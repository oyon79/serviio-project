const express = require("express");
const router = express.Router();
const walletController = require("../controllers/walletController");
const authMiddleware = require("../middlewares/authMiddleware");
const authorizeRoles = require("../middlewares/roleMiddleware");
const {
  validate,
  validators: v,
} = require("../middlewares/validationMiddleware");

router.get("/me", authMiddleware, walletController.getMyWallet);
router.get(
  "/payout-requests/me",
  authMiddleware,
  authorizeRoles("provider"),
  walletController.listMyPayoutRequests,
);
router.post(
  "/payout-requests",
  authMiddleware,
  authorizeRoles("provider"),
  validate({
    body: {
      amount: [v.required("amount"), v.positiveNumber("amount")],
      payout_method: [
        v.required("payout_method"),
        v.oneOf(["BKASH", "NAGAD", "BANK"], "payout_method"),
      ],
      account_ref: [
        v.required("account_ref"),
        v.nonEmptyString("account_ref"),
        v.maxLength(255, "account_ref"),
      ],
      provider_notes: [v.maxLength(1000, "provider_notes")],
    },
  }),
  walletController.createPayoutRequest,
);
router.get(
  "/payout-requests/admin",
  authMiddleware,
  authorizeRoles("admin", "super_admin", "support_agent"),
  validate({
    query: {
      status: [
        v.oneOf(["REQUESTED", "APPROVED", "REJECTED", "PAID"], "status"),
      ],
    },
  }),
  walletController.listPayoutRequests,
);
router.patch(
  "/payout-requests/:id",
  authMiddleware,
  authorizeRoles("admin", "super_admin", "support_agent"),
  validate({
    params: {
      id: [v.required("id"), v.positiveInteger("id")],
    },
    body: {
      status: [
        v.required("status"),
        v.oneOf(["APPROVED", "REJECTED", "PAID"], "status"),
      ],
      reviewer_notes: [v.maxLength(1000, "reviewer_notes")],
      external_reference: [v.maxLength(255, "external_reference")],
    },
  }),
  walletController.updatePayoutRequest,
);
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

router.post(
  "/escrow/:booking_id/refund",
  authMiddleware,
  authorizeRoles("admin", "super_admin", "support_agent"),
  validate({
    params: {
      booking_id: [v.required("booking_id"), v.positiveInteger("booking_id")],
    },
    body: {
      reason: [v.maxLength(1000, "reason")],
    },
  }),
  walletController.refundEscrow,
);

module.exports = router;
