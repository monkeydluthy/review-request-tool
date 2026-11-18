#!/usr/bin/env node
/**
 * Sanity check for clients/*.json against the review-send function allowlist.
 *
 *   node scripts/check_clients.js
 *
 * Fails if:
 *   - any client JSON contains a secret-looking field (nexusApiKey, *key*,
 *     *secret*, *token*). Client files are served publicly at /clients/<slug>.json.
 *   - a client with a nexusClientSlug is missing from CLIENTS in
 *     netlify/functions/review-send.js, or the slugs disagree.
 *   - CLIENTS lists a page slug that has no clients/<slug>.json.
 *
 * Never prints a field's value.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const { CLIENTS } = require(path.join(ROOT, "netlify/functions/review-send.js"));
const SECRETISH = /(api_?key|secret|token|password|^key$|Key$)/i;

const problems = [];
const seen = new Set();

function scanForSecrets(obj, where) {
  if (!obj || typeof obj !== "object") return;
  for (const [k, v] of Object.entries(obj)) {
    if (SECRETISH.test(k)) problems.push(`${where}: field "${k}" looks like a secret. Remove it; keys go in Netlify env vars.`);
    scanForSecrets(v, `${where}.${k}`);
  }
}

for (const file of fs.readdirSync(path.join(ROOT, "clients")).sort()) {
  if (!file.endsWith(".json")) continue;
  const rel = `clients/${file}`;
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
  scanForSecrets(data, rel);
  if (file.startsWith("_")) continue;

  const pageSlug = file.replace(/\.json$/, "");
  const nexusSlug = String(data.nexusClientSlug || "").trim();
  const entry = CLIENTS[pageSlug];
  seen.add(pageSlug);
  if (nexusSlug && !entry) {
    problems.push(`${rel}: nexusClientSlug is set but "${pageSlug}" is not in CLIENTS (netlify/functions/review-send.js).`);
  } else if (entry && entry.nexusClientSlug !== nexusSlug) {
    problems.push(`${rel}: nexusClientSlug does not match CLIENTS.${pageSlug}.nexusClientSlug.`);
  }
}

for (const pageSlug of Object.keys(CLIENTS)) {
  if (!seen.has(pageSlug)) problems.push(`CLIENTS.${pageSlug} has no clients/${pageSlug}.json.`);
}

if (problems.length) {
  console.error(problems.map((p) => `✗ ${p}`).join("\n"));
  process.exit(1);
}
console.log(`✓ clients OK. Logging enabled for: ${Object.entries(CLIENTS).map(([s, c]) => `${s} (${c.keyEnv})`).join(", ")}`);
