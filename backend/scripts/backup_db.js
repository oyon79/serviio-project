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
  MYSQLDUMP_PATH,
  DB_BACKUP_DIR,
} = process.env;

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function findMysqldump() {
  const candidates = [
    MYSQLDUMP_PATH,
    "C:\\xampp\\mysql\\bin\\mysqldump.exe",
    "C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqldump.exe",
    "mysqldump",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate === "mysqldump" || fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return "mysqldump";
}

function runBackup() {
  if (!DB_NAME) {
    throw new Error("DB_NAME is required to create a backup.");
  }

  const backupDir = path.resolve(
    DB_BACKUP_DIR || path.join(__dirname, "..", "..", "database", "backups"),
  );
  fs.mkdirSync(backupDir, { recursive: true });

  const backupFile = path.join(backupDir, `${DB_NAME}_${timestamp()}.sql`);
  const output = fs.createWriteStream(backupFile, { encoding: "utf8" });
  const args = [
    "--single-transaction",
    "--routines",
    "--triggers",
    "--events",
    "-h",
    DB_HOST,
    "-P",
    String(DB_PORT),
    "-u",
    DB_USER,
    DB_NAME,
  ];

  const env = { ...process.env };
  if (DB_PASSWORD) {
    env.MYSQL_PWD = DB_PASSWORD;
  }

  const child = spawn(findMysqldump(), args, {
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  child.stdout.pipe(output);
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));

  child.on("error", (error) => {
    output.close();
    fs.rmSync(backupFile, { force: true });
    console.error(
      `Database backup failed to start. Set MYSQLDUMP_PATH if mysqldump is not on PATH. ${error.message}`,
    );
    process.exit(1);
  });

  child.on("close", (code) => {
    output.close();
    if (code !== 0) {
      fs.rmSync(backupFile, { force: true });
      console.error(`Database backup failed with exit code ${code}.`);
      process.exit(code || 1);
    }
    console.log(`Database backup created: ${backupFile}`);
  });
}

try {
  runBackup();
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
