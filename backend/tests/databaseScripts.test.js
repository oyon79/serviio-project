const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const backendRoot = path.resolve(__dirname, "..");

test("database and release utility scripts pass syntax checks", () => {
  const files = [
    path.join(backendRoot, "server.js"),
    path.join(backendRoot, "config", "db.js"),
    path.join(backendRoot, "scripts", "backup_db.js"),
    path.join(backendRoot, "scripts", "restore_db.js"),
    path.join(backendRoot, "scripts", "verify_release.js"),
  ];

  for (const file of files) {
    const result = spawnSync(process.execPath, [
      "--check",
      file,
    ]);
    assert.equal(
      result.status,
      0,
      `${path.relative(backendRoot, file)} syntax check failed: ${result.stderr?.toString()}`,
    );
  }
});

test("restore script refuses to run without explicit confirmation", () => {
  const result = spawnSync(
    process.execPath,
    [path.join(backendRoot, "scripts", "restore_db.js"), "missing.sql"],
    {
      cwd: backendRoot,
      env: {
        ...process.env,
        DB_NAME: "serviio_db",
        SERVIIO_RESTORE_CONFIRM: "",
      },
      encoding: "utf8",
    },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Refusing to restore/);
});

test("server routes fatal runtime errors through graceful shutdown", () => {
  const source = require("node:fs").readFileSync(
    path.join(backendRoot, "server.js"),
    "utf8",
  );

  assert.match(source, /function handleFatalError/);
  assert.match(source, /process\.on\("uncaughtException"/);
  assert.match(source, /process\.on\("unhandledRejection"/);
  assert.match(source, /shutdown\(label,\s*1\)/);
});
