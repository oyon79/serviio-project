const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  hasMagicSignature,
  sanitizeBaseName,
} = require("../middlewares/uploadMiddleware");

function writeTempFile(bytes) {
  const filePath = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "serviio-upload-")),
    "sample.bin",
  );
  fs.writeFileSync(filePath, Buffer.from(bytes));
  return filePath;
}

test("verification upload signature accepts real PDF and image headers", () => {
  const pdf = writeTempFile(Buffer.from("%PDF-1.7\n"));
  const png = writeTempFile([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const jpg = writeTempFile([0xff, 0xd8, 0xff, 0xdb]);
  const webp = writeTempFile(Buffer.from("RIFF1234WEBP"));

  assert.equal(hasMagicSignature(pdf, "application/pdf"), true);
  assert.equal(hasMagicSignature(png, "image/png"), true);
  assert.equal(hasMagicSignature(jpg, "image/jpeg"), true);
  assert.equal(hasMagicSignature(webp, "image/webp"), true);
});

test("verification upload signature rejects mismatched file content", () => {
  const fake = writeTempFile(Buffer.from("<script>alert(1)</script>"));

  assert.equal(hasMagicSignature(fake, "application/pdf"), false);
  assert.equal(hasMagicSignature(fake, "image/png"), false);
  assert.equal(hasMagicSignature(fake, "image/jpeg"), false);
  assert.equal(hasMagicSignature(fake, "image/webp"), false);
});

test("upload filename sanitizer strips path and shell characters", () => {
  assert.equal(sanitizeBaseName("../../nid front.php"), "nid-front");
  assert.equal(sanitizeBaseName("  police clearance!!.pdf"), "police-clearance");
});
