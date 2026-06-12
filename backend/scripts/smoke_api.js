const { spawn } = require("child_process");
const path = require("path");

const BASE_URL = process.env.SERVIIO_SMOKE_BASE_URL || "http://localhost:5000";
const START_SERVER = process.env.SERVIIO_SMOKE_START_SERVER !== "false";
const TIMEOUT_MS = Number(process.env.SERVIIO_SMOKE_TIMEOUT_MS || 20000);
const PASSWORD = "Passw0rd!";

let serverProcess = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(pathname, options = {}) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch (_) {
    body = { raw: text };
  }

  if (!response.ok) {
    const error = new Error(
      `${options.method || "GET"} ${pathname} failed with ${response.status}: ${body.message || text}`,
    );
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return body;
}

async function isServerHealthy() {
  try {
    const body = await fetchJson("/api/test-db");
    return body.success === true;
  } catch (_) {
    return false;
  }
}

async function waitForServer() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < TIMEOUT_MS) {
    if (serverProcess && serverProcess.exitCode !== null) {
      throw new Error(
        `Backend server exited before becoming healthy at ${BASE_URL} (exit code ${serverProcess.exitCode}).`,
      );
    }
    if (await isServerHealthy()) return;
    await sleep(500);
  }
  throw new Error(`Server did not become healthy at ${BASE_URL}`);
}

