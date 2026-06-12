process.env.JWT_SECRET = process.env.JWT_SECRET || "route-integration-secret";

const test = require("node:test");
const { after } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");

const db = require("../config/db");
const authRoutes = require("../routes/authRoutes");
const bookingRoutes = require("../routes/bookingRoutes");

after(async () => {
  await db.end();
});

async function withTestServer(app, callback) {
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

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRoutes);
  app.use("/api/bookings", bookingRoutes);
  return app;
}

test("auth routes reject invalid login payload before controller work", async () => {
  await withTestServer(buildApp(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "not-an-email", password: "Passw0rd!" }),
    });
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.success, false);
    assert.equal(payload.message, "Validation failed.");
    assert.equal(payload.errors[0].field, "email");
  });
});

test("auth routes reject admin self-registration at validation boundary", async () => {
  await withTestServer(buildApp(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        first_name: "Admin",
        last_name: "User",
        email: "admin-candidate@example.com",
        phone: "01700000000",
        password: "Passw0rd!",
        role: "admin",
      }),
    });
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.success, false);
    assert.match(payload.errors[0].message, /customer, provider/);
  });
});

test("authenticated profile route rejects missing bearer token", async () => {
  await withTestServer(buildApp(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/me`);
    const payload = await response.json();

    assert.equal(response.status, 401);
    assert.equal(payload.success, false);
    assert.match(payload.message, /Authorization header/);
  });
});

test("booking routes require authentication before returning user history", async () => {
  await withTestServer(buildApp(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/bookings/my`);
    const payload = await response.json();

    assert.equal(response.status, 401);
    assert.equal(payload.success, false);
  });
});

test("booking provider history route enforces provider role before controller work", async () => {
  await withTestServer(buildApp(), async (baseUrl) => {
    const token = jwt.sign(
      { id: 10, role: "customer", email: "customer@example.com" },
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
    );

    const response = await fetch(`${baseUrl}/api/bookings/provider`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();

    assert.equal(response.status, 403);
    assert.equal(payload.success, false);
    assert.match(payload.message, /permission/);
  });
});

test("booking create route rejects invalid booking body before database access", async () => {
  await withTestServer(buildApp(), async (baseUrl) => {
    const token = jwt.sign(
      { id: 10, role: "customer", email: "customer@example.com" },
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
    );

    const response = await fetch(`${baseUrl}/api/bookings/create`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        provider_id: 0,
        service_type: "",
        booking_date: "not-a-date",
      }),
    });
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.success, false);
    assert.equal(payload.message, "Validation failed.");
    assert.deepEqual(
      payload.errors.map((error) => error.field),
      ["provider_id", "service_type", "booking_date"],
    );
  });
});
