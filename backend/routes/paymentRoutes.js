const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/paymentController");
const authMiddleware = require("../middlewares/authMiddleware");
const {
  validate,
  validators: v,
} = require("../middlewares/validationMiddleware");

router.post(
  "/process",
  authMiddleware,
  validate({
    body: {
      booking_id: [v.required("booking_id"), v.positiveInteger("booking_id")],
      amount: [v.required("amount"), v.positiveNumber("amount")],
      payment_method: [v.maxLength(50, "payment_method")],
      gateway_reference: [v.maxLength(255, "gateway_reference")],
    },
  }),
  paymentController.processPayment,
);

router.get(
  "/:booking_id/status",
  authMiddleware,
  validate({
    params: {
      booking_id: [v.required("booking_id"), v.positiveInteger("booking_id")],
    },
  }),
  paymentController.getPaymentStatus,
);

module.exports = router;
