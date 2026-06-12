process.env.SERVIIO_SKIP_DB_HEALTHCHECK = "true";
process.env.JWT_SECRET = process.env.JWT_SECRET || "admin-role-access-secret";

const test = require("node:test");
const assert = require("node:assert/strict");

const db = require("../config/db");
const bookingController = require("../controllers/bookingController");
const communicationController = require("../controllers/communicationController");
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

test("super admins can view unrelated booking details with handshake code", async () => {
  const originalQuery = db.query;
  db.query = async () => [
    [
      {
        id: 99,
        customer_id: 10,
        provider_id: 20,
        status: "ACCEPTED",
        payment_status: "PAID",
        handshake_code: "1234",
      },
    ],
  ];

  try {
    const res = createResponse();
    await bookingController.getBookingById(
      {
        params: { id: 99 },
        user: { id: 1, role: "super_admin" },
      },
      res,
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.success, true);
    assert.equal(res.payload.data.handshake_code, "1234");
  } finally {
    db.query = originalQuery;
  }
});

test("super admins can view unrelated payment status", async () => {
  const originalQuery = db.query;
  db.query = async () => [
    [
      {
        id: 77,
        customer_id: 10,
        provider_id: 20,
        payment_status: "PAID",
        payment_amount: "850.00",
        payment_date: "2026-06-10T10:00:00.000Z",
        escrow_status: "HELD",
        platform_fee: "85.00",
        provider_amount: "765.00",
      },
    ],
  ];

  try {
    const res = createResponse();
    await paymentController.getPaymentStatus(
      {
        params: { booking_id: 77 },
        user: { id: 1, role: "super_admin" },
      },
      res,
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.success, true);
    assert.equal(res.payload.data.payment_status, "PAID");
    assert.equal(res.payload.data.escrow_status, "HELD");
  } finally {
    db.query = originalQuery;
  }
});

test("super admins can inspect unrelated booking messages", async () => {
  const originalGetConnection = db.getConnection;
  const calls = [];
  const connection = {
    async query(sql) {
      calls.push(sql);
      if (sql.includes("FROM bookings b")) {
        return [
          [
            {
              id: 44,
              customer_id: 10,
              provider_id: 20,
              service_type: "Electrician",
              status: "ACCEPTED",
            },
          ],
        ];
      }
      if (sql.includes("FROM booking_messages m")) {
        return [
          [
            {
              id: 5,
              booking_id: 44,
              sender_id: 10,
              message: "Please bring a tester.",
              is_read: false,
              first_name: "Customer",
              last_name: "One",
              role: "customer",
            },
          ],
        ];
      }
      return [{ affectedRows: 1 }];
    },
    release() {},
  };
  db.getConnection = async () => connection;

  try {
    const res = createResponse();
    await communicationController.listMessages(
      {
        params: { bookingId: 44 },
        user: { id: 1, role: "super_admin" },
      },
      res,
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.success, true);
    assert.equal(res.payload.count, 1);
    assert.equal(res.payload.data[0].sender_name, "Customer One");
    assert.equal(calls.length, 3);
  } finally {
    db.getConnection = originalGetConnection;
  }
});
