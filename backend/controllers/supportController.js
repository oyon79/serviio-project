const db = require("../config/db");
const {
  createAdminNotifications,
  createNotification,
} = require("../services/notificationService");
const { isSupportRole } = require("../utils/roles");

const allowedCategories = new Set([
  "GENERAL",
  "REFUND",
  "DISPUTE",
  "SAFETY",
  "TECHNICAL",
]);
const allowedStatuses = new Set(["OPEN", "IN_REVIEW", "RESOLVED", "CLOSED"]);
const allowedPriorities = new Set(["LOW", "NORMAL", "HIGH", "URGENT"]);

function makeTicketNumber() {
  const stamp = Date.now().toString(36).toUpperCase();
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SV-${stamp}-${suffix}`;
}

async function canAccessBooking(connection, bookingId, user) {
  if (!bookingId) return true;
  if (isSupportRole(user.role)) return true;

  const [bookingRows] = await connection.query(
    "SELECT customer_id, provider_id FROM bookings WHERE id = ? LIMIT 1",
    [bookingId],
  );

  if (bookingRows.length === 0) return false;

  const booking = bookingRows[0];
  return (
    String(booking.customer_id) === String(user.id) ||
    String(booking.provider_id) === String(user.id)
  );
}

async function canAccessTicket(connection, ticketId, user) {
  const [ticketRows] = await connection.query(
    `SELECT id, created_by, assigned_to
     FROM support_tickets
     WHERE id = ?
     LIMIT 1`,
    [ticketId],
  );

  if (ticketRows.length === 0) return null;
  const ticket = ticketRows[0];

  if (isSupportRole(user.role)) return ticket;
  if (String(ticket.created_by) === String(user.id)) return ticket;
  if (String(ticket.assigned_to) === String(user.id)) return ticket;
  return false;
}

exports.createTicket = async (req, res) => {
  const userId = req.user?.id;
  const {
    booking_id,
    category = "GENERAL",
    subject,
    description,
    priority = "NORMAL",
  } = req.body;

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }

  const normalizedCategory = String(category).toUpperCase();
  const normalizedPriority = String(priority).toUpperCase();

  if (!subject || !description) {
    return res.status(400).json({
      success: false,
      message: "subject and description are required.",
    });
  }

  if (!allowedCategories.has(normalizedCategory)) {
    return res.status(400).json({
      success: false,
      message: "Invalid support ticket category.",
    });
  }

  if (!allowedPriorities.has(normalizedPriority)) {
    return res.status(400).json({
      success: false,
      message: "Invalid support ticket priority.",
    });
  }

  const connection = await db.getConnection();

  try {
    const bookingAllowed = await canAccessBooking(connection, booking_id, req.user);
    if (!bookingAllowed) {
      return res.status(403).json({
        success: false,
        message: "You can only create tickets for your own bookings.",
      });
    }

    const ticketNumber = makeTicketNumber();
    const [result] = await connection.query(
      `INSERT INTO support_tickets
        (ticket_number, booking_id, created_by, category, subject, description, priority)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        ticketNumber,
        booking_id || null,
        userId,
        normalizedCategory,
        subject.trim(),
        description.trim(),
        normalizedPriority,
      ],
    );

    await connection.query(
      `INSERT INTO support_ticket_messages
        (ticket_id, sender_id, message, is_internal)
       VALUES (?, ?, ?, FALSE)`,
      [result.insertId, userId, description.trim()],
    );

    if (
      booking_id &&
      ["REFUND", "DISPUTE", "SAFETY"].includes(normalizedCategory)
    ) {
      await connection.query(
        `UPDATE escrow_payments
         SET status = 'DISPUTED'
         WHERE booking_id = ? AND status = 'HELD'`,
        [booking_id],
      );
    }

    await createAdminNotifications(
      {
        notification_type: "SUPPORT_TICKET_CREATED",
        title: "New support ticket",
        message: `${normalizedCategory} ticket opened: ${subject.trim()}`,
        entity_type: "SUPPORT_TICKET",
        entity_id: result.insertId,
        staff_roles: ["admin", "super_admin", "support_agent"],
      },
      connection,
    );

    return res.status(201).json({
      success: true,
      message: "Support ticket created.",
      data: {
        id: result.insertId,
        ticket_number: ticketNumber,
        status: "OPEN",
      },
    });
  } catch (error) {
    console.error("Error creating support ticket:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while creating support ticket.",
    });
  } finally {
    connection.release();
  }
};

exports.getMyTickets = async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }

  try {
    const [rows] = await db.query(
      `SELECT id, ticket_number, booking_id, category, subject, status,
              priority, resolution, created_at, updated_at
       FROM support_tickets
       WHERE created_by = ? OR assigned_to = ?
       ORDER BY updated_at DESC`,
      [userId, userId],
    );

    return res.status(200).json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    console.error("Error fetching support tickets:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching support tickets.",
    });
  }
};

