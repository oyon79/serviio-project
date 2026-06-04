const express = require("express");
const router = express.Router();
const reviewController = require("../controllers/reviewController");
const authMiddleware = require("../middlewares/authMiddleware");

router.get("/me", authMiddleware, reviewController.getProviderReviews);

module.exports = router;
