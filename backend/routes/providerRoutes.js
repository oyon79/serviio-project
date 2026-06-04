const express = require("express");
const router = express.Router();
const providerController = require("../controllers/providerController");
const reviewController = require("../controllers/reviewController");
const authMiddleware = require("../middlewares/authMiddleware");

// Route to get all providers: GET /api/providers
router.get("/", providerController.getAllProviders);
router.get("/me", authMiddleware, providerController.getMyProviderProfile);
router.put(
  "/me/availability",
  authMiddleware,
  providerController.updateMyAvailability,
);
router.put("/me/settings", authMiddleware, providerController.updateMySettings);
router.get("/me/reviews", authMiddleware, reviewController.getProviderReviews);
router.get("/:id", providerController.getProviderById);

module.exports = router;
