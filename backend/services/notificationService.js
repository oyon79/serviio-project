const db = require("../config/db");
const { OPERATIONS_ROLES } = require("../utils/roles");

let realtimeServer = null;

function setNotificationRealtimeServer(io) {
  realtimeServer = io;
}

function normalizeNotification(input) {
  return {
    user_id: input.user_id,
    booking_id: input.booking_id || null,
    notification_type: input.notification_type || "GENERAL",
    channel: input.channel || "IN_APP",
    title: input.title || null,
    message: input.message || null,
    entity_type: input.entity_type || null,
    entity_id: input.entity_id || null,
    delivery_status: input.delivery_status || "QUEUED",
  };
}

function emitNotification(notification) {
  if (!realtimeServer || !notification?.user_id) return;

  realtimeServer.to(`user_room:${notification.user_id}`).emit("notification:new", {
    ...notification,
    is_read: false,
    created_at: new Date().toISOString(),
  });
}

function emitBookingEvent(bookingId, eventName, payload) {
  if (!realtimeServer || !bookingId || !eventName) return;
  realtimeServer.to(`booking_room:${bookingId}`).emit(eventName, payload);
}

async function createNotification(input, executor = db) {
  if (!input || !input.user_id) return null;
  const notification = normalizeNotification(input);

  const [result] = await executor.query(
    `INSERT INTO notifications
      (user_id, booking_id, notification_type, channel, title, message, entity_type, entity_id, delivery_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      notification.user_id,
      notification.booking_id,
      notification.notification_type,
      notification.channel,
      notification.title,
      notification.message,
      notification.entity_type,
      notification.entity_id,
      notification.delivery_status,
    ],
  );

  const createdNotification = {
    id: result.insertId,
    ...notification,
  };

  emitNotification(createdNotification);
  return createdNotification;
}

async function createNotifications(notifications, executor = db) {
  const created = [];
  for (const notification of notifications || []) {
    const row = await createNotification(notification, executor);
    if (row) created.push(row);
  }
  return created;
}

async function createAdminNotifications(input, executor = db) {
  const roles = Array.from(input.staff_roles || OPERATIONS_ROLES);
  const placeholders = roles.map(() => "?").join(", ");
  const [admins] = await executor.query(
    `SELECT id FROM users WHERE role IN (${placeholders}) AND is_active = TRUE`,
    roles,
  );

  return createNotifications(
    admins.map((admin) => ({
      ...input,
      staff_roles: undefined,
      user_id: admin.id,
    })),
    executor,
  );
}

module.exports = {
  setNotificationRealtimeServer,
  emitBookingEvent,
  createNotification,
  createNotifications,
  createAdminNotifications,
};
