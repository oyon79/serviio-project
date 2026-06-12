const db = require("../config/db");
const {
  createNotification,
  createNotifications,
} = require("../services/notificationService");
const {
  allowedStatuses,
  canProviderTransition,
  canStartWithHandshake,
  getStatusTimestampColumn,
} = require("../services/bookingLifecycle");
const { estimatePrice } = require("../services/pricingService");
const { isAdminRole } = require("../utils/roles");

// Create a new booking
exports.createBooking = async (req, res) => {
  const customerId = req.user?.id;
  const {
    provider_id,
    service_type,
    booking_date,
    job_location,
    is_emergency = false,
    estimated_price_range,
  } = req.body;

  if (!customerId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required to create a booking.",
    });
  }

  if (!provider_id || !service_type || !booking_date) {
    return res.status(400).json({
      success: false,
      message: "provider_id, service_type, and booking_date are required.",
    });
  }

  try {
    const [customerRows] = await db.query(
      "SELECT id FROM users WHERE id = ? AND role = 'customer' LIMIT 1",
      [customerId],
    );
    if (customerRows.length === 0) {
      return res.status(403).json({
        success: false,
        message: "Only customers can create bookings.",
      });
    }

    const [providerRows] = await db.query(
      `SELECT u.id, p.hourly_rate
       FROM users u
       INNER JOIN provider_profiles p ON p.user_id = u.id
       WHERE u.id = ?
         AND u.role = 'provider'
         AND u.is_active = TRUE
         AND p.is_available = TRUE
         AND (p.is_verified = 1 OR p.is_verified = TRUE)
       LIMIT 1`,
      [provider_id],
    );
    if (providerRows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Provider is not available for booking." });
    }

    const handshake_code = Math.floor(1000 + Math.random() * 9000).toString();
    const priceEstimate = estimatePrice({
      serviceType: service_type,
      location: job_location,
      scheduledAt: booking_date,
      workload: "moderate",
      isEmergency: Boolean(is_emergency),
      providerHourlyRate: providerRows[0].hourly_rate,
    });

    const [result] = await db.query(
      `INSERT INTO bookings
        (customer_id, provider_id, service_type, job_location, booking_date, estimated_price_range, quoted_amount, is_emergency, status, handshake_code)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        customerId,
        provider_id,
        service_type,
        job_location || null,
        booking_date,
        priceEstimate.rangeLabel || estimated_price_range || null,
        priceEstimate.quotedAmount,
        is_emergency ? 1 : 0,
        "PENDING",
        handshake_code,
      ],
    );
    const bookingId = result.insertId;

    await createNotifications([
      {
        user_id: provider_id,
        booking_id: bookingId,
        notification_type: "BOOKING_CREATED",
        title: "New booking request",
        message: `You have a new ${service_type} booking request.`,
        entity_type: "BOOKING",
        entity_id: bookingId,
      },
      {
        user_id: customerId,
        booking_id: bookingId,
        notification_type: "BOOKING_CREATED",
        title: "Booking created",
        message: "Your booking was created. Complete payment to confirm it.",
        entity_type: "BOOKING",
        entity_id: bookingId,
      },
    ]);

    return res.status(201).json({
      success: true,
      message: "Booking created successfully.",
      data: {
        booking_id: bookingId,
        status: "PENDING",
        estimated_price_range: priceEstimate.rangeLabel,
        quoted_amount: priceEstimate.quotedAmount,
      },
    });
  } catch (error) {
    console.error("Error creating booking:", error);
    return res.status(500).json({
      success: false,
      message: "Server error during booking creation.",
    });
  }
};
// ... existing createBooking function ...

// Get a specific booking by its ID
exports.getBookingById = async (req, res) => {
  const bookingId = req.params.id;

  if (!req.user || !req.user.id) {
    return res.status(401).json({
      success: false,
      message: "Authentication required to view booking details.",
    });
  }

  try {
    // Query the database for the booking, and join provider details if you want their name!
    const query = `
            SELECT b.*, p.first_name as provider_name, p.phone as provider_phone
            FROM bookings b
            LEFT JOIN users p ON b.provider_id = p.id
            WHERE b.id = ?
        `;

    const [booking] = await db.query(query, [bookingId]);

    if (booking.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Booking not found." });
    }

    const bookingRow = booking[0];
    const userId = String(req.user.id);
    const isCustomer = String(bookingRow.customer_id) === userId;
    const isProvider = String(bookingRow.provider_id) === userId;

    const isAdmin = isAdminRole(req.user.role);

    if (!isCustomer && !isProvider && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to view this booking.",
      });
    }

    if (!isAdmin) {
      if (!isCustomer || bookingRow.payment_status !== "PAID") {
        delete bookingRow.handshake_code;
      }
    }

    res.status(200).json({
      success: true,
      data: bookingRow,
    });
  } catch (error) {
    console.error("Error fetching booking:", error);
    res.status(500).json({
      success: false,
      message: "Server Error while fetching booking.",
    });
  }
};

// ... existing functions (createBooking, getBookingById) ...

// 1. Get all bookings for a specific provider
exports.getProviderBookings = async (req, res) => {
  if (!req.user || req.user.role !== "provider") {
    return res
      .status(403)
      .json({ success: false, message: "Provider access required" });
  }

  let providerId = req.params.providerId;

  // If no providerId param, try to read from authenticated token (req.user)
  if (!providerId && req.user && req.user.id) {
    providerId = req.user.id;
  }

  if (!providerId) {
    return res
      .status(400)
      .json({ success: false, message: "providerId is required" });
  }

  if (String(providerId) !== String(req.user.id)) {
    return res
      .status(403)
      .json({ success: false, message: "You can only view your own bookings" });
  }

  try {
    const query = `
        SELECT
          b.id, b.customer_id, b.provider_id, b.service_type, b.job_location,
          b.booking_date, b.estimated_price_range, b.status, b.is_emergency,
          b.payment_status, b.payment_transaction_id, b.payment_amount,
          b.payment_date, b.created_at, b.updated_at,
          u.first_name as customer_name, u.phone as customer_phone
        FROM bookings b
        JOIN users u ON b.customer_id = u.id
        WHERE b.provider_id = ?
        ORDER BY b.created_at DESC
      `;

    const [bookings] = await db.query(query, [providerId]);

    res
      .status(200)
      .json({ success: true, count: bookings.length, data: bookings });
  } catch (error) {
    console.error("Error fetching provider bookings:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// 3. Get bookings for the authenticated user (customer or provider)
exports.getMyBookings = async (req, res) => {
  if (!req.user || !req.user.id) {
    return res
      .status(401)
      .json({ success: false, message: "Authentication required" });
  }

  const userId = req.user.id;
  try {
    if (req.user.role === "provider") {
      const query = `
        SELECT
          b.id, b.customer_id, b.provider_id, b.service_type, b.job_location,
          b.booking_date, b.estimated_price_range, b.status, b.is_emergency,
          b.payment_status, b.payment_transaction_id, b.payment_amount,
          b.payment_date, b.created_at, b.updated_at,
          u.first_name as customer_name, u.phone as customer_phone
        FROM bookings b
        JOIN users u ON b.customer_id = u.id
        WHERE b.provider_id = ?
        ORDER BY b.created_at DESC
      `;
      const [bookings] = await db.query(query, [userId]);
      return res
        .status(200)
        .json({ success: true, count: bookings.length, data: bookings });
    }

    // else customer
    const query = `
      SELECT
        b.id, b.customer_id, b.provider_id, b.service_type, b.job_location,
        b.booking_date, b.estimated_price_range, b.status, b.is_emergency,
        b.payment_status, b.payment_transaction_id, b.payment_amount,
        b.payment_date, b.created_at, b.updated_at,
        u.first_name as provider_name, u.phone as provider_phone
      FROM bookings b
      LEFT JOIN users u ON b.provider_id = u.id
      WHERE b.customer_id = ?
      ORDER BY b.created_at DESC
    `;
    const [bookings] = await db.query(query, [userId]);
    return res
      .status(200)
      .json({ success: true, count: bookings.length, data: bookings });
  } catch (error) {
    console.error("Error fetching user bookings:", error);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};

// 2. Verify Handshake Code (Changes status to 'working')
exports.verifyHandshake = async (req, res) => {
  if (!req.user || req.user.role !== "provider") {
    return res
      .status(403)
      .json({ success: false, message: "Provider access required" });
  }

  // Accept multiple naming conventions from frontend
  const booking_id =
    req.body.booking_id || req.body.bookingId || req.body.bookingId?.toString();
  const handshake_code =
    req.body.handshake_code ||
    req.body.handshakeCode ||
    req.body.handshakeCode?.toString();

  // Normalize types
  const bookingId = booking_id;
  const code = handshake_code;

  if (!bookingId || !code) {
    return res.status(400).json({
      success: false,
      message: "booking_id and handshake_code are required.",
    });
  }

  try {
    // Find the booking
    const [booking] = await db.query("SELECT * FROM bookings WHERE id = ?", [
      bookingId,
    ]);

    if (booking.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Booking not found." });
    }

    const currentBooking = booking[0];

    if (String(currentBooking.provider_id) !== String(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: "You can only verify bookings assigned to you.",
      });
    }

    if (currentBooking.payment_status !== "PAID") {
      return res.status(400).json({
        success: false,
        message: "Payment must be completed before starting the job.",
      });
    }

    if (!canStartWithHandshake(currentBooking.status)) {
      return res.status(409).json({
        success: false,
        message: `Handshake cannot start a job in status ${currentBooking.status}.`,
      });
    }

    // Check if the code matches
    if (currentBooking.handshake_code !== code) {
      return res.status(400).json({
        success: false,
        message: "Invalid 4-digit code! Please try again.",
      });
    }
    // If it matches, update the job status to 'IN_PROGRESS'
    await db.query(
      `UPDATE bookings
       SET status = ?, started_at = COALESCE(started_at, NOW())
       WHERE id = ?`,
      ["IN_PROGRESS", bookingId],
    );
    await createNotification({
      user_id: currentBooking.customer_id,
      booking_id: bookingId,
      notification_type: "BOOKING_STARTED",
      title: "Job started",
      message: "Your provider verified the handshake code and started work.",
      entity_type: "BOOKING",
      entity_id: bookingId,
    });

    res.status(200).json({
      success: true,
      message: "Handshake verified! Job status is now Active.",
    });
  } catch (error) {
    console.error("Error verifying handshake:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.updateBookingStatus = async (req, res) => {
  if (!req.user || req.user.role !== "provider") {
    return res
      .status(403)
      .json({ success: false, message: "Provider access required." });
  }

  const bookingId = req.params.id;
  const requestedStatus = String(req.body.status || "").toUpperCase();

  if (!allowedStatuses.has(requestedStatus)) {
    return res.status(400).json({
      success: false,
      message:
        "Invalid status. Valid values are PENDING, ACCEPTED, ON_THE_WAY, ARRIVED, IN_PROGRESS, COMPLETED, or CANCELLED.",
    });
  }

  try {
    const [bookingRows] = await db.query(
      "SELECT id, customer_id, provider_id, status, payment_status FROM bookings WHERE id = ? LIMIT 1",
      [bookingId],
    );

    if (bookingRows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Booking not found." });
    }

    const booking = bookingRows[0];
    if (String(booking.provider_id) !== String(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: "You can only update bookings assigned to you.",
      });
    }

    if (booking.status === requestedStatus) {
      return res.status(200).json({
        success: true,
        message: `Booking already in status ${requestedStatus}.`,
        data: { id: bookingId, status: requestedStatus },
      });
    }

    if (requestedStatus === "PENDING" || requestedStatus === "IN_PROGRESS") {
      return res.status(400).json({
        success: false,
        message:
          requestedStatus === "IN_PROGRESS"
            ? "Use handshake verification to start a booking."
            : "Bookings cannot be moved back to pending.",
      });
    }

    const validTransition = canProviderTransition(
      booking.status,
      requestedStatus,
    );

    if (!validTransition) {
      return res.status(409).json({
        success: false,
        message: `Cannot change booking from ${booking.status} to ${requestedStatus}.`,
      });
    }

    if (requestedStatus === "COMPLETED" && booking.payment_status !== "PAID") {
      return res.status(400).json({
        success: false,
        message: "Paid escrow is required before a booking can be completed.",
      });
    }

    if (
      ["ON_THE_WAY", "ARRIVED"].includes(requestedStatus) &&
      booking.payment_status !== "PAID"
    ) {
      return res.status(400).json({
        success: false,
        message: "Customer payment must be secured before travel begins.",
      });
    }

    const timestampColumn = getStatusTimestampColumn(requestedStatus);
    if (timestampColumn) {
      await db.query(
        `UPDATE bookings
         SET status = ?, ${timestampColumn} = COALESCE(${timestampColumn}, NOW())
         WHERE id = ?`,
        [requestedStatus, bookingId],
      );
    } else {
      await db.query("UPDATE bookings SET status = ? WHERE id = ?", [
        requestedStatus,
        bookingId,
      ]);
    }
    const [recipientRows] = await db.query(
      "SELECT customer_id FROM bookings WHERE id = ? LIMIT 1",
      [bookingId],
    );
    if (recipientRows.length > 0) {
      await createNotification({
        user_id: recipientRows[0].customer_id,
        booking_id: bookingId,
        notification_type: "BOOKING_STATUS_UPDATED",
        title: "Booking status updated",
        message: `Your booking is now ${requestedStatus}.`,
        entity_type: "BOOKING",
        entity_id: bookingId,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Booking status updated successfully.",
      data: { id: bookingId, status: requestedStatus },
    });
  } catch (error) {
    console.error("Error updating booking status:", error);
    return res
      .status(500)
      .json({ success: false, message: "Server error while updating status." });
  }
};

exports.cancelBooking = async (req, res) => {
  if (!req.user) {
    return res
      .status(401)
      .json({ success: false, message: "Authentication required." });
  }

  const bookingId = req.params.id;
  if (!bookingId) {
    return res
      .status(400)
      .json({ success: false, message: "Booking id is required." });
  }

  try {
    const [bookingRows] = await db.query(
      "SELECT id, customer_id, provider_id, status, payment_status FROM bookings WHERE id = ? LIMIT 1",
      [bookingId],
    );

    if (bookingRows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Booking not found." });
    }

    const booking = bookingRows[0];
    const userId = String(req.user.id);
    const isCustomer = String(booking.customer_id) === userId;
    const isProvider = String(booking.provider_id) === userId;
    const isAdmin = isAdminRole(req.user.role);

    if (!isCustomer && !isProvider && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to cancel this booking.",
      });
    }

    if (booking.status === "COMPLETED") {
      return res.status(400).json({
        success: false,
        message: "Completed bookings cannot be cancelled.",
      });
    }

    if (booking.payment_status === "PAID" && !isAdmin) {
      return res.status(400).json({
        success: false,
        message:
          "Paid bookings require support/admin review for cancellation or refund.",
      });
    }

    if (isCustomer && booking.status !== "PENDING" && !isAdmin) {
      return res.status(400).json({
        success: false,
        message: "Customers can only cancel pending bookings.",
      });
    }

    if (booking.status === "CANCELLED") {
      return res.status(200).json({
        success: true,
        message: "Booking is already cancelled.",
        data: { id: bookingId, status: booking.status },
      });
    }

    await db.query("UPDATE bookings SET status = ? WHERE id = ?", [
      "CANCELLED",
      bookingId,
    ]);
    const recipientId = isCustomer ? booking.provider_id : booking.customer_id;
    await createNotification({
      user_id: recipientId,
      booking_id: bookingId,
      notification_type: "BOOKING_CANCELLED",
      title: "Booking cancelled",
      message: `Booking #${bookingId} was cancelled.`,
      entity_type: "BOOKING",
      entity_id: bookingId,
    });

    return res.status(200).json({
      success: true,
      message: "Booking cancelled successfully.",
      data: { id: bookingId, status: "CANCELLED" },
    });
  } catch (error) {
    console.error("Error cancelling booking:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while cancelling booking.",
    });
  }
};
