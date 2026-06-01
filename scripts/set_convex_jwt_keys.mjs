#!/usr/bin/env node
/** Generate and set JWT_PRIVATE_KEY + JWKS for Convex Auth on Windows/Unix safely using -- */
import { exportJWK, exportPKCS8, generateKeyPair } from "jose";
import { execFileSync, execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const useProd = process.argv.includes("--prod");

function convexEnvSet(name, value) {
  // Use '--' to prevent CLI flags confusion (especially with '-----BEGIN' on Windows)
  const args = ["convex", "env", "set", name];
  if (useProd) {
    args.push("--prod");
  }
  args.push("--", value);
  const target = useProd ? "production" : "development";
  console.log(`Setting ${name} on Convex ${target}...`);
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

async function main() {
  const keys = await generateKeyPair("RS256", { extractable: true });
  const privateKey = await exportPKCS8(keys.privateKey);
  const publicKey = await exportJWK(keys.publicKey);
  const jwks = JSON.stringify({ keys: [{ use: "sig", ...publicKey }] });

  // Use the PEM string format with newlines replaced by space (as in generate_auth_keys.mjs)
  const pemFormatted = privateKey.trimEnd().replace(/\n/g, " ");

  try {
    convexEnvSet("JWT_PRIVATE_KEY", pemFormatted);
    convexEnvSet("JWKS", jwks);
    console.log("Convex JWT_PRIVATE_KEY and JWKS set successfully!");
  } catch (error) {
    console.error("Failed to set Convex environment variables:", error);
    process.exit(1);
  }
}

main();
