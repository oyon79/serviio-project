const PAYMENT_MODE = String(process.env.PAYMENT_MODE || "mock").toLowerCase();
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const MOCK_PAYMENTS_ENABLED =
  process.env.MOCK_PAYMENTS_ENABLED === "true" || !IS_PRODUCTION;
const PAYMENT_GATEWAY_TIMEOUT_MS = Number(
  process.env.PAYMENT_GATEWAY_TIMEOUT_MS || 15000,
);

function makeTransactionId(prefix = "TXN") {
  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 11)
    .toUpperCase()}`;
}

function buildGatewayUrl(baseUrl, path) {
  const base = String(baseUrl || "").replace(/\/+$/, "");
  return `${base}${path}`;
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    PAYMENT_GATEWAY_TIMEOUT_MS,
  );

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    const text = await response.text();
    let payload = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch (_) {
      payload = { raw: text };
    }
    return { response, payload };
  } finally {
    clearTimeout(timeout);
  }
}

function amountMatches(gatewayAmount, expectedAmount) {
  const gatewayCents = Math.round(Number(gatewayAmount) * 100);
  const expectedCents = Math.round(Number(expectedAmount) * 100);
  return Math.abs(gatewayCents - expectedCents) <= 1;
}

async function verifySslCommerzPayment({ gatewayReference, amount }) {
  const storeId = process.env.SSLCOMMERZ_STORE_ID;
  const storePassword = process.env.SSLCOMMERZ_STORE_PASSWORD;
  const validationUrl =
    process.env.SSLCOMMERZ_VALIDATION_URL ||
    "https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php";

  if (!storeId || !storePassword) {
    return {
      verified: false,
      statusCode: 503,
      message: "SSLCommerz credentials are not configured.",
    };
  }

  if (!gatewayReference) {
    return {
      verified: false,
      statusCode: 202,
      message: "SSLCommerz payment reference is required for verification.",
    };
  }

  const url = new URL(validationUrl);
  url.searchParams.set("val_id", gatewayReference);
  url.searchParams.set("store_id", storeId);
  url.searchParams.set("store_passwd", storePassword);
  url.searchParams.set("format", "json");

  const { response, payload } = await fetchJson(url);
  const validStatuses = new Set(["VALID", "VALIDATED"]);

  if (
    !response.ok ||
    !validStatuses.has(String(payload.status || "").toUpperCase()) ||
    !amountMatches(payload.amount, amount)
  ) {
    return {
      verified: false,
      statusCode: 400,
      message: "SSLCommerz payment could not be verified.",
      payload,
    };
  }

  return {
    verified: true,
    transactionId:
      payload.tran_id || payload.bank_tran_id || makeTransactionId("SSLC"),
    gatewayName: "sslcommerz",
    gatewayReference,
    payload,
  };
}

async function verifyBkashPayment({ gatewayReference, amount }) {
  const baseUrl =
    process.env.BKASH_BASE_URL || "https://tokenized.sandbox.bka.sh/v1.2.0-beta";
  const appKey = process.env.BKASH_APP_KEY;
  const appSecret = process.env.BKASH_APP_SECRET;
  const username = process.env.BKASH_USERNAME;
  const password = process.env.BKASH_PASSWORD;

  if (!appKey || !appSecret || !username || !password) {
    return {
      verified: false,
      statusCode: 503,
      message: "bKash credentials are not configured.",
    };
  }

  if (!gatewayReference) {
    return {
      verified: false,
      statusCode: 202,
      message: "bKash paymentID is required for verification.",
    };
  }

  const tokenUrl = buildGatewayUrl(baseUrl, "/tokenized/checkout/token/grant");
  const tokenResult = await fetchJson(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      username,
      password,
    },
    body: JSON.stringify({
      app_key: appKey,
      app_secret: appSecret,
    }),
  });

  const idToken = tokenResult.payload.id_token;
  if (!tokenResult.response.ok || !idToken) {
    return {
      verified: false,
      statusCode: 502,
      message: "bKash token request failed.",
      payload: tokenResult.payload,
    };
  }

  const queryUrl = buildGatewayUrl(baseUrl, "/tokenized/checkout/payment/status");
  const queryResult = await fetchJson(queryUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: idToken,
      "X-APP-Key": appKey,
    },
    body: JSON.stringify({
      paymentID: gatewayReference,
    }),
  });
  const payload = queryResult.payload;
  const transactionStatus = String(payload.transactionStatus || "").toUpperCase();

  if (
    !queryResult.response.ok ||
    transactionStatus !== "COMPLETED" ||
    !amountMatches(payload.amount, amount)
  ) {
    return {
      verified: false,
      statusCode: 400,
      message: "bKash payment could not be verified.",
      payload,
    };
  }

  return {
    verified: true,
    transactionId: payload.trxID || payload.paymentID || makeTransactionId("BKASH"),
    gatewayName: "bkash",
    gatewayReference,
    payload,
  };
}

async function verifyNagadPayment({ gatewayReference, amount }) {
  const verifyUrl = process.env.NAGAD_VERIFY_URL;
  const merchantId = process.env.NAGAD_MERCHANT_ID;
  const apiKey = process.env.NAGAD_API_KEY;

  if (!verifyUrl || !merchantId) {
    return {
      verified: false,
      statusCode: 503,
      message:
        "Nagad verification endpoint and merchant credentials are not configured.",
    };
  }

  if (!gatewayReference) {
    return {
      verified: false,
      statusCode: 202,
      message: "Nagad payment reference is required for verification.",
    };
  }

  const headers = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const { response, payload } = await fetchJson(verifyUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      merchant_id: merchantId,
      payment_ref_id: gatewayReference,
      amount: Number(amount),
    }),
  });
  const status = String(
    payload.status || payload.paymentStatus || payload.transactionStatus || "",
  ).toUpperCase();
  const validStatuses = new Set(["SUCCESS", "COMPLETED", "PAID", "VERIFIED"]);
  const gatewayAmount = payload.amount || payload.totalAmount || amount;

  if (!response.ok || !validStatuses.has(status) || !amountMatches(gatewayAmount, amount)) {
    return {
      verified: false,
      statusCode: 400,
      message: "Nagad payment could not be verified.",
      payload,
    };
  }

  return {
    verified: true,
    transactionId:
      payload.transaction_id ||
      payload.transactionId ||
      payload.issuerPaymentRefNo ||
      makeTransactionId("NAGAD"),
    gatewayName: "nagad",
    gatewayReference,
    payload,
  };
}

async function verifyConfiguredGatewayPayment(input) {
  if (PAYMENT_MODE === "mock") {
    if (!MOCK_PAYMENTS_ENABLED) {
      return {
        verified: false,
        statusCode: 403,
        message: "Mock payments are disabled in this environment.",
      };
    }

    return {
      verified: true,
      transactionId: makeTransactionId("MOCK"),
      gatewayName: "mock",
      gatewayReference: input.gatewayReference || null,
      payload: { mode: "mock" },
    };
  }

  if (PAYMENT_MODE === "sslcommerz") {
    return verifySslCommerzPayment(input);
  }

  if (PAYMENT_MODE === "bkash") {
    return verifyBkashPayment(input);
  }

  if (PAYMENT_MODE === "nagad") {
    return verifyNagadPayment(input);
  }

  return {
    verified: false,
    statusCode: 500,
    message: `Unsupported payment mode: ${PAYMENT_MODE}.`,
  };
}

module.exports = {
  amountMatches,
  verifyBkashPayment,
  verifyConfiguredGatewayPayment,
  verifyNagadPayment,
  verifySslCommerzPayment,
};
