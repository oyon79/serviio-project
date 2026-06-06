const db = require("../config/db");

exports.getMyNotifications = async (req, res) => {
  const userId = req.user?.id;
  const unreadOnly = String(req.query.unread || "").toLowerCase() === "true";

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }

  try {
    const where = unreadOnly ? "AND is_read = FALSE" : "";
    const [rows] = await db.query(
      `SELECT id, booking_id, notification_type, channel, title, message,
              entity_type, entity_id, delivery_status, is_read, read_at, created_at
       FROM notifications
       WHERE user_id = ?
       ${where}
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId],
    );

    return res.status(200).json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching notifications.",
    });
  }
};

exports.getUnreadCount = async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }

  try {
    const [rows] = await db.query(
      "SELECT COUNT(*) AS unread_count FROM notifications WHERE user_id = ? AND is_read = FALSE",
      [userId],
    );

    return res.status(200).json({
      success: true,
      data: {
        unread_count: rows[0].unread_count || 0,
      },
    });
  } catch (error) {
    console.error("Error fetching unread notification count:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching unread notification count.",
    });
  }
};

exports.markNotificationRead = async (req, res) => {
  const userId = req.user?.id;
  const notificationId = req.params.id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }

  try {
    const [result] = await db.query(
      `UPDATE notifications
       SET is_read = TRUE, delivery_status = 'READ', read_at = COALESCE(read_at, NOW())
       WHERE id = ? AND user_id = ?`,
      [notificationId, userId],
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Notification not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Notification marked as read.",
    });
  } catch (error) {
    console.error("Error marking notification read:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while updating notification.",
    });
  }
};

exports.markAllRead = async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }

  try {
    await db.query(
      `UPDATE notifications
       SET is_read = TRUE, delivery_status = 'READ', read_at = COALESCE(read_at, NOW())
       WHERE user_id = ? AND is_read = FALSE`,
      [userId],
    );

    return res.status(200).json({
      success: true,
      message: "All notifications marked as read.",
    });
  } catch (error) {
    console.error("Error marking all notifications read:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while updating notifications.",
    });
  }
};
