// Self-contained tests for the ARD validator (no external fixtures).
// Run with: npm test   (node --test)
import test from "node:test";
import assert from "node:assert/strict";
import { validateCatalog } from "../site/assets/ard-validator.js";

const VALID = {
  specVersion: "1.0",
  host: { displayName: "Acme Dev Tools", identifier: "did:web:acme.com" },
  entries: [
    {
      identifier: "urn:air:acme.com:weather:telemetry",
      displayName: "Acme Weather Telemetry Server",
      type: "application/mcp-server-card+json",
      url: "https://api.acme.com/mcp/weather.json",
      description: "Live weather telemetry MCP server.",
      capabilities: ["WeatherTool"],
      representativeQueries: ["wind speed in Chicago", "5-day forecast for Seattle"],
    },
  ],
};

const BROKEN = {
  specVersion: "1.0",
  host: { displayName: "Partnerly" },
  entries: [
    {
      identifier: "urn:ai:partnerly.io:support:assistant",
      displayName: "Support Assistant",
      type: "application/a2a-agent-card+json",
      url: "https://api.partnerly.io/agents/support.json",
      data: { name: "Support Assistant" },
    },
    {
      identifier: "urn:air:localhost:billing:reconciler",
      displayName: "Billing Reconciler",
      type: "mcp-server",
      trustManifest: {
        identity: "spiffe://other.com/billing",
        attestations: [{ type: "SOC2-Type2", uri: "https://trust.partnerly.io/soc2.pdf" }],
      },
    },
  ],
};

const codesOf = (r) => new Set(r.findings.map((f) => f.code));

test("a valid catalog passes with zero errors", () => {
  const r = validateCatalog(VALID);
  assert.equal(r.ok, true);
  assert.equal(r.counts.error, 0);
});

test("urn:ai: prefix is flagged as urn-wrong-nid", () => {
  const r = validateCatalog(BROKEN);
  assert.ok(codesOf(r).has("urn-wrong-nid"));
});

test("an entry with both url and data fails Value-or-Reference", () => {
  const r = validateCatalog(BROKEN);
  assert.ok(r.findings.some((f) => f.code === "value-or-reference" && f.message.includes("BOTH")));
});

test("a localhost publisher is flagged", () => {
  const r = validateCatalog(BROKEN);
  assert.ok(codesOf(r).has("urn-localhost"));
});

test("an attestation missing mediaType is a schema error", () => {
  const r = validateCatalog(BROKEN);
  assert.ok(r.findings.some((f) => f.code === "schema" && f.path.includes("attestations[0].mediaType")));
});

test("a non-media-type 'type' is flagged", () => {
  const r = validateCatalog(BROKEN);
  assert.ok(codesOf(r).has("type-not-media-type"));
});

test("trust identity domain mismatch is flagged", () => {
  const r = validateCatalog(BROKEN);
  assert.ok(codesOf(r).has("trust-domain-mismatch"));
});

test("the broken catalog is not conformant overall", () => {
  const r = validateCatalog(BROKEN);
  assert.equal(r.ok, false);
});

test("every finding carries a suggestion field", () => {
  const r = validateCatalog(BROKEN);
  assert.ok(r.findings.every((f) => Object.prototype.hasOwnProperty.call(f, "suggestion")));
});

test("warnings do not gate conformance (errors do)", () => {
  const warn = {
    specVersion: "1.0",
    host: { displayName: "Warn Co" },
    entries: [{ identifier: "urn:air:bareword:agent", displayName: "W", type: "application/mcp-server-card+json", url: "http://localhost:8080/mcp" }],
  };
  const r = validateCatalog(warn);
  assert.equal(r.ok, true);
  assert.ok(r.counts.warning >= 1);
});
