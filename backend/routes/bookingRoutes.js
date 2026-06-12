const express = require("express");
const router = express.Router();
const bookingController = require("../controllers/bookingController");
const authMiddleware = require("../middlewares/authMiddleware");
const authorizeRoles = require("../middlewares/roleMiddleware");
const {
  validate,
  validators: v,
} = require("../middlewares/validationMiddleware");

// Route to create a new booking: POST /api/bookings/create
router.post(
  "/create",
  authMiddleware,
  validate({
    body: {
      provider_id: [v.required("provider_id"), v.positiveInteger("provider_id")],
      service_type: [
        v.required("service_type"),
        v.nonEmptyString("service_type"),
        v.maxLength(100, "service_type"),
      ],
      booking_date: [
        v.required("booking_date"),
        v.dateLike("booking_date"),
      ],
      job_location: [v.maxLength(255, "job_location")],
      estimated_price_range: [v.maxLength(100, "estimated_price_range")],
      is_emergency: [v.boolean("is_emergency")],
    },
  }),
  bookingController.createBooking,
);

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
  validate({
    params: {
      providerId: [v.required("providerId"), v.positiveInteger("providerId")],
    },
  }),
  bookingController.getProviderBookings,
);

// Get bookings for authenticated user (customer or provider)
router.get("/my", authMiddleware, bookingController.getMyBookings);

// Route to fetch a booking by ID: GET /api/bookings/:id
// NOTE: placed after provider routes so literal paths like '/provider' are not mistaken for an ID
router.get(
  "/:id",
  authMiddleware,
  validate({
    params: {
      id: [v.required("id"), v.positiveInteger("id")],
    },
  }),
  bookingController.getBookingById,
);

// Verify the 4-digit handshake code (accept POST or PUT) - provider must be authenticated
router.post(
  "/verify-handshake",
  authMiddleware,
  authorizeRoles("provider"),
  validate({
    body: {
      booking_id: [v.positiveInteger("booking_id")],
      bookingId: [v.positiveInteger("bookingId")],
      handshake_code: [
        v.regex(/^\d{4}$/, "handshake_code must be 4 digits."),
      ],
      handshakeCode: [
        v.regex(/^\d{4}$/, "handshakeCode must be 4 digits."),
      ],
    },
  }),
  bookingController.verifyHandshake,
);
router.put(
  "/verify-handshake",
  authMiddleware,
  authorizeRoles("provider"),
  validate({
    body: {
      booking_id: [v.positiveInteger("booking_id")],
      bookingId: [v.positiveInteger("bookingId")],
      handshake_code: [
        v.regex(/^\d{4}$/, "handshake_code must be 4 digits."),
      ],
      handshakeCode: [
        v.regex(/^\d{4}$/, "handshakeCode must be 4 digits."),
      ],
    },
  }),
  bookingController.verifyHandshake,
);

router.patch(
  "/:id/status",
  authMiddleware,
  authorizeRoles("provider"),
  validate({
    params: {
      id: [v.required("id"), v.positiveInteger("id")],
    },
    body: {
      status: [
        v.required("status"),
        v.oneOf(
          [
            "PENDING",
            "ACCEPTED",
            "ON_THE_WAY",
            "ARRIVED",
            "IN_PROGRESS",
            "COMPLETED",
            "CANCELLED",
          ],
          "status",
        ),
      ],
    },
  }),
  bookingController.updateBookingStatus,
);

router.delete(
  "/:id",
  authMiddleware,
  validate({
    params: {
      id: [v.required("id"), v.positiveInteger("id")],
    },
  }),
  bookingController.cancelBooking,
);

module.exports = router;
