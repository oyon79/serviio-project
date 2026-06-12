const express = require("express");
const router = express.Router();
const providerController = require("../controllers/providerController");
const reviewController = require("../controllers/reviewController");
const authMiddleware = require("../middlewares/authMiddleware");
const authorizeRoles = require("../middlewares/roleMiddleware");
const {
  verificationUpload,
  handleUploadErrors,
} = require("../middlewares/uploadMiddleware");
const {
  validate,
  validators: v,
} = require("../middlewares/validationMiddleware");

// Route to get all providers: GET /api/providers
router.get("/", providerController.getAllProviders);
router.get(
  "/me",
  authMiddleware,
  authorizeRoles("provider"),
  providerController.getMyProviderProfile,
);
router.put(
  "/me/availability",
  authMiddleware,
  authorizeRoles("provider"),
  validate({
    body: {
      is_available: [v.required("is_available"), v.boolean("is_available")],
    },
  }),
  providerController.updateMyAvailability,
);
router.put(
  "/me/settings",
  authMiddleware,
  authorizeRoles("provider"),
  validate({
    body: {
      first_name: [v.nonEmptyString("first_name"), v.maxLength(100, "first_name")],
      last_name: [v.nonEmptyString("last_name"), v.maxLength(100, "last_name")],
      email: [v.email("email"), v.maxLength(255, "email")],
      phone: [v.maxLength(30, "phone")],
      service_type: [
        v.nonEmptyString("service_type"),
        v.maxLength(100, "service_type"),
      ],
      location: [v.maxLength(255, "location")],
      experience_summary: [v.maxLength(2000, "experience_summary")],
      nid_number: [
        v.regex(
          /^(?:\d{10}|\d{13}|\d{17})$/,
          "nid_number must be 10, 13, or 17 digits.",
        ),
      ],
    },
  }),
  providerController.updateMySettings,
);
router.get(
  "/me/reviews",
  authMiddleware,
  authorizeRoles("provider"),
  reviewController.getProviderReviews,
);
router.get(
  "/me/verification",
  authMiddleware,
  authorizeRoles("provider"),
  providerController.getMyVerification,
);
router.post(
  "/me/verification/documents",
  authMiddleware,
  authorizeRoles("provider"),
  handleUploadErrors(verificationUpload.single("document_file")),
  validate({
    body: {
      document_type: [
        v.required("document_type"),
        v.oneOf(
          [
            "NID",
            "POLICE_CLEARANCE",
            "SKILL_CERTIFICATE",
            "LIVE_SELFIE",
            "EXPERIENCE_PROOF",
            "OTHER",
          ],
          "document_type",
        ),
      ],
      document_number: [v.maxLength(100, "document_number")],
      document_url: [v.maxLength(500, "document_url")],
      file_name: [v.maxLength(255, "file_name")],
      file_mime: [v.maxLength(100, "file_mime")],
      notes: [v.maxLength(1000, "notes")],
    },
  }),
  providerController.submitVerificationDocument,
);
router.post(
  "/me/verification/submit",
  authMiddleware,
  authorizeRoles("provider"),
  providerController.submitVerificationForReview,
);
router.get(
  "/:id",
  validate({
    params: {
      id: [v.required("id"), v.positiveInteger("id")],
    },
  }),
  providerController.getProviderById,
);

module.exports = router;
