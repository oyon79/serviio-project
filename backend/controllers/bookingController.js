const db = require("../config/db");

// Create a new booking
exports.createBooking = async (req, res) => {
  const {
    customer_id,
    provider_id,
    service_type,
    job_location,
    is_emergency,
    estimated_price_range,
  } = req.body;

  try {
    // 1. Generate a secure, random 4-digit handshake code
    const handshake_code = Math.floor(1000 + Math.random() * 9000).toString();

    // 2. Insert the booking into the database
    const [result] = await db.query(
      `INSERT INTO bookings 
            (customer_id, provider_id, service_type, estimated_price_range, is_emergency, status, handshake_code, job_location) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        customer_id,
        provider_id,
        service_type,
        estimated_price_range,
        is_emergency || false,
        "searching", // Initial status
        handshake_code,
        job_location,
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
  const providerId = req.params.providerId;

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
  const { booking_id, handshake_code } = req.body;

  try {
    // Find the booking
    const [booking] = await db.query("SELECT * FROM bookings WHERE id = ?", [
      booking_id,
    ]);

    if (booking.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Booking not found." });
    }

    // Check if the code matches
    if (booking[0].handshake_code !== handshake_code) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Invalid 4-digit code! Please try again.",
        });
    }

    // If it matches, update the job status to 'working'
    await db.query("UPDATE bookings SET status = ? WHERE id = ?", [
      "working",
      booking_id,
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
