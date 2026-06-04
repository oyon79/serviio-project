const db = require("../config/db");

const allowedStatuses = new Set([
  "PENDING",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
]);

// Create a new booking
exports.createBooking = async (req, res) => {
  const {
    customer_id,
    provider_id,
    service_type,
    job_location,
    booking_date,
    is_emergency,
    estimated_price_range,
  } = req.body;

  try {
    const [customerRows] = await db.query(
      "SELECT id FROM users WHERE id = ? AND role = 'customer' LIMIT 1",
      [customer_id],
    );
    if (customerRows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Customer not found" });
    }

    const [providerRows] = await db.query(
      "SELECT u.id FROM users u INNER JOIN provider_profiles p ON p.user_id = u.id WHERE u.id = ? AND u.role = 'provider' LIMIT 1",
      [provider_id],
    );
    if (providerRows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Provider not found" });
    }

    // 1. Generate a secure, random 4-digit handshake code
    const handshake_code = Math.floor(1000 + Math.random() * 9000).toString();

    // 2. Insert the booking into the database
    const [result] = await db.query(
      `INSERT INTO bookings 
            (customer_id, provider_id, service_type, estimated_price_range, is_emergency, status, handshake_code, job_location, booking_date) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        customer_id,
        provider_id,
        service_type,
        estimated_price_range,
        is_emergency || false,
        "PENDING", // Initial status aligned with schema
        handshake_code,
        job_location,
        booking_date || null,
      ],
    );

    // 3. Send success response back to the frontend
    res.status(201).json({
      success: true,
      message: "Booking created successfully!",
      booking_id: result.insertId,
      handshake_code: handshake_code, // We send this back so the customer can see it!
    });
  } catch (error) {
    console.error("Error creating booking:", error);
    res
      .status(500)
      .json({ success: false, message: "Server Error during booking" });
  }
};
// ... existing createBooking function ...

// Get a specific booking by its ID
exports.getBookingById = async (req, res) => {
  const bookingId = req.params.id;

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

    res.status(200).json({
      success: true,
      data: booking[0],
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
        SELECT b.*, u.first_name as customer_name, u.phone as customer_phone 
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

    if (String(booking[0].provider_id) !== String(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: "You can only verify bookings assigned to you.",
      });
    }

    // Check if the code matches
    if (booking[0].handshake_code !== code) {
      return res.status(400).json({
        success: false,
        message: "Invalid 4-digit code! Please try again.",
      });
    }
    // If it matches, update the job status to 'IN_PROGRESS'
    await db.query("UPDATE bookings SET status = ? WHERE id = ?", [
      "IN_PROGRESS",
      bookingId,
    ]);

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
      .json({ success: false, message: "Provider access required" });
  }

  const bookingId = req.params.id;
  const requestedStatus = String(req.body.status || "").toUpperCase();

  if (!allowedStatuses.has(requestedStatus)) {
    return res.status(400).json({
      success: false,
      message:
        "Invalid status. Use PENDING, IN_PROGRESS, COMPLETED, or CANCELLED.",
    });
  }

  try {
    const [bookingRows] = await db.query(
      "SELECT id, provider_id, status FROM bookings WHERE id = ? LIMIT 1",
      [bookingId],
    );

    if (bookingRows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Booking not found." });
    }

    if (String(bookingRows[0].provider_id) !== String(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: "You can only update bookings assigned to you.",
      });
    }

    await db.query("UPDATE bookings SET status = ? WHERE id = ?", [
      requestedStatus,
      bookingId,
    ]);

    return res.status(200).json({
      success: true,
      message: "Booking status updated",
      data: { id: bookingId, status: requestedStatus },
    });
  } catch (error) {
    console.error("Error updating booking status:", error);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};
