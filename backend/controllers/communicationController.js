const db = require("../config/db");
const {
  createNotification,
  emitBookingEvent,
} = require("../services/notificationService");
const { isAdminRole } = require("../utils/roles");

const allowedCallTypes = new Set(["VOICE", "VIDEO"]);
const allowedCallStatuses = new Set([
  "REQUESTED",
  "ACCEPTED",
  "DECLINED",
  "COMPLETED",
  "MISSED",
  "CANCELLED",
]);

function normalizeCallType(value) {
  const normalized = String(value || "VOICE").toUpperCase();
  return allowedCallTypes.has(normalized) ? normalized : null;
}

function normalizeCallStatus(value) {
  const normalized = String(value || "").toUpperCase();
  return allowedCallStatuses.has(normalized) ? normalized : null;
}

async function getAccessibleBooking(connection, bookingId, user) {
  if (!user?.id || !bookingId) return null;

  const [rows] = await connection.query(
    `SELECT b.id, b.customer_id, b.provider_id, b.service_type, b.status,
            cu.first_name AS customer_first_name,
            cu.last_name AS customer_last_name,
            pu.first_name AS provider_first_name,
            pu.last_name AS provider_last_name
     FROM bookings b
     JOIN users cu ON cu.id = b.customer_id
     JOIN users pu ON pu.id = b.provider_id
     WHERE b.id = ?
     LIMIT 1`,
    [bookingId],
  );

  if (rows.length === 0) return null;
  const booking = rows[0];
  if (isAdminRole(user.role)) return booking;
  if (String(booking.customer_id) === String(user.id)) return booking;
  if (String(booking.provider_id) === String(user.id)) return booking;
  return false;
}

function getRecipientId(booking, senderId) {
  if (String(booking.customer_id) === String(senderId)) {
    return booking.provider_id;
  }
  if (String(booking.provider_id) === String(senderId)) {
    return booking.customer_id;
  }
  return null;
}

function senderName(row) {
  return `${row.first_name || ""} ${row.last_name || ""}`.trim() || "User";
}

exports.listMessages = async (req, res) => {
  const bookingId = req.params.bookingId;
  const connection = await db.getConnection();

  try {
    const booking = await getAccessibleBooking(connection, bookingId, req.user);
    if (booking === null) {
      return res.status(404).json({
        success: false,
        message: "Booking not found.",
      });
    }
    if (!booking) {
      return res.status(403).json({
        success: false,
        message: "You cannot view this booking conversation.",
      });
    }

    const [rows] = await connection.query(
      `SELECT m.id, m.booking_id, m.sender_id, m.message, m.is_read,
              m.read_at, m.created_at, u.first_name, u.last_name, u.role
       FROM booking_messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.booking_id = ?
       ORDER BY m.created_at ASC, m.id ASC`,
      [bookingId],
    );

    await connection.query(
      `UPDATE booking_messages
       SET is_read = TRUE, read_at = COALESCE(read_at, NOW())
       WHERE booking_id = ? AND sender_id <> ? AND is_read = FALSE`,
      [bookingId, req.user.id],
    );

    return res.status(200).json({
      success: true,
      count: rows.length,
      data: rows.map((row) => ({
        ...row,
        sender_name: senderName(row),
      })),
    });
  } catch (error) {
    console.error("Error listing booking messages:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while loading booking messages.",
    });
  } finally {
    connection.release();
  }
};

exports.createMessage = async (req, res) => {
  const bookingId = req.params.bookingId;
  const message = String(req.body.message || "").trim();
  const connection = await db.getConnection();

  if (!message) {
    connection.release();
    return res.status(400).json({
      success: false,
      message: "message is required.",
    });
  }

  try {
    const booking = await getAccessibleBooking(connection, bookingId, req.user);
    if (booking === null) {
      return res.status(404).json({
        success: false,
        message: "Booking not found.",
      });
    }
    if (!booking) {
      return res.status(403).json({
        success: false,
        message: "You cannot message on this booking.",
      });
    }

    const [result] = await connection.query(
      `INSERT INTO booking_messages (booking_id, sender_id, message)
       VALUES (?, ?, ?)`,
      [bookingId, req.user.id, message],
    );

    const [messageRows] = await connection.query(
      `SELECT m.id, m.booking_id, m.sender_id, m.message, m.is_read,
              m.read_at, m.created_at, u.first_name, u.last_name, u.role
       FROM booking_messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.id = ?
       LIMIT 1`,
      [result.insertId],
    );

    const created = {
      ...messageRows[0],
      sender_name: senderName(messageRows[0]),
    };
    const recipientId = getRecipientId(booking, req.user.id);

    if (recipientId) {
      await createNotification(
        {
          user_id: recipientId,
          booking_id: booking.id,
          notification_type: "BOOKING_MESSAGE",
          title: "New booking message",
          message: `${created.sender_name}: ${message.slice(0, 120)}`,
          entity_type: "BOOKING_MESSAGE",
          entity_id: created.id,
        },
        connection,
      );
    }

    emitBookingEvent(booking.id, "booking:message:new", created);

    return res.status(201).json({
      success: true,
      message: "Message sent.",
      data: created,
    });
  } catch (error) {
    console.error("Error creating booking message:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while sending booking message.",
    });
  } finally {
    connection.release();
  }
};

