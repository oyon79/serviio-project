const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const authMiddleware = require("../middlewares/authMiddleware");
const authorizeRoles = require("../middlewares/roleMiddleware");
const {
  validate,
  validators: v,
} = require("../middlewares/validationMiddleware");

router.get(
  "/overview",
  authMiddleware,
  authorizeRoles("admin", "super_admin", "support_agent", "verification_officer"),
  adminController.getOverview,
);

router.get(
  "/bookings",
  authMiddleware,
  authorizeRoles("admin", "super_admin", "support_agent", "verification_officer"),
  adminController.listBookings,
);

router.get(
  "/emergencies",
  authMiddleware,
  authorizeRoles("admin", "super_admin", "support_agent", "verification_officer"),
  adminController.listEmergencyLogs,
);

router.patch(
  "/emergencies/:id",
  authMiddleware,
  authorizeRoles("admin", "super_admin", "support_agent"),
  validate({
    params: {
      id: [v.required("id"), v.positiveInteger("id")],
    },
    body: {
      status: [
        v.required("status"),
        v.oneOf(["ACTIVE", "RESOLVED", "CANCELLED"], "status"),
      ],
    },
  }),
  adminController.updateEmergencyStatus,
);

// Admin: list providers
router.get(
  "/providers",
  authMiddleware,
  authorizeRoles("admin", "super_admin", "support_agent", "verification_officer"),
  adminController.listProviders,
);

// Admin: verify provider by profile id
router.post(
  "/providers/:profileId/verify",
  authMiddleware,
  authorizeRoles("admin", "super_admin", "verification_officer"),
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
  authorizeRoles("admin", "super_admin", "support_agent", "verification_officer"),
  adminController.listVerificationQueue,
);

router.get(
  "/verification-queue/:profileId",
  authMiddleware,
  authorizeRoles("admin", "super_admin", "support_agent", "verification_officer"),
  validate({
    params: {
      profileId: [v.required("profileId"), v.positiveInteger("profileId")],
    },
  }),
  adminController.getProviderVerificationDetails,
);

router.get(
  "/verification-documents/:documentId/download",
  authMiddleware,
  authorizeRoles("admin", "super_admin", "verification_officer"),
  validate({
    params: {
      documentId: [v.required("documentId"), v.positiveInteger("documentId")],
    },
  }),
  adminController.downloadVerificationDocument,
);

router.patch(
  "/verification-documents/:documentId",
  authMiddleware,
  authorizeRoles("admin", "super_admin", "verification_officer"),
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
  authorizeRoles("admin", "super_admin", "verification_officer"),
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
