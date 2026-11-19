"use strict";

/**
 * POST /.netlify/functions/review-send
 *
 * Server-side relay for the review-send log (Phase 22). The page posts the same
 * JSON body it used to send straight to Nexus; this function validates it and
 * forwards it to Nexus with the X-Review-Send-Key header added here, so the key
 * never reaches the browser or the repo.
 *
 * Keys live ONLY in Netlify environment variables (see CLIENTS below). Client
 * JSON files under /clients are public and must never hold a key.
 *
 * Logging is best-effort bookkeeping. The page never waits on this function.
 */

// ---------------------------------------------------------------------------
// Allowlist. Code, not data: page slug -> Nexus client slug + env var name.
// Must match clients/*.json (checked by scripts/check_clients.js).
// A client with no nexusClientSlug (e.g. asm) is not listed: the page never
// posts for it. A listed client whose env var is unset gets 200 + no forward.
// ---------------------------------------------------------------------------
const CLIENTS = Object.freeze({
  toby: { nexusClientSlug: "signature_tree", keyEnv: "NEXUS_KEY_TOBY" },
  mna: { nexusClientSlug: "ma_stump_grinding", keyEnv: "NEXUS_KEY_MNA" },
});

const DEFAULT_NEXUS_BASE_URL = "https://nexus.digitaldynamicsolution.com";
const NEXUS_PATH = "/api/v1/review-sends";
const MAX_BODY_BYTES = 2048;
const UPSTREAM_TIMEOUT_MS = 5000;

const BY_NEXUS_SLUG = new Map(
  Object.entries(CLIENTS).map(([pageSlug, c]) => [c.nexusClientSlug, { pageSlug, ...c }])
);

// Mirrors the app's filter: Nexus 422s labels holding a phone or an email.
const LABEL_LOOKS_LIKE_PHONE = /\d[\d\s().-]{5,}/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;
const ALLOWED_FIELDS = new Set([
  "client_slug",
  "customer_hash",
  "template_variant",
  "variant_index",
  "channel",
  "timestamp",
  "customer_label",
]);

function reply(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
    body: JSON.stringify(obj),
  };
}

function header(event, name) {
  const h = event.headers || {};
  const want = name.toLowerCase();
  for (const k of Object.keys(h)) {
    if (k.toLowerCase() === want) return String(h[k] || "");
  }
  return "";
}

function hostOf(value) {
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return "";
  }
}

function isLocalhost(host) {
  const name = host.replace(/:\d+$/, "");
  return name === "localhost" || name === "127.0.0.1" || name === "[::1]";
}

/**
 * Same-site check. Accepts the request when the Origin (or, if absent, the
 * Referer) host is:
 *   - the host this request was served on (the site calling its own function),
 *   - the site's own Netlify URLs (URL / DEPLOY_PRIME_URL / DEPLOY_URL),
 *   - anything listed in ALLOWED_ORIGINS (comma-separated, optional), or
 *   - localhost, for local preview.
 * This stops other websites from driving the endpoint from a browser. It does
 * not stop a non-browser client from forging headers; the key is still never
 * exposed, and the payload is validated either way.
 */
function originAllowed(event) {
  const source = header(event, "origin") || header(event, "referer");
  const srcHost = hostOf(source);
  if (!srcHost) return false;
  if (isLocalhost(srcHost)) return true;

  const allowed = new Set();
  const reqHost = (header(event, "x-forwarded-host") || header(event, "host")).toLowerCase();
  if (reqHost) allowed.add(reqHost);
  for (const v of [process.env.URL, process.env.DEPLOY_PRIME_URL, process.env.DEPLOY_URL]) {
    const h = hostOf(v || "");
    if (h) allowed.add(h);
  }
  for (const v of String(process.env.ALLOWED_ORIGINS || "").split(",")) {
    const h = hostOf(v.trim());
    if (h) allowed.add(h);
  }
  return allowed.has(srcHost);
}

