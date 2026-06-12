const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

require("dotenv").config({
  path: path.resolve(__dirname, "..", ".env"),
  quiet: true,
});

const {
  DB_HOST = "localhost",
  DB_PORT = "3306",
  DB_USER = "root",
  DB_PASSWORD = "",
  DB_NAME,
  MYSQL_PATH,
} = process.env;

function findMysql() {
  const candidates = [
    MYSQL_PATH,
    "C:\\xampp\\mysql\\bin\\mysql.exe",
    "C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysql.exe",
    "mysql",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate === "mysql" || fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return "mysql";
}

function runRestore() {
  const backupFile = process.argv[2];
  if (!DB_NAME) {
    throw new Error("DB_NAME is required to restore a backup.");
  }
  if (!backupFile) {
    throw new Error("Usage: npm run restore-db -- path/to/backup.sql");
  }
  if (process.env.SERVIIO_RESTORE_CONFIRM !== "I_UNDERSTAND") {
    throw new Error(
      "Refusing to restore without SERVIIO_RESTORE_CONFIRM=I_UNDERSTAND.",
    );
  }

  const resolvedBackup = path.resolve(backupFile);
  if (!fs.existsSync(resolvedBackup)) {
    throw new Error(`Backup file not found: ${resolvedBackup}`);
  }

  const args = ["-h", DB_HOST, "-P", String(DB_PORT), "-u", DB_USER, DB_NAME];
  const env = { ...process.env };
  if (DB_PASSWORD) {
    env.MYSQL_PWD = DB_PASSWORD;
  }

  const child = spawn(findMysql(), args, {
    env,
    stdio: ["pipe", "inherit", "inherit"],
    windowsHide: true,
  });

  fs.createReadStream(resolvedBackup).pipe(child.stdin);

  child.on("error", (error) => {
    console.error(
      `Database restore failed to start. Set MYSQL_PATH if mysql is not on PATH. ${error.message}`,
    );
    process.exit(1);
  });

  child.on("close", (code) => {
    if (code !== 0) {
      console.error(`Database restore failed with exit code ${code}.`);
      process.exit(code || 1);
    }
    console.log(`Database restored from: ${resolvedBackup}`);
  });
}

try {
  runRestore();
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
