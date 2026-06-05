const express = require("express");
const router = express.Router();
const providerController = require("../controllers/providerController");
const reviewController = require("../controllers/reviewController");
const authMiddleware = require("../middlewares/authMiddleware");
const authorizeRoles = require("../middlewares/roleMiddleware");

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
  providerController.updateMyAvailability,
);
router.put(
  "/me/settings",
  authMiddleware,
  authorizeRoles("provider"),
  providerController.updateMySettings,
);
router.get(
  "/me/reviews",
  authMiddleware,
  authorizeRoles("provider"),
  reviewController.getProviderReviews,
);
router.get("/:id", providerController.getProviderById);

module.exports = router;
