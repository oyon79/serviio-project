const test = require("node:test");
const assert = require("node:assert/strict");
const {
  hasWeakSecret,
  validateRuntimeConfig,
} = require("../config/runtimeConfig");

const baseEnv = {
  NODE_ENV: "development",
  JWT_SECRET: "development-secret-for-local-testing",
  DB_NAME: "serviio_db",
  PAYMENT_MODE: "mock",
};

test("runtime config accepts local development defaults", () => {
  const result = validateRuntimeConfig(baseEnv);
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test("runtime config rejects weak production auth and wildcard CORS", () => {
  const result = validateRuntimeConfig({
    ...baseEnv,
    NODE_ENV: "production",
    JWT_SECRET: "secret",
    CORS_ORIGIN: "*",
    PAYMENT_MODE: "sslcommerz",
    MOCK_PAYMENTS_ENABLED: "false",
    SSLCOMMERZ_STORE_ID: "store",
    SSLCOMMERZ_STORE_PASSWORD: "pass",
    EMAIL_HOST: "smtp.example.com",
    EMAIL_USER: "user",
    EMAIL_PASS: "pass",
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /JWT_SECRET/);
  assert.match(result.errors.join("\n"), /CORS_ORIGIN/);
});

test("runtime config rejects production mock payments", () => {
  const result = validateRuntimeConfig({
    ...baseEnv,
    NODE_ENV: "production",
    JWT_SECRET: "a-very-long-production-key-value-1234567890",
    CORS_ORIGIN: "https://serviio.example.com",
    MOCK_PAYMENTS_ENABLED: "true",
    EMAIL_HOST: "smtp.example.com",
    EMAIL_USER: "user",
    EMAIL_PASS: "pass",
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /PAYMENT_MODE cannot be mock/);
  assert.match(result.errors.join("\n"), /MOCK_PAYMENTS_ENABLED/);
});

test("runtime config rejects production DB health-check bypass", () => {
  const result = validateRuntimeConfig({
    NODE_ENV: "production",
    JWT_SECRET: "a-very-long-production-key-value-1234567890",
    DB_NAME: "serviio_db",
    CORS_ORIGIN: "https://serviio.example.com",
    FRONTEND_BASE_URL: "https://serviio.example.com",
    PAYMENT_MODE: "bkash",
    MOCK_PAYMENTS_ENABLED: "false",
    BKASH_APP_KEY: "key",
    BKASH_APP_SECRET: "secret",
    BKASH_USERNAME: "merchant",
    BKASH_PASSWORD: "password",
    SMS_PROVIDER_URL: "https://sms.vendor.test/send",
    SERVIIO_SKIP_DB_HEALTHCHECK: "true",
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /SERVIIO_SKIP_DB_HEALTHCHECK/);
});

test("runtime config requires a delivery provider for production registration OTP", () => {
  const result = validateRuntimeConfig({
    ...baseEnv,
    NODE_ENV: "production",
    JWT_SECRET: "a-very-long-production-key-value-1234567890",
    CORS_ORIGIN: "https://serviio.example.com",
    FRONTEND_BASE_URL: "https://serviio.example.com",
    PAYMENT_MODE: "bkash",
    MOCK_PAYMENTS_ENABLED: "false",
    BKASH_APP_KEY: "key",
    BKASH_APP_SECRET: "secret",
    BKASH_USERNAME: "merchant",
    BKASH_PASSWORD: "password",
    REGISTRATION_VERIFICATION_REQUIRED: "true",
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /registration verification/i);
});

test("runtime config treats placeholder delivery values as unconfigured", () => {
  const result = validateRuntimeConfig({
    ...baseEnv,
    NODE_ENV: "production",
    JWT_SECRET: "a-very-long-production-key-value-1234567890",
    CORS_ORIGIN: "https://serviio.example.com",
    FRONTEND_BASE_URL: "https://serviio.example.com",
    PAYMENT_MODE: "bkash",
    MOCK_PAYMENTS_ENABLED: "false",
    BKASH_APP_KEY: "key",
    BKASH_APP_SECRET: "secret",
    BKASH_USERNAME: "merchant",
    BKASH_PASSWORD: "password",
    EMAIL_HOST: "smtp.example.com",
    EMAIL_USER: "user@example.com",
    EMAIL_PASS: "replace_this",
    SMS_PROVIDER_URL: "https://sms.example.com/send",
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /password reset/i);
  assert.match(result.errors.join("\n"), /registration verification/i);
});

test("runtime config requires gateway credentials by payment mode", () => {
  const bkashResult = validateRuntimeConfig({
    ...baseEnv,
    PAYMENT_MODE: "bkash",
  });
  assert.equal(bkashResult.ok, false);
  assert.match(bkashResult.errors.join("\n"), /BKASH_APP_KEY/);

  const nagadResult = validateRuntimeConfig({
    ...baseEnv,
    PAYMENT_MODE: "nagad",
  });
  assert.equal(nagadResult.ok, false);
  assert.match(nagadResult.errors.join("\n"), /NAGAD_VERIFY_URL/);
});

test("runtime config rejects invalid platform commission rates", () => {
  for (const invalidRate of ["-0.01", "1", "1.5", "not-a-number"]) {
    const result = validateRuntimeConfig({
      ...baseEnv,
      PLATFORM_COMMISSION_RATE: invalidRate,
    });

    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /PLATFORM_COMMISSION_RATE/);
  }

  const validResult = validateRuntimeConfig({
    ...baseEnv,
    PLATFORM_COMMISSION_RATE: "0.25",
  });
  assert.equal(validResult.ok, true);
});

test("runtime config validates police and skill verification modes", () => {
  const policeResult = validateRuntimeConfig({
    ...baseEnv,
    POLICE_VERIFICATION_MODE: "generic_http",
  });
  assert.equal(policeResult.ok, false);
  assert.match(policeResult.errors.join("\n"), /POLICE_VERIFICATION_URL/);

  const skillResult = validateRuntimeConfig({
    ...baseEnv,
    SKILL_VERIFICATION_MODE: "invalid",
  });
  assert.equal(skillResult.ok, false);
  assert.match(skillResult.errors.join("\n"), /Unsupported SKILL_VERIFICATION_MODE/);
});

test("runtime config accepts production bKash with delivery provider", () => {
  const result = validateRuntimeConfig({
    NODE_ENV: "production",
    JWT_SECRET: "a-very-long-production-key-value-1234567890",
    DB_NAME: "serviio_db",
    CORS_ORIGIN: "https://serviio.example.com",
    FRONTEND_BASE_URL: "https://serviio.example.com",
    PAYMENT_MODE: "bkash",
    MOCK_PAYMENTS_ENABLED: "false",
    BKASH_APP_KEY: "key",
    BKASH_APP_SECRET: "secret",
    BKASH_USERNAME: "merchant",
    BKASH_PASSWORD: "password",
    SMS_PROVIDER_URL: "https://sms.vendor.test/send",
  });

  assert.equal(result.ok, true);
});

test("weak secret helper catches placeholders and short values", () => {
  assert.equal(hasWeakSecret("replace_this_with_secret"), true);
  assert.equal(hasWeakSecret("short"), true);
  assert.equal(hasWeakSecret("a-very-long-random-looking-value-12345"), false);
});
