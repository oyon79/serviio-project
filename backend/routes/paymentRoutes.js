const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/paymentController");
const authMiddleware = require("../middlewares/authMiddleware");

router.post("/process", authMiddleware, paymentController.processPayment);

router.get(
  "/:booking_id/status",
  authMiddleware,
  paymentController.getPaymentStatus,
);

module.exports = router;
