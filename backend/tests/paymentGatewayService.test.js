const test = require("node:test");
const assert = require("node:assert/strict");

function loadPaymentService(env = {}) {
  const modulePath = require.resolve("../services/paymentGatewayService");
  delete require.cache[modulePath];
  const previous = {};
  for (const key of Object.keys(env)) {
    previous[key] = process.env[key];
    if (env[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = env[key];
    }
  }
  const service = require("../services/paymentGatewayService");
  return {
    service,
    restore() {
      delete require.cache[modulePath];
      for (const key of Object.keys(env)) {
        if (previous[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = previous[key];
        }
      }
    },
  };
}

test("amountMatches allows cent-level gateway precision differences", () => {
  const { service, restore } = loadPaymentService();
  try {
    assert.equal(service.amountMatches("100.00", 100), true);
    assert.equal(service.amountMatches("100.01", 100), true);
    assert.equal(service.amountMatches("100.02", 100), false);
  } finally {
    restore();
  }
});

test("production mock payments fail closed when disabled", async () => {
  const { service, restore } = loadPaymentService({
    NODE_ENV: "production",
    PAYMENT_MODE: "mock",
    MOCK_PAYMENTS_ENABLED: "false",
  });
  try {
    const result = await service.verifyConfiguredGatewayPayment({
      amount: 100,
    });
    assert.equal(result.verified, false);
    assert.equal(result.statusCode, 403);
  } finally {
    restore();
  }
});

test("bKash verification requires live credentials", async () => {
  const { service, restore } = loadPaymentService({
    PAYMENT_MODE: "bkash",
    BKASH_APP_KEY: "",
    BKASH_APP_SECRET: "",
    BKASH_USERNAME: "",
    BKASH_PASSWORD: "",
  });
  try {
    const result = await service.verifyConfiguredGatewayPayment({
      gatewayReference: "payment-id",
      amount: 100,
    });
    assert.equal(result.verified, false);
    assert.equal(result.statusCode, 503);
  } finally {
    restore();
  }
});

test("bKash verification accepts completed payment status", async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).endsWith("/token/grant")) {
      return new Response(JSON.stringify({ id_token: "token-123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify({
        transactionStatus: "Completed",
        amount: "250.00",
        trxID: "BKASH-TXN-1",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  };

  const { service, restore } = loadPaymentService({
    PAYMENT_MODE: "bkash",
    BKASH_BASE_URL: "https://bkash.test",
    BKASH_APP_KEY: "key",
    BKASH_APP_SECRET: "secret",
    BKASH_USERNAME: "user",
    BKASH_PASSWORD: "pass",
  });

  try {
    const result = await service.verifyConfiguredGatewayPayment({
      gatewayReference: "payment-id",
      amount: 250,
    });
    assert.equal(result.verified, true);
    assert.equal(result.transactionId, "BKASH-TXN-1");
    assert.equal(calls.length, 2);
  } finally {
    global.fetch = originalFetch;
    restore();
  }
});

test("SSLCommerz verification accepts validated matching payment", async () => {
  const originalFetch = global.fetch;
  let validationUrl;
  global.fetch = async (url) => {
    validationUrl = new URL(String(url));
    return new Response(
      JSON.stringify({
        status: "VALIDATED",
        amount: "500.00",
        tran_id: "SSLC-TXN-1",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  };

  const { service, restore } = loadPaymentService({
    PAYMENT_MODE: "sslcommerz",
    SSLCOMMERZ_STORE_ID: "store-id",
    SSLCOMMERZ_STORE_PASSWORD: "store-pass",
    SSLCOMMERZ_VALIDATION_URL: "https://sslcommerz.test/validate",
  });

  try {
    const result = await service.verifyConfiguredGatewayPayment({
      gatewayReference: "val-id-1",
      amount: 500,
    });
    assert.equal(result.verified, true);
    assert.equal(result.transactionId, "SSLC-TXN-1");
    assert.equal(validationUrl.searchParams.get("val_id"), "val-id-1");
    assert.equal(validationUrl.searchParams.get("store_id"), "store-id");
  } finally {
    global.fetch = originalFetch;
    restore();
  }
});

test("Nagad verification requires endpoint and merchant id", async () => {
  const { service, restore } = loadPaymentService({
    PAYMENT_MODE: "nagad",
    NAGAD_VERIFY_URL: "",
    NAGAD_MERCHANT_ID: "",
  });
  try {
    const result = await service.verifyConfiguredGatewayPayment({
      gatewayReference: "payment-ref",
      amount: 100,
    });
    assert.equal(result.verified, false);
    assert.equal(result.statusCode, 503);
  } finally {
    restore();
  }
});

test("Nagad verification accepts configured success response", async () => {
  const originalFetch = global.fetch;
  let requestBody;
  global.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response(
      JSON.stringify({
        paymentStatus: "SUCCESS",
        totalAmount: "350.00",
        transactionId: "NAGAD-TXN-1",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  };

  const { service, restore } = loadPaymentService({
    PAYMENT_MODE: "nagad",
    NAGAD_VERIFY_URL: "https://nagad.test/verify",
    NAGAD_MERCHANT_ID: "merchant-1",
    NAGAD_API_KEY: "api-key",
  });

  try {
    const result = await service.verifyConfiguredGatewayPayment({
      gatewayReference: "payment-ref",
      amount: 350,
    });
    assert.equal(result.verified, true);
    assert.equal(result.transactionId, "NAGAD-TXN-1");
    assert.equal(requestBody.merchant_id, "merchant-1");
    assert.equal(requestBody.payment_ref_id, "payment-ref");
  } finally {
    global.fetch = originalFetch;
    restore();
  }
});