exports.listCallRequests = async (req, res) => {
  const bookingId = req.params.bookingId;
  const connection = await db.getConnection();

  try {
    const booking = await getAccessibleBooking(connection, bookingId, req.user);
    if (booking === null) {
      return res.status(404).json({
        success: false,
        message: "Booking not found.",
      });
    }
    if (!booking) {
      return res.status(403).json({
        success: false,
        message: "You cannot view call requests for this booking.",
      });
    }

    const [rows] = await connection.query(
      `SELECT c.*, requester.first_name AS requester_first_name,
              requester.last_name AS requester_last_name,
              recipient.first_name AS recipient_first_name,
              recipient.last_name AS recipient_last_name
       FROM booking_call_requests c
       JOIN users requester ON requester.id = c.requester_id
       JOIN users recipient ON recipient.id = c.recipient_id
       WHERE c.booking_id = ?
       ORDER BY c.created_at DESC`,
      [bookingId],
    );

    return res.status(200).json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    console.error("Error listing call requests:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while loading call requests.",
    });
  } finally {
    connection.release();
  }
};

exports.createCallRequest = async (req, res) => {
  const bookingId = req.params.bookingId;
  const callType = normalizeCallType(req.body.call_type);
  const reason = String(req.body.reason || "").trim() || null;
  const connection = await db.getConnection();

  if (!callType) {
    connection.release();
    return res.status(400).json({
      success: false,
      message: "call_type must be VOICE or VIDEO.",
    });
  }

  try {
    const booking = await getAccessibleBooking(connection, bookingId, req.user);
    if (booking === null) {
      return res.status(404).json({
        success: false,
        message: "Booking not found.",
      });
    }
    if (!booking) {
      return res.status(403).json({
        success: false,
        message: "You cannot request calls for this booking.",
      });
    }

    const recipientId = getRecipientId(booking, req.user.id);
    if (!recipientId) {
      return res.status(400).json({
        success: false,
        message: "Could not determine the booking call recipient.",
      });
    }

    const [result] = await connection.query(
      `INSERT INTO booking_call_requests
        (booking_id, requester_id, recipient_id, call_type, reason)
       VALUES (?, ?, ?, ?, ?)`,
      [bookingId, req.user.id, recipientId, callType, reason],
    );

    const callRequest = {
      id: result.insertId,
      booking_id: Number(bookingId),
      requester_id: req.user.id,
      recipient_id: recipientId,
      call_type: callType,
      reason,
      status: "REQUESTED",
      created_at: new Date().toISOString(),
    };

    await createNotification(
      {
        user_id: recipientId,
        booking_id: booking.id,
        notification_type: "BOOKING_CALL_REQUEST",
        title: "Call request",
        message: `${req.user.role} requested a ${callType.toLowerCase()} call for booking #${booking.id}.`,
        entity_type: "BOOKING_CALL_REQUEST",
        entity_id: callRequest.id,
      },
      connection,
    );
    emitBookingEvent(booking.id, "booking:call:requested", callRequest);

    return res.status(201).json({
      success: true,
      message: "Call request created.",
      data: callRequest,
    });
  } catch (error) {
    console.error("Error creating call request:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while creating call request.",
    });
  } finally {
    connection.release();
  }
};

exports.updateCallRequest = async (req, res) => {
  const callRequestId = req.params.id;
  const status = normalizeCallStatus(req.body.status);
  const connection = await db.getConnection();

  if (!status || status === "REQUESTED") {
    connection.release();
    return res.status(400).json({
      success: false,
      message: "status must be ACCEPTED, DECLINED, COMPLETED, MISSED, or CANCELLED.",
    });
  }

  try {
    const [rows] = await connection.query(
      `SELECT c.*, b.customer_id, b.provider_id
       FROM booking_call_requests c
       JOIN bookings b ON b.id = c.booking_id
       WHERE c.id = ?
       LIMIT 1`,
      [callRequestId],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Call request not found.",
      });
    }

    const callRequest = rows[0];
    const isParticipant =
      isAdminRole(req.user.role) ||
      String(callRequest.requester_id) === String(req.user.id) ||
      String(callRequest.recipient_id) === String(req.user.id);
    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: "You cannot update this call request.",
      });
    }

    const acceptedAt = status === "ACCEPTED" ? "NOW()" : "accepted_at";
    const completedAt =
      status === "COMPLETED" || status === "MISSED" || status === "CANCELLED"
        ? "NOW()"
        : "completed_at";
    await connection.query(
      `UPDATE booking_call_requests
       SET status = ?, accepted_at = ${acceptedAt}, completed_at = ${completedAt}
       WHERE id = ?`,
      [status, callRequestId],
    );

    const notifyUserId =
      String(callRequest.requester_id) === String(req.user.id)
        ? callRequest.recipient_id
        : callRequest.requester_id;
    await createNotification(
      {
        user_id: notifyUserId,
        booking_id: callRequest.booking_id,
        notification_type: "BOOKING_CALL_STATUS",
        title: "Call request updated",
        message: `Call request #${callRequest.id} is now ${status}.`,
        entity_type: "BOOKING_CALL_REQUEST",
        entity_id: callRequest.id,
      },
      connection,
    );
    emitBookingEvent(callRequest.booking_id, "booking:call:updated", {
      id: Number(callRequestId),
      booking_id: callRequest.booking_id,
      status,
    });

    return res.status(200).json({
      success: true,
      message: "Call request updated.",
      data: {
        id: Number(callRequestId),
        status,
      },
    });
  } catch (error) {
    console.error("Error updating call request:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while updating call request.",
    });
  } finally {
    connection.release();
  }
};
