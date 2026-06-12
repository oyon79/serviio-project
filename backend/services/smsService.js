const IS_PRODUCTION = process.env.NODE_ENV === "production";

function normalizeBangladeshPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (/^01\d{9}$/.test(digits)) return `88${digits}`;
  if (/^8801\d{9}$/.test(digits)) return digits;
  return digits;
}

function buildSmsPayload({ to, message }) {
  const recipientField = process.env.SMS_PROVIDER_RECIPIENT_FIELD || "to";
  const messageField = process.env.SMS_PROVIDER_MESSAGE_FIELD || "message";
  const senderField = process.env.SMS_PROVIDER_SENDER_FIELD || "sender_id";
  const senderId = process.env.SMS_SENDER_ID || "SERVIIO";

  return {
    [recipientField]: normalizeBangladeshPhone(to),
    [messageField]: message,
    [senderField]: senderId,
  };
}

function buildSmsHeaders() {
  const headers = {
    "Content-Type": "application/json",
  };
  const apiKey = process.env.SMS_PROVIDER_API_KEY;
  if (apiKey) {
    const headerName = process.env.SMS_PROVIDER_AUTH_HEADER || "Authorization";
    const scheme = process.env.SMS_PROVIDER_AUTH_SCHEME || "Bearer";
    headers[headerName] = scheme ? `${scheme} ${apiKey}` : apiKey;
  }
  return headers;
}

async function sendSms({ to, message }) {
  const providerUrl = process.env.SMS_PROVIDER_URL;
  const mockEnabled =
    process.env.SMS_MOCK_ENABLED === "true" || !IS_PRODUCTION;

  if (!to || !message) {
    return {
      sent: false,
      statusCode: 400,
      message: "SMS recipient and message are required.",
    };
  }

  if (!providerUrl) {
    if (mockEnabled) {
      return {
        sent: true,
        provider: "mock",
        reference: `SMS-MOCK-${Date.now()}`,
        payload: { to: normalizeBangladeshPhone(to) },
      };
    }

    return {
      sent: false,
      statusCode: 503,
      message: "SMS provider is not configured.",
    };
  }

  const timeoutMs = Number(process.env.SMS_PROVIDER_TIMEOUT_MS || 10000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(providerUrl, {
      method: "POST",
      headers: buildSmsHeaders(),
      body: JSON.stringify(buildSmsPayload({ to, message })),
      signal: controller.signal,
    });
    const text = await response.text();
    let payload = text;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch (_) {
      payload = { raw: text };
    }

    if (!response.ok) {
      return {
        sent: false,
        statusCode: response.status,
        message: "SMS provider rejected the request.",
        payload,
      };
    }

    return {
      sent: true,
      provider: "http",
      reference:
        payload.reference ||
        payload.message_id ||
        payload.id ||
        `SMS-${Date.now()}`,
      payload,
    };
  } catch (error) {
    return {
      sent: false,
      statusCode: error.name === "AbortError" ? 504 : 502,
      message:
        error.name === "AbortError"
          ? "SMS provider request timed out."
          : "SMS provider request failed.",
      error: error.message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function sendPasswordResetOtp({ to, otp, resetUrl }) {
  const appName = process.env.APP_NAME || "SERVIIO";
  const message =
    `${appName} password reset code: ${otp}. ` +
    "It expires soon. " +
    `Reset: ${resetUrl}`;

  return sendSms({ to, message });
}

async function sendRegistrationOtp({ to, otp }) {
  const appName = process.env.APP_NAME || "SERVIIO";
  const minutes = Number(process.env.REGISTRATION_VERIFICATION_EXPIRY_MINUTES || 15);
  const message =
    `${appName} account verification code: ${otp}. ` +
    `It expires in ${minutes} minutes.`;

  return sendSms({ to, message });
}

module.exports = {
  normalizeBangladeshPhone,
  sendSms,
  sendPasswordResetOtp,
  sendRegistrationOtp,
};
