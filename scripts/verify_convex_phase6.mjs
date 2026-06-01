#!/usr/bin/env node
/** Phase 6: Flask /chat + Convex HTTP usage bridge. */
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

requireIn("convex/http.ts", "http.ts", [
  "/api/chat/increment-usage",
  "incrementUsageForChat",
]);
requireIn("convex/chatHttp.ts", "chatHttp.ts", [
  "incrementUsageForChat",
  "api.usage.increment",
]);
requireIn("convex_usage.py", "convex_usage.py", [
  "increment_usage_via_convex",
  "bearer_token_from_request",
  "CONVEX_SITE_URL",
]);
requireIn("app.py", "app.py", [
  "increment_usage_via_convex",
  "usage_from_convex",
  "bearer_token_from_request",
]);
requireIn("static/convex_bridge.mjs", "convex_bridge.mjs", [
  "useAuthToken",
  "getAuthToken",
]);
requireIn("static/app.js", "app.js", [
  "Authorization",
  "getAuthToken",
]);
requireIn("convex/chatBridgeInfo.ts", "chatBridgeInfo.ts", ["phase6Status"]);

if (failed > 0) process.exit(1);
console.log("Phase 6 chat bridge layout: OK");
