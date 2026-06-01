#!/usr/bin/env node
/** Phase 5: main app Convex Auth + usage bridge. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;

function requireIn(file, label, patterns) {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  for (const pattern of patterns) {
    const ok = typeof pattern === "string" ? text.includes(pattern) : pattern.test(text);
    if (!ok) {
      console.error(`${label}: missing ${pattern}`);
      failed += 1;
    }
  }
}

requireIn("static/convex_bridge.mjs", "convex_bridge.mjs", [
  "initWakuConvexBridge",
  "window.WakuConvex",
  "syncFlaskSession",
  "/auth/convex-bridge",
  "api.usage.status",
  "api.usage.increment",
]);
requireIn("static/app.js", "app.js", [
  "__WAKU_ENV__",
  "useConvexFrontend",
  "WakuConvex",
  "getAuthToken",
  "Authorization",
]);
requireIn("templates/index.html", "index.html", [
  "__WAKU_ENV__",
  "convex_bridge.mjs",
  "convex-bridge-root",
  '<button id="google-sign-in-button"',
]);
requireIn("auth.py", "auth.py", [
  "/convex-bridge",
  "auth_convex_bridge",
  "googleSub",
]);
requireIn("app.py", "app.py", [
  "convex_frontend_enabled",
  "convex_url",
  "convex_enabled",
]);
requireIn("static/convex_client_api.js", "convex_client_api.js", [
  'ref("users:me")',
  'ref("usage:status")',
  'ref("usage:increment")',
  "Symbol.for(\"functionName\")",
]);
requireIn("convex/frontendInfo.ts", "frontendInfo.ts", ["phase5Status", "USE_CONVEX_FRONTEND"]);

if (failed > 0) process.exit(1);
console.log("Phase 5 frontend bridge layout: OK");
