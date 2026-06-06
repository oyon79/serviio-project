const db = require("../config/db");
const { createNotifications } = require("../services/notificationService");

function normalizeRating(value) {
  const rating = Number(value);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return null;
  }
  return rating;
}

function normalizeText(value, maxLength) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

async function refreshProviderRating(providerId, executor = db) {
  await executor.query(
    `UPDATE provider_profiles
     SET total_reviews = (
           SELECT COUNT(*) FROM reviews WHERE provider_id = ?
         ),
         average_rating = (
           SELECT ROUND(COALESCE(AVG(rating), 0), 2)
           FROM reviews
           WHERE provider_id = ?
         )
     WHERE user_id = ?`,
    [providerId, providerId, providerId],
  );
}

function formatCustomerName(row) {
  return `${row.customer_first_name || "Customer"} ${
    row.customer_last_name || ""
  }`.trim();
}

function formatProviderName(row) {
  return `${row.provider_first_name || "Provider"} ${
    row.provider_last_name || ""
  }`.trim();
}

exports.createReview = async (req, res) => {
  const customerId = req.user && req.user.id;
  const bookingId = Number(req.body.booking_id || req.body.bookingId);
  const rating = normalizeRating(req.body.rating);
  const title = normalizeText(req.body.title, 255);
  const comment = normalizeText(req.body.comment, 2000);

  if (!customerId) {
    return res
      .status(401)
      .json({ success: false, message: "Authentication required" });
  }

  if (!bookingId || !rating) {
    return res.status(400).json({
      success: false,
      message: "booking_id and a rating from 1 to 5 are required.",
    });
  }

  let connection;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [bookingRows] = await connection.query(
      `SELECT id, customer_id, provider_id, status, service_type
       FROM bookings
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [bookingId],
    );

    if (bookingRows.length === 0) {
      await connection.rollback();
      return res
        .status(404)
        .json({ success: false, message: "Booking not found." });
    }

    const booking = bookingRows[0];
    if (String(booking.customer_id) !== String(customerId)) {
      await connection.rollback();
      return res.status(403).json({
        success: false,
        message: "You can only review your own bookings.",
      });
    }

    if (booking.status !== "COMPLETED") {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Only completed bookings can be reviewed.",
      });
    }

    const [existingRows] = await connection.query(
      "SELECT id FROM reviews WHERE booking_id = ? LIMIT 1",
      [bookingId],
    );

    if (existingRows.length > 0) {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: "This booking already has a review.",
      });
    }

    const [result] = await connection.query(
      `INSERT INTO reviews
        (booking_id, provider_id, customer_id, rating, title, comment)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [bookingId, booking.provider_id, customerId, rating, title, comment],
    );

    await refreshProviderRating(booking.provider_id, connection);

    await createNotifications(
      [
        {
          user_id: booking.provider_id,
          booking_id: bookingId,
          notification_type: "REVIEW_RECEIVED",
          title: "New customer review",
          message: `A customer rated your ${booking.service_type || "service"} booking ${rating}/5.`,
          entity_type: "REVIEW",
          entity_id: result.insertId,
        },
        {
          user_id: customerId,
          booking_id: bookingId,
          notification_type: "REVIEW_SUBMITTED",
          title: "Review submitted",
          message: "Thanks for sharing feedback about your completed booking.",
          entity_type: "REVIEW",
          entity_id: result.insertId,
        },
      ],
      connection,
    );

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: "Review submitted successfully.",
      data: {
        id: result.insertId,
        booking_id: bookingId,
        provider_id: booking.provider_id,
        customer_id: customerId,
        rating,
        title,
        comment,
      },
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error("Error creating review:", error);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "This booking already has a review.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server error while creating review.",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

exports.getProviderReviews = async (req, res) => {
  const providerId = req.user && req.user.id;
  if (!providerId) {
    return res
      .status(401)
      .json({ success: false, message: "Authentication required" });
  }

  try {
    const query = `
      SELECT
        r.id,
        r.rating,
        r.title,
        r.comment,
        r.created_at,
        u.first_name AS customer_first_name,
        u.last_name AS customer_last_name
      FROM reviews r
      LEFT JOIN users u ON u.id = r.customer_id
      WHERE r.provider_id = ?
      ORDER BY r.created_at DESC
    `;

    const [rows] = await db.query(query, [providerId]);
    const reviews = rows.map((review) => ({
      id: review.id,
      rating: review.rating,
      title: review.title,
      comment: review.comment,
      created_at: review.created_at,
      customer_name: `${review.customer_first_name || "Customer"} ${
        review.customer_last_name || ""
      }`.trim(),
    }));

    return res.status(200).json({
      success: true,
      count: reviews.length,
      data: reviews,
    });
  } catch (error) {
    console.error("Error fetching provider reviews:", error);
    if (error.code === "ER_NO_SUCH_TABLE") {
      return res.status(200).json({
        success: true,
        count: 0,
        data: [],
        message: "No reviews table found yet.",
      });
    }
    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

exports.getMyReviews = async (req, res) => {
  const customerId = req.user && req.user.id;
  if (!customerId) {
    return res
      .status(401)
      .json({ success: false, message: "Authentication required" });
  }

  try {
    const [rows] = await db.query(
      `SELECT
        r.id,
        r.booking_id,
        r.provider_id,
        r.rating,
        r.title,
        r.comment,
        r.created_at,
        u.first_name AS provider_first_name,
        u.last_name AS provider_last_name,
        b.service_type,
        b.booking_date
       FROM reviews r
       LEFT JOIN users u ON u.id = r.provider_id
       LEFT JOIN bookings b ON b.id = r.booking_id
       WHERE r.customer_id = ?
       ORDER BY r.created_at DESC`,
      [customerId],
    );

    const reviews = rows.map((review) => ({
      id: review.id,
      booking_id: review.booking_id,
      provider_id: review.provider_id,
      provider_name: formatProviderName(review),
      service_type: review.service_type,
      booking_date: review.booking_date,
      rating: review.rating,
      title: review.title,
      comment: review.comment,
      created_at: review.created_at,
    }));

    return res.status(200).json({
      success: true,
      count: reviews.length,
      data: reviews,
    });
  } catch (error) {
    console.error("Error fetching customer reviews:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

exports.getPublicProviderReviews = async (req, res) => {
  const providerId = Number(req.params.providerId);
  if (!providerId) {
    return res
      .status(400)
      .json({ success: false, message: "providerId is required." });
  }

  try {
    const [rows] = await db.query(
      `SELECT
        r.id,
        r.booking_id,
        r.rating,
        r.title,
        r.comment,
        r.created_at,
        u.first_name AS customer_first_name,
        u.last_name AS customer_last_name,
        b.service_type
       FROM reviews r
       LEFT JOIN users u ON u.id = r.customer_id
       LEFT JOIN bookings b ON b.id = r.booking_id
       WHERE r.provider_id = ?
       ORDER BY r.created_at DESC`,
      [providerId],
    );

    const reviews = rows.map((review) => ({
      id: review.id,
      booking_id: review.booking_id,
      service_type: review.service_type,
      rating: review.rating,
      title: review.title,
      comment: review.comment,
      created_at: review.created_at,
      customer_name: formatCustomerName(review),
    }));

    return res.status(200).json({
      success: true,
      count: reviews.length,
      data: reviews,
    });
  } catch (error) {
    console.error("Error fetching public provider reviews:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
