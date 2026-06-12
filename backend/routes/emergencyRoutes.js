const express = require("express");
const router = express.Router();
const emergencyController = require("../controllers/emergencyController");
const jwt = require("jsonwebtoken");
const {
  validate,
  validators: v,
} = require("../middlewares/validationMiddleware");

function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader) return next();

  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) return next();

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    req.user = null;
  }

  return next();
}

// Create emergency log (authenticated preferred but optional)
router.post(
  "/",
  optionalAuth,
  validate({
    body: {
      booking_id: [v.positiveInteger("booking_id")],
      emergency_type: [v.maxLength(100, "emergency_type")],
      message: [v.maxLength(2000, "message")],
      location: [v.maxLength(255, "location")],
      latitude: [v.numberRange(-90, 90, "latitude")],
      longitude: [v.numberRange(-180, 180, "longitude")],
    },
  }),
  emergencyController.createEmergency,
);

module.exports = router;