function isNonEmptyString(v, max) {
  return typeof v === "string" && v.length > 0 && v.length <= max;
}

/** Returns { payload } (fields in the app's order) or { error }. */
function validate(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "body must be an object" };
  for (const k of Object.keys(body)) {
    if (!ALLOWED_FIELDS.has(k)) return { error: `unexpected field: ${k.slice(0, 40)}` };
  }

  const { client_slug, customer_hash, template_variant, variant_index, channel, timestamp } = body;
  if (!isNonEmptyString(client_slug, 64) || !/^[a-z0-9_-]+$/.test(client_slug)) return { error: "bad client_slug" };
  if (typeof customer_hash !== "string" || !/^[0-9a-f]{64}$/.test(customer_hash)) return { error: "bad customer_hash" };
  if (template_variant !== "first" && template_variant !== "repeat") return { error: "bad template_variant" };
  if (!Number.isInteger(variant_index) || variant_index < 0 || variant_index > 49) return { error: "bad variant_index" };
  if (channel !== "deep_link" && channel !== "copy") return { error: "bad channel" };
  if (!isNonEmptyString(timestamp, 40) || !ISO_TIMESTAMP.test(timestamp) || Number.isNaN(Date.parse(timestamp))) {
    return { error: "bad timestamp" };
  }

  const payload = { client_slug, customer_hash, template_variant, variant_index, channel, timestamp };

  if (body.customer_label !== undefined) {
    if (typeof body.customer_label !== "string" || body.customer_label.length > 64) {
      return { error: "bad customer_label" };
    }
    const label = body.customer_label.trim();
    // Drop (not reject) a label Nexus would 422 on: a weird name should cost the
    // label, not the row. Same rule as the app.
    if (label && !label.includes("@") && !LABEL_LOOKS_LIKE_PHONE.test(label) && !/[\u0000-\u001f\u007f]/.test(label)) {
      payload.customer_label = label;
    }
  }
  return { payload };
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") {
    const res = reply(405, { ok: false, error: "method not allowed" });
    res.headers.Allow = "POST";
    return res;
  }

  if (!originAllowed(event)) return reply(403, { ok: false, error: "origin not allowed" });

  const ctype = header(event, "content-type").split(";")[0].trim().toLowerCase();
  if (ctype !== "application/json") return reply(415, { ok: false, error: "content-type must be application/json" });

  const raw = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : String(event.body || "");
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return reply(413, { ok: false, error: "body too large" });

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return reply(400, { ok: false, error: "invalid json" });
  }

  const { payload, error } = validate(body);
  if (error) return reply(400, { ok: false, error });

  const client = BY_NEXUS_SLUG.get(payload.client_slug);
  if (!client) return reply(403, { ok: false, error: "unknown client" });

  const key = String(process.env[client.keyEnv] || "").trim();
  if (!key) {
    // Not configured for this client: succeed quietly, forward nothing.
    return reply(200, { ok: true, forwarded: false });
  }

  const base = String(process.env.NEXUS_BASE_URL || DEFAULT_NEXUS_BASE_URL).replace(/\/+$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const upstream = await fetch(`${base}${NEXUS_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Review-Send-Key": key },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!upstream.ok) {
      // Status only. Never the key, never the payload (it carries a customer label).
      console.warn(`[review-send] nexus rejected ${client.pageSlug}: ${upstream.status}`);
      return reply(502, { ok: false, forwarded: true, upstream_status: upstream.status });
    }
    return reply(200, { ok: true, forwarded: true });
  } catch (err) {
    console.warn(`[review-send] nexus unreachable for ${client.pageSlug}: ${err && err.name}`);
    return reply(502, { ok: false, forwarded: false, error: "upstream unreachable" });
  } finally {
    clearTimeout(timer);
  }
};

// Exposed for scripts/check_clients.js and local tests. Not secret.
exports.CLIENTS = CLIENTS;
