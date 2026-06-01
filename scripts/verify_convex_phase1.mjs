#!/usr/bin/env node
/** Phase 1: schema.ts defines required tables and indexes. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = path.join(root, "convex", "schema.ts");
const constantsPath = path.join(root, "convex", "constants.ts");

let failed = 0;

function requireIn(file, label, patterns) {
  const text = fs.readFileSync(file, "utf8");
  for (const pattern of patterns) {
    const ok = typeof pattern === "string" ? text.includes(pattern) : pattern.test(text);
    if (!ok) {
      console.error(`${label}: missing ${pattern}`);
      failed += 1;
    }
  }
}

if (!fs.existsSync(schemaPath)) {
  console.error("Missing convex/schema.ts");
  process.exit(1);
}

requireIn(schemaPath, "schema", [
  "users: defineTable",
  "dailyUsage: defineTable",
  "chatSessions: defineTable",
  "chatMessages: defineTable",
  'index("by_user_date"',
  /index\("by_googleSub"|authTables/,
]);

requireIn(constantsPath, "constants", ["DAILY_MESSAGE_LIMIT = 10"]);

if (failed > 0) {
  process.exit(1);
}

console.log("Phase 1 schema layout: OK");
console.log("Next: npm run convex:dev:once && npx convex run schemaInfo:phase1Status");
