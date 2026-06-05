const express = require("express");
const router = express.Router();
const bookingController = require("../controllers/bookingController");
const authMiddleware = require("../middlewares/authMiddleware");
const authorizeRoles = require("../middlewares/roleMiddleware");

// Route to create a new booking: POST /api/bookings/create
router.post("/create", authMiddleware, bookingController.createBooking);

// Route to fetch a booking by ID: GET /api/bookings/:id
// Get bookings for provider. If providerId param provided, use it; otherwise expect authenticated user
// Provider-specific routes require authentication and provider role
router.get(
  "/provider",
  authMiddleware,
  authorizeRoles("provider"),
  bookingController.getProviderBookings,
);
router.get(
  "/provider/:providerId",
  authMiddleware,
  authorizeRoles("provider"),
  bookingController.getProviderBookings,
);

// Get bookings for authenticated user (customer or provider)
router.get("/my", authMiddleware, bookingController.getMyBookings);

// Route to fetch a booking by ID: GET /api/bookings/:id
// NOTE: placed after provider routes so literal paths like '/provider' are not mistaken for an ID
router.get("/:id", bookingController.getBookingById);

// Verify the 4-digit handshake code (accept POST or PUT) - provider must be authenticated
router.post(
  "/verify-handshake",
  authMiddleware,
  authorizeRoles("provider"),
  bookingController.verifyHandshake,
);
router.put(
  "/verify-handshake",
  authMiddleware,
  authorizeRoles("provider"),
  bookingController.verifyHandshake,
);

router.patch(
  "/:id/status",
  authMiddleware,
  authorizeRoles("provider"),
  bookingController.updateBookingStatus,
);

router.delete("/:id", authMiddleware, bookingController.cancelBooking);

module.exports = router;
