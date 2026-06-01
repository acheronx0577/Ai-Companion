#!/usr/bin/env node
/** Phase 4: usage limits in Convex. */
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

requireIn("convex/usage.ts", "usage.ts", [
  "export const status",
  "export const increment",
  "export const checkDailyLimit",
  "getAuthUserId",
]);
requireIn("convex/usageLogic.ts", "usageLogic.ts", [
  "computeUsageStatusForUser",
  "rateLimitFromTimestamps",
]);
requireIn("static/convex_auth_test.mjs", "convex_auth_test.mjs", [
  "usage.increment",
  "<h2>Usage</h2>",
]);
requireIn("convex/schema.ts", "schema.ts", ["chatRateState: defineTable", "dailyUsage: defineTable"]);
requireIn("convex/usageInfo.ts", "usageInfo.ts", ["phase4Status", "usage.increment"]);
requireIn("convex_usage.py", "convex_usage.py", ["use_convex_usage", "USE_CONVEX_USAGE"]);
requireIn("usage_limit.py", "usage_limit.py", ["use_convex_usage"]);

if (failed > 0) process.exit(1);
console.log("Phase 4 usage layout: OK");
