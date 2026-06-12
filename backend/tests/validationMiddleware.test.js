const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  validate,
  validators: v,
} = require("../middlewares/validationMiddleware");

function runMiddleware(middleware, req) {
  let statusCode = null;
  let payload = null;
  let nextCalled = false;

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      payload = body;
      return this;
    },
  };

  middleware(req, res, () => {
    nextCalled = true;
  });

  return { statusCode, payload, nextCalled };
}

test("validate rejects missing required body fields", () => {
  const middleware = validate({
    body: {
      email: [v.required("email"), v.email("email")],
      password: [v.required("password"), v.minLength(8, "password")],
    },
  });

  const result = runMiddleware(middleware, { body: { email: "bad" } });

  assert.equal(result.nextCalled, false);
  assert.equal(result.statusCode, 400);
  assert.equal(result.payload.success, false);
  assert.equal(result.payload.errors.length, 2);
});

test("validate allows omitted optional fields", () => {
  const middleware = validate({
    body: {
      notes: [v.maxLength(50, "notes")],
    },
  });

  const result = runMiddleware(middleware, { body: {} });

  assert.equal(result.nextCalled, true);
  assert.equal(result.statusCode, null);
});

test("validate checks optional fields when they are present", () => {
  const middleware = validate({
    body: {
      first_name: [v.maxLength(5, "first_name")],
    },
  });

  const result = runMiddleware(middleware, { body: { first_name: "Long Name" } });

  assert.equal(result.nextCalled, false);
  assert.equal(result.statusCode, 400);
  assert.equal(result.payload.errors[0].field, "first_name");
});

test("validate treats optional empty strings as omitted", () => {
  const middleware = validate({
    body: {
      nid_number: [
        v.regex(
          /^(?:\d{10}|\d{13}|\d{17})$/,
          "nid_number must be 10, 13, or 17 digits.",
        ),
      ],
    },
  });

  const result = runMiddleware(middleware, { body: { nid_number: "" } });

  assert.equal(result.nextCalled, true);
  assert.equal(result.statusCode, null);
});

test("validate accepts enum values case-insensitively", () => {
  const middleware = validate({
    body: {
      status: [v.required("status"), v.oneOf(["OPEN", "CLOSED"], "status")],
    },
  });

  const result = runMiddleware(middleware, { body: { status: "open" } });

  assert.equal(result.nextCalled, true);
});

test("validate rejects invalid positive integer params", () => {
  const middleware = validate({
    params: {
      id: [v.required("id"), v.positiveInteger("id")],
    },
  });

  const result = runMiddleware(middleware, { params: { id: "abc" } });

  assert.equal(result.nextCalled, false);
  assert.equal(result.statusCode, 400);
  assert.equal(result.payload.errors[0].message, "id must be a positive integer.");
});

test("validate accepts signed coordinate ranges", () => {
  const middleware = validate({
    body: {
      latitude: [v.numberRange(-90, 90, "latitude")],
      longitude: [v.numberRange(-180, 180, "longitude")],
    },
  });

  const result = runMiddleware(middleware, {
    body: { latitude: "-23.5", longitude: "90.4" },
  });

  assert.equal(result.nextCalled, true);
});

test("validate deletes uploaded file when request validation fails", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "serviio-validation-"));
  const tempFile = path.join(tempDir, "upload.pdf");
  fs.writeFileSync(tempFile, "%PDF-1.7");
  const middleware = validate({
    body: {
      document_type: [v.required("document_type")],
    },
  });

  const result = runMiddleware(middleware, {
    body: {},
    file: { path: tempFile },
  });

  assert.equal(result.nextCalled, false);
  assert.equal(result.statusCode, 400);
  assert.equal(fs.existsSync(tempFile), false);
});
