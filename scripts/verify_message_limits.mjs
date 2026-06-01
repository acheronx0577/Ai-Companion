#!/usr/bin/env node
/** Ensures 100-word message cap is wired in template, client, and server. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;

function requireIn(file, label, patterns) {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  for (const pattern of patterns) {
    if (!text.includes(pattern)) {
      console.error(`${label}: missing ${pattern}`);
      failed += 1;
    }
  }
}

requireIn("message_limits.py", "message_limits.py", ["MAX_MESSAGE_WORDS = 100"]);
requireIn("static/app.js", "app.js", ["const MAX_MESSAGE_WORDS = 100", "truncateToWordLimit"]);
requireIn("templates/index.html", "index.html", [
  'id="message-word-hint"',
  "0 / 100 words",
  "aria-describedby=\"message-word-hint\"",
]);
requireIn("app.py", "app.py", ["message_exceeds_word_limit", "messageTooLong"]);

if (failed > 0) process.exit(1);
console.log("Message word limits: OK");
