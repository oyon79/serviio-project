const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const WebSocket = require("ws");

const FRONTEND_BASE_URL =
  process.env.FRONTEND_BASE_URL ||
  "http://localhost/serviio-project/frontend";
const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:5000";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "Passw0rd!";
const CHROME_DEBUG_PORT = Number(process.env.CHROME_DEBUG_PORT || 9223);
let ownedBackendProcess = null;

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate));
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch (_) {
    payload = { raw: text };
  }
  return { response, payload };
}

async function isBackendHealthy() {
  try {
    const api = await fetchJson(`${API_BASE_URL}/api/test-db`);
    return api.response.ok && api.payload.success;
  } catch (_) {
    return false;
  }
}

async function ensureBackend() {
  if (await isBackendHealthy()) return;

  ownedBackendProcess = spawn(process.execPath, ["server.js"], {
    cwd: path.resolve(__dirname, ".."),
    env: process.env,
    stdio: "ignore",
    windowsHide: true,
  });

  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (ownedBackendProcess.exitCode !== null) {
      throw new Error("Backend server exited before browser smoke could start.");
    }
    if (await isBackendHealthy()) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Backend health check failed at ${API_BASE_URL}/api/test-db.`);
}

async function assertFrontendReachable() {
  const frontend = await fetch(`${FRONTEND_BASE_URL}/login.html`);
  if (!frontend.ok) {
    throw new Error(
      `Frontend was not reachable at ${FRONTEND_BASE_URL}/login.html.`,
    );
  }
}

async function login(email) {
  const { response, payload } = await fetchJson(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    body: JSON.stringify({ email, password: DEMO_PASSWORD }),
  });

  if (!response.ok || !payload.success) {
    throw new Error(
      `Unable to log in ${email}. Run npm run seed:demo before browser smoke.`,
    );
  }
  return { token: payload.token, user: payload.user };
}

async function loadDemoContext(customerSession) {
  const providers = await fetchJson(`${API_BASE_URL}/api/providers`);
  if (!providers.response.ok || !providers.payload.data?.length) {
    throw new Error("No verified providers available for browser smoke.");
  }

  const bookings = await fetchJson(`${API_BASE_URL}/api/bookings/my`, {
    headers: { Authorization: `Bearer ${customerSession.token}` },
  });
  if (!bookings.response.ok || !bookings.payload.data?.length) {
    throw new Error("No customer bookings available for browser smoke.");
  }

  return {
    providerId: providers.payload.data[0].id,
    bookingId: bookings.payload.data[0].id,
  };
}

async function waitForChrome(port) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return response.json();
    } catch (_) {
      // Chrome is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Timed out waiting for headless Chrome.");
}

async function createTarget(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {
    method: "PUT",
  });
  if (!response.ok) {
    throw new Error("Unable to create Chrome tab for browser smoke.");
  }
  return response.json();
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.ws.once("open", resolve);
      this.ws.once("error", reject);
    });
    this.ws.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result || {});
        return;
      }
      if (message.method) this.events.push(message);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });
    this.ws.send(payload);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  waitForEvent(method, timeoutMs = 10000) {
    const existing = this.events.find((event) => event.method === method);
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Timed out waiting for ${method}`)),
        timeoutMs,
      );
      const handler = (raw) => {
        const message = JSON.parse(raw.toString());
        if (message.method === method) {
          clearTimeout(timer);
          this.ws.off("message", handler);
          resolve(message);
        }
      };
      this.ws.on("message", handler);
    });
  }

  close() {
    this.ws.close();
  }
}

function sessionScript(session) {
  if (!session) return "";
  return `
    localStorage.setItem("serviio_token", ${JSON.stringify(session.token)});
    localStorage.setItem("serviio_user", ${JSON.stringify(JSON.stringify(session.user))});
  `;
}

function collectPageErrors(events) {
  const errors = [];
  for (const event of events) {
    if (event.method === "Runtime.exceptionThrown") {
      errors.push(event.params?.exceptionDetails?.text || "Runtime exception");
    }
    if (
      event.method === "Runtime.consoleAPICalled" &&
      event.params?.type === "error"
    ) {
      errors.push(
        (event.params.args || [])
          .map((arg) => arg.value || arg.description || "")
          .join(" ")
          .trim() || "console.error",
      );
    }
  }
  return errors.filter(Boolean);
}

