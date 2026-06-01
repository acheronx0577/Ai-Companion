#!/usr/bin/env node
/**
 * Phase 0 exit checks (no Convex account required for file layout).
 * Run after `npm run convex:dev:once` to also verify deployment + functions.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const requiredFiles = [
  "convex/schema.ts",
  "convex/auth.ts",
  "convex/users.ts",
  "convex/usage.ts",
  "convex/http.ts",
  "convex/tsconfig.json",
  "package.json",
];

let failed = 0;

for (const rel of requiredFiles) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    console.error(`Missing: ${rel}`);
    failed += 1;
  }
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
if (!pkg.dependencies?.convex) {
  console.error("package.json must list convex in dependencies");
  failed += 1;
}

if (!pkg.scripts?.["convex:dev"]) {
  console.error('package.json must include script "convex:dev"');
  failed += 1;
}

const gitignore = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
if (!gitignore.includes("convex/_generated/")) {
  console.error(".gitignore must ignore convex/_generated/");
  failed += 1;
}

const envExample = fs.readFileSync(path.join(root, ".env.example"), "utf8");
if (!envExample.includes("CONVEX_URL")) {
  console.error(".env.example must document CONVEX_URL");
  failed += 1;
}

if (failed > 0) {
  process.exit(1);
}

console.log("Phase 0 layout: OK");
console.log("Next: npm run convex:dev:once  (then open Convex dashboard)");
