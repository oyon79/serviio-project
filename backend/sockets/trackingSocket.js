const jwt = require("jsonwebtoken");

module.exports = function (io) {
  io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);

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
    socket.on("provider:join_booking", ({ bookingId, providerId }) => {
      if (!bookingId || !providerId) return;
      socket.join(`booking_room:${bookingId}`);
      console.log(
        `Provider ${providerId} joined booking room booking_room:${bookingId}`,
      );
    });

    // Legacy/current frontend provider room support.
    socket.on("provider:join", ({ providerId }) => {
      if (!providerId) return;
      socket.join(`provider_room:${providerId}`);
      console.log(`Provider ${providerId} joined provider_room:${providerId}`);
    });

    // User joins the booking room to receive live provider location updates.
    socket.on("user:join_booking", ({ bookingId, userId }) => {
      if (!bookingId || !userId) return;
      socket.join(`booking_room:${bookingId}`);
      console.log(
        `User ${userId} joined booking room booking_room:${bookingId}`,
      );
    });

    // Legacy/current frontend customer subscription support.
    socket.on("customer:subscribe", ({ providerId }) => {
      if (!providerId) return;
      socket.join(`provider_room:${providerId}`);
      console.log(`Customer subscribed to provider_room:${providerId}`);
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
        console.log(`User ${decoded.id} joined notification room`);
      } catch (error) {
        socket.emit("notifications:error", {
          message: "Invalid notification token.",
        });
      }
    });

    // Provider sends a live location update for a specific booking.
    socket.on("location_update", (payload) => {
      const { bookingId, providerId, lat, lng, bearing, speed, accuracy } =
        payload || {};
      if (
        !bookingId ||
        !providerId ||
        lat == null ||
        lng == null ||
        !isValidLocation(lat, lng)
      ) {
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
      console.log(`Broadcast location_update for booking ${bookingId}`);
    });

    // Provider-level live location used by the current home/provider dashboard pages.
    socket.on("provider:location", (payload) => {
      const { providerId, lat, lng, bearing, speed, accuracy } = payload || {};
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
      console.log(`Broadcast provider:location for provider ${providerId}`);
    });

    socket.on("disconnect", () => {
      console.log("Socket disconnected:", socket.id);
    });
  });
};
