const express = require("express");
const router = express.Router();
const pricingController = require("../controllers/pricingController");
const {
  validate,
  validators: v,
} = require("../middlewares/validationMiddleware");

router.post(
  "/estimate",
  validate({
    body: {
      service_type: [
        v.required("service_type"),
        v.nonEmptyString("service_type"),
        v.maxLength(150, "service_type"),
      ],
      location: [v.maxLength(255, "location")],
      scheduled_at: [v.dateLike("scheduled_at")],
      workload: [v.oneOf(["light", "moderate", "hard"], "workload")],
      is_emergency: [v.boolean("is_emergency")],
      provider_hourly_rate: [v.positiveNumber("provider_hourly_rate")],
    },
  }),
  pricingController.estimate,
);

module.exports = router;
