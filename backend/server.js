const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env"), quiet: true });
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const http = require("http");
const { Server } = require("socket.io");
const { assertRuntimeConfig } = require("./config/runtimeConfig");

try {
  assertRuntimeConfig();
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}

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
const pricingRoutes = require("./routes/pricingRoutes");
const communicationRoutes = require("./routes/communicationRoutes");
const {
  setNotificationRealtimeServer,
} = require("./services/notificationService");

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

const authLimiter = rateLimit({
  windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many authentication attempts. Please try again later.",
  },
});

app.use("/api/auth/login", authLimiter);
app.use("/api/auth/forgot-password", authLimiter);
app.use("/api/auth/reset-password", authLimiter);
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
app.use("/api/pricing", pricingRoutes);
app.use("/api/communications", communicationRoutes);

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

const PORT = Number(process.env.PORT) || 5000;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

const SHUTDOWN_TIMEOUT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS || 10000);
let isShuttingDown = false;

function closeHttpServer() {
  return new Promise((resolve) => {
    server.close((error) => {
      if (error) {
        console.error("Error closing HTTP server:", error.message || error);
      }
      resolve();
    });
  });
}

function closeSocketServer() {
  return new Promise((resolve) => {
    io.close((error) => {
      if (error) {
        console.error("Error closing realtime server:", error.message || error);
      }
      resolve();
    });
  });
}

async function shutdown(signal, exitCode = 0) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`Received ${signal}. Shutting down Serviio backend...`);

  const forceExit = setTimeout(() => {
    console.error("Graceful shutdown timed out.");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref?.();

  try {
    await closeSocketServer();
    await closeHttpServer();
    await db.end();
    console.log("Serviio backend stopped cleanly.");
    clearTimeout(forceExit);
    process.exit(exitCode);
  } catch (error) {
    clearTimeout(forceExit);
    console.error("Graceful shutdown failed:", error.message || error);
    process.exit(1);
  }
}

function handleFatalError(label, error) {
  console.error(`${label}:`, error?.stack || error);
  shutdown(label, 1);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("uncaughtException", (error) =>
  handleFatalError("uncaughtException", error),
);
process.on("unhandledRejection", (reason) =>
  handleFatalError("unhandledRejection", reason),
);
