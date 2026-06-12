const { spawnSync } = require("child_process");
const path = require("path");

const args = new Set(process.argv.slice(2));
const strictLive =
  args.has("--strict-live") || process.env.LIVE_READINESS_STRICT === "true";
const skipBrowser = args.has("--skip-browser");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const backendRoot = path.resolve(__dirname, "..");

const steps = [
  {
    name: "Backend tests",
    command: npmCommand,
    args: ["test"],
  },
  {
    name: "Frontend static QA",
    command: npmCommand,
    args: ["run", "qa:frontend"],
  },
  {
    name: "Runtime config validation",
    command: npmCommand,
    args: ["run", "validate-config"],
  },
  {
    name: "Release hygiene",
    command: npmCommand,
    args: ["run", "release:hygiene"],
  },
  {
    name: "Dependency audit",
    command: npmCommand,
    args: ["audit", "--omit=dev"],
  },
  {
    name: "Migrations",
    command: npmCommand,
    args: ["run", "migrate"],
  },
  {
    name: "Demo seed",
    command: npmCommand,
    args: ["run", "seed:demo"],
  },
  {
    name: "API smoke",
    command: npmCommand,
    args: ["run", "smoke:api"],
  },
  ...(!skipBrowser
    ? [
        {
          name: "Headless browser smoke",
          command: npmCommand,
          args: ["run", "smoke:browser"],
        },
      ]
    : []),
  {
    name: strictLive ? "Strict live readiness" : "Local live readiness",
    command: npmCommand,
    args: ["run", "readiness:live"],
    env: strictLive ? { LIVE_READINESS_STRICT: "true" } : {},
  },
];

const summary = [];

function runStep(step) {
  const startedAt = Date.now();
  console.log(`\n=== ${step.name} ===`);
  const result = spawnSync(step.command, step.args, {
    cwd: backendRoot,
    env: {
      ...process.env,
      ...(step.env || {}),
    },
    shell: process.platform === "win32",
    stdio: "inherit",
  });
  const durationSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  const ok = result.status === 0;
  summary.push({
    name: step.name,
    status: ok ? "pass" : "fail",
    durationSeconds,
  });
  if (result.error) {
    console.error(`Unable to run ${step.name}: ${result.error.message}`);
  }
  return ok;
}

let success = true;
for (const step of steps) {
  if (!runStep(step)) {
    success = false;
    break;
  }
}

console.log("\n=== Release Verification Summary ===");
for (const item of summary) {
  console.log(`${item.status.toUpperCase()} ${item.name} (${item.durationSeconds}s)`);
}

if (!success) {
  console.error("\nRelease verification failed.");
  process.exit(1);
}

console.log(
  strictLive
    ? "\nRelease verification passed with strict live readiness."
    : "\nRelease verification passed for local readiness. Re-run with --strict-live before launch.",
);
