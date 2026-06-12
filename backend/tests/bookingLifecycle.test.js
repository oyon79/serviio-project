const test = require("node:test");
const assert = require("node:assert/strict");
const {
  allowedStatuses,
  canProviderTransition,
  canStartWithHandshake,
  getStatusTimestampColumn,
  normalizeStatus,
} = require("../services/bookingLifecycle");

test("booking lifecycle exposes all production statuses", () => {
  for (const status of [
    "PENDING",
    "ACCEPTED",
    "ON_THE_WAY",
    "ARRIVED",
    "IN_PROGRESS",
    "COMPLETED",
    "CANCELLED",
  ]) {
    assert.equal(allowedStatuses.has(status), true);
  }
});

test("provider lifecycle allows real-world forward transitions", () => {
  assert.equal(canProviderTransition("PENDING", "ACCEPTED"), true);
  assert.equal(canProviderTransition("ACCEPTED", "ON_THE_WAY"), true);
  assert.equal(canProviderTransition("ON_THE_WAY", "ARRIVED"), true);
  assert.equal(canProviderTransition("IN_PROGRESS", "COMPLETED"), true);
});

test("provider lifecycle blocks backwards or unsafe transitions", () => {
  assert.equal(canProviderTransition("COMPLETED", "IN_PROGRESS"), false);
  assert.equal(canProviderTransition("ARRIVED", "COMPLETED"), false);
  assert.equal(canProviderTransition("PENDING", "ON_THE_WAY"), false);
});

test("handshake can start only pre-work statuses", () => {
  assert.equal(canStartWithHandshake("ARRIVED"), true);
  assert.equal(canStartWithHandshake("IN_PROGRESS"), false);
  assert.equal(canStartWithHandshake("COMPLETED"), false);
});

test("lifecycle helpers normalize casing and expose timestamp columns", () => {
  assert.equal(normalizeStatus("on_the_way"), "ON_THE_WAY");
  assert.equal(getStatusTimestampColumn("completed"), "completed_at");
  assert.equal(getStatusTimestampColumn("unknown"), null);
});
