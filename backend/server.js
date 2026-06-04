const express = require("express");
const cors = require("cors");
require("dotenv").config();
const db = require("./config/db");

// Ensure critical env vars
if (!process.env.JWT_SECRET) {
  console.error("Missing required environment variable: JWT_SECRET");
  process.exit(1);
}

const authRoutes = require("./routes/authRoutes");
const providerRoutes = require("./routes/providerRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const emergencyRoutes = require("./routes/emergencyRoutes");
const adminRoutes = require("./routes/adminRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const app = express();
const http = require("http");
const { Server } = require("socket.io");
// Middlewares
app.use(
  cors({
    origin: "*", // For development, allow everything. Or specify: 'http://localhost:5500'
    credentials: true,
  }),
); // Let frontend communicate with backend
app.use(express.json()); // Allow API to accept JSON data
app.use("/api/auth", authRoutes); // Use the authentication routes
app.use("/api/providers", providerRoutes); // Use the provider routes
app.use("/api/bookings", bookingRoutes); // Use the booking routes
app.use("/api/reviews", reviewRoutes);
app.use("/api/emergency", emergencyRoutes);
app.use("/api/admin", adminRoutes);

// Create HTTP server and attach Socket.IO
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

// Initialize socket handlers
require("./sockets/trackingSocket")(io);

// 1. Basic Test Route
app.get("/", (req, res) => {
  res.send("Serviio Backend API is running!");
});

// 2. Database Connection Test Route
app.get("/api/test-db", async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT "Database is successfully connected!" AS status',
    );
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Database connection failed",
      error: error.message,
    });
  }
});

// Start the server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
