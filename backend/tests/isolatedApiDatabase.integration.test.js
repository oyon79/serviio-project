process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "isolated-api-integration-secret";
process.env.PAYMENT_MODE = "mock";
process.env.MOCK_PAYMENTS_ENABLED = "true";
process.env.PLATFORM_COMMISSION_RATE = "0.10";

const test = require("node:test");
const { before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const express = require("express");
const jwt = require("jsonwebtoken");
const mysql = require("mysql2/promise");
require("dotenv").config({
  path: path.resolve(__dirname, "..", ".env"),
  quiet: true,
});

const testDbName = `serviio_test_${Date.now()}_${Math.random()
  .toString(36)
  .slice(2, 8)}`;
process.env.DB_NAME = testDbName;

let adminConnection;
let app;
let db;

function escapeIdentifier(value) {
  if (!/^[a-zA-Z0-9_]+$/.test(value)) {
    throw new Error(`Unsafe database identifier: ${value}`);
  }
  return `\`${value}\``;
}

function splitSqlStatements(sql) {
  const withoutLineComments = sql
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  return withoutLineComments
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean)
    .filter(
      (statement) =>
        !/^CREATE\s+DATABASE\b/i.test(statement) && !/^USE\s+/i.test(statement),
    );
}

async function createIsolatedSchema() {
  const {
    DB_HOST = "localhost",
    DB_USER = "root",
    DB_PASSWORD = "",
    DB_PORT = 3306,
  } = process.env;

  adminConnection = await mysql.createConnection({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASSWORD,
    port: Number(DB_PORT),
    multipleStatements: false,
  });

  const escapedDbName = escapeIdentifier(testDbName);
  await adminConnection.query(`DROP DATABASE IF EXISTS ${escapedDbName}`);
  await adminConnection.query(
    `CREATE DATABASE ${escapedDbName} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );

  const schemaConnection = await mysql.createConnection({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASSWORD,
    port: Number(DB_PORT),
    database: testDbName,
    multipleStatements: false,
  });

  try {
    const schemaPath = path.resolve(
      __dirname,
      "..",
      "..",
      "database",
      "serviio_schema.sql",
    );
    const statements = splitSqlStatements(fs.readFileSync(schemaPath, "utf8"));
    for (const statement of statements) {
      await schemaConnection.query(statement);
    }
  } finally {
    await schemaConnection.end();
  }
}

function buildApp() {
  const authRoutes = require("../routes/authRoutes");
  const providerRoutes = require("../routes/providerRoutes");
  const bookingRoutes = require("../routes/bookingRoutes");
  const paymentRoutes = require("../routes/paymentRoutes");
  const walletRoutes = require("../routes/walletRoutes");
  const reviewRoutes = require("../routes/reviewRoutes");

  const instance = express();
  instance.use(express.json());
  instance.use("/api/auth", authRoutes);
  instance.use("/api/providers", providerRoutes);
  instance.use("/api/bookings", bookingRoutes);
  instance.use("/api/payments", paymentRoutes);
  instance.use("/api/wallet", walletRoutes);
  instance.use("/api/reviews", reviewRoutes);
  return instance;
}

async function withTestServer(callback) {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  try {
    const { port } = server.address();
    return await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function requestJson(baseUrl, pathName, options = {}) {
  const response = await fetch(`${baseUrl}${pathName}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const payload = await response.json();
  return { response, payload };
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

before(async () => {
  await createIsolatedSchema();
  db = require("../config/db");
  app = buildApp();
});

after(async () => {
  if (db) {
    await db.end().catch(() => {});
  }

  if (adminConnection) {
    await adminConnection
      .query(`DROP DATABASE IF EXISTS ${escapeIdentifier(testDbName)}`)
      .catch(() => {});
    await adminConnection.end().catch(() => {});
  }
});

test("isolated API flow covers auth, booking, payment, escrow, and review", async () => {
  await withTestServer(async (baseUrl) => {
    const unique = Date.now();

    const customerRegister = await requestJson(baseUrl, "/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        first_name: "Test",
        last_name: "Customer",
        email: `customer-${unique}@serviio.test`,
        phone: "01710000001",
        password: "Passw0rd!",
        role: "customer",
      }),
    });
    assert.equal(customerRegister.response.status, 201);
    assert.equal(customerRegister.payload.success, true);
    const customerToken = customerRegister.payload.token;
    const customerId = customerRegister.payload.user.id;

    const providerRegister = await requestJson(baseUrl, "/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        first_name: "Test",
        last_name: "Provider",
        email: `provider-${unique}@serviio.test`,
        phone: "01710000002",
        password: "Passw0rd!",
        role: "provider",
        nid: "1234567890",
      }),
    });
    assert.equal(providerRegister.response.status, 201);
    assert.equal(providerRegister.payload.success, true);
    const providerToken = providerRegister.payload.token;
    const providerId = providerRegister.payload.user.id;

    const [supportUser] = await db.query(
      `INSERT INTO users
        (first_name, last_name, email, phone, password, role, account_verified)
       VALUES (?, ?, ?, ?, ?, 'support_agent', TRUE)`,
      [
        "Support",
        "Agent",
        `support-${unique}@serviio.test`,
        "01710000003",
        "$2b$12$3TacDNJmDc/tYLV9QNNJNejq04bAHxhjpO5LkxedC7QwsNCaL7wci",
      ],
    );
    const supportToken = jwt.sign(
      {
        id: supportUser.insertId,
        role: "support_agent",
        email: `support-${unique}@serviio.test`,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
    );

    await db.query(
      `UPDATE provider_profiles
       SET service_type = 'Plumber',
           location = 'Dhaka',
           is_verified = 1,
           verification_status = 'VERIFIED',
           verified_at = NOW(),
           is_available = 1,
           hourly_rate = 500.00
       WHERE user_id = ?`,
      [providerId],
    );

    const providerList = await requestJson(baseUrl, "/api/providers");
    assert.equal(providerList.response.status, 200);
    assert.equal(providerList.payload.success, true);
    assert.equal(providerList.payload.count, 1);
    assert.equal(providerList.payload.data[0].id, providerId);

    const bookingDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const bookingCreate = await requestJson(baseUrl, "/api/bookings/create", {
      method: "POST",
      headers: authHeaders(customerToken),
      body: JSON.stringify({
        provider_id: providerId,
        service_type: "Plumber",
        booking_date: bookingDate,
        job_location: "Banani, Dhaka",
        is_emergency: false,
      }),
    });
    assert.equal(bookingCreate.response.status, 201);
    assert.equal(bookingCreate.payload.success, true);
    assert.equal(bookingCreate.payload.data.status, "PENDING");
    assert.ok(Number(bookingCreate.payload.data.quoted_amount) > 0);

    const bookingId = bookingCreate.payload.data.booking_id;
    const amount = bookingCreate.payload.data.quoted_amount;

    const acceptedBeforePayment = await requestJson(
      baseUrl,
      `/api/bookings/${bookingId}/status`,
      {
        method: "PATCH",
        headers: authHeaders(providerToken),
        body: JSON.stringify({ status: "ACCEPTED" }),
      },
    );
    assert.equal(acceptedBeforePayment.response.status, 200);
    assert.equal(acceptedBeforePayment.payload.data.status, "ACCEPTED");

    const unpaidTravelAttempt = await requestJson(
      baseUrl,
      `/api/bookings/${bookingId}/status`,
      {
        method: "PATCH",
        headers: authHeaders(providerToken),
        body: JSON.stringify({ status: "ON_THE_WAY" }),
      },
    );
    assert.equal(unpaidTravelAttempt.response.status, 400);
    assert.match(unpaidTravelAttempt.payload.message, /payment/i);

    const payment = await requestJson(baseUrl, "/api/payments/process", {
      method: "POST",
      headers: authHeaders(customerToken),
      body: JSON.stringify({
        booking_id: bookingId,
        amount,
        payment_method: "mock",
      }),
    });
    assert.equal(payment.response.status, 200);
    assert.equal(payment.payload.success, true);
    assert.equal(payment.payload.data.status, "PAID");
    assert.equal(payment.payload.data.escrow_status, "HELD");

    const paidBooking = await requestJson(baseUrl, `/api/bookings/${bookingId}`, {
      headers: authHeaders(customerToken),
    });
    assert.equal(paidBooking.response.status, 200);
    assert.equal(paidBooking.payload.success, true);
    assert.match(paidBooking.payload.data.handshake_code, /^\d{4}$/);

    for (const status of ["ON_THE_WAY", "ARRIVED"]) {
      const statusResponse = await requestJson(
        baseUrl,
        `/api/bookings/${bookingId}/status`,
        {
          method: "PATCH",
          headers: authHeaders(providerToken),
          body: JSON.stringify({ status }),
        },
      );
      assert.equal(statusResponse.response.status, 200);
      assert.equal(statusResponse.payload.data.status, status);
    }

    const handshake = await requestJson(baseUrl, "/api/bookings/verify-handshake", {
      method: "POST",
      headers: authHeaders(providerToken),
      body: JSON.stringify({
        booking_id: bookingId,
        handshake_code: paidBooking.payload.data.handshake_code,
      }),
    });
    assert.equal(handshake.response.status, 200);
    assert.equal(handshake.payload.success, true);

    const completed = await requestJson(
      baseUrl,
      `/api/bookings/${bookingId}/status`,
      {
        method: "PATCH",
        headers: authHeaders(providerToken),
        body: JSON.stringify({ status: "COMPLETED" }),
      },
    );
    assert.equal(completed.response.status, 200);
    assert.equal(completed.payload.data.status, "COMPLETED");

    const review = await requestJson(baseUrl, "/api/reviews", {
      method: "POST",
      headers: authHeaders(customerToken),
      body: JSON.stringify({
        booking_id: bookingId,
        rating: 5,
        title: "Great work",
        comment: "Fast, clean, and professional.",
      }),
    });
    assert.equal(review.response.status, 201);
    assert.equal(review.payload.success, true);

    const duplicateReview = await requestJson(baseUrl, "/api/reviews", {
      method: "POST",
      headers: authHeaders(customerToken),
      body: JSON.stringify({
        booking_id: bookingId,
        rating: 4,
        title: "Second review",
      }),
    });
    assert.equal(duplicateReview.response.status, 409);

    const walletBeforeRelease = await requestJson(baseUrl, "/api/wallet/me", {
      headers: authHeaders(providerToken),
    });
    assert.equal(walletBeforeRelease.response.status, 200);
    assert.equal(walletBeforeRelease.payload.success, true);
    assert.equal(walletBeforeRelease.payload.data.escrows[0].status, "HELD");
    assert.ok(Number(walletBeforeRelease.payload.data.wallet.pending_balance) > 0);

    const escrowRelease = await requestJson(
      baseUrl,
      `/api/wallet/escrow/${bookingId}/release`,
      {
        method: "POST",
        headers: authHeaders(customerToken),
        body: JSON.stringify({}),
      },
    );
    assert.equal(escrowRelease.response.status, 200);
    assert.equal(escrowRelease.payload.success, true);
    assert.equal(escrowRelease.payload.data.status, "RELEASED");

    const walletAfterRelease = await requestJson(baseUrl, "/api/wallet/me", {
      headers: authHeaders(providerToken),
    });
    assert.equal(walletAfterRelease.response.status, 200);
    assert.equal(walletAfterRelease.payload.data.escrows[0].status, "RELEASED");
    assert.ok(Number(walletAfterRelease.payload.data.wallet.balance) > 0);
    assert.equal(Number(walletAfterRelease.payload.data.wallet.pending_balance), 0);

    const payoutRequest = await requestJson(
      baseUrl,
      "/api/wallet/payout-requests",
      {
        method: "POST",
        headers: authHeaders(providerToken),
        body: JSON.stringify({
          amount: 100,
          payout_method: "BKASH",
          account_ref: "01710000002",
          provider_notes: "Weekly payout test.",
        }),
      },
    );
    assert.equal(payoutRequest.response.status, 201);
    assert.equal(payoutRequest.payload.success, true);
    assert.equal(payoutRequest.payload.data.status, "REQUESTED");

    const walletAfterPayoutRequest = await requestJson(
      baseUrl,
      "/api/wallet/me",
      {
        headers: authHeaders(providerToken),
      },
    );
    assert.equal(walletAfterPayoutRequest.response.status, 200);
    assert.equal(
      Number(walletAfterPayoutRequest.payload.data.wallet.payout_reserved_balance),
      100,
    );
    assert.equal(walletAfterPayoutRequest.payload.data.payouts[0].status, "REQUESTED");

    const adminPayouts = await requestJson(
      baseUrl,
      "/api/wallet/payout-requests/admin",
      {
        headers: authHeaders(supportToken),
      },
    );
    assert.equal(adminPayouts.response.status, 200);
    assert.ok(
      adminPayouts.payload.data.some(
        (payout) => payout.id === payoutRequest.payload.data.id,
      ),
    );

    const approvedPayout = await requestJson(
      baseUrl,
      `/api/wallet/payout-requests/${payoutRequest.payload.data.id}`,
      {
        method: "PATCH",
        headers: authHeaders(supportToken),
        body: JSON.stringify({
          status: "APPROVED",
          reviewer_notes: "Approved in integration test.",
        }),
      },
    );
    assert.equal(approvedPayout.response.status, 200);
    assert.equal(approvedPayout.payload.data.status, "APPROVED");

    const paidPayout = await requestJson(
      baseUrl,
      `/api/wallet/payout-requests/${payoutRequest.payload.data.id}`,
      {
        method: "PATCH",
        headers: authHeaders(supportToken),
        body: JSON.stringify({
          status: "PAID",
          external_reference: "BKASH-PAYOUT-TEST",
        }),
      },
    );
    assert.equal(paidPayout.response.status, 200);
    assert.equal(paidPayout.payload.data.status, "PAID");

    const walletAfterPayoutPaid = await requestJson(baseUrl, "/api/wallet/me", {
      headers: authHeaders(providerToken),
    });
    assert.equal(
      Number(walletAfterPayoutPaid.payload.data.wallet.payout_reserved_balance),
      0,
    );
    assert.equal(walletAfterPayoutPaid.payload.data.payouts[0].status, "PAID");

    const paymentStatus = await requestJson(
      baseUrl,
      `/api/payments/${bookingId}/status`,
      { headers: authHeaders(customerToken) },
    );
    assert.equal(paymentStatus.response.status, 200);
    assert.equal(paymentStatus.payload.data.payment_status, "PAID");
    assert.equal(paymentStatus.payload.data.escrow_status, "RELEASED");

    const [bookingRows] = await db.query(
      "SELECT customer_id, provider_id, status, payment_status FROM bookings WHERE id = ?",
      [bookingId],
    );
    assert.deepEqual(bookingRows[0], {
      customer_id: customerId,
      provider_id: providerId,
      status: "COMPLETED",
      payment_status: "PAID",
    });
  });
});

