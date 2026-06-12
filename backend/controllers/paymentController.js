const db = require("../config/db");
const { createNotifications } = require("../services/notificationService");
const {
  verifyConfiguredGatewayPayment,
} = require("../services/paymentGatewayService");
const { parsePlatformCommissionRate } = require("../utils/financialPolicy");
const { isAdminRole } = require("../utils/roles");

exports.processPayment = async (req, res) => {
  const {
    booking_id,
    amount,
    payment_method = "mock",
    gateway_reference,
  } = req.body;
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }

  if (!booking_id || !amount) {
    return res.status(400).json({
      success: false,
      message: "booking_id and amount are required.",
    });
  }

  const requestedAmount = parseFloat(amount);
  if (isNaN(requestedAmount) || requestedAmount <= 0) {
    return res.status(400).json({
      success: false,
      message: "amount must be a positive number.",
    });
  }

  let platformFeeRate;
  try {
    platformFeeRate = parsePlatformCommissionRate();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Payment configuration is invalid.",
    });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [bookingRows] = await connection.query(
      "SELECT id, customer_id, provider_id, status, payment_status, quoted_amount FROM bookings WHERE id = ? LIMIT 1 FOR UPDATE",
      [booking_id],
    );

    if (bookingRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Booking not found.",
      });
    }

    const booking = bookingRows[0];

    if (String(booking.customer_id) !== String(userId)) {
      await connection.rollback();
      return res.status(403).json({
        success: false,
        message: "Only the customer can pay for this booking.",
      });
    }

    if (booking.status === "CANCELLED") {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Cannot process payment for a cancelled booking.",
      });
    }

    if (!["PENDING", "ACCEPTED"].includes(booking.status)) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message:
          "Payment can only be completed before the provider starts travelling or working.",
      });
    }

    if (booking.payment_status === "PAID") {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: "Payment has already been completed for this booking.",
      });
    }

    const parsedAmount = Number(booking.quoted_amount || requestedAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Booking does not have a valid payable amount.",
      });
    }

    const gatewayResult = await verifyConfiguredGatewayPayment({
      bookingId: booking.id,
      customerId: booking.customer_id,
      providerId: booking.provider_id,
      amount: parsedAmount,
      paymentMethod: payment_method,
      gatewayReference: gateway_reference,
    });

    if (!gatewayResult.verified) {
      await connection.rollback();
      return res.status(gatewayResult.statusCode || 400).json({
        success: false,
        message: gatewayResult.message || "Payment could not be verified.",
      });
    }

    const transactionId = String(gatewayResult.transactionId).slice(0, 100);
    const gatewayName =
      gatewayResult.gatewayName || String(payment_method).slice(0, 50);

    const platformFee = Number((parsedAmount * platformFeeRate).toFixed(2));
    const providerAmount = Number((parsedAmount - platformFee).toFixed(2));

    await connection.query(
      "UPDATE bookings SET payment_status = ?, payment_transaction_id = ?, payment_amount = ?, payment_date = NOW() WHERE id = ?",
      ["PAID", transactionId, parsedAmount, booking_id],
    );

    await connection.query(
      `INSERT INTO payment_transactions
        (booking_id, customer_id, provider_id, transaction_id, amount, status, payment_method, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        booking.id,
        booking.customer_id,
        booking.provider_id,
        transactionId,
        parsedAmount,
        "SUCCESS",
        gatewayName,
        `${gatewayName} checkout payment verified by Serviio backend.`,
      ],
    );

    await connection.query(
      "INSERT IGNORE INTO wallets (user_id, balance, pending_balance) VALUES (?, 0.00, 0.00)",
      [booking.provider_id],
    );

    const [walletRows] = await connection.query(
      "SELECT id, balance, pending_balance FROM wallets WHERE user_id = ? LIMIT 1 FOR UPDATE",
      [booking.provider_id],
    );
    const providerWallet = walletRows[0];

    await connection.query(
      "UPDATE wallets SET pending_balance = pending_balance + ? WHERE id = ?",
      [providerAmount, providerWallet.id],
    );

    await connection.query(
      `INSERT INTO escrow_payments
        (booking_id, customer_id, provider_id, payment_transaction_id, amount, platform_fee, provider_amount, status, release_available_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'HELD', DATE_ADD(NOW(), INTERVAL 24 HOUR))`,
      [
        booking.id,
        booking.customer_id,
        booking.provider_id,
        transactionId,
        parsedAmount,
        platformFee,
        providerAmount,
      ],
    );

    await connection.query(
      `INSERT INTO wallet_transactions
        (wallet_id, user_id, booking_id, type, amount, balance_after, reference_id, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        providerWallet.id,
        booking.provider_id,
        booking.id,
        "ESCROW_HOLD",
        providerAmount,
        providerWallet.balance,
        transactionId,
        "Payment held in escrow pending job completion/release.",
      ],
    );

    await createNotifications(
      [
        {
          user_id: booking.customer_id,
          booking_id: booking.id,
          notification_type: "PAYMENT_ESCROW_HELD",
          title: "Payment secured in escrow",
          message: `Your payment of BDT ${parsedAmount.toFixed(2)} is held safely until service completion.`,
          entity_type: "ESCROW",
          entity_id: booking.id,
        },
        {
          user_id: booking.provider_id,
          booking_id: booking.id,
          notification_type: "PAYMENT_ESCROW_HELD",
          title: "Escrow payment received",
          message: `BDT ${providerAmount.toFixed(2)} is pending in escrow for this booking.`,
          entity_type: "ESCROW",
          entity_id: booking.id,
        },
      ],
      connection,
    );

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: "Payment processed successfully.",
      data: {
        booking_id,
        transaction_id: transactionId,
        amount: parsedAmount,
        status: "PAID",
        escrow_status: "HELD",
        platform_fee: platformFee,
        provider_amount: providerAmount,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error processing payment:", error);

    if (
      error.code === "ER_BAD_FIELD_ERROR" &&
      error.sqlMessage.includes("payment")
    ) {
      return res.status(500).json({
        success: false,
        message:
          "Payment fields not yet added to database schema. Please run migration.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server error during payment processing.",
    });
  } finally {
    connection.release();
  }
};

exports.getPaymentStatus = async (req, res) => {
  const { booking_id } = req.params;
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }

  if (!booking_id) {
    return res.status(400).json({
      success: false,
      message: "booking_id is required.",
    });
  }

  try {
    const [bookingRows] = await db.query(
      `SELECT b.id, b.customer_id, b.provider_id, b.payment_status, b.payment_amount, b.payment_date,
              e.status AS escrow_status, e.platform_fee, e.provider_amount,
              e.release_available_at, e.released_at
       FROM bookings b
       LEFT JOIN escrow_payments e ON e.booking_id = b.id
       WHERE b.id = ?
       LIMIT 1`,
      [booking_id],
    );

    if (bookingRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Booking not found.",
      });
    }

    const booking = bookingRows[0];

    if (
      String(booking.customer_id) !== String(userId) &&
      String(booking.provider_id) !== String(userId) &&
      !isAdminRole(req.user.role)
    ) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to view this booking's payment.",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        booking_id,
        payment_status: booking.payment_status || "UNPAID",
        amount: booking.payment_amount || null,
        payment_date: booking.payment_date || null,
        escrow_status: booking.escrow_status || null,
        platform_fee: booking.platform_fee || null,
        provider_amount: booking.provider_amount || null,
        release_available_at: booking.release_available_at || null,
        released_at: booking.released_at || null,
      },
    });
  } catch (error) {
    console.error("Error fetching payment status:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching payment status.",
    });
  }
};
