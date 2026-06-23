// analytics.js — minimal, cookieless, GDPR-friendly usage telemetry for Azure Application Insights.
//
// Privacy by design:
//   * No cookies. No localStorage / sessionStorage. Nothing is written to or read from the device,
//     so no consent banner is required under ePrivacy/GDPR.
//   * The "session id" is a random value generated in memory for this page load only. It is never
//     stored and never persists across loads, so it cannot be used to track a person over time.
//   * No personal data: we NEVER send the host you type or the catalog you fetch — only anonymous
//     UI event names and coarse, non-identifying outcomes (e.g. "conformant").
//   * We do not send your IP; Application Insights masks client IP by default (resource-side).
//   * Do Not Track / Global Privacy Control are honoured — telemetry is disabled when set.
//
// The identifiers below are *client-side ingestion* identifiers (instrumentation key + ingestion
// endpoint). They are designed to be embedded in a public web page and are not secrets.

const INSTRUMENTATION_KEY = "277d4aad-1994-48f3-8446-e71bf913d970";
const INGESTION_ENDPOINT = "https://westeurope-5.in.applicationinsights.azure.com/";
const ROLE = "ard-explorer-web";

const IKEY_NODASH = INSTRUMENTATION_KEY.replace(/-/g, "");
const TRACK_URL = INGESTION_ENDPOINT.replace(/\/?$/, "/") + "v2/track";

// In-memory only: a per-page-load id, never stored, never persisted.
function randomId() {
  try { if (crypto && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, "").slice(0, 16); } catch { /* ignore */ }
  return (Date.now().toString(36) + Math.random().toString(36).slice(2)).slice(0, 16);
}
const sessionId = randomId();

// Respect user privacy signals.
let enabled = true;
try {
  if (navigator.doNotTrack === "1" || window.doNotTrack === "1" || navigator.globalPrivacyControl === true) enabled = false;
} catch { /* ignore */ }

function envelope(typeShort, baseType, baseData) {
  return {
    name: `Microsoft.ApplicationInsights.${IKEY_NODASH}.${typeShort}`,
    time: new Date().toISOString(),
    iKey: INSTRUMENTATION_KEY,
    tags: {
      "ai.cloud.role": ROLE,
      "ai.session.id": sessionId,
      "ai.operation.name": "ARD Explorer",
    },
    data: { baseType, baseData: { ver: 2, ...baseData } },
  };
}

function send(env) {
  if (!enabled) return;
  try {
    fetch(TRACK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(env),
      keepalive: true,      // allow the request to complete during page unload
      mode: "cors",
      credentials: "omit",  // never attach cookies/credentials
      cache: "no-store",
    }).catch(() => {});
  } catch { /* analytics must never break the app */ }
}

// Defensive scrubber: only short string values, no nullish — guards against accidental PII.
function clean(properties) {
  const out = {};
  if (properties) {
    for (const [k, v] of Object.entries(properties)) {
      if (v == null) continue;
      out[k] = String(v).slice(0, 64);
    }
  }
  return out;
}

export function trackEvent(name, properties) {
  send(envelope("Event", "EventData", { name: String(name).slice(0, 64), properties: clean(properties) }));
}

export function trackPageView() {
  // Deliberately drop the query string (it can hold the host being probed).
  send(envelope("PageView", "PageViewData", { name: "ARD Explorer", url: location.origin + location.pathname }));
}
