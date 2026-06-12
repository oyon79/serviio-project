const test = require("node:test");
const assert = require("node:assert/strict");

function loadIdentityService(env = {}) {
  const modulePath = require.resolve("../services/identityVerificationService");
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
  const service = require("../services/identityVerificationService");
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

test("validates supported Bangladesh NID lengths", () => {
  const { service, restore } = loadIdentityService();
  try {
    assert.equal(service.isValidBangladeshNid("1234567890"), true);
    assert.equal(service.isValidBangladeshNid("1234567890123"), true);
    assert.equal(service.isValidBangladeshNid("12345678901234567"), true);
    assert.equal(service.isValidBangladeshNid("12345"), false);
  } finally {
    restore();
  }
});

test("NID verification returns NOT_CHECKED when provider is disabled", async () => {
  const { service, restore } = loadIdentityService({
    NID_VERIFICATION_MODE: "disabled",
    NID_VERIFICATION_URL: "",
  });
  try {
    const result = await service.verifyNid({
      nidNumber: "1234567890",
      fullName: "Test User",
    });
    assert.equal(result.checked, false);
    assert.equal(result.status, "NOT_CHECKED");
  } finally {
    restore();
  }
});

test("generic NID verification maps provider match response", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response(JSON.stringify({ matched: true, request_id: "nid-1" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  const { service, restore } = loadIdentityService({
    NID_VERIFICATION_MODE: "generic_http",
    NID_VERIFICATION_URL: "https://nid.test/verify",
    NID_VERIFICATION_API_KEY: "secret",
  });
  try {
    const result = await service.verifyNid({
      nidNumber: "1234567890",
      fullName: "Test User",
    });
    assert.equal(result.checked, true);
    assert.equal(result.status, "MATCHED");
    assert.equal(result.reference, "nid-1");
  } finally {
    global.fetch = originalFetch;
    restore();
  }
});

test("generic police verification maps provider match response", async () => {
  const originalFetch = global.fetch;
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.document_type, "POLICE_CLEARANCE");
    return new Response(JSON.stringify({ verified: true, reference: "police-1" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const { service, restore } = loadIdentityService({
    POLICE_VERIFICATION_MODE: "generic_http",
    POLICE_VERIFICATION_URL: "https://police.test/verify",
    POLICE_VERIFICATION_API_KEY: "secret",
  });
  try {
    const result = await service.verifyProviderDocument({
      documentType: "POLICE_CLEARANCE",
      documentNumber: "PC-123",
      fullName: "Test User",
    });
    assert.equal(result.checked, true);
    assert.equal(result.status, "MATCHED");
    assert.equal(result.reference, "police-1");
  } finally {
    global.fetch = originalFetch;
    restore();
  }
});

test("generic verification supports custom nested status and reference fields", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        verification: { outcome: "clear" },
        meta: { request: "vendor-police-22" },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );

  const { service, restore } = loadIdentityService({
    POLICE_VERIFICATION_MODE: "generic_http",
    POLICE_VERIFICATION_URL: "https://police-vendor.test/verify",
    POLICE_VERIFICATION_STATUS_FIELDS: "verification.outcome",
    POLICE_VERIFICATION_MATCH_VALUES: "clear",
    POLICE_VERIFICATION_REFERENCE_FIELDS: "meta.request",
  });
  try {
    const result = await service.verifyProviderDocument({
      documentType: "POLICE_CLEARANCE",
      documentNumber: "PC-456",
      fullName: "Vendor User",
    });
    assert.equal(result.checked, true);
    assert.equal(result.status, "MATCHED");
    assert.equal(result.reference, "vendor-police-22");
  } finally {
    global.fetch = originalFetch;
    restore();
  }
});

test("generic NID verification supports custom truthy response fields", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        result: { ok: "Y" },
        audit: { trace_id: "nid-trace-77" },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );

  const { service, restore } = loadIdentityService({
    NID_VERIFICATION_MODE: "generic_http",
    NID_VERIFICATION_URL: "https://nid-vendor.test/verify",
    NID_VERIFICATION_TRUTHY_FIELDS: "result.ok",
    NID_VERIFICATION_REFERENCE_FIELDS: "audit.trace_id",
  });
  try {
    const result = await service.verifyNid({
      nidNumber: "1234567890",
      fullName: "Vendor User",
    });
    assert.equal(result.checked, true);
    assert.equal(result.status, "MATCHED");
    assert.equal(result.reference, "nid-trace-77");
  } finally {
    global.fetch = originalFetch;
    restore();
  }
});

test("disabled skill verification records NOT_CHECKED", async () => {
  const { service, restore } = loadIdentityService({
    SKILL_VERIFICATION_MODE: "disabled",
    SKILL_VERIFICATION_URL: "",
  });
  try {
    const result = await service.verifyProviderDocument({
      documentType: "SKILL_CERTIFICATE",
      documentNumber: "SKILL-123",
      fullName: "Test User",
    });
    assert.equal(result.checked, false);
    assert.equal(result.status, "NOT_CHECKED");
  } finally {
    restore();
  }
});
