const express = require("express");
const router = express.Router();
const bookingController = require("../controllers/bookingController");
const authMiddleware = require("../middlewares/authMiddleware");

// Route to create a new booking: POST /api/bookings/create
router.post("/create", bookingController.createBooking);

// Route to fetch a booking by ID: GET /api/bookings/:id
// Get bookings for provider. If providerId param provided, use it; otherwise expect authenticated user
// Provider-specific routes require authentication
router.get("/provider", authMiddleware, bookingController.getProviderBookings);
router.get(
  "/provider/:providerId",
  authMiddleware,
  bookingController.getProviderBookings,
);

// Route to fetch a booking by ID: GET /api/bookings/:id
// NOTE: placed after provider routes so literal paths like '/provider' are not mistaken for an ID
router.get("/:id", bookingController.getBookingById);

// Verify the 4-digit handshake code (accept POST or PUT) - provider must be authenticated
router.post(
  "/verify-handshake",
  authMiddleware,
  bookingController.verifyHandshake,
);
router.put(
  "/verify-handshake",
  authMiddleware,
  bookingController.verifyHandshake,
);

router.patch(
  "/:id/status",
  authMiddleware,
  bookingController.updateBookingStatus,
);

module.exports = router;
