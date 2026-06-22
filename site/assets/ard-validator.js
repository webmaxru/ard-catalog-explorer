// ard-validator.js
// Browser + Node ES-module port of the ard-registry-builder skill's validate_catalog.py.
// Mirrors the same finding `code`s and severities (ERROR/WARN/INFO) and adds a concrete
// `suggestion` for each issue. Pure function: takes a parsed manifest object, returns findings.
//
// Source of truth: .agents/skills/ard-registry-builder/scripts/validate_catalog.py
//                  .agents/skills/ard-registry-builder/references/validation-rules.md
//                  .agents/skills/ard-registry-builder/assets/ai-catalog.schema.json

export const ERROR = "ERROR";
export const WARN = "WARN";
export const INFO = "INFO";

export const URN_RE = /^urn:air:[a-zA-Z0-9.-]+(:[a-zA-Z0-9._-]+)+$/;

const MANIFEST_KEYS = new Set(["specVersion", "host", "entries"]);
const HOST_KEYS = new Set(["displayName", "identifier", "documentationUrl", "logoUrl", "trustManifest"]);
const TRUST_KEYS = new Set(["identity", "identityType", "trustSchema", "attestations", "provenance", "signature"]);
const IDENTITY_TYPES = new Set(["spiffe", "did", "https", "other"]);
const PROVENANCE_RELATIONS = new Set(["derivedFrom", "publishedFrom", "copiedFrom"]);

function isObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function isString(v) {
  return typeof v === "string";
}

class Report {
  constructor() {
    this.findings = [];
  }
  add(level, path, code, message, suggestion = "") {
    this.findings.push({ level, path, code, message, suggestion });
  }
  count(level) {
    return this.findings.filter((f) => f.level === level).length;
  }
}

// --------------------------------------------------------------------------- //
// Layer 1: structural checks (mirrors ai-catalog.schema.json, Draft 2020-12)
// --------------------------------------------------------------------------- //
function structuralManifest(doc, report, base = "") {
  const p = (k) => (base ? `${base}${k}` : k);
  if (!isObject(doc)) {
    report.add(ERROR, base || "(root)", "schema", "manifest must be a JSON object", "Wrap the document in a top-level { } object.");
    return;
  }
  if (doc.specVersion !== "1.0") {
    report.add(ERROR, p("specVersion"), "schema",
      'specVersion is required and must equal "1.0"', 'Set "specVersion": "1.0".');
  }
  if (!Array.isArray(doc.entries)) {
    report.add(ERROR, p("entries"), "schema", "entries is required and must be an array",
      'Add an "entries": [ ... ] array (one object per agentic resource).');
  }
  for (const key of Object.keys(doc)) {
    if (!MANIFEST_KEYS.has(key)) {
      report.add(ERROR, p(key), "schema", `unknown top-level property '${key}' (additionalProperties is false)`,
        `Remove '${key}'. Allowed top-level keys are: specVersion, host, entries.`);
    }
  }
  if ("host" in doc) structuralHost(doc.host, report, p("host"));
  if (Array.isArray(doc.entries)) {
    doc.entries.forEach((entry, i) => structuralEntry(entry, report, `${p("entries")}[${i}]`));
  }
}

function structuralHost(host, report, base) {
  if (!isObject(host)) {
    report.add(ERROR, base, "schema", "host must be an object", "Make host a { } object or remove it.");
    return;
  }
  if (!isString(host.displayName)) {
    report.add(ERROR, `${base}.displayName`, "schema", "host.displayName is required when host is present",
      'Add "displayName" to the host object.');
  }
  for (const key of Object.keys(host)) {
    if (!HOST_KEYS.has(key)) {
      report.add(ERROR, `${base}.${key}`, "schema", `unknown host property '${key}' (additionalProperties is false)`,
        `Remove '${key}'. Allowed host keys: displayName, identifier, documentationUrl, logoUrl, trustManifest.`);
    }
  }
  if ("trustManifest" in host) structuralTrust(host.trustManifest, report, `${base}.trustManifest`);
}

