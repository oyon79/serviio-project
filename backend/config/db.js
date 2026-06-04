const mysql = require("mysql2/promise");
require("dotenv").config();

// Read env with safe defaults
const {
  DB_HOST = "localhost",
  DB_USER = "root",
  DB_PASSWORD = "",
  DB_NAME,
  DB_PORT,
  DB_CONNECTION_LIMIT = 10,
} = process.env;

// Validate required config
if (!DB_NAME) {
  console.error("Missing required environment variable: DB_NAME");
  // Fail fast so developers notice misconfiguration early
  process.exit(1);
}

// Create a connection pool
const pool = mysql.createPool({
  host: DB_HOST,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  port: DB_PORT ? parseInt(DB_PORT, 10) : undefined,
  waitForConnections: true,
  connectionLimit: parseInt(DB_CONNECTION_LIMIT, 10) || 10,
  queueLimit: 0,
});

console.log("MySQL Pool created for database:", DB_NAME);

// Helper: test connection on startup
async function testConnection() {
  try {
    const conn = await pool.getConnection();
    try {
      await conn.ping();
    } finally {
      conn.release();
    }
    console.log("MySQL connection test succeeded");
  } catch (err) {
    console.error("MySQL connection test failed:", err.message || err);
    // Exit so the service doesn't run in a broken state
    process.exit(1);
  }
}

// Expose a small convenience query helper
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

// Attach helpers on the pool object to remain backwards-compatible
pool.testConnection = testConnection;
pool.queryExec = query;

// Graceful shutdown: close pool on process exit
function closePool() {
  pool
    .end()
    .then(() => console.log("MySQL pool closed"))
    .catch((e) => console.error("Error closing MySQL pool", e));
}

process.on("SIGINT", closePool);
process.on("SIGTERM", closePool);
process.on("exit", closePool);

// Run a quick test at startup
testConnection();

module.exports = pool;
