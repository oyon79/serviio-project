const express = require("express");
const router = express.Router();
const reviewController = require("../controllers/reviewController");
const authMiddleware = require("../middlewares/authMiddleware");
const authorizeRoles = require("../middlewares/roleMiddleware");
const {
  validate,
  validators: v,
} = require("../middlewares/validationMiddleware");

router.post(
  "/",
  authMiddleware,
  authorizeRoles("customer"),
  validate({
    body: {
      booking_id: [v.positiveInteger("booking_id")],
      bookingId: [v.positiveInteger("bookingId")],
      rating: [v.required("rating"), v.positiveInteger("rating")],
      title: [v.maxLength(255, "title")],
      comment: [v.maxLength(2000, "comment")],
    },
  }),
  reviewController.createReview,
);

router.get(
  "/my",
  authMiddleware,
  authorizeRoles("customer"),
  reviewController.getMyReviews,
);

router.get(
  "/me",
  authMiddleware,
  authorizeRoles("provider"),
  reviewController.getProviderReviews,
);

router.get(
  "/provider/:providerId",
  validate({
    params: {
      providerId: [v.required("providerId"), v.positiveInteger("providerId")],
    },
  }),
  reviewController.getPublicProviderReviews,
);

module.exports = router;