function structuralEntry(entry, report, base) {
  if (!isObject(entry)) {
    report.add(ERROR, base, "schema", "entry must be an object", "Each item in entries must be a { } object.");
    return;
  }
  for (const field of ["identifier", "displayName", "type"]) {
    if (!isString(entry[field])) {
      report.add(ERROR, `${base}.${field}`, "schema", `${field} is required and must be a string`,
        `Add a string "${field}" to this entry.`);
    }
  }
  const rq = entry.representativeQueries;
  if (rq !== undefined) {
    if (!Array.isArray(rq) || !rq.every(isString)) {
      report.add(ERROR, `${base}.representativeQueries`, "schema", "representativeQueries must be an array of strings", "");
    } else if (rq.length < 2 || rq.length > 5) {
      report.add(ERROR, `${base}.representativeQueries`, "schema",
        `representativeQueries must contain between 2 and 5 items (found ${rq.length})`,
        "Provide 2-5 natural-language sample queries.");
    }
  }
  for (const arrField of ["tags", "capabilities"]) {
    const v = entry[arrField];
    if (v !== undefined && (!Array.isArray(v) || !v.every(isString))) {
      report.add(ERROR, `${base}.${arrField}`, "schema", `${arrField} must be an array of strings`, "");
    }
  }
  if ("url" in entry && !isString(entry.url)) {
    report.add(ERROR, `${base}.url`, "schema", "url must be a string", "");
  }
  if ("data" in entry && !isObject(entry.data)) {
    report.add(ERROR, `${base}.data`, "schema", "data must be an object", "");
  }
  if ("metadata" in entry) {
    if (!isObject(entry.metadata)) {
      report.add(ERROR, `${base}.metadata`, "schema", "metadata must be an object", "");
    } else {
      for (const [k, v] of Object.entries(entry.metadata)) {
        if (!(v === null || ["string", "number", "boolean"].includes(typeof v))) {
          report.add(ERROR, `${base}.metadata.${k}`, "schema", "metadata values must be string, number, boolean, or null", "");
        }
      }
    }
  }
  if ("trustManifest" in entry) structuralTrust(entry.trustManifest, report, `${base}.trustManifest`);
}

function structuralTrust(tm, report, base) {
  if (!isObject(tm)) {
    report.add(ERROR, base, "schema", "trustManifest must be an object", "");
    return;
  }
  if (!isString(tm.identity)) {
    report.add(ERROR, `${base}.identity`, "schema", "trustManifest.identity is required",
      "Add an identity (e.g. spiffe://domain/..., did:web:domain, or an https URI).");
  }
  if (tm.identityType !== undefined && !IDENTITY_TYPES.has(tm.identityType)) {
    report.add(ERROR, `${base}.identityType`, "schema", "identityType must be one of spiffe, did, https, other", "");
  }
  if (tm.attestations !== undefined) {
    if (!Array.isArray(tm.attestations)) {
      report.add(ERROR, `${base}.attestations`, "schema", "attestations must be an array", "");
    } else {
      tm.attestations.forEach((att, j) => {
        const ab = `${base}.attestations[${j}]`;
        if (!isObject(att)) {
          report.add(ERROR, ab, "schema", "attestation must be an object", "");
          return;
        }
        for (const field of ["type", "uri", "mediaType"]) {
          if (!(field in att)) {
            report.add(ERROR, `${ab}.${field}`, "schema", `'${field}' is a required property`,
              field === "mediaType"
                ? 'Add "mediaType" (e.g. "application/pdf" or "application/json"). The schema requires it even though the prose spec table omits it.'
                : `Add the required "${field}".`);
          }
        }
      });
    }
  }
  if (tm.provenance !== undefined) {
    if (!Array.isArray(tm.provenance)) {
      report.add(ERROR, `${base}.provenance`, "schema", "provenance must be an array", "");
    } else {
      tm.provenance.forEach((pv, j) => {
        const pb = `${base}.provenance[${j}]`;
        if (!isObject(pv)) {
          report.add(ERROR, pb, "schema", "provenance link must be an object", "");
          return;
        }
        if (!PROVENANCE_RELATIONS.has(pv.relation)) {
          report.add(ERROR, `${pb}.relation`, "schema", "relation must be one of derivedFrom, publishedFrom, copiedFrom", "");
        }
        if (!isString(pv.sourceId)) {
          report.add(ERROR, `${pb}.sourceId`, "schema", "sourceId is required", "");
        }
      });
    }
  }
  for (const key of Object.keys(tm)) {
    if (!TRUST_KEYS.has(key)) {
      report.add(ERROR, `${base}.${key}`, "schema", `unknown trustManifest property '${key}' (additionalProperties is false)`,
        `Remove '${key}'. Allowed keys: identity, identityType, trustSchema, attestations, provenance, signature.`);
    }
  }
}

