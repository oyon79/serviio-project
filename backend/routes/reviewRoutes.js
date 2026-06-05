const express = require("express");
const router = express.Router();
const reviewController = require("../controllers/reviewController");
const authMiddleware = require("../middlewares/authMiddleware");
const authorizeRoles = require("../middlewares/roleMiddleware");

router.get(
  "/me",
  authMiddleware,
  authorizeRoles("provider"),
  reviewController.getProviderReviews,
);

module.exports = router;
