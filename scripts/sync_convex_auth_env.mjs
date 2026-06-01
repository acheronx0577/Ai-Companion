#!/usr/bin/env node
/**
 * Copy GOOGLE_OAUTH_* from .env into Convex AUTH_GOOGLE_* (local dev helper).
 * Requires: npx convex, .env with GOOGLE_OAUTH_CLIENT_ID/SECRET
 */
import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");

function parseEnv(text) {
  const out = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    out[key.trim()] = rest.join("=").trim();
  }
  return out;
}

function convexEnvSet(name, value) {
  const args = ["convex", "env", "set", name, value];
  if (process.platform === "win32") {
    execSync(`npx ${args.map((a) => JSON.stringify(a)).join(" ")}`, {
      cwd: root,
      stdio: "inherit",
      shell: true,
    });
    return;
  }
  execFileSync("npx", args, { cwd: root, stdio: "inherit" });
}

if (!fs.existsSync(envPath)) {
  console.error("Missing .env");
  process.exit(1);
}

const env = parseEnv(fs.readFileSync(envPath, "utf8"));
const id = env.GOOGLE_OAUTH_CLIENT_ID;
const secret = env.GOOGLE_OAUTH_CLIENT_SECRET;

if (!id || !secret) {
  console.error("Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in .env first.");
  process.exit(1);
}

convexEnvSet("AUTH_GOOGLE_ID", id);
convexEnvSet("AUTH_GOOGLE_SECRET", secret);
convexEnvSet("SITE_URL", "http://127.0.0.1:5000");

console.log("Convex AUTH_GOOGLE_* and SITE_URL updated from .env");