test("registration OTP verification blocks login until account is verified", async () => {
  const previousRequirement = process.env.REGISTRATION_VERIFICATION_REQUIRED;
  process.env.REGISTRATION_VERIFICATION_REQUIRED = "true";

  try {
    await withTestServer(async (baseUrl) => {
      const unique = Date.now();
      const email = `otp-${unique}@serviio.test`;
      const password = "Passw0rd!";

      const register = await requestJson(baseUrl, "/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          first_name: "Otp",
          last_name: "Customer",
          email,
          password,
          role: "customer",
        }),
      });

      assert.equal(register.response.status, 201);
      assert.equal(register.payload.success, true);
      assert.equal(register.payload.verification_required, true);
      assert.equal(register.payload.token, undefined);
      assert.match(register.payload.otp, /^\d{6}$/);

      const blockedLogin = await requestJson(baseUrl, "/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      assert.equal(blockedLogin.response.status, 403);
      assert.equal(blockedLogin.payload.verification_required, true);

      const wrongOtp = await requestJson(
        baseUrl,
        "/api/auth/verify-registration",
        {
          method: "POST",
          body: JSON.stringify({ email, otp: "000000" }),
        },
      );
      assert.equal(wrongOtp.response.status, 400);

      const verified = await requestJson(
        baseUrl,
        "/api/auth/verify-registration",
        {
          method: "POST",
          body: JSON.stringify({ email, otp: register.payload.otp }),
        },
      );
      assert.equal(verified.response.status, 200, JSON.stringify(verified.payload));
      assert.equal(verified.payload.success, true);
      assert.ok(verified.payload.token);
      assert.equal(verified.payload.user.account_verified, true);

      const login = await requestJson(baseUrl, "/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      assert.equal(login.response.status, 200);
      assert.equal(login.payload.success, true);
    });
  } finally {
    if (previousRequirement === undefined) {
      delete process.env.REGISTRATION_VERIFICATION_REQUIRED;
    } else {
      process.env.REGISTRATION_VERIFICATION_REQUIRED = previousRequirement;
    }
  }
});
