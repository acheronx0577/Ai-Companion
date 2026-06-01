#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fix = process.argv.includes("--fix");

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

const py = resolvePython();
const exclude = ["--exclude", "venv,.git,node_modules,convex/_generated"];

const checkArgs = ["-m", "ruff", "check", ".", ...exclude];
if (fix) {
  checkArgs.push("--fix");
}
execFileSync(py, checkArgs, { cwd: root, stdio: "inherit" });

const formatArgs = fix
  ? ["-m", "ruff", "format", "."]
  : ["-m", "ruff", "format", "--check", "."];
execFileSync(py, formatArgs, { cwd: root, stdio: "inherit" });
