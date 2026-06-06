const express = require("express");
const router = express.Router();
const emergencyController = require("../controllers/emergencyController");
const jwt = require("jsonwebtoken");

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
router.post("/", optionalAuth, emergencyController.createEmergency);

module.exports = router;
