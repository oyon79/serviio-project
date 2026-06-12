const jwt = require("jsonwebtoken");
const db = require("../config/db");
const { isAdminRole } = require("../utils/roles");
const { socketDebug } = require("../utils/logger");

module.exports = function (io) {
  io.on("connection", (socket) => {
    socketDebug("Socket connected:", socket.id);

    function getToken(payload = {}) {
      const authHeader = socket.handshake.headers?.authorization || "";
      const bearerToken = authHeader.startsWith("Bearer ")
        ? authHeader.slice(7)
        : null;
      return (
        payload.token ||
        socket.handshake.auth?.token ||
        socket.handshake.query?.token ||
        bearerToken ||
        null
      );
    }

    function authenticate(payload = {}) {
      const token = getToken(payload);
      if (!token || !process.env.JWT_SECRET) return null;
      try {
        return jwt.verify(token, process.env.JWT_SECRET);
      } catch (error) {
        return null;
      }
    }

    function deny(eventName, message = "Socket authorization failed.") {
      socket.emit("socket:error", { event: eventName, message });
    }

    async function canAccessBooking(user, bookingId) {
      if (!user?.id || !bookingId) return false;

      const [rows] = await db.query(
        "SELECT customer_id, provider_id FROM bookings WHERE id = ? LIMIT 1",
        [bookingId],
      );
      if (rows.length === 0) return false;

      const booking = rows[0];
      if (isAdminRole(user.role)) return true;
      if (user.role === "provider") {
        return String(booking.provider_id) === String(user.id);
      }
      if (user.role === "customer") {
        return String(booking.customer_id) === String(user.id);
      }
      return false;
    }

    async function persistProviderLocation(update) {
      await db.query(
        `INSERT INTO provider_locations
          (provider_id, booking_id, latitude, longitude, bearing, speed, accuracy, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           booking_id = VALUES(booking_id),
           latitude = VALUES(latitude),
           longitude = VALUES(longitude),
           bearing = VALUES(bearing),
           speed = VALUES(speed),
           accuracy = VALUES(accuracy),
           last_seen_at = NOW()`,
        [
          update.providerId,
          update.bookingId || null,
          update.lat,
          update.lng,
          update.bearing,
          update.speed,
          update.accuracy,
        ],
      );
    }

    function isValidLocation(lat, lng) {
      const latitude = Number(lat);
      const longitude = Number(lng);
      return (
        Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        latitude >= -90 &&
        latitude <= 90 &&
        longitude >= -180 &&
        longitude <= 180
      );
    }

    // Provider joins a booking-specific room to send updates for that booking.
    socket.on("booking:join", async (payload = {}) => {
      const { bookingId } = payload;
      const user = authenticate(payload);
      if (!user) {
        deny("booking:join");
        return;
      }
      if (!bookingId || !(await canAccessBooking(user, bookingId))) {
        deny("booking:join", "You cannot join this booking conversation.");
        return;
      }
      socket.join(`booking_room:${bookingId}`);
      socket.emit("booking:joined", { bookingId });
      socketDebug(`User ${user.id} joined booking_room:${bookingId}`);
    });

    // Provider joins a booking-specific room to send updates for that booking.
    socket.on("provider:join_booking", async (payload = {}) => {
      const { bookingId } = payload;
      const user = authenticate(payload);
      if (!user || user.role !== "provider") {
        deny("provider:join_booking");
        return;
      }
      if (!bookingId || !(await canAccessBooking(user, bookingId))) {
        deny("provider:join_booking", "You cannot join this booking room.");
        return;
      }
      socket.join(`booking_room:${bookingId}`);
      socketDebug(
        `Provider ${user.id} joined booking room booking_room:${bookingId}`,
      );
    });

    // Legacy/current frontend provider room support.
    socket.on("provider:join", (payload = {}) => {
      const { providerId } = payload;
      const user = authenticate(payload);
      if (!user || user.role !== "provider" || String(user.id) !== String(providerId)) {
        deny("provider:join");
        return;
      }
      socket.join(`provider_room:${user.id}`);
      socketDebug(`Provider ${user.id} joined provider_room:${user.id}`);
    });

    // User joins the booking room to receive live provider location updates.
    socket.on("user:join_booking", async (payload = {}) => {
      const { bookingId } = payload;
      const user = authenticate(payload);
      if (!user) {
        deny("user:join_booking");
        return;
      }
      if (!bookingId || !(await canAccessBooking(user, bookingId))) {
        deny("user:join_booking", "You cannot join this booking room.");
        return;
      }
      socket.join(`booking_room:${bookingId}`);
      socketDebug(
        `User ${user.id} joined booking room booking_room:${bookingId}`,
      );
    });

    // Legacy/current frontend customer subscription support.
    socket.on("customer:subscribe", (payload = {}) => {
      const { providerId } = payload;
      const user = authenticate(payload);
      if (!user) {
        deny("customer:subscribe");
        return;
      }
      if (!isAdminRole(user.role) && String(user.id) !== String(providerId)) {
        deny(
          "customer:subscribe",
          "Subscribe to booking rooms for customer tracking.",
        );
        return;
      }
      socket.join(`provider_room:${providerId}`);
      socketDebug(`Customer subscribed to provider_room:${providerId}`);
    });

    socket.on("notifications:join", ({ token }) => {
      if (!token || !process.env.JWT_SECRET) {
        socket.emit("notifications:error", {
          message: "Notification authentication failed.",
        });
        return;
      }

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (!decoded?.id) {
          throw new Error("Token missing user id");
        }
        socket.join(`user_room:${decoded.id}`);
        socket.emit("notifications:ready", {
          userId: decoded.id,
        });
        socketDebug(`User ${decoded.id} joined notification room`);
      } catch (error) {
        socket.emit("notifications:error", {
          message: "Invalid notification token.",
        });
      }
    });

    // Provider sends a live location update for a specific booking.
    socket.on("location_update", async (payload) => {
      const { bookingId, providerId, lat, lng, bearing, speed, accuracy } =
        payload || {};
      const user = authenticate(payload);
      if (!user || user.role !== "provider" || String(user.id) !== String(providerId)) {
        deny("location_update");
        return;
      }
      if (
        !bookingId ||
        !providerId ||
        lat == null ||
        lng == null ||
        !isValidLocation(lat, lng)
      ) {
        return;
      }
      if (!(await canAccessBooking(user, bookingId))) {
        deny("location_update", "You cannot update this booking location.");
        return;
      }

      const update = {
        bookingId,
        providerId,
        lat: Number(lat),
        lng: Number(lng),
        bearing: bearing || 0,
        speed: speed || null,
        accuracy: accuracy || null,
        timestamp: Date.now(),
      };

      io.to(`booking_room:${bookingId}`).emit("location_update", update);
      persistProviderLocation(update).catch((error) => {
        console.error("Failed to persist provider location:", error.message);
      });
      socketDebug(`Broadcast location_update for booking ${bookingId}`);
    });

    // Provider-level live location used by the current home/provider dashboard pages.
    socket.on("provider:location", (payload) => {
      const { providerId, lat, lng, bearing, speed, accuracy } = payload || {};
      const user = authenticate(payload);
      if (!user || user.role !== "provider" || String(user.id) !== String(providerId)) {
        deny("provider:location");
        return;
      }
      if (
        !providerId ||
        lat == null ||
        lng == null ||
        !isValidLocation(lat, lng)
      ) {
        return;
      }

      const update = {
        providerId,
        lat: Number(lat),
        lng: Number(lng),
        bearing: bearing || 0,
        speed: speed || null,
        accuracy: accuracy || null,
        timestamp: Date.now(),
      };

      io.to(`provider_room:${providerId}`).emit("provider:location", update);
      persistProviderLocation(update).catch((error) => {
        console.error("Failed to persist provider location:", error.message);
      });
      socketDebug(`Broadcast provider:location for provider ${providerId}`);
    });

    socket.on("disconnect", () => {
      socketDebug("Socket disconnected:", socket.id);
    });
  });
};
