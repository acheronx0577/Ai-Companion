#!/usr/bin/env node
/** Check /voices/status: English Piper + Japanese device voice (no English device when Piper on). */
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
  console.log(`voiceCatalogVersion: ${data.voiceCatalogVersion ?? "(missing)"}`);
  console.log(`piperAvailable: ${data.piperAvailable}`);

  const piper = data.piperVoices || [];
  const device = data.browserVoiceMenu || [];

  for (const lang of ["es", "ko", "zh", "vi"]) {
    if (piper.some((v) => v.lang === lang)) {
      fail(`Unexpected Piper voice for ${lang}`);
    }
    if (device.some((v) => v.lang === lang)) {
      fail(`Unexpected device voice for ${lang}`);
    }
  }

  const enPiper = piper.find((v) => v.id === "en_US-hfc_female-medium");
  if (!enPiper) {
    fail("Missing en_US-hfc_female-medium in catalog");
  }

  const deviceLangs = new Set(device.map((v) => v.lang));
  if (!deviceLangs.has("ja")) {
    fail(`Expected Japanese device voice, got: ${[...deviceLangs].join(", ")}`);
  }
  if (data.piperAvailable && deviceLangs.has("en")) {
    fail("English device voice should be hidden when Piper English is available");
  }

  console.log("\nPiper voices:");
  for (const v of piper) {
    console.log(`  • ${v.label}${v.available ? "" : " (not installed)"}`);
  }
  console.log("\nDevice voices:");
  for (const v of device) {
    console.log(`  • ${v.label}`);
  }

  if (failed > 0) {
    process.exit(1);
  }
  console.log("\nDropdown API: OK");
}

main();
