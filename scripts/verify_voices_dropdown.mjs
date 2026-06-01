#!/usr/bin/env node
/** Check /voices/status matches current catalog (no Spanish / Korean). */
const base = process.env.WAKU_BASE_URL || "http://127.0.0.1:5000";
const url = `${base.replace(/\/$/, "")}/voices/status`;

let failed = 0;

function fail(msg) {
  console.error(msg);
  failed += 1;
}

async function main() {
  let res;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch (error) {
    fail(`Cannot reach ${url} — start npm run dev first. (${error.message})`);
    process.exit(1);
  }
  if (!res.ok) {
    fail(`/voices/status returned ${res.status}`);
    process.exit(1);
  }
  const data = await res.json();
  console.log(`voiceCatalogVersion: ${data.voiceCatalogVersion ?? "(missing — restart Flask)"}`);

  const piper = data.piperVoices || [];
  const device = data.browserVoiceMenu || [];

  for (const lang of ["es", "ko"]) {
    if (piper.some((v) => v.lang === lang)) {
      fail(`Piper voice still listed for ${lang}`);
    }
    if (device.some((v) => v.lang === lang)) {
      fail(`Device voice still listed for ${lang}`);
    }
  }

  const expectedPiper = ["en_US-hfc_female-medium", "zh_CN-huayan-medium", "vi_VN-25hours_single-low"];
  for (const id of expectedPiper) {
    const row = piper.find((v) => v.id === id);
    if (!row) {
      fail(`Missing Piper catalog entry: ${id}`);
    }
  }

  console.log("\nPiper voices (dropdown — Piper voices group):");
  for (const v of piper.filter((x) => x.available)) {
    console.log(`  • ${v.label}`);
  }
  console.log("\nDevice voices (dropdown — Device voices group):");
  for (const v of device) {
    console.log(`  • ${v.label}`);
  }

  if (failed > 0) {
    process.exit(1);
  }
  console.log("\nDropdown API: OK");
}

main();
