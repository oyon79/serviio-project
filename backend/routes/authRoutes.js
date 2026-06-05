const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");

// Define the routes
router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);
router.get("/validate-reset-token", authController.validateResetToken);

module.exports = router;
