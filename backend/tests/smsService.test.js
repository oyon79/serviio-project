const test = require("node:test");
const assert = require("node:assert/strict");

function loadSmsService(env = {}) {
  const modulePath = require.resolve("../services/smsService");
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
  const service = require("../services/smsService");
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

test("normalizes Bangladeshi phone numbers for SMS providers", () => {
  const { service, restore } = loadSmsService();
  try {
    assert.equal(service.normalizeBangladeshPhone("01712345678"), "8801712345678");
    assert.equal(service.normalizeBangladeshPhone("+8801712345678"), "8801712345678");
  } finally {
    restore();
  }
});

test("SMS fails closed in production when provider is missing", async () => {
  const { service, restore } = loadSmsService({
    NODE_ENV: "production",
    SMS_PROVIDER_URL: "",
    SMS_MOCK_ENABLED: "false",
  });
  try {
    const result = await service.sendSms({
      to: "01712345678",
      message: "Test",
    });
    assert.equal(result.sent, false);
    assert.equal(result.statusCode, 503);
  } finally {
    restore();
  }
});

test("SMS posts to configured HTTP provider", async () => {
  const originalFetch = global.fetch;
  let requestBody = null;
  global.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ message_id: "sms-1" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const { service, restore } = loadSmsService({
    SMS_PROVIDER_URL: "https://sms.test/send",
    SMS_PROVIDER_API_KEY: "secret",
  });
  try {
    const result = await service.sendSms({
      to: "01712345678",
      message: "Hello",
    });
    assert.equal(result.sent, true);
    assert.equal(result.reference, "sms-1");
    assert.equal(requestBody.to, "8801712345678");
  } finally {
    global.fetch = originalFetch;
    restore();
  }
});
