const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const {
  validate,
  validators: v,
} = require("../middlewares/validationMiddleware");

router.get(
  "/overview",
  authMiddleware,
  adminMiddleware,
  adminController.getOverview,
);

router.get(
  "/bookings",
  authMiddleware,
  adminMiddleware,
  adminController.listBookings,
);

// Admin: list providers
router.get(
  "/providers",
  authMiddleware,
  adminMiddleware,
  adminController.listProviders,
);

// Admin: verify provider by profile id
router.post(
  "/providers/:profileId/verify",
  authMiddleware,
  adminMiddleware,
  validate({
    params: {
      profileId: [v.required("profileId"), v.positiveInteger("profileId")],
    },
  }),
  adminController.verifyProvider,
);

router.get(
  "/verification-queue",
  authMiddleware,
  adminMiddleware,
  adminController.listVerificationQueue,
);

router.get(
  "/verification-queue/:profileId",
  authMiddleware,
  adminMiddleware,
  validate({
    params: {
      profileId: [v.required("profileId"), v.positiveInteger("profileId")],
    },
  }),
  adminController.getProviderVerificationDetails,
);

router.patch(
  "/verification-documents/:documentId",
  authMiddleware,
  adminMiddleware,
  validate({
    params: {
      documentId: [v.required("documentId"), v.positiveInteger("documentId")],
    },
    body: {
      status: [v.required("status"), v.oneOf(["APPROVED", "REJECTED"], "status")],
      reviewer_notes: [v.maxLength(1000, "reviewer_notes")],
    },
  }),
  adminController.reviewVerificationDocument,
);

router.post(
  "/providers/:profileId/verification-decision",
  authMiddleware,
  adminMiddleware,
  validate({
    params: {
      profileId: [v.required("profileId"), v.positiveInteger("profileId")],
    },
    body: {
      decision: [
        v.required("decision"),
        v.oneOf(["VERIFIED", "REJECTED"], "decision"),
      ],
      notes: [v.maxLength(1000, "notes")],
    },
  }),
  adminController.decideProviderVerification,
);

module.exports = router;
