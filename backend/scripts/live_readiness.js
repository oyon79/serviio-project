const nodemailer = require("nodemailer");
const path = require("path");
require("dotenv").config({
  path: path.resolve(__dirname, "..", ".env"),
  quiet: true,
});
const { validateRuntimeConfig } = require("../config/runtimeConfig");
const { sendSms } = require("../services/smsService");
const {
  verifyConfiguredGatewayPayment,
} = require("../services/paymentGatewayService");
const {
  verifyNid,
  verifyProviderDocument,
} = require("../services/identityVerificationService");

const isStrict =
  process.env.LIVE_READINESS_STRICT === "true" ||
  process.env.NODE_ENV === "production";

const results = [];

function hasValue(value) {
  return String(value || "").trim() !== "";
}

function isPlaceholder(value) {
  return /example\.com|example\.org|localhost|replace|change[-_]?me|your[-_]?/i.test(
    String(value || ""),
  );
}

function addResult(name, status, message, details = undefined) {
  results.push({
    name,
    status,
    message,
    ...(details ? { details } : {}),
  });
}

function addSkippedOrStrictFailure(name, message, strictMessage = message) {
  addResult(name, isStrict ? "fail" : "skip", isStrict ? strictMessage : message);
}

async function checkRuntimeConfig() {
  const result = validateRuntimeConfig();
  if (result.ok) {
    addResult(
      "runtime-config",
      "pass",
      result.warnings.length
        ? "Runtime config is valid with warnings."
        : "Runtime config is valid.",
      result.warnings.length ? { warnings: result.warnings } : undefined,
    );
    return;
  }

  addResult("runtime-config", "fail", "Runtime config is invalid.", {
    errors: result.errors,
    warnings: result.warnings,
  });
}

