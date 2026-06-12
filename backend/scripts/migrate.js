const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const db = require("../config/db");

const migrationsDir = path.resolve(__dirname, "..", "..", "database", "migrations");

function checksum(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function splitSqlStatements(sql) {
  const withoutLineComments = sql
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  return withoutLineComments
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function ensureMigrationTable(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      checksum CHAR(64) NOT NULL,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function run() {
  const connection = await db.getConnection();
  try {
    await ensureMigrationTable(connection);

    const [appliedRows] = await connection.query(
      "SELECT filename, checksum FROM schema_migrations",
    );
    const applied = new Map(
      appliedRows.map((row) => [row.filename, row.checksum]),
    );

    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const fullPath = path.join(migrationsDir, file);
      const content = fs.readFileSync(fullPath, "utf8");
      const hash = checksum(content);

      if (applied.has(file)) {
        if (applied.get(file) !== hash) {
          throw new Error(
            `Migration checksum mismatch for ${file}. Create a new migration instead of editing an applied one.`,
          );
        }
        console.log(`skip ${file}`);
        continue;
      }

      console.log(`apply ${file}`);
      await connection.beginTransaction();
      try {
        for (const statement of splitSqlStatements(content)) {
          await connection.query(statement);
        }
        await connection.query(
          "INSERT INTO schema_migrations (filename, checksum) VALUES (?, ?)",
          [file, hash],
        );
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }

    console.log("Migrations complete.");
  } finally {
    connection.release();
    await db.end();
  }
}

run().catch((error) => {
  console.error("Migration failed:", error.message || error);
  process.exit(1);
});
