#!/usr/bin/env node
/**
 * Pre-commit phase gate: audit → verify → optimize checks (automated verify slice).
 * Usage: node scripts/phase_gate.mjs [phaseNumber]
 *   npm run phase:gate -- 0
 */
import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const phase = Number.parseInt(process.argv[2] ?? "0", 10);

const UI_PHASES = new Set([5, 7]);
/** Phases 0–4: backend work but UI shell must not regress (Design Pro audit baseline). */
const A11Y_BASELINE_MAX_PHASE = 4;

function resolvePython() {
  const winPy = path.join(root, "venv", "Scripts", "python.exe");
  const unixPy = path.join(root, "venv", "bin", "python");
  if (fs.existsSync(winPy)) {
    return winPy;
  }
  if (fs.existsSync(unixPy)) {
    return unixPy;
  }
  return "python";
}

const python = resolvePython();

function run(label, command, { optional = false } = {}) {
  process.stdout.write(`\n▶ ${label}\n`);
  try {
    if (Array.isArray(command)) {
      execFileSync(command[0], command.slice(1), { cwd: root, stdio: "inherit", env: process.env });
    } else {
      execSync(command, { cwd: root, stdio: "inherit", env: process.env, shell: true });
    }
    process.stdout.write(`✔ ${label}\n`);
    return true;
  } catch (error) {
    if (optional) {
      process.stdout.write(`⚠ ${label} (optional, skipped/failed)\n`);
      return true;
    }
    process.stderr.write(`✖ ${label} failed\n`);
    throw error;
  }
}

function checkCleanup() {
  const problems = [];
  const gitignore = fs.readFileSync(path.join(root, ".gitignore"), "utf8");

  if (!gitignore.includes("convex/_generated/")) {
    problems.push(".gitignore must list convex/_generated/");
  }
  if (!gitignore.includes(".env.local")) {
    problems.push(".gitignore must list .env.local");
  }

  const stale = [".env.railway.example", "RAILWAY.md", "railway.json", "nixpacks.toml"];
  for (const rel of stale) {
    if (fs.existsSync(path.join(root, rel))) {
      problems.push(`Remove stale file: ${rel}`);
    }
  }

  if (problems.length) {
    console.error("\nCleanup check failed:");
    problems.forEach((p) => console.error(`  - ${p}`));
    process.exit(1);
  }
  console.log("\n✔ Cleanup check (no stale deploy files, gitignore OK)");
}

console.log(`Phase gate — phase ${phase} (UI-heavy: ${UI_PHASES.has(phase)})`);

run("Python lint (ruff)", "npm run lint");
const unittestModules = [
  "tests.test_serve",
  "tests.test_deploy",
  "tests.test_convex_phase0",
];
if (phase >= 1) {
  unittestModules.push("tests.test_convex_phase1");
}

run("Deploy + Convex tests", [python, "-m", "unittest", ...unittestModules, "-v"]);

if (phase === 0) {
  run("Convex Phase 0 layout", "npm run test:convex-phase0");
  run("Convex deploy (once)", "npm run convex:dev:once");
  run("Convex bootstrapPing", "npx convex run users:bootstrapPing");
} else if (phase === 1) {
  run("Convex Phase 1 schema layout", "npm run test:convex-phase1");
  run("Convex deploy (once)", "npm run convex:dev:once");
  run("Convex phase1Status", "npx convex run schemaInfo:phase1Status");
} else if (phase >= 2 && phase <= 6) {
  run("Convex deploy (once)", "npm run convex:dev:once");
  run("Convex bootstrapPing", "npx convex run users:bootstrapPing", { optional: phase > 3 });
}

if (UI_PHASES.has(phase) || phase <= A11Y_BASELINE_MAX_PHASE) {
  const label = UI_PHASES.has(phase)
    ? "Playwright accessibility (required)"
    : "Playwright accessibility (Design Pro baseline)";
  run(label, "npm run test:a11y");
}

checkCleanup();

console.log(`\n✅ Phase ${phase} gate passed. Safe to commit after manual audit notes in docs/PHASE_GATE.md.\n`);
