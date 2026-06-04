const express = require("express");
const router = express.Router();
const emergencyController = require("../controllers/emergencyController");
const authMiddleware = require("../middlewares/authMiddleware");

// Create emergency log (authenticated preferred but optional)
router.post("/", authMiddleware, emergencyController.createEmergency);

module.exports = router;
