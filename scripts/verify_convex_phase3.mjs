#!/usr/bin/env node
/** Phase 3: user sync (upsertFromAuth, users.me). */
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

requireIn("convex/users.ts", "users.ts", [
  "upsertFromAuth",
  "export const me",
  "getAuthUserId",
  "syncUserFromAuth",
]);
requireIn("convex/userSync.ts", "userSync.ts", ["syncUserFromAuth", "toUserProfile"]);
requireIn("convex/usersInfo.ts", "usersInfo.ts", ["phase3Status", "users.upsertFromAuth"]);
requireIn("templates/convex_auth_test.html", "convex_auth_test.html", [
  "convex-auth-root",
  "convex_auth_test.mjs",
  "Convex auth",
]);
requireIn("static/convex_auth_test.mjs", "convex_auth_test.mjs", [
  "upsertFromAuth",
  "api.users.me",
]);

if (failed > 0) process.exit(1);
console.log("Phase 3 user sync layout: OK");
