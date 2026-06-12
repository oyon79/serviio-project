const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..", "..");
const bannedFiles = [
  "backend/test_register.js",
  "backend/scripts/debug_provider.js",
  "backend/scripts/clear_test_accounts.js",
];

const errors = [];

for (const relativePath of bannedFiles) {
  if (fs.existsSync(path.join(projectRoot, relativePath))) {
    errors.push(`${relativePath} is an ad-hoc debug/destructive script and must not ship.`);
  }
}

const frontendRoot = path.join(projectRoot, "frontend");
const frontendFiles = [];

function collectFrontendFiles(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectFrontendFiles(fullPath);
      continue;
    }
    if (entry.name.endsWith(".html") || entry.name.endsWith(".js")) {
      frontendFiles.push(fullPath);
    }
  }
}

collectFrontendFiles(frontendRoot);

for (const file of frontendFiles) {
  const relativePath = path.relative(projectRoot, file).replace(/\\/g, "/");
  if (relativePath === "frontend/js/config.js") continue;
  const source = fs.readFileSync(file, "utf8");
  if (source.includes("http://localhost:5000")) {
    errors.push(`${relativePath} hardcodes the local API origin.`);
  }
}

const e2eScript = path.join(projectRoot, "backend", "scripts", "e2e_test.ps1");
if (fs.existsSync(e2eScript)) {
  const source = fs.readFileSync(e2eScript, "utf8");
  if (source.includes("http://localhost:5000/api/")) {
    errors.push(
      "backend/scripts/e2e_test.ps1 must use SERVIIO_E2E_BASE_URL instead of hardcoded API URLs.",
    );
  }
}

if (errors.length) {
  console.error("Release hygiene failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Release hygiene checks passed.");
