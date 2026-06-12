const path = require("path");
require("dotenv").config({
  path: path.resolve(__dirname, "..", ".env"),
  quiet: true,
});
const mysql = require("mysql2/promise");

const {
  DB_HOST = "localhost",
  DB_USER = "root",
  DB_PASSWORD = "",
  DB_NAME,
  DB_PORT = 3306,
  DB_CONNECTION_LIMIT = 10,
  DB_QUEUE_LIMIT = 0,
  DB_CONNECT_TIMEOUT = 10000,
} = process.env;

if (!DB_NAME) {
  console.error("Missing required environment variable: DB_NAME");
  process.exit(1);
}

const pool = mysql.createPool({
  host: DB_HOST,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  port: Number(DB_PORT),
  waitForConnections: true,
  connectionLimit: Number(DB_CONNECTION_LIMIT) || 10,
  queueLimit: Number(DB_QUEUE_LIMIT) || 0,
  connectTimeout: Number(DB_CONNECT_TIMEOUT) || 10000,
  decimalNumbers: true,
  namedPlaceholders: true,
});

async function testConnection() {
  try {
    const connection = await pool.getConnection();
    try {
      await connection.ping();
    } finally {
      connection.release();
    }
    console.log("MySQL pool initialized and reachable.");
  } catch (error) {
    console.error("MySQL pool initialization failed:", error.message || error);
    process.exit(1);
  }
}

pool.testConnection = testConnection;

if (process.env.SERVIIO_SKIP_DB_HEALTHCHECK !== "true") {
  testConnection();
}

module.exports = pool;
