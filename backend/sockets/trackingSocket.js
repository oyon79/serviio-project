module.exports = function (io) {
  io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);

    // Provider announces itself and joins a room for its id
    socket.on("provider:join", ({ providerId }) => {
      if (!providerId) return;
      socket.join(`provider:${providerId}`);
      console.log(
        `Provider ${providerId} joined socket room provider:${providerId}`,
      );
    });

    // Provider sends location updates
    socket.on("provider:location", (payload) => {
      // payload: { providerId, lat, lng, bearing }
      if (!payload || !payload.providerId) return;
      const room = `track:provider:${payload.providerId}`;
      // Broadcast to any customers subscribed to this provider
      io.to(room).emit("provider:location", {
        providerId: payload.providerId,
        lat: payload.lat,
        lng: payload.lng,
        bearing: payload.bearing || 0,
        ts: Date.now(),
      });
    });

    // Customer subscribes to provider location updates
    socket.on("customer:subscribe", ({ providerId }) => {
      if (!providerId) return;
      socket.join(`track:provider:${providerId}`);
      console.log(`Customer subscribed to provider ${providerId}`);
    });

    socket.on("disconnect", () => {
      console.log("Socket disconnected:", socket.id);
    });
  });
};
