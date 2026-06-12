const fs = require("fs");
const path = require("path");
const db = require("../config/db");

const seedName = process.argv[2] || "demo";
const seedFiles = {
  demo: path.resolve(__dirname, "..", "..", "database", "demo_seed.sql"),
};

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

async function run() {
  const filePath = seedFiles[seedName];
  if (!filePath) {
    throw new Error(
      `Unknown seed fixture "${seedName}". Available fixtures: ${Object.keys(seedFiles).join(", ")}`,
    );
  }

  const sql = fs.readFileSync(filePath, "utf8");
  const statements = splitSqlStatements(sql);
  const connection = await db.getConnection();

  try {
    for (const statement of statements) {
      await connection.query(statement);
    }
    console.log(`Seed fixture applied: ${seedName}`);
  } finally {
    connection.release();
    await db.end();
  }
}

run().catch((error) => {
  console.error("Seed fixture failed:", error.message || error);
  process.exit(1);
});