async function startServerIfNeeded() {
  if (await isServerHealthy()) {
    console.log(`Using existing server at ${BASE_URL}`);
    return;
  }

  if (!START_SERVER) {
    throw new Error(`No healthy server at ${BASE_URL}`);
  }

  console.log("Starting backend server for smoke test...");
  serverProcess = spawn("node", ["server.js"], {
    cwd: path.resolve(__dirname, ".."),
    env: {
      ...process.env,
      PAYMENT_MODE: process.env.PAYMENT_MODE || "mock",
      MOCK_PAYMENTS_ENABLED: process.env.MOCK_PAYMENTS_ENABLED || "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  serverProcess.stdout.on("data", (chunk) =>
    process.stdout.write(`[server] ${chunk}`),
  );
  serverProcess.stderr.on("data", (chunk) =>
    process.stderr.write(`[server] ${chunk}`),
  );

  await waitForServer();
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

async function login(email) {
  const body = await fetchJson("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!body.token || !body.user?.id) {
    throw new Error(`Login response for ${email} did not include token/user.`);
  }
  return body;
}

async function runSmoke() {
  await startServerIfNeeded();

  const customer = await login("customer@serviio.test");
  const provider = await login("provider@serviio.test");
  const admin = await login("admin@serviio.test");

  const providers = await fetchJson("/api/providers");
  if (!Array.isArray(providers.data) || providers.data.length === 0) {
    throw new Error("Provider discovery returned no providers.");
  }

  const timestamp = Date.now();
  const booking = await fetchJson("/api/bookings/create", {
    method: "POST",
    headers: authHeaders(customer.token),
    body: JSON.stringify({
      provider_id: provider.user.id,
      service_type: "Electrician",
      job_location: `Smoke QA Location ${timestamp}`,
      booking_date: new Date(Date.now() + 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 19)
        .replace("T", " "),
      is_emergency: false,
    }),
  });
  const bookingId = booking.data?.booking_id;
  const quotedAmount = Number(booking.data?.quoted_amount);
  if (!bookingId || !Number.isFinite(quotedAmount) || quotedAmount <= 0) {
    throw new Error("Booking create did not return booking_id and quoted_amount.");
  }

  await fetchJson(`/api/bookings/${bookingId}/status`, {
    method: "PATCH",
    headers: authHeaders(provider.token),
    body: JSON.stringify({ status: "ACCEPTED" }),
  });

  const payment = await fetchJson("/api/payments/process", {
    method: "POST",
    headers: authHeaders(customer.token),
    body: JSON.stringify({
      booking_id: bookingId,
      amount: quotedAmount,
      payment_method: "mock",
    }),
  });
  if (payment.data?.status !== "PAID") {
    throw new Error("Payment did not mark booking as PAID.");
  }

  const paymentStatus = await fetchJson(`/api/payments/${bookingId}/status`, {
    headers: authHeaders(customer.token),
  });
  if (paymentStatus.data?.escrow_status !== "HELD") {
    throw new Error("Payment did not create HELD escrow.");
  }

  const paidBooking = await fetchJson(`/api/bookings/${bookingId}`, {
    headers: authHeaders(customer.token),
  });
  const handshakeCode = paidBooking.data?.handshake_code;
  if (!/^\d{4}$/.test(String(handshakeCode || ""))) {
    throw new Error("Paid customer booking did not expose a 4-digit handshake code.");
  }

  for (const status of ["ON_THE_WAY", "ARRIVED"]) {
    await fetchJson(`/api/bookings/${bookingId}/status`, {
      method: "PATCH",
      headers: authHeaders(provider.token),
      body: JSON.stringify({ status }),
    });
  }

  await fetchJson("/api/bookings/verify-handshake", {
    method: "POST",
    headers: authHeaders(provider.token),
    body: JSON.stringify({
      booking_id: bookingId,
      handshake_code: handshakeCode,
    }),
  });
  await fetchJson(`/api/bookings/${bookingId}/status`, {
    method: "PATCH",
    headers: authHeaders(provider.token),
    body: JSON.stringify({ status: "COMPLETED" }),
  });

  const escrowRelease = await fetchJson(`/api/wallet/escrow/${bookingId}/release`, {
    method: "POST",
    headers: authHeaders(customer.token),
    body: JSON.stringify({}),
  });
  const releasedAmount = Number(escrowRelease.data?.amount);
  if (escrowRelease.data?.status !== "RELEASED" || releasedAmount < 100) {
    throw new Error("Escrow release did not create enough provider wallet balance for payout smoke.");
  }

  const payout = await fetchJson("/api/wallet/payout-requests", {
    method: "POST",
    headers: authHeaders(provider.token),
    body: JSON.stringify({
      amount: 100,
      payout_method: "BKASH",
      account_ref: "01700000000",
      provider_notes: "Smoke test provider payout request.",
    }),
  });
  const payoutId = payout.data?.id;
  if (!payoutId || payout.data?.status !== "REQUESTED") {
    throw new Error("Provider payout request was not created.");
  }

  const review = await fetchJson("/api/reviews", {
    method: "POST",
    headers: authHeaders(customer.token),
    body: JSON.stringify({
      booking_id: bookingId,
      rating: 5,
      title: `Smoke review ${timestamp}`,
      comment: "Smoke test review after a completed booking.",
    }),
  });
  if (!review.data?.id) {
    throw new Error("Customer review was not created.");
  }

  const message = await fetchJson(`/api/communications/bookings/${bookingId}/messages`, {
    method: "POST",
    headers: authHeaders(customer.token),
    body: JSON.stringify({ message: `Smoke message ${timestamp}` }),
  });
  if (!message.data?.id) {
    throw new Error("Booking message was not created.");
  }

  const call = await fetchJson(`/api/communications/bookings/${bookingId}/call-requests`, {
    method: "POST",
    headers: authHeaders(customer.token),
    body: JSON.stringify({ call_type: "VOICE", reason: "Smoke call request" }),
  });
  if (!call.data?.id) {
    throw new Error("Call request was not created.");
  }

  await fetchJson(`/api/communications/call-requests/${call.data.id}`, {
    method: "PATCH",
    headers: authHeaders(provider.token),
    body: JSON.stringify({ status: "ACCEPTED" }),
  });

  const ticket = await fetchJson("/api/support/tickets", {
    method: "POST",
    headers: authHeaders(customer.token),
    body: JSON.stringify({
      booking_id: bookingId,
      category: "GENERAL",
      subject: `Smoke support ${timestamp}`,
      description: "Smoke test support ticket",
      priority: "NORMAL",
    }),
  });
  if (!ticket.data?.id) {
    throw new Error("Support ticket was not created.");
  }

  const emergency = await fetchJson("/api/emergency", {
    method: "POST",
    headers: authHeaders(customer.token),
    body: JSON.stringify({
      booking_id: bookingId,
      emergency_type: "SMOKE_TEST",
      message: "Smoke test emergency alert",
      location: "Smoke QA Location",
      latitude: 23.8103,
      longitude: 90.4125,
    }),
  });
  if (!emergency.id) {
    throw new Error("Emergency log was not created.");
  }

  const kycBefore = await fetchJson("/api/providers/me/verification", {
    headers: authHeaders(provider.token),
  });
  const profileId = kycBefore.data?.profile?.id;
  if (!profileId) {
    throw new Error("Provider verification profile was not returned.");
  }

  const kycDocument = await fetchJson("/api/providers/me/verification/documents", {
    method: "POST",
    headers: authHeaders(provider.token),
    body: JSON.stringify({
      document_type: "POLICE_CLEARANCE",
      document_number: `SMOKE-PC-${timestamp}`,
      notes: "Smoke test police clearance document.",
    }),
  });
  if (!kycDocument.data?.id) {
    throw new Error("KYC document was not submitted.");
  }

  await fetchJson("/api/providers/me/verification/submit", {
    method: "POST",
    headers: authHeaders(provider.token),
    body: JSON.stringify({}),
  });

  const adminTickets = await fetchJson("/api/support/tickets/admin", {
    headers: authHeaders(admin.token),
  });
  if (!Array.isArray(adminTickets.data)) {
    throw new Error("Admin ticket queue did not return a list.");
  }

  const adminOverview = await fetchJson("/api/admin/overview", {
    headers: authHeaders(admin.token),
  });
  if (!adminOverview.data) {
    throw new Error("Admin overview did not return dashboard data.");
  }

  const adminPayouts = await fetchJson("/api/wallet/payout-requests/admin", {
    headers: authHeaders(admin.token),
  });
  if (!Array.isArray(adminPayouts.data) || !adminPayouts.data.some((item) => item.id === payoutId)) {
    throw new Error("Admin payout queue did not include the smoke payout request.");
  }
  await fetchJson(`/api/wallet/payout-requests/${payoutId}`, {
    method: "PATCH",
    headers: authHeaders(admin.token),
    body: JSON.stringify({
      status: "APPROVED",
      reviewer_notes: "Smoke test payout approval.",
    }),
  });
  const paidPayout = await fetchJson(`/api/wallet/payout-requests/${payoutId}`, {
    method: "PATCH",
    headers: authHeaders(admin.token),
    body: JSON.stringify({
      status: "PAID",
      reviewer_notes: "Smoke test payout paid.",
      external_reference: `SMOKE-PAYOUT-${timestamp}`,
    }),
  });
  if (paidPayout.data?.status !== "PAID") {
    throw new Error("Admin payout mark-paid flow did not complete.");
  }

  const adminEmergencies = await fetchJson("/api/admin/emergencies", {
    headers: authHeaders(admin.token),
  });
  if (!Array.isArray(adminEmergencies.data)) {
    throw new Error("Admin emergencies endpoint did not return a list.");
  }
  await fetchJson(`/api/admin/emergencies/${emergency.id}`, {
    method: "PATCH",
    headers: authHeaders(admin.token),
    body: JSON.stringify({ status: "RESOLVED" }),
  });

  const verificationDetails = await fetchJson(
    `/api/admin/verification-queue/${profileId}`,
    { headers: authHeaders(admin.token) },
  );
  if (!Array.isArray(verificationDetails.data?.documents)) {
    throw new Error("Admin verification details did not include documents.");
  }
  await fetchJson(`/api/admin/verification-documents/${kycDocument.data.id}`, {
    method: "PATCH",
    headers: authHeaders(admin.token),
    body: JSON.stringify({
      status: "APPROVED",
      reviewer_notes: "Smoke test document approval.",
    }),
  });
  await fetchJson(`/api/admin/providers/${profileId}/verification-decision`, {
    method: "POST",
    headers: authHeaders(admin.token),
    body: JSON.stringify({
      decision: "VERIFIED",
      notes: "Smoke test verification approval.",
    }),
  });

  console.log(
    JSON.stringify(
      {
        success: true,
        booking_id: bookingId,
        payment_status: payment.data.status,
        escrow_status: paymentStatus.data.escrow_status,
        message_id: message.data.id,
        call_request_id: call.data.id,
        ticket_id: ticket.data.id,
        review_id: review.data.id,
        emergency_id: emergency.id,
        kyc_document_id: kycDocument.data.id,
        payout_id: payoutId,
      },
      null,
      2,
    ),
  );
}

runSmoke()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(() => {
    if (serverProcess) {
      serverProcess.kill();
    }
  });
