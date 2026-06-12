const test = require("node:test");
const assert = require("node:assert/strict");
const { estimatePrice } = require("../services/pricingService");

test("pricing service returns a valid BDT range and quote", () => {
  const estimate = estimatePrice({
    serviceType: "Electrician",
    location: "Uttara",
    scheduledAt: "2026-06-10 10:00:00",
    workload: "moderate",
  });

  assert.equal(estimate.currency, "BDT");
  assert.equal(estimate.min > 0, true);
  assert.equal(estimate.max > estimate.min, true);
  assert.equal(estimate.quotedAmount >= estimate.min, true);
  assert.equal(estimate.quotedAmount <= estimate.max, true);
});

test("emergency pricing is higher than normal pricing", () => {
  const normal = estimatePrice({
    serviceType: "Plumber",
    location: "Mirpur",
    scheduledAt: "2026-06-10 10:00:00",
  });
  const emergency = estimatePrice({
    serviceType: "Plumber",
    location: "Mirpur",
    scheduledAt: "2026-06-10 10:00:00",
    isEmergency: true,
  });

  assert.equal(emergency.quotedAmount > normal.quotedAmount, true);
});
