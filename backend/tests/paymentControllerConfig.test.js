process.env.SERVIIO_SKIP_DB_HEALTHCHECK = "true";
process.env.JWT_SECRET = process.env.JWT_SECRET || "payment-controller-config-secret";

const test = require("node:test");
const assert = require("node:assert/strict");

const db = require("../config/db");
const paymentController = require("../controllers/paymentController");

function createResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

test("payment processing rejects invalid commission config before database work", async () => {
  const previousRate = process.env.PLATFORM_COMMISSION_RATE;
  const originalGetConnection = db.getConnection;
  let getConnectionCalled = false;

  process.env.PLATFORM_COMMISSION_RATE = "1.25";
  db.getConnection = async () => {
    getConnectionCalled = true;
    throw new Error("db should not be touched for invalid commission config");
  };

  try {
    const res = createResponse();
    await paymentController.processPayment(
      {
        body: {
          booking_id: 123,
          amount: 500,
          payment_method: "mock",
        },
        user: { id: 10, role: "customer" },
      },
      res,
    );

    assert.equal(getConnectionCalled, false);
    assert.equal(res.statusCode, 500);
    assert.equal(res.payload.success, false);
    assert.match(res.payload.message, /configuration/i);
  } finally {
    db.getConnection = originalGetConnection;
    if (previousRate === undefined) {
      delete process.env.PLATFORM_COMMISSION_RATE;
    } else {
      process.env.PLATFORM_COMMISSION_RATE = previousRate;
    }
  }
});