exports.getTicketById = async (req, res) => {
  const ticketId = req.params.id;
  const connection = await db.getConnection();

  try {
    const access = await canAccessTicket(connection, ticketId, req.user);
    if (access === null) {
      return res.status(404).json({
        success: false,
        message: "Support ticket not found.",
      });
    }
    if (!access) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to view this support ticket.",
      });
    }

    const [ticketRows] = await connection.query(
      `SELECT t.*, u.first_name, u.last_name, u.email
       FROM support_tickets t
       JOIN users u ON u.id = t.created_by
       WHERE t.id = ?
       LIMIT 1`,
      [ticketId],
    );
    const messageVisibility = isSupportRole(req.user.role)
      ? ""
      : "AND m.is_internal = FALSE";
    const [messages] = await connection.query(
      `SELECT m.id, m.sender_id, m.message, m.is_internal, m.created_at,
              u.first_name, u.last_name, u.role
       FROM support_ticket_messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.ticket_id = ?
       ${messageVisibility}
       ORDER BY m.created_at ASC`,
      [ticketId],
    );

    return res.status(200).json({
      success: true,
      data: {
        ticket: ticketRows[0],
        messages,
      },
    });
  } catch (error) {
    console.error("Error fetching support ticket:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching support ticket.",
    });
  } finally {
    connection.release();
  }
};

exports.addMessage = async (req, res) => {
  const ticketId = req.params.id;
  const userId = req.user?.id;
  const { message, is_internal = false } = req.body;
  const connection = await db.getConnection();

  if (!message || !message.trim()) {
    connection.release();
    return res.status(400).json({
      success: false,
      message: "message is required.",
    });
  }

  try {
    const access = await canAccessTicket(connection, ticketId, req.user);
    if (access === null) {
      return res.status(404).json({
        success: false,
        message: "Support ticket not found.",
      });
    }
    if (!access) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to update this support ticket.",
      });
    }

    const internal = isSupportRole(req.user.role) ? !!is_internal : false;
    await connection.query(
      `INSERT INTO support_ticket_messages
        (ticket_id, sender_id, message, is_internal)
       VALUES (?, ?, ?, ?)`,
      [ticketId, userId, message.trim(), internal],
    );
    await connection.query(
      "UPDATE support_tickets SET status = IF(status = 'CLOSED', 'CLOSED', 'IN_REVIEW') WHERE id = ?",
      [ticketId],
    );
    if (String(access.created_by) !== String(userId)) {
      await createNotification(
        {
          user_id: access.created_by,
          notification_type: "SUPPORT_TICKET_UPDATED",
          title: "Support ticket updated",
          message: "A new message was added to your support ticket.",
          entity_type: "SUPPORT_TICKET",
          entity_id: ticketId,
        },
        connection,
      );
    } else {
      await createAdminNotifications(
        {
          notification_type: "SUPPORT_TICKET_UPDATED",
          title: "Support ticket updated",
          message: "A user added a new support ticket message.",
          entity_type: "SUPPORT_TICKET",
          entity_id: ticketId,
          staff_roles: ["admin", "super_admin", "support_agent"],
        },
        connection,
      );
    }

    return res.status(201).json({
      success: true,
      message: "Support message added.",
    });
  } catch (error) {
    console.error("Error adding support message:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while adding support message.",
    });
  } finally {
    connection.release();
  }
};

exports.listAllTickets = async (req, res) => {
  const { status } = req.query;
  const values = [];
  let where = "";

  if (status) {
    const normalizedStatus = String(status).toUpperCase();
    if (!allowedStatuses.has(normalizedStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ticket status.",
      });
    }
    where = "WHERE t.status = ?";
    values.push(normalizedStatus);
  }

  try {
    const [rows] = await db.query(
      `SELECT t.id, t.ticket_number, t.booking_id, t.category, t.subject,
              t.status, t.priority, t.created_at, t.updated_at,
              u.first_name, u.last_name, u.email
       FROM support_tickets t
       JOIN users u ON u.id = t.created_by
       ${where}
       ORDER BY FIELD(t.priority, 'URGENT', 'HIGH', 'NORMAL', 'LOW'),
                t.updated_at DESC`,
      values,
    );

    return res.status(200).json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    console.error("Error listing support tickets:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while listing support tickets.",
    });
  }
};

exports.updateTicket = async (req, res) => {
  const ticketId = req.params.id;
  const { status, priority, assigned_to, resolution } = req.body;
  const fields = {};

  if (status !== undefined) {
    const normalizedStatus = String(status).toUpperCase();
    if (!allowedStatuses.has(normalizedStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ticket status.",
      });
    }
    fields.status = normalizedStatus;
  }

  if (priority !== undefined) {
    const normalizedPriority = String(priority).toUpperCase();
    if (!allowedPriorities.has(normalizedPriority)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ticket priority.",
      });
    }
    fields.priority = normalizedPriority;
  }

  if (assigned_to !== undefined) fields.assigned_to = assigned_to || null;
  if (resolution !== undefined) fields.resolution = resolution || null;

  if (Object.keys(fields).length === 0) {
    return res.status(400).json({
      success: false,
      message: "No ticket values provided to update.",
    });
  }

  try {
    const setClause = Object.keys(fields)
      .map((field) => `${field} = ?`)
      .join(", ");
    const values = Object.values(fields);
    values.push(ticketId);

    const [existingRows] = await db.query(
      "SELECT created_by FROM support_tickets WHERE id = ? LIMIT 1",
      [ticketId],
    );
    const [result] = await db.query(
      `UPDATE support_tickets SET ${setClause} WHERE id = ?`,
      values,
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Support ticket not found.",
      });
    }

    if (existingRows.length > 0 && fields.status) {
      await createNotification({
        user_id: existingRows[0].created_by,
        notification_type: "SUPPORT_TICKET_STATUS",
        title: "Support ticket status changed",
        message: `Your support ticket is now ${fields.status}.`,
        entity_type: "SUPPORT_TICKET",
        entity_id: ticketId,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Support ticket updated.",
    });
  } catch (error) {
    console.error("Error updating support ticket:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while updating support ticket.",
    });
  }
};
