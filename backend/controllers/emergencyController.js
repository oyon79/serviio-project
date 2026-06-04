const db = require("../config/db");

// Create an emergency log and return a community link for fallback
exports.createEmergency = async (req, res) => {
  const userId = req.user && req.user.id ? req.user.id : null;
  const { booking_id, message, location } = req.body;

  try {
    const [result] = await db.query(
      "INSERT INTO emergency_logs (user_id, booking_id, message, location) VALUES (?, ?, ?, ?)",
      [userId, booking_id || null, message || null, location || null],
    );

    // In production this could trigger a webhook to Facebook API or send notifications.
    const communityLink = "https://www.facebook.com/ServiioSupport";

    res.status(201).json({ success: true, id: result.insertId, communityLink });
  } catch (err) {
    console.error("Emergency log error:", err);
    res
      .status(500)
      .json({ success: false, message: "Server error saving emergency log" });
  }
};
