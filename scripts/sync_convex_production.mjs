#!/usr/bin/env node
/**
 * Set Convex *production* Auth env for Render (or other hosting).
 *
 * Usage:
 *   node scripts/sync_convex_production.mjs https://ai-companion-ngbi.onrender.com
 *
 * Copies GOOGLE_OAUTH_* from .env → AUTH_GOOGLE_* and sets SITE_URL on prod deployment.
 * Also run: npm run convex:set-jwt-keys:prod
 * Or set JWT_PRIVATE_KEY + JWKS in Convex dashboard → Production.
 */
import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
const siteUrl = (process.argv[2] || process.env.PRODUCTION_SITE_URL || "").trim().replace(/\/$/, "");

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
  const args = ["convex", "env", "set", name, "--prod", "--", value];
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

if (!siteUrl.startsWith("https://")) {
  console.error("Pass your public app URL, e.g.:");
  console.error("  node scripts/sync_convex_production.mjs https://ai-companion-ngbi.onrender.com");
  process.exit(1);
}

if (!fs.existsSync(envPath)) {
  console.error("Missing .env with GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET");
  process.exit(1);
}

const env = parseEnv(fs.readFileSync(envPath, "utf8"));
const id = env.GOOGLE_OAUTH_CLIENT_ID;
const secret = env.GOOGLE_OAUTH_CLIENT_SECRET;

if (!id || !secret) {
  console.error("Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in .env first.");
  process.exit(1);
}

console.log(`Setting Convex PRODUCTION env (SITE_URL=${siteUrl})...`);
convexEnvSet("AUTH_GOOGLE_ID", id);
convexEnvSet("AUTH_GOOGLE_SECRET", secret);
convexEnvSet("SITE_URL", siteUrl);

const envLocalPath = path.join(root, ".env.local");
let convexSiteHint = "https://YOUR-PROJECT.convex.site";
if (fs.existsSync(envLocalPath)) {
  const localEnv = parseEnv(fs.readFileSync(envLocalPath, "utf8"));
  const site = (localEnv.CONVEX_SITE_URL || "").replace(/\/$/, "");
  if (site.includes(".convex.site")) {
    convexSiteHint = site;
  }
}

console.log("\nDone. Also verify:");
console.log("  1. npx convex deploy");
console.log("  2. Render env: CONVEX_URL + CONVEX_SITE_URL from Convex dashboard (Production)");
console.log(`  3. Google redirect: ${siteUrl}/auth/google/callback`);
console.log(`  4. Google redirect: ${convexSiteHint}/api/auth/callback/google`);
console.log("  5. JWT_PRIVATE_KEY + JWKS: npm run convex:set-jwt-keys:prod");
