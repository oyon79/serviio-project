module.exports = function (io) {
  io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);

    // Provider joins a booking-specific room to send updates for that booking.
    socket.on("provider:join_booking", ({ bookingId, providerId }) => {
      if (!bookingId || !providerId) return;
      socket.join(`booking_room:${bookingId}`);
      console.log(
        `Provider ${providerId} joined booking room booking_room:${bookingId}`,
      );
    });

    // User joins the booking room to receive live provider location updates.
    socket.on("user:join_booking", ({ bookingId, userId }) => {
      if (!bookingId || !userId) return;
      socket.join(`booking_room:${bookingId}`);
      console.log(
        `User ${userId} joined booking room booking_room:${bookingId}`,
      );
    });

    // Provider sends a live location update for a specific booking.
    socket.on("location_update", (payload) => {
      const { bookingId, providerId, lat, lng, bearing, speed, accuracy } =
        payload || {};
      if (!bookingId || !providerId || lat == null || lng == null) return;

      const update = {
        bookingId,
        providerId,
        lat,
        lng,
        bearing: bearing || 0,
        speed: speed || null,
        accuracy: accuracy || null,
        timestamp: Date.now(),
      };

      io.to(`booking_room:${bookingId}`).emit("location_update", update);
      console.log(`Broadcast location_update for booking ${bookingId}`);
    });

    socket.on("disconnect", () => {
      console.log("Socket disconnected:", socket.id);
    });
  });
};
