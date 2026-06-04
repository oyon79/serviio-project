const db = require("../config/db");

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