async function inspectPage(port, page) {
  const target = await createTarget(port);
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.open();

  try {
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: sessionScript(page.session),
    });

    await client.send("Page.navigate", { url: page.url });
    await client.waitForEvent("Page.loadEventFired", 15000);
    await new Promise((resolve) => setTimeout(resolve, page.settleMs || 1200));

    const result = await client.send("Runtime.evaluate", {
      returnByValue: true,
      expression: `(() => ({
        href: location.href,
        title: document.title,
        readyState: document.readyState,
        text: document.body ? document.body.innerText.slice(0, 3000) : "",
        elementCount: document.querySelectorAll("a,button,input,select,textarea").length
      }))()`,
    });

    const value = result.result?.value || {};
    const text = String(value.text || "");
    const errors = collectPageErrors(client.events);
    const missingText =
      page.mustContain && !text.toLowerCase().includes(page.mustContain.toLowerCase());

    if (errors.length || !text.trim() || missingText) {
      return {
        ok: false,
        name: page.name,
        url: page.url,
        title: value.title || "",
        errors,
        reason: !text.trim()
          ? "Page rendered with no visible text."
          : missingText
            ? `Expected visible text "${page.mustContain}" was missing.`
            : "Page emitted console/runtime errors.",
      };
    }

    return {
      ok: true,
      name: page.name,
      url: page.url,
      title: value.title || "",
      elements: value.elementCount,
    };
  } finally {
    client.close();
    await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`).catch(
      () => {},
    );
  }
}

async function run() {
  const chromePath = findChrome();
  if (!chromePath) {
    throw new Error("Chrome or Edge was not found. Set CHROME_PATH to run browser smoke.");
  }

  await ensureBackend();
  await assertFrontendReachable();

  const customer = await login("customer@serviio.test");
  const provider = await login("provider@serviio.test");
  const admin = await login("admin@serviio.test");
  const { providerId, bookingId } = await loadDemoContext(customer);

  const pages = [
    { name: "Landing", url: `${FRONTEND_BASE_URL}/landing.html`, mustContain: "Get Started" },
    { name: "Login", url: `${FRONTEND_BASE_URL}/login.html`, mustContain: "Sign In" },
    { name: "Verify Registration", url: `${FRONTEND_BASE_URL}/verify-registration.html`, mustContain: "Verify" },
    { name: "Customer Register", url: `${FRONTEND_BASE_URL}/user.html`, mustContain: "Create Customer Account" },
    { name: "Provider Register", url: `${FRONTEND_BASE_URL}/serviceProvider.html`, mustContain: "Register" },
    { name: "Provider List", url: `${FRONTEND_BASE_URL}/providerList.html`, mustContain: "Providers" },
    { name: "Provider Detail", url: `${FRONTEND_BASE_URL}/providerInfo1.html?id=${providerId}`, mustContain: "Book" },
    { name: "Home", url: `${FRONTEND_BASE_URL}/home.html`, session: customer, mustContain: "Book" },
    { name: "Customer Profile", url: `${FRONTEND_BASE_URL}/profile.html`, session: customer, mustContain: "My Profile", settleMs: 1800 },
    { name: "Saved Providers", url: `${FRONTEND_BASE_URL}/bookmark.html`, session: customer, mustContain: "Saved" },
    { name: "Schedule", url: `${FRONTEND_BASE_URL}/schedule.html?provider_id=${providerId}`, session: customer, mustContain: "Confirm Schedule" },
    { name: "Payment", url: `${FRONTEND_BASE_URL}/payment.html?booking_id=${bookingId}`, session: customer, mustContain: "Payment" },
    { name: "Provider Dashboard", url: `${FRONTEND_BASE_URL}/profileBooking.html`, session: provider, mustContain: "Dashboard", settleMs: 1800 },
    { name: "Admin", url: `${FRONTEND_BASE_URL}/admin.html`, session: admin, mustContain: "Admin", settleMs: 1800 },
    { name: "Emergency", url: `${FRONTEND_BASE_URL}/emergency.html`, session: customer, mustContain: "SOS" },
  ];

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "serviio-chrome-"));
  const chrome = spawn(
    chromePath,
    [
      "--headless=new",
      `--remote-debugging-port=${CHROME_DEBUG_PORT}`,
      `--user-data-dir=${userDataDir}`,
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  try {
    await waitForChrome(CHROME_DEBUG_PORT);
    const results = [];
    for (const page of pages) {
      results.push(await inspectPage(CHROME_DEBUG_PORT, page));
    }

    const failures = results.filter((result) => !result.ok);
    if (failures.length) {
      console.error(JSON.stringify({ success: false, failures, results }, null, 2));
      process.exit(1);
    }

    console.log(JSON.stringify({ success: true, checked: results }, null, 2));
  } finally {
    chrome.kill();
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 1500);
      chrome.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch (_) {
      // Chrome can keep Crashpad metrics files locked briefly on Windows.
    }
    if (ownedBackendProcess) {
      ownedBackendProcess.kill();
    }
  }
}

run().catch((error) => {
  console.error(`Browser smoke failed: ${error.message || error}`);
  process.exit(1);
});
