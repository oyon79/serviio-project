const db = require("../config/db");
const { createNotifications } = require("../services/notificationService");
const { isAdminRole } = require("../utils/roles");

const PAYOUT_METHODS = new Set(["BKASH", "NAGAD", "BANK"]);
const PAYOUT_STATUSES = new Set(["REQUESTED", "APPROVED", "REJECTED", "PAID"]);
const MIN_PAYOUT_AMOUNT = Number(process.env.MIN_PAYOUT_AMOUNT || 100);

async function ensureWallet(connection, userId) {
  await connection.query(
    "INSERT IGNORE INTO wallets (user_id, balance, pending_balance) VALUES (?, 0.00, 0.00)",
    [userId],
  );

  const [walletRows] = await connection.query(
    "SELECT id, user_id, currency, balance, pending_balance, payout_reserved_balance FROM wallets WHERE user_id = ? LIMIT 1",
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
    const [payouts] = await connection.query(
      `SELECT id, amount, currency, payout_method, account_ref, status,
              provider_notes, reviewer_notes, external_reference,
              requested_at, reviewed_at, paid_at
       FROM payout_requests
       WHERE provider_id = ?
       ORDER BY requested_at DESC
       LIMIT 20`,
      [userId],
    );

    return res.status(200).json({
      success: true,
      data: {
        wallet,
        transactions,
        escrows,
        payouts,
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

exports.createPayoutRequest = async (req, res) => {
  const userId = req.user?.id;
  const amount = Number(req.body.amount);
  const payoutMethod = String(req.body.payout_method || "").toUpperCase();
  const accountRef = String(req.body.account_ref || "").trim();
  const providerNotes = String(req.body.provider_notes || "").trim();

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }

  if (!Number.isFinite(amount) || amount < MIN_PAYOUT_AMOUNT) {
    return res.status(400).json({
      success: false,
      message: `Payout amount must be at least BDT ${MIN_PAYOUT_AMOUNT}.`,
    });
  }

  if (!PAYOUT_METHODS.has(payoutMethod)) {
    return res.status(400).json({
      success: false,
      message: "Invalid payout method.",
    });
  }

  if (!accountRef) {
    return res.status(400).json({
      success: false,
      message: "Payout account reference is required.",
    });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    await ensureWallet(connection, userId);
    const [walletRows] = await connection.query(
      `SELECT id, user_id, currency, balance, payout_reserved_balance
       FROM wallets
       WHERE user_id = ?
       LIMIT 1
       FOR UPDATE`,
      [userId],
    );
    const wallet = walletRows[0];
    const availableBalance = Number(wallet.balance);
    const payoutAmount = Number(amount.toFixed(2));

    if (availableBalance < payoutAmount) {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: "Insufficient available wallet balance for this payout.",
      });
    }

    await connection.query(
      `UPDATE wallets
       SET balance = balance - ?,
           payout_reserved_balance = payout_reserved_balance + ?
       WHERE id = ?`,
      [payoutAmount, payoutAmount, wallet.id],
    );

    const [updatedWalletRows] = await connection.query(
      "SELECT balance FROM wallets WHERE id = ? LIMIT 1",
      [wallet.id],
    );

    const [result] = await connection.query(
      `INSERT INTO payout_requests
        (provider_id, wallet_id, amount, currency, payout_method, account_ref, provider_notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        wallet.id,
        payoutAmount,
        wallet.currency || "BDT",
        payoutMethod,
        accountRef,
        providerNotes || null,
      ],
    );

    await connection.query(
      `INSERT INTO wallet_transactions
        (wallet_id, user_id, type, amount, balance_after, reference_id, description)
       VALUES (?, ?, 'PAYOUT_REQUEST', ?, ?, ?, ?)`,
      [
        wallet.id,
        userId,
        payoutAmount,
        updatedWalletRows[0].balance,
        `PAYOUT-${result.insertId}`,
        `Payout requested via ${payoutMethod}.`,
      ],
    );

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: "Payout request submitted.",
      data: {
        id: result.insertId,
        amount: payoutAmount,
        currency: wallet.currency || "BDT",
        status: "REQUESTED",
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error creating payout request:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while creating payout request.",
    });
  } finally {
    connection.release();
  }
};

exports.listMyPayoutRequests = async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }

  try {
    const [rows] = await db.query(
      `SELECT id, amount, currency, payout_method, account_ref, status,
              provider_notes, reviewer_notes, external_reference,
              requested_at, reviewed_at, paid_at
       FROM payout_requests
       WHERE provider_id = ?
       ORDER BY requested_at DESC
       LIMIT 50`,
      [userId],
    );

    return res.status(200).json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    console.error("Error listing provider payout requests:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching payout requests.",
    });
  }
};

exports.listPayoutRequests = async (req, res) => {
  const status = req.query.status ? String(req.query.status).toUpperCase() : "";
  const values = [];
  let where = "";

  if (status) {
    if (!PAYOUT_STATUSES.has(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payout status.",
      });
    }
    where = "WHERE pr.status = ?";
    values.push(status);
  }

  try {
    const [rows] = await db.query(
      `SELECT pr.*, u.first_name, u.last_name, u.email, u.phone
       FROM payout_requests pr
       JOIN users u ON u.id = pr.provider_id
       ${where}
       ORDER BY FIELD(pr.status, 'REQUESTED', 'APPROVED', 'PAID', 'REJECTED', 'CANCELLED'),
                pr.requested_at DESC
       LIMIT 100`,
      values,
    );

    return res.status(200).json({
      success: true,
      count: rows.length,
      data: rows.map((row) => ({
        ...row,
        provider_name: `${row.first_name || ""} ${row.last_name || ""}`.trim(),
      })),
    });
  } catch (error) {
    console.error("Error listing payout requests:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching payout requests.",
    });
  }
};

exports.updatePayoutRequest = async (req, res) => {
  const payoutId = req.params.id;
  const nextStatus = String(req.body.status || "").toUpperCase();
  const reviewerNotes = String(req.body.reviewer_notes || "").trim();
  const externalReference = String(req.body.external_reference || "").trim();

  if (!["APPROVED", "REJECTED", "PAID"].includes(nextStatus)) {
    return res.status(400).json({
      success: false,
      message: "Payout status must be APPROVED, REJECTED, or PAID.",
    });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT pr.*, w.balance, w.payout_reserved_balance
       FROM payout_requests pr
       JOIN wallets w ON w.id = pr.wallet_id
       WHERE pr.id = ?
       LIMIT 1
       FOR UPDATE`,
      [payoutId],
    );

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Payout request not found.",
      });
    }

    const payout = rows[0];
    const amount = Number(payout.amount);

    if (["REJECTED", "PAID", "CANCELLED"].includes(payout.status)) {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: `Payout is already ${String(payout.status).toLowerCase()}.`,
      });
    }

    if (nextStatus === "APPROVED" && payout.status !== "REQUESTED") {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: "Only requested payouts can be approved.",
      });
    }

    if (nextStatus === "REJECTED") {
      await connection.query(
        `UPDATE wallets
         SET balance = balance + ?,
             payout_reserved_balance = GREATEST(payout_reserved_balance - ?, 0)
         WHERE id = ?`,
        [amount, amount, payout.wallet_id],
      );
    }

    if (nextStatus === "PAID") {
      await connection.query(
        `UPDATE wallets
         SET payout_reserved_balance = GREATEST(payout_reserved_balance - ?, 0)
         WHERE id = ?`,
        [amount, payout.wallet_id],
      );
    }

    const [walletRows] = await connection.query(
      "SELECT balance FROM wallets WHERE id = ? LIMIT 1",
      [payout.wallet_id],
    );
    const balanceAfter = walletRows[0].balance;

    await connection.query(
      `UPDATE payout_requests
       SET status = ?,
           reviewer_id = ?,
           reviewer_notes = ?,
           external_reference = ?,
           reviewed_at = COALESCE(reviewed_at, NOW()),
           paid_at = IF(? = 'PAID', NOW(), paid_at)
       WHERE id = ?`,
      [
        nextStatus,
        req.user.id,
        reviewerNotes || null,
        externalReference || null,
        nextStatus,
        payout.id,
      ],
    );

    if (nextStatus !== "APPROVED") {
      await connection.query(
        `INSERT INTO wallet_transactions
          (wallet_id, user_id, type, amount, balance_after, reference_id, description)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          payout.wallet_id,
          payout.provider_id,
          nextStatus === "REJECTED" ? "PAYOUT_REJECTED" : "PAYOUT_PAID",
          amount,
          balanceAfter,
          `PAYOUT-${payout.id}`,
          nextStatus === "REJECTED"
            ? "Payout request rejected and funds returned."
            : "Payout marked as paid by operations.",
        ],
      );
    }

    await createNotifications(
      [
        {
          user_id: payout.provider_id,
          notification_type: "PAYOUT_STATUS",
          title: "Payout status updated",
          message: `Your payout request is now ${nextStatus}.`,
          entity_type: "PAYOUT_REQUEST",
          entity_id: payout.id,
        },
      ],
      connection,
    );

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: `Payout request ${nextStatus.toLowerCase()}.`,
      data: {
        id: payout.id,
        status: nextStatus,
        amount,
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error updating payout request:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while updating payout request.",
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
    const isAdmin = isAdminRole(req.user.role);

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

    const [openDisputes] = await connection.query(
      `SELECT id
       FROM support_tickets
       WHERE booking_id = ?
         AND category IN ('REFUND', 'DISPUTE', 'SAFETY')
         AND status NOT IN ('RESOLVED', 'CLOSED')
       LIMIT 1`,
      [bookingId],
    );
    if (openDisputes.length > 0 && !isAdmin) {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: "Escrow cannot be released while a dispute is open.",
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

exports.refundEscrow = async (req, res) => {
  const bookingId = req.params.booking_id;
  const reason = req.body.reason || "Admin refund issued.";
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
    if (!["HELD", "DISPUTED"].includes(escrow.status)) {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: `Escrow is already ${escrow.status.toLowerCase()}.`,
      });
    }

    const providerWallet = await ensureWallet(connection, escrow.provider_id);
    const customerWallet = await ensureWallet(connection, escrow.customer_id);
    const providerAmount = Number(escrow.provider_amount);
    const refundAmount = Number(escrow.amount);

    await connection.query(
      `UPDATE wallets
       SET pending_balance = GREATEST(pending_balance - ?, 0)
       WHERE id = ?`,
      [providerAmount, providerWallet.id],
    );

    await connection.query(
      `UPDATE wallets
       SET balance = balance + ?
       WHERE id = ?`,
      [refundAmount, customerWallet.id],
    );

    const [updatedCustomerWalletRows] = await connection.query(
      "SELECT balance FROM wallets WHERE id = ? LIMIT 1",
      [customerWallet.id],
    );

    await connection.query(
      `INSERT INTO wallet_transactions
        (wallet_id, user_id, booking_id, type, amount, balance_after, reference_id, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        customerWallet.id,
        escrow.customer_id,
        escrow.booking_id,
        "REFUND",
        refundAmount,
        updatedCustomerWalletRows[0].balance,
        escrow.payment_transaction_id,
        reason,
      ],
    );

    await connection.query(
      "UPDATE escrow_payments SET status = 'REFUNDED' WHERE id = ?",
      [escrow.id],
    );
    await connection.query(
      "UPDATE bookings SET payment_status = 'REFUNDED', status = IF(status = 'COMPLETED', status, 'CANCELLED'), cancelled_at = COALESCE(cancelled_at, NOW()) WHERE id = ?",
      [escrow.booking_id],
    );

    await createNotifications(
      [
        {
          user_id: escrow.customer_id,
          booking_id: escrow.booking_id,
          notification_type: "ESCROW_REFUNDED",
          title: "Payment refunded",
          message: `BDT ${refundAmount.toFixed(2)} was refunded to your Serviio wallet.`,
          entity_type: "ESCROW",
          entity_id: escrow.id,
        },
        {
          user_id: escrow.provider_id,
          booking_id: escrow.booking_id,
          notification_type: "ESCROW_REFUNDED",
          title: "Escrow refunded",
          message: "The booking escrow was refunded after admin review.",
          entity_type: "ESCROW",
          entity_id: escrow.id,
        },
      ],
      connection,
    );

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: "Escrow refunded successfully.",
      data: {
        booking_id: escrow.booking_id,
        amount: refundAmount,
        status: "REFUNDED",
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error refunding escrow:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while refunding escrow.",
    });
  } finally {
    connection.release();
  }
};
