const express = require("express");
const router = express.Router();
const walletController = require("../controllers/walletController");
const authMiddleware = require("../middlewares/authMiddleware");
const {
  validate,
  validators: v,
} = require("../middlewares/validationMiddleware");

router.get("/me", authMiddleware, walletController.getMyWallet);
router.post(
  "/escrow/:booking_id/release",
  authMiddleware,
  validate({
    params: {
      booking_id: [v.required("booking_id"), v.positiveInteger("booking_id")],
    },
  }),
  walletController.releaseEscrow,
);

module.exports = router;
