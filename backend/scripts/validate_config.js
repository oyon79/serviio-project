const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env"), quiet: true });

const { assertRuntimeConfig } = require("../config/runtimeConfig");

try {
  assertRuntimeConfig();
  console.log("Runtime configuration is valid.");
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
