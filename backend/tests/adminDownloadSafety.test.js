const test = require("node:test");
const assert = require("node:assert/strict");

process.env.SERVIIO_SKIP_DB_HEALTHCHECK = "true";

const db = require("../config/db");
const adminController = require("../controllers/adminController");

test.after(async () => {
  await db.end().catch(() => {});
});

function createResponse() {
  return {
    statusCode: 200,
    jsonPayload: null,
    downloaded: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.jsonPayload = payload;
      return this;
    },
    download(filePath, fileName) {
      this.downloaded = { filePath, fileName };
      return this;
    },
  };
}

async function withDocumentUrl(documentUrl, callback) {
  const originalQuery = db.query;
  db.query = async () => [[{ document_url: documentUrl, file_name: "doc.pdf" }]];
  try {
    await callback();
  } finally {
    db.query = originalQuery;
  }
}

test("admin document download rejects external document URLs", async () => {
  await withDocumentUrl("https://example.com/document.pdf", async () => {
    const res = createResponse();
    await adminController.downloadVerificationDocument(
      { params: { documentId: 1 } },
      res,
    );

    assert.equal(res.statusCode, 400);
    assert.match(res.jsonPayload.message, /locally uploaded/i);
    assert.equal(res.downloaded, null);
  });
});

test("admin document download rejects traversal paths inside uploads prefix", async () => {
  await withDocumentUrl("uploads/../../.env", async () => {
    const res = createResponse();
    await adminController.downloadVerificationDocument(
      { params: { documentId: 1 } },
      res,
    );

    assert.equal(res.statusCode, 400);
    assert.match(res.jsonPayload.message, /invalid/i);
    assert.equal(res.downloaded, null);
  });
});
