#!/usr/bin/env node
/* eslint-disable no-console */
const { randomBytes } = require("crypto");
const { spawnSync } = require("child_process");

function usage() {
  console.log("Usage:");
  console.log("  node scripts/setup-skeddy-bridge.cjs --url https://<relay-domain>/webhook");
  process.exit(1);
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) {
    return "";
  }
  return (process.argv[index + 1] || "").trim();
}

function runVercelEnvAdd(key, value) {
  const result = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["--yes", "vercel", "env", "add", key, "production"],
    {
      input: `${value}\n`,
      stdio: ["pipe", "inherit", "inherit"],
      shell: false,
      encoding: "utf8",
    }
  );
  return result.status === 0;
}

function main() {
  const url = readArg("--url");
  if (!url) {
    usage();
  }

  const secret = randomBytes(32).toString("hex");
  const timeoutMs = "6000";

  console.log("[setup] Adding Vercel env for Skeddy Bridge...");
  const okUrl = runVercelEnvAdd("SKEDDY_BRIDGE_WEBHOOK_URL", url);
  const okSecret = runVercelEnvAdd("SKEDDY_BRIDGE_WEBHOOK_SECRET", secret);
  const okTimeout = runVercelEnvAdd("SKEDDY_BRIDGE_TIMEOUT_MS", timeoutMs);

  if (!okUrl || !okSecret || !okTimeout) {
    console.error("[setup] Failed to add one or more env variables.");
    process.exit(1);
  }

  console.log("\n[done] Vercel env added for production.");
  console.log("\nSet this same secret on relay:");
  console.log(`SKEDDY_RELAY_WEBHOOK_SECRET=${secret}`);
  console.log("\nThen redeploy app:");
  console.log("npx --yes vercel deploy --prod --yes");
}

main();

