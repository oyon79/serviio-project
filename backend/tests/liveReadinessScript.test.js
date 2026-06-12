const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const scriptPath = path.resolve(__dirname, "..", "scripts", "live_readiness.js");

function runReadiness(env = {}) {
  return spawnSync(process.execPath, [scriptPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: "development",
      JWT_SECRET: "development-secret-for-readiness-tests",
      DB_NAME: "serviio_db",
      PAYMENT_MODE: "mock",
      MOCK_PAYMENTS_ENABLED: "true",
      EMAIL_HOST: "",
      EMAIL_USER: "",
      EMAIL_PASS: "",
      SMS_PROVIDER_URL: "",
      NID_VERIFICATION_MODE: "disabled",
      POLICE_VERIFICATION_MODE: "disabled",
      SKILL_VERIFICATION_MODE: "disabled",
      ...env,
    },
  });
}

function parseOutput(result) {
  assert.equal(result.stderr, "");
  return JSON.parse(result.stdout);
}

test("live readiness exits successfully with skipped local providers in non-strict mode", () => {
  const result = runReadiness();
  const payload = parseOutput(result);

  assert.equal(result.status, 0);
  assert.equal(payload.success, true);
  assert.equal(payload.strict, false);
  assert.equal(payload.summary.fail, 0);
  assert.ok(payload.summary.skip > 0);
});

test("live readiness reports missing providers as failures in strict mode", () => {
  const result = runReadiness({ LIVE_READINESS_STRICT: "true" });
  const payload = parseOutput(result);
  const smtp = payload.results.find((item) => item.name === "smtp");
  const sms = payload.results.find((item) => item.name === "sms");
  const payment = payload.results.find((item) => item.name === "payment");
  const nid = payload.results.find((item) => item.name === "nid-verification");
  const police = payload.results.find((item) => item.name === "police-verification");
  const skill = payload.results.find((item) => item.name === "skill-verification");

  assert.equal(result.status, 1);
  assert.equal(payload.success, false);
  assert.equal(payload.strict, true);
  assert.equal(payload.summary.skip, 0);
  assert.equal(smtp.status, "fail");
  assert.equal(sms.status, "fail");
  assert.equal(payment.status, "fail");
  assert.equal(nid.status, "fail");
  assert.equal(police.status, "fail");
  assert.equal(skill.status, "fail");
  assert.match(smtp.message, /SMTP credentials/i);
  assert.match(sms.message, /SMS provider URL/i);
  assert.match(payment.message, /real payment gateway/i);
  assert.match(nid.message, /real NID verification provider/i);
  assert.match(police.message, /real POLICE_CLEARANCE verification provider/i);
  assert.match(skill.message, /real SKILL_CERTIFICATE verification provider/i);
});

test("live readiness treats placeholder SMTP as skipped", () => {
  const result = runReadiness({
    EMAIL_HOST: "smtp.example.com",
    EMAIL_USER: "user@example.com",
    EMAIL_PASS: "password",
  });
  const payload = parseOutput(result);
  const smtp = payload.results.find((item) => item.name === "smtp");

  assert.equal(result.status, 0);
  assert.equal(smtp.status, "skip");
  assert.match(smtp.message, /placeholder/i);
});

test("strict live readiness treats placeholder SMTP as failure", () => {
  const result = runReadiness({
    LIVE_READINESS_STRICT: "true",
    EMAIL_HOST: "smtp.example.com",
    EMAIL_USER: "user@example.com",
    EMAIL_PASS: "password",
  });
  const payload = parseOutput(result);
  const smtp = payload.results.find((item) => item.name === "smtp");

  assert.equal(result.status, 1);
  assert.equal(smtp.status, "fail");
  assert.match(smtp.message, /real SMTP credentials/i);
});

test("strict live readiness requires payment probe reference for live modes", () => {
  const result = runReadiness({
    LIVE_READINESS_STRICT: "true",
    PAYMENT_MODE: "sslcommerz",
    SSLCOMMERZ_STORE_ID: "store-id",
    SSLCOMMERZ_STORE_PASSWORD: "store-password",
  });
  const payload = parseOutput(result);
  const payment = payload.results.find((item) => item.name === "payment");

  assert.equal(result.status, 1);
  assert.equal(payment.status, "fail");
  assert.match(payment.message, /LIVE_READINESS_SSLCOMMERZ_VAL_ID/i);
});

test("strict live readiness rejects mock KYC verification modes", () => {
  const result = runReadiness({
    LIVE_READINESS_STRICT: "true",
    NID_VERIFICATION_MODE: "mock",
    POLICE_VERIFICATION_MODE: "mock",
    SKILL_VERIFICATION_MODE: "mock",
    LIVE_READINESS_NID_NUMBER: "1234567890",
    LIVE_READINESS_POLICE_DOCUMENT_NUMBER: "POLICE-TEST",
    LIVE_READINESS_SKILL_DOCUMENT_NUMBER: "SKILL-TEST",
  });
  const payload = parseOutput(result);
  const nid = payload.results.find((item) => item.name === "nid-verification");
  const police = payload.results.find((item) => item.name === "police-verification");
  const skill = payload.results.find((item) => item.name === "skill-verification");

  assert.equal(result.status, 1);
  assert.equal(nid.status, "fail");
  assert.equal(police.status, "fail");
  assert.equal(skill.status, "fail");
  assert.match(nid.message, /real NID verification provider/i);
  assert.match(police.message, /real POLICE_CLEARANCE verification provider/i);
  assert.match(skill.message, /real SKILL_CERTIFICATE verification provider/i);
});