async function checkSmtp() {
  if (
    !hasValue(process.env.EMAIL_HOST) ||
    !hasValue(process.env.EMAIL_USER) ||
    !hasValue(process.env.EMAIL_PASS)
  ) {
    addSkippedOrStrictFailure(
      "smtp",
      "SMTP credentials are not configured.",
      "Strict live readiness requires configured SMTP credentials.",
    );
    return;
  }

  if (
    isPlaceholder(process.env.EMAIL_HOST) ||
    isPlaceholder(process.env.EMAIL_USER) ||
    isPlaceholder(process.env.EMAIL_PASS)
  ) {
    addSkippedOrStrictFailure(
      "smtp",
      "SMTP credentials still look like placeholders.",
      "Strict live readiness requires real SMTP credentials, not placeholders.",
    );
    return;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_SECURE === "true",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  try {
    await transporter.verify();
    addResult("smtp", "pass", "SMTP server accepted the configured account.");
  } catch (error) {
    addResult("smtp", "fail", "SMTP verification failed.", {
      error: error.message,
    });
  }
}

async function checkSms() {
  if (!hasValue(process.env.SMS_PROVIDER_URL)) {
    addSkippedOrStrictFailure(
      "sms",
      "SMS provider URL is not configured.",
      "Strict live readiness requires a configured SMS provider URL.",
    );
    return;
  }

  if (!hasValue(process.env.LIVE_READINESS_SMS_TO)) {
    addSkippedOrStrictFailure(
      "sms",
      "Set LIVE_READINESS_SMS_TO to send a real SMS provider probe.",
      "Strict live readiness requires LIVE_READINESS_SMS_TO for a real SMS provider probe.",
    );
    return;
  }

  const message =
    process.env.LIVE_READINESS_SMS_MESSAGE ||
    `SERVIIO readiness probe ${new Date().toISOString()}`;
  const result = await sendSms({
    to: process.env.LIVE_READINESS_SMS_TO,
    message,
  });

  if (result.sent) {
    addResult("sms", "pass", "SMS provider accepted the readiness message.", {
      provider: result.provider,
      reference: result.reference,
    });
    return;
  }

  addResult("sms", "fail", result.message || "SMS provider probe failed.", {
    statusCode: result.statusCode,
    error: result.error,
  });
}

function getPaymentProbe() {
  const mode = String(process.env.PAYMENT_MODE || "mock").toLowerCase();
  const amount = Number(process.env.LIVE_READINESS_PAYMENT_AMOUNT || 100);

  if (mode === "mock") {
    return { mode, amount, reference: "LIVE-READINESS-MOCK" };
  }

  if (mode === "sslcommerz") {
    return {
      mode,
      amount,
      reference: process.env.LIVE_READINESS_SSLCOMMERZ_VAL_ID,
      hint: "LIVE_READINESS_SSLCOMMERZ_VAL_ID",
    };
  }

  if (mode === "bkash") {
    return {
      mode,
      amount,
      reference: process.env.LIVE_READINESS_BKASH_PAYMENT_ID,
      hint: "LIVE_READINESS_BKASH_PAYMENT_ID",
    };
  }

  if (mode === "nagad") {
    return {
      mode,
      amount,
      reference: process.env.LIVE_READINESS_NAGAD_PAYMENT_REF,
      hint: "LIVE_READINESS_NAGAD_PAYMENT_REF",
    };
  }

  return { mode, amount };
}

async function checkPaymentGateway() {
  const probe = getPaymentProbe();
  if (!["mock", "sslcommerz", "bkash", "nagad"].includes(probe.mode)) {
    addResult("payment", "fail", `Unsupported payment mode: ${probe.mode}.`);
    return;
  }

  if (isStrict && probe.mode === "mock") {
    addResult(
      "payment",
      "fail",
      "Strict live readiness requires a real payment gateway mode, not mock.",
    );
    return;
  }

  if (probe.mode !== "mock" && !hasValue(probe.reference)) {
    addSkippedOrStrictFailure(
      "payment",
      `Set ${probe.hint} to verify a real ${probe.mode} payment reference.`,
      `Strict live readiness requires ${probe.hint} to verify a real ${probe.mode} payment reference.`,
    );
    return;
  }

  const result = await verifyConfiguredGatewayPayment({
    gatewayReference: probe.reference,
    amount: probe.amount,
  });

  if (result.verified) {
    addResult("payment", "pass", `${probe.mode} payment verification passed.`, {
      transactionId: result.transactionId,
      gatewayName: result.gatewayName,
    });
    return;
  }

  addResult(
    "payment",
    probe.mode === "mock" && !isStrict ? "skip" : "fail",
    result.message || `${probe.mode} payment verification failed.`,
    { statusCode: result.statusCode },
  );
}

async function checkNid() {
  const mode = String(process.env.NID_VERIFICATION_MODE || "disabled").toLowerCase();
  if (mode === "disabled") {
    addSkippedOrStrictFailure(
      "nid-verification",
      "NID verification is disabled.",
      "Strict live readiness requires a real NID verification provider.",
    );
    return;
  }

  if (isStrict && mode === "mock") {
    addResult(
      "nid-verification",
      "fail",
      "Strict live readiness requires a real NID verification provider, not mock.",
    );
    return;
  }

  if (!hasValue(process.env.LIVE_READINESS_NID_NUMBER)) {
    addSkippedOrStrictFailure(
      "nid-verification",
      "Set LIVE_READINESS_NID_NUMBER to probe NID verification.",
      "Strict live readiness requires LIVE_READINESS_NID_NUMBER to probe NID verification.",
    );
    return;
  }

  const result = await verifyNid({
    nidNumber: process.env.LIVE_READINESS_NID_NUMBER,
    fullName: process.env.LIVE_READINESS_NID_FULL_NAME || "Serviio Test User",
    dateOfBirth: process.env.LIVE_READINESS_NID_DOB || null,
    phone: process.env.LIVE_READINESS_NID_PHONE || null,
  });

  addResult(
    "nid-verification",
    result.status === "MATCHED" ? "pass" : "fail",
    result.message || `NID verification returned ${result.status}.`,
    {
      status: result.status,
      provider: result.provider,
      reference: result.reference,
    },
  );
}

async function checkDocumentVerification({
  name,
  envPrefix,
  documentType,
  numberKey,
}) {
  const mode = String(process.env[`${envPrefix}_MODE`] || "disabled").toLowerCase();
  if (mode === "disabled") {
    addSkippedOrStrictFailure(
      name,
      `${documentType} verification is disabled.`,
      `Strict live readiness requires a real ${documentType} verification provider.`,
    );
    return;
  }

  if (isStrict && mode === "mock") {
    addResult(
      name,
      "fail",
      `Strict live readiness requires a real ${documentType} verification provider, not mock.`,
    );
    return;
  }

  if (!hasValue(process.env[numberKey])) {
    addSkippedOrStrictFailure(
      name,
      `Set ${numberKey} to probe ${documentType} verification.`,
      `Strict live readiness requires ${numberKey} to probe ${documentType} verification.`,
    );
    return;
  }

  const result = await verifyProviderDocument({
    documentType,
    documentNumber: process.env[numberKey],
    fullName: process.env.LIVE_READINESS_DOCUMENT_FULL_NAME || "Serviio Test User",
    phone: process.env.LIVE_READINESS_DOCUMENT_PHONE || null,
  });

  addResult(
    name,
    result.status === "MATCHED" ? "pass" : "fail",
    result.message || `${documentType} verification returned ${result.status}.`,
    {
      status: result.status,
      provider: result.provider,
      reference: result.reference,
    },
  );
}

async function run() {
  await checkRuntimeConfig();
  await checkSmtp();
  await checkSms();
  await checkPaymentGateway();
  await checkNid();
  await checkDocumentVerification({
    name: "police-verification",
    envPrefix: "POLICE_VERIFICATION",
    documentType: "POLICE_CLEARANCE",
    numberKey: "LIVE_READINESS_POLICE_DOCUMENT_NUMBER",
  });
  await checkDocumentVerification({
    name: "skill-verification",
    envPrefix: "SKILL_VERIFICATION",
    documentType: "SKILL_CERTIFICATE",
    numberKey: "LIVE_READINESS_SKILL_DOCUMENT_NUMBER",
  });

  const failures = results.filter((result) => result.status === "fail");
  const skips = results.filter((result) => result.status === "skip");
  const shouldFail = failures.length > 0 || (isStrict && skips.length > 0);

  console.log(
    JSON.stringify(
      {
        success: !shouldFail,
        strict: isStrict,
        summary: {
          pass: results.filter((result) => result.status === "pass").length,
          fail: failures.length,
          skip: skips.length,
        },
        results,
      },
      null,
      2,
    ),
  );

  if (shouldFail) {
    process.exit(1);
  }
}

run().catch((error) => {
  console.error(`Live readiness failed: ${error.message || error}`);
  process.exit(1);
});
