const db = require("../config/db");
const { createAdminNotifications } = require("../services/notificationService");

// Create an emergency log and return a community link for fallback
exports.createEmergency = async (req, res) => {
  const userId = req.user && req.user.id ? req.user.id : null;
  const {
    booking_id,
    emergency_type = "GENERAL",
    message,
    location,
    latitude,
    longitude,
  } = req.body;

  try {
    const [result] = await db.query(
      `INSERT INTO emergency_logs
        (user_id, booking_id, emergency_type, message, location, latitude, longitude)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        booking_id || null,
        emergency_type || "GENERAL",
        message || null,
        location || null,
        latitude || null,
        longitude || null,
      ],
    );

    await createAdminNotifications({
      booking_id: booking_id || null,
      notification_type: "SOS_ALERT",
      title: "SOS emergency alert",
      message: message || "A user triggered an emergency request.",
      entity_type: "EMERGENCY_LOG",
      entity_id: result.insertId,
      staff_roles: ["admin", "super_admin", "support_agent"],
    });

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