// --------------------------------------------------------------------------- //
// Layer 2: ARD semantic checks
// --------------------------------------------------------------------------- //
function domainOfIdentity(identity) {
  if (!isString(identity)) return null;
  if (identity.startsWith("spiffe://")) return identity.slice("spiffe://".length).split("/", 1)[0] || null;
  if (identity.startsWith("did:web:")) return identity.slice("did:web:".length).split(":", 1)[0] || null;
  if (identity.startsWith("https://") || identity.startsWith("http://")) {
    try { return new URL(identity).hostname || null; } catch { return null; }
  }
  return null;
}
function domainsAligned(publisher, idDomain) {
  const p = publisher.toLowerCase().replace(/\.+$/, "");
  const d = idDomain.toLowerCase().replace(/\.+$/, "");
  return p === d || p.endsWith("." + d) || d.endsWith("." + p);
}
function hostnameOf(url) {
  try { return new URL(url).hostname; } catch { return ""; }
}

function checkEntry(entry, base, report) {
  if (!isObject(entry)) return;
  const identifier = entry.identifier;

  // URN identity rules
  if (isString(identifier)) {
    if (identifier.startsWith("urn:ai:") && !identifier.startsWith("urn:air:")) {
      report.add(ERROR, `${base}.identifier`, "urn-wrong-nid",
        "identifier uses 'urn:ai:' but the authoritative schema requires 'urn:air:' (NID 'air' = Agentic Resource discovery). Some older docs show 'urn:ai:' - that is incorrect.",
        `Change the prefix to 'urn:air:' -> ${identifier.replace(/^urn:ai:/, "urn:air:")}`);
    } else if (!URN_RE.test(identifier)) {
      report.add(ERROR, `${base}.identifier`, "urn-format",
        "identifier must match urn:air:<publisher>:<namespace?>:<agent-name> (pattern ^urn:air:[a-zA-Z0-9.-]+(:[a-zA-Z0-9._-]+)+$)",
        "Use the form urn:air:acme.com:finance:tax-agent (verifiable FQDN publisher, then optional namespace, then a short agent name).");
    } else {
      const segments = identifier.split(":"); // urn, air, publisher, ...rest
      const publisher = segments[2];
      if (publisher === "localhost") {
        report.add(WARN, `${base}.identifier`, "urn-localhost",
          "publisher 'localhost' is an anti-pattern: it is not globally unique or verifiable. Use a placeholder FQDN such as 'agent.localhost' or 'example.com' for local dev.",
          "Replace the publisher with agent.localhost (local) or your real domain (published).");
      } else if (!publisher.includes(".")) {
        report.add(WARN, `${base}.identifier`, "urn-publisher-fqdn",
          `publisher '${publisher}' is not a fully qualified domain name. The publisher segment should be a verifiable FQDN (e.g. acme.com, github.com) so trust can be anchored in DNS.`,
          "Use a domain you control (acme.com), a namespace host (github.com:you), or a reserved placeholder (example.com).");
      }
      if (segments.length < 5) {
        report.add(INFO, `${base}.identifier`, "urn-no-namespace",
          "identifier has no <namespace> segment between publisher and agent-name. This is allowed, but namespaces (e.g. finance:trading) help organize larger catalogs.",
          "Optionally insert a namespace: urn:air:<publisher>:<namespace>:<agent-name>.");
      }
    }
  }

  // Strict Value-or-Reference
  const hasUrl = "url" in entry;
  const hasData = "data" in entry;
  if (hasUrl && hasData) {
    report.add(ERROR, base, "value-or-reference",
      "entry contains BOTH 'url' and 'data'; exactly one is allowed (ARD sec 3.4 Strict Value-or-Reference).",
      "Keep 'url' for a remote artifact OR 'data' for an inline document - delete the other.");
  } else if (!hasUrl && !hasData) {
    report.add(ERROR, base, "value-or-reference",
      "entry contains NEITHER 'url' nor 'data'; exactly one is required (ARD sec 3.4).",
      "Add a 'url' pointing to the artifact, or inline the artifact under 'data'.");
  }

  // url hygiene
  if (isString(entry.url)) {
    const host = hostnameOf(entry.url);
    if (entry.url.startsWith("http://") && !["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) {
      report.add(WARN, `${base}.url`, "url-not-https",
        "url is plain http://. Published manifests must be served over HTTPS; http is acceptable only for local development endpoints.",
        "Serve the artifact over https://.");
    }
  }

  // type / media-type
  const mtype = entry.type;
  if (isString(mtype) && !mtype.includes("/")) {
    report.add(WARN, `${base}.type`, "type-not-media-type",
      `type '${mtype}' is not an IANA media type. Expected something like application/mcp-server-card+json, application/a2a-agent-card+json, or application/ai-skill.`,
      "Set type to an IANA media type describing the wrapped artifact.");
  }

  // representativeQueries advice
  if (!("representativeQueries" in entry) && isString(mtype) && (mtype.includes("agent-card") || mtype.includes("mcp-server"))) {
    report.add(INFO, base, "missing-representative-queries",
      "no representativeQueries. Registries use 2-5 sample queries to build semantic search ranking; adding them greatly improves how discoverable this entry is.",
      'Add "representativeQueries": ["...", "..."] with 2-5 realistic user phrasings.');
  }

  // updatedAt parse
  if (isString(entry.updatedAt)) {
    const iso = entry.updatedAt.replace("Z", "+00:00");
    if (Number.isNaN(Date.parse(iso)) && Number.isNaN(Date.parse(entry.updatedAt))) {
      report.add(WARN, `${base}.updatedAt`, "updatedat-format",
        `updatedAt '${entry.updatedAt}' is not a parseable ISO 8601 / date-time value.`,
        "Use an ISO 8601 timestamp, e.g. 2026-05-28T12:00:00Z.");
    }
  }

  // trust-domain alignment
  const tm = entry.trustManifest;
  if (isObject(tm) && isString(identifier) && URN_RE.test(identifier)) {
    const publisher = identifier.split(":")[2];
    const idomain = domainOfIdentity(tm.identity || "");
    if (idomain && !domainsAligned(publisher, idomain)) {
      report.add(WARN, `${base}.trustManifest.identity`, "trust-domain-mismatch",
        `trustManifest identity domain '${idomain}' does not align with the URN publisher '${publisher}'. The authority domain in the identity SHOULD match the publisher so a registry can verify the publisher actually controls this identity.`,
        `Use an identity anchored to ${publisher} (or correct the publisher).`);
    }
  }
}

function semanticManifest(doc, report, base = "") {
  if (!isObject(doc)) return;
  const entries = doc.entries;
  if (Array.isArray(entries)) {
    if (entries.length === 0) {
      report.add(WARN, base ? `${base}entries` : "entries", "empty-entries",
        "entries is empty. A catalog SHOULD advertise at least one agentic resource.",
        "Add at least one entry, or remove the empty catalog.");
    }
    const seen = new Map();
    entries.forEach((entry, i) => {
      const ebase = `${base}entries[${i}]`;
      if (!isObject(entry)) return;
      const ident = entry.identifier;
      if (isString(ident)) {
        if (seen.has(ident)) {
          report.add(ERROR, `${ebase}.identifier`, "duplicate-identifier",
            `duplicate identifier '${ident}' (also at entries[${seen.get(ident)}]). Identifiers are the primary key for discovery and MUST be unique within a catalog.`,
            "Give each entry a distinct identifier (vary the namespace or agent-name segment).");
        } else {
          seen.set(ident, i);
        }
      }
      checkEntry(entry, ebase, report);
      // Recurse into embedded sub-catalogs (application/ai-catalog+json with inline data).
      if (isObject(entry.data) && isString(entry.type) && entry.type.includes("ai-catalog")) {
        validateInto(entry.data, report, `${ebase}.data.`);
      }
    });
  }
}

function validateInto(doc, report, base) {
  structuralManifest(doc, report, base);
  semanticManifest(doc, report, base);
}

/**
 * Validate a parsed ai-catalog manifest object.
 * @returns {{ok:boolean, counts:{error:number,warning:number,info:number}, findings:Array}}
 */
export function validateCatalog(doc) {
  const report = new Report();
  validateInto(doc, report, "");
  const order = { ERROR: 0, WARN: 1, INFO: 2 };
  report.findings.sort((a, b) => order[a.level] - order[b.level] || a.path.localeCompare(b.path));
  return {
    ok: report.count(ERROR) === 0,
    counts: { error: report.count(ERROR), warning: report.count(WARN), info: report.count(INFO) },
    findings: report.findings,
  };
}

// Allow `node ard-validator.js <file>` (or .mjs) for quick CLI / parity testing.
const __isCli = typeof process !== "undefined" && Array.isArray(process.argv) &&
  process.argv[1] && /ard-validator\.(m?js)$/.test(process.argv[1].replace(/\\/g, "/"));
if (__isCli) {
  const fs = await import("node:fs");
  const file = process.argv[2];
  if (!file) {
    console.error("usage: node ard-validator.js <manifest.json>");
    process.exit(2);
  }
  const result = validateCatalog(JSON.parse(fs.readFileSync(file, "utf-8")));
  for (const f of result.findings) console.log(`${f.level.padEnd(5)} ${f.path}: ${f.message}`);
  console.log(`\nResult: ${result.ok ? "PASS" : "FAIL"} - ${result.counts.error} error(s), ${result.counts.warning} warning(s), ${result.counts.info} info`);
  process.exit(result.ok ? 0 : 1);
}
