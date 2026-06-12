const DEFAULT_WEAK_SECRET_PATTERNS = [
  /replace[_-]?this/i,
  /change[_-]?me/i,
  /secret/i,
  /test/i,
  /password/i,
];

const {
  validatePlatformCommissionRate,
} = require("../utils/financialPolicy");

function hasValue(value) {
  return String(value || "").trim() !== "";
}

function looksLikePlaceholder(value) {
  return /(?:example\.com|replace[_-]?this|change[_-]?me|your[_-]|placeholder)/i.test(
    String(value || ""),
  );
}

function isEnabled(value) {
  return String(value || "").toLowerCase() === "true";
}

function getPaymentMode(env) {
  return String(env.PAYMENT_MODE || "mock").toLowerCase();
}

function registrationVerificationRequired(env) {
  const value = String(env.REGISTRATION_VERIFICATION_REQUIRED || "").trim();
  if (value) return value.toLowerCase() === "true";
  return (env.NODE_ENV || "development") === "production";
}

function hasSmtpConfig(env) {
  return (
    hasValue(env.EMAIL_HOST) &&
    hasValue(env.EMAIL_USER) &&
    hasValue(env.EMAIL_PASS) &&
    !looksLikePlaceholder(env.EMAIL_HOST) &&
    !looksLikePlaceholder(env.EMAIL_USER) &&
    !looksLikePlaceholder(env.EMAIL_PASS)
  );
}

function hasSmsConfig(env) {
  return hasValue(env.SMS_PROVIDER_URL) && !looksLikePlaceholder(env.SMS_PROVIDER_URL);
}

function hasWeakSecret(secret) {
  const normalized = String(secret || "");
  return (
    normalized.length < 32 ||
    DEFAULT_WEAK_SECRET_PATTERNS.some((pattern) => pattern.test(normalized))
  );
}

function validateRuntimeConfig(env = process.env) {
  const errors = [];
  const warnings = [];
  const nodeEnv = env.NODE_ENV || "development";
  const isProduction = nodeEnv === "production";
  const paymentMode = getPaymentMode(env);
  const registrationOtpRequired = registrationVerificationRequired(env);

  if (!hasValue(env.JWT_SECRET)) {
    errors.push("JWT_SECRET is required.");
  } else if (isProduction && hasWeakSecret(env.JWT_SECRET)) {
    errors.push(
      "JWT_SECRET must be at least 32 characters and not look like a placeholder in production.",
    );
  }

  if (!hasValue(env.DB_NAME)) {
    errors.push("DB_NAME is required.");
  }

  const commissionRateError = validatePlatformCommissionRate(env);
  if (commissionRateError) {
    errors.push(commissionRateError);
  }

  if (isProduction) {
    if (isEnabled(env.SERVIIO_SKIP_DB_HEALTHCHECK)) {
      errors.push("SERVIIO_SKIP_DB_HEALTHCHECK must not be enabled in production.");
    }

    if (!hasValue(env.CORS_ORIGIN) || env.CORS_ORIGIN === "*") {
      errors.push("CORS_ORIGIN must be a concrete frontend origin in production.");
    }

    if (paymentMode === "mock") {
      errors.push("PAYMENT_MODE cannot be mock in production.");
    }

    if (isEnabled(env.MOCK_PAYMENTS_ENABLED)) {
      errors.push("MOCK_PAYMENTS_ENABLED must be false in production.");
    }

    if (!hasSmtpConfig(env) && !hasSmsConfig(env)) {
      errors.push(
        "Production password reset requires SMTP or SMS provider configuration.",
      );
    }

    if (registrationOtpRequired && !hasSmtpConfig(env) && !hasSmsConfig(env)) {
      errors.push(
        "Production registration verification requires SMTP or SMS provider configuration.",
      );
    }

    if (hasValue(env.FRONTEND_BASE_URL) && !/^https:\/\//i.test(env.FRONTEND_BASE_URL)) {
      warnings.push("FRONTEND_BASE_URL should use HTTPS in production.");
    }
  }

  if (!["mock", "sslcommerz", "bkash", "nagad"].includes(paymentMode)) {
    errors.push(`Unsupported PAYMENT_MODE: ${paymentMode}.`);
  }

  if (paymentMode === "sslcommerz") {
    for (const key of ["SSLCOMMERZ_STORE_ID", "SSLCOMMERZ_STORE_PASSWORD"]) {
      if (!hasValue(env[key])) errors.push(`${key} is required for SSLCommerz.`);
    }
  }

  if (paymentMode === "bkash") {
    for (const key of [
      "BKASH_APP_KEY",
      "BKASH_APP_SECRET",
      "BKASH_USERNAME",
      "BKASH_PASSWORD",
    ]) {
      if (!hasValue(env[key])) errors.push(`${key} is required for bKash.`);
    }
  }

  if (paymentMode === "nagad") {
    for (const key of ["NAGAD_VERIFY_URL", "NAGAD_MERCHANT_ID"]) {
      if (!hasValue(env[key])) errors.push(`${key} is required for Nagad.`);
    }
  }

  const nidMode = String(env.NID_VERIFICATION_MODE || "disabled").toLowerCase();
  if (!["disabled", "mock", "generic_http"].includes(nidMode)) {
    errors.push(`Unsupported NID_VERIFICATION_MODE: ${nidMode}.`);
  }
  if (nidMode === "generic_http" && !hasValue(env.NID_VERIFICATION_URL)) {
    errors.push("NID_VERIFICATION_URL is required for generic_http NID checks.");
  }
  if (isProduction && nidMode === "mock" && !isEnabled(env.NID_VERIFICATION_MOCK_ENABLED)) {
    errors.push("NID mock mode requires NID_VERIFICATION_MOCK_ENABLED=true.");
  }

  for (const { prefix, label } of [
    { prefix: "POLICE_VERIFICATION", label: "police verification" },
    { prefix: "SKILL_VERIFICATION", label: "skill verification" },
  ]) {
    const mode = String(env[`${prefix}_MODE`] || "disabled").toLowerCase();
    if (!["disabled", "mock", "generic_http"].includes(mode)) {
      errors.push(`Unsupported ${prefix}_MODE: ${mode}.`);
    }
    if (mode === "generic_http" && !hasValue(env[`${prefix}_URL`])) {
      errors.push(`${prefix}_URL is required for generic_http ${label}.`);
    }
    if (isProduction && mode === "mock" && !isEnabled(env[`${prefix}_MOCK_ENABLED`])) {
      errors.push(`${prefix} mock mode requires ${prefix}_MOCK_ENABLED=true.`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

function assertRuntimeConfig(env = process.env) {
  const result = validateRuntimeConfig(env);
  for (const warning of result.warnings) {
    console.warn(`Config warning: ${warning}`);
  }
  if (!result.ok) {
    const message = `Runtime configuration is invalid:\n- ${result.errors.join("\n- ")}`;
    throw new Error(message);
  }
  return result;
}

module.exports = {
  assertRuntimeConfig,
  hasWeakSecret,
  registrationVerificationRequired,
  validateRuntimeConfig,
};
