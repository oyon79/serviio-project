const db = require("../config/db");
const { createNotifications } = require("../services/notificationService");

async function ensureWallet(connection, userId) {
  await connection.query(
    "INSERT IGNORE INTO wallets (user_id, balance, pending_balance) VALUES (?, 0.00, 0.00)",
    [userId],
  );

  const [walletRows] = await connection.query(
    "SELECT id, user_id, currency, balance, pending_balance FROM wallets WHERE user_id = ? LIMIT 1",
    [userId],
  );

  return walletRows[0];
}

exports.getMyWallet = async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }

  const connection = await db.getConnection();

  try {
    const wallet = await ensureWallet(connection, userId);
    const [transactions] = await connection.query(
      `SELECT id, booking_id, type, amount, balance_after, reference_id, description, created_at
       FROM wallet_transactions
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 20`,
      [userId],
    );
    const [escrows] = await connection.query(
      `SELECT id, booking_id, amount, platform_fee, provider_amount, status,
              release_available_at, released_at, created_at
       FROM escrow_payments
       WHERE customer_id = ? OR provider_id = ?
       ORDER BY created_at DESC
       LIMIT 20`,
      [userId, userId],
    );

    return res.status(200).json({
      success: true,
      data: {
        wallet,
        transactions,
        escrows,
      },
    });
  } catch (error) {
    console.error("Error fetching wallet:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching wallet.",
    });
  } finally {
    connection.release();
  }
};

exports.releaseEscrow = async (req, res) => {
  const userId = req.user?.id;
  const bookingId = req.params.booking_id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }

  if (!bookingId) {
    return res.status(400).json({
      success: false,
      message: "booking_id is required.",
    });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [escrowRows] = await connection.query(
      `SELECT e.*, b.status AS booking_status
       FROM escrow_payments e
       JOIN bookings b ON b.id = e.booking_id
       WHERE e.booking_id = ?
       LIMIT 1
       FOR UPDATE`,
      [bookingId],
    );

    if (escrowRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Escrow payment not found for this booking.",
      });
    }

    const escrow = escrowRows[0];
    const isCustomer = String(escrow.customer_id) === String(userId);
    const isProvider = String(escrow.provider_id) === String(userId);
    const isAdmin = req.user.role === "admin";

    if (!isCustomer && !isProvider && !isAdmin) {
      await connection.rollback();
      return res.status(403).json({
        success: false,
        message: "You do not have permission to release this escrow.",
      });
    }

    if (escrow.status !== "HELD") {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: `Escrow is already ${escrow.status.toLowerCase()}.`,
      });
    }

    if (escrow.booking_status !== "COMPLETED" && !isAdmin) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Booking must be completed before provider escrow release.",
      });
    }

    if (isProvider && !isAdmin) {
      const [releaseRows] = await connection.query(
        "SELECT NOW() >= ? AS can_release",
        [escrow.release_available_at],
      );
      if (!releaseRows[0]?.can_release) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: "Escrow is not available for automatic release yet.",
        });
      }
    }

    const wallet = await ensureWallet(connection, escrow.provider_id);
    const providerAmount = Number(escrow.provider_amount);

    await connection.query(
      `UPDATE wallets
       SET pending_balance = GREATEST(pending_balance - ?, 0),
           balance = balance + ?
       WHERE id = ?`,
      [providerAmount, providerAmount, wallet.id],
    );

    const [updatedWalletRows] = await connection.query(
      "SELECT balance FROM wallets WHERE id = ? LIMIT 1",
      [wallet.id],
    );

    await connection.query(
      `INSERT INTO wallet_transactions
        (wallet_id, user_id, booking_id, type, amount, balance_after, reference_id, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        wallet.id,
        escrow.provider_id,
        escrow.booking_id,
        "ESCROW_RELEASE",
        providerAmount,
        updatedWalletRows[0].balance,
        escrow.payment_transaction_id,
        "Escrow released to provider wallet.",
      ],
    );

    await connection.query(
      "UPDATE escrow_payments SET status = 'RELEASED', released_at = NOW() WHERE id = ?",
      [escrow.id],
    );
    await createNotifications(
      [
        {
          user_id: escrow.provider_id,
          booking_id: escrow.booking_id,
          notification_type: "ESCROW_RELEASED",
          title: "Escrow released",
          message: `BDT ${providerAmount.toFixed(2)} is now available in your wallet.`,
          entity_type: "ESCROW",
          entity_id: escrow.id,
        },
        {
          user_id: escrow.customer_id,
          booking_id: escrow.booking_id,
          notification_type: "ESCROW_RELEASED",
          title: "Payment released",
          message: "Your escrow payment has been released to the provider.",
          entity_type: "ESCROW",
          entity_id: escrow.id,
        },
      ],
      connection,
    );

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: "Escrow released successfully.",
      data: {
        booking_id: escrow.booking_id,
        provider_id: escrow.provider_id,
        amount: providerAmount,
        status: "RELEASED",
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error releasing escrow:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while releasing escrow.",
    });
  } finally {
    connection.release();
  }
};
