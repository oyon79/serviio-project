const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

const authMiddleware = require("../middlewares/authMiddleware");
const authorizeRoles = require("../middlewares/roleMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");

function makeResponse() {
  return {
    statusCode: null,
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

function runMiddleware(middleware, req = {}) {
  const res = makeResponse();
  let nextCalled = false;
  const request = {
    headers: {},
    ...req,
  };
  middleware(
    request,
    res,
    () => {
      nextCalled = true;
    },
  );
  return { req: request, res, nextCalled };
}

test("auth middleware rejects missing authorization header", () => {
  const { res, nextCalled } = runMiddleware(authMiddleware);

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.match(res.payload.message, /Authorization header is required/);
});

test("auth middleware rejects malformed bearer header", () => {
  const { res, nextCalled } = runMiddleware(authMiddleware, {
    headers: { authorization: "Bearer token extra" },
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.match(res.payload.message, /Bearer <token>/);
});

test("auth middleware accepts case-insensitive bearer scheme and sets req.user", () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "test-auth-secret";
  const token = jwt.sign(
    { id: 42, role: "customer", email: "customer@example.com" },
    process.env.JWT_SECRET,
    { expiresIn: "1h" },
  );

  try {
    const req = { headers: { authorization: `bearer ${token}` } };
    const result = runMiddleware(authMiddleware, req);

    assert.equal(result.nextCalled, true);
    assert.equal(result.res.statusCode, null);
    assert.equal(result.req.user.id, 42);
    assert.equal(result.req.user.role, "customer");
  } finally {
    if (previousSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = previousSecret;
    }
  }
});

test("auth middleware reports expired token distinctly", () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "test-auth-secret";
  const token = jwt.sign(
    { id: 42, role: "customer" },
    process.env.JWT_SECRET,
    { expiresIn: "-1s" },
  );

  try {
    const { res, nextCalled } = runMiddleware(authMiddleware, {
      headers: { authorization: `Bearer ${token}` },
    });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
    assert.match(res.payload.message, /expired/);
  } finally {
    if (previousSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = previousSecret;
    }
  }
});

test("role middleware enforces authenticated allowed roles", () => {
  const providerOnly = authorizeRoles("provider");

  const missingAuth = runMiddleware(providerOnly);
  assert.equal(missingAuth.res.statusCode, 401);

  const wrongRole = runMiddleware(providerOnly, {
    user: { id: 1, role: "customer" },
  });
  assert.equal(wrongRole.res.statusCode, 403);

  const allowed = runMiddleware(providerOnly, {
    user: { id: 2, role: "provider" },
  });
  assert.equal(allowed.nextCalled, true);
});

test("admin middleware allows admins and super admins only", () => {
  const customer = runMiddleware(adminMiddleware, {
    user: { id: 1, role: "customer" },
  });
  assert.equal(customer.res.statusCode, 403);

  const supportAgent = runMiddleware(adminMiddleware, {
    user: { id: 3, role: "support_agent" },
  });
  assert.equal(supportAgent.res.statusCode, 403);

  const admin = runMiddleware(adminMiddleware, {
    user: { id: 2, role: "admin" },
  });
  assert.equal(admin.nextCalled, true);

  const superAdmin = runMiddleware(adminMiddleware, {
    user: { id: 4, role: "super_admin" },
  });
  assert.equal(superAdmin.nextCalled, true);
});
