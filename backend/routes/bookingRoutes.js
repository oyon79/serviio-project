const express = require("express");
const router = express.Router();
const bookingController = require("../controllers/bookingController");

// Route to create a new booking: POST /api/bookings/create
router.post("/create", bookingController.createBooking);

// Route to fetch a booking by ID: GET /api/bookings/:id
router.get("/:id", bookingController.getBookingById);

// NEW: Get all bookings for a provider
router.get("/provider/:providerId", bookingController.getProviderBookings);

// NEW: Verify the 4-digit handshake code
router.put("/verify-handshake", bookingController.verifyHandshake);

module.exports = router;
