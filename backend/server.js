const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env"), quiet: true });
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const http = require("http");
const { Server } = require("socket.io");

const db = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const providerRoutes = require("./routes/providerRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const emergencyRoutes = require("./routes/emergencyRoutes");
const adminRoutes = require("./routes/adminRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const walletRoutes = require("./routes/walletRoutes");
const supportRoutes = require("./routes/supportRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const bookmarkRoutes = require("./routes/bookmarkRoutes");
const {
  setNotificationRealtimeServer,
} = require("./services/notificationService");

// Ensure critical environment variables
const requiredEnv = ["JWT_SECRET"];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const app = express();
app.set("trust proxy", 1);
const corsOrigin = process.env.CORS_ORIGIN || "*";
const corsCredentials =
  corsOrigin !== "*" && process.env.CORS_CREDENTIALS !== "false";

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: corsOrigin,
    credentials: corsCredentials,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests from this IP, please try again later.",
  },
});
app.use("/api", apiLimiter);

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/providers", providerRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/emergency", emergencyRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/bookmarks", bookmarkRoutes);

// Create HTTP server and attach Socket.IO
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    methods: ["GET", "POST"],
    credentials: corsCredentials,
  },
});
setNotificationRealtimeServer(io);
require("./sockets/trackingSocket")(io);

app.get("/", (req, res) => {
  res.send("Serviio Backend API is running!");
});

app.get("/api/test-db", async (req, res, next) => {
  try {
    const [rows] = await db.query(
      'SELECT "Database is successfully connected!" AS status',
    );
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    next(error);
  }
});

// 404 handler
app.use((req, res, next) => {
  const error = new Error(`Not Found: ${req.originalUrl}`);
  error.status = 404;
  next(error);
});

// Global async error handler
app.use((err, req, res, next) => {
  console.error(err.stack || err);
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

const PORT = Number(process.env.PORT) || 5000;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
