const db = require("../config/db");

exports.processPayment = async (req, res) => {
  const { booking_id, amount } = req.body;
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

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({
      success: false,
      message: "amount must be a positive number.",
    });
  }

  try {
    const [bookingRows] = await db.query(
      "SELECT id, customer_id, provider_id, status FROM bookings WHERE id = ? LIMIT 1",
      [booking_id],
    );

    if (bookingRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Booking not found.",
      });
    }

    const booking = bookingRows[0];

    if (String(booking.customer_id) !== String(userId)) {
      return res.status(403).json({
        success: false,
        message: "Only the customer can pay for this booking.",
      });
    }

    if (booking.status === "CANCELLED") {
      return res.status(400).json({
        success: false,
        message: "Cannot process payment for a cancelled booking.",
      });
    }

    const transactionId = `TXN-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)
      .toUpperCase()}`;

    await db.query(
      "UPDATE bookings SET payment_status = ?, payment_transaction_id = ?, payment_amount = ?, payment_date = NOW() WHERE id = ?",
      ["PAID", transactionId, parsedAmount, booking_id],
    );

    return res.status(200).json({
      success: true,
      message: "Payment processed successfully.",
      data: {
        booking_id,
        transaction_id: transactionId,
        amount: parsedAmount,
        status: "PAID",
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
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
      "SELECT id, customer_id, payment_status, payment_amount, payment_date FROM bookings WHERE id = ? LIMIT 1",
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
      req.user.role !== "admin"
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
