// app.js — ARD Catalog Explorer orchestration (fetch, CORS handling, render).
import { validateCatalog } from "./ard-validator.js";

const $ = (id) => document.getElementById(id);
const refs = {
  form: $("explore-form"), host: $("host-input"), exploreBtn: $("explore-btn"),
  togglePaste: $("toggle-paste"), pasteSection: $("paste-section"), pasteInput: $("paste-input"), pasteBtn: $("paste-btn"),
  status: $("status"), spinner: $("status-spinner"), verdict: $("verdict"), counts: $("counts"), source: $("status-source"),
  hostSection: $("host-section"), hostCard: $("host-card"),
  entriesSection: $("entries-section"), entriesGrid: $("entries-grid"), entriesCount: $("entries-count"), entriesEmpty: $("entries-empty"),
  findingsSection: $("findings-section"), findingsList: $("findings-list"), findingsEmpty: $("findings-empty"), filters: $("finding-filters"),
};

// ---------- tiny DOM helper (textContent-only => XSS-safe with remote data) ----------
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}
const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); };

// ---------- input -> well-known URL ----------
function buildCatalogUrl(raw) {
  let s = (raw || "").trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (u.pathname && u.pathname !== "/" ) return u.toString();   // explicit path/file => respect it
  u.pathname = "/.well-known/ai-catalog.json";
  return u.toString();
}

// ---------- transport findings (CORS / status / content-type / JSON) ----------
function tf(level, code, message, suggestion) {
  return { level, path: "(fetch)", code, message, suggestion };
}

async function fetchCatalog(url) {
  let resp;
  try {
    resp = await fetch(url, { headers: { Accept: "application/json" }, redirect: "follow" });
  } catch (e) {
    return { doc: null, findings: [tf("ERROR", "fetch-failed",
      "The browser could not fetch the catalog. This is almost always a missing CORS header, an unreachable host, or no file at the well-known path.",
      "A conformant ARD catalog MUST be served over HTTPS with 'Access-Control-Allow-Origin: *'. Verify the file exists at /.well-known/ai-catalog.json and sends that header. If it isn't your host, use ‘Paste JSON’ below.")] };
  }
  const findings = [];
  if (!resp.ok) {
    findings.push(tf("ERROR", "http-status",
      `The host returned HTTP ${resp.status} ${resp.statusText} for the catalog URL.`,
      resp.status === 404
        ? "Publish the manifest at https://<domain>/.well-known/ai-catalog.json (or point the input directly at its URL)."
        : "Ensure the catalog URL resolves to a publicly readable JSON document."));
    return { doc: null, findings };
  }
  const ctype = (resp.headers.get("content-type") || "").toLowerCase();
  if (!ctype.includes("json")) {
    findings.push(tf("WARN", "content-type",
      `The catalog was served with Content-Type '${ctype || "(none)"}', not application/json.`,
      "Configure your host to serve the manifest as 'Content-Type: application/json'."));
  }
  const text = await resp.text();
  let doc;
  try { doc = JSON.parse(text); }
  catch (e) {
    findings.push(tf("ERROR", "invalid-json",
      `The document is not valid JSON: ${e.message}`,
      "Fix the JSON syntax (a linter or 'jq' will pinpoint the location)."));
    return { doc: null, findings };
  }
  return { doc, findings };
}

// ---------- render ----------
const LEVEL_CLASS = { ERROR: "error", WARN: "warn", INFO: "info" };

function setStatus({ loading = false, sourceLabel = "", combined = null, hasDoc = true } = {}) {
  refs.status.classList.remove("hidden");
  refs.spinner.classList.toggle("hidden", !loading);
  clear(refs.counts);
  if (loading) {
    refs.verdict.className = "verdict";
    refs.verdict.textContent = "Fetching…";
    refs.source.textContent = sourceLabel;
    return;
  }
  const c = combined.counts;
  if (!hasDoc) {
    refs.verdict.className = "verdict bad";
    refs.verdict.textContent = "Could not read catalog";
  } else if (c.error > 0) {
    refs.verdict.className = "verdict bad";
    refs.verdict.textContent = "✗ Not conformant";
  } else if (c.warning > 0) {
    refs.verdict.className = "verdict warn";
    refs.verdict.textContent = "Conformant with warnings";
  } else {
    refs.verdict.className = "verdict ok";
    refs.verdict.textContent = "✓ Strictly conformant";
  }
  const mk = (n, cls, label) => n > 0 ? el("span", { class: `badge ${cls}`, text: `${n} ${label}${n > 1 ? "s" : ""}` }) : null;
  [mk(c.error, "error", "error"), mk(c.warning, "warn", "warning"), mk(c.info, "info", "info"),
   (c.error + c.warning + c.info === 0 && hasDoc) ? el("span", { class: "badge ok", text: "0 issues" }) : null]
    .filter(Boolean).forEach((b) => refs.counts.appendChild(b));
  refs.source.appendChild(el("span", {}, sourceLabel ? [el("code", { text: sourceLabel })] : []));
}

function renderHost(host) {
  if (!host || typeof host !== "object") { refs.hostSection.classList.add("hidden"); return; }
  refs.hostSection.classList.remove("hidden");
  clear(refs.hostCard);
  refs.hostCard.appendChild(el("h3", { text: host.displayName || "(missing displayName)" }));
  const dl = el("dl", { class: "kv" });
  const row = (label, value, mono = false) => {
    if (value == null || value === "") return;
    dl.appendChild(el("dt", { text: label }));
    dl.appendChild(el("dd", {}, [mono ? el("code", { text: String(value) }) : String(value)]));
  };
  row("identifier", host.identifier, true);
  if (host.documentationUrl) { dl.appendChild(el("dt", { text: "docs" })); dl.appendChild(el("dd", {}, [safeLink(host.documentationUrl)])); }
  if (host.logoUrl) { dl.appendChild(el("dt", { text: "logo" })); dl.appendChild(el("dd", {}, [safeLink(host.logoUrl)])); }
  if (host.trustManifest && host.trustManifest.identity) row("trust identity", host.trustManifest.identity, true);
  refs.hostCard.appendChild(dl);
}

function safeLink(url) {
  if (typeof url === "string" && /^https?:\/\//i.test(url)) {
    return el("a", { href: url, target: "_blank", rel: "noopener noreferrer", text: url });
  }
  return document.createTextNode(String(url ?? ""));
}

function entryFindingCounts(findings, i) {
  const prefix = `entries[${i}]`;
  let error = 0, warn = 0;
  for (const f of findings) {
    if (f.path === prefix || f.path.startsWith(prefix + ".") || f.path.startsWith(prefix + " ")) {
      if (f.level === "ERROR") error++; else if (f.level === "WARN") warn++;
    }
  }
  return { error, warn };
}

function renderEntries(entries, findings) {
  if (!Array.isArray(entries)) { refs.entriesSection.classList.add("hidden"); return; }
  refs.entriesSection.classList.remove("hidden");
  refs.entriesCount.textContent = `(${entries.length})`;
  clear(refs.entriesGrid);
  refs.entriesEmpty.classList.toggle("hidden", entries.length > 0);

  entries.forEach((entry, i) => {
    const e = (entry && typeof entry === "object") ? entry : {};
    const fc = entryFindingCounts(findings, i);
    const card = el("div", { class: "entry" + (fc.error ? " has-error" : fc.warn ? " has-warn" : "") });

    const top = el("div", { class: "entry-top" }, [
      el("h3", { class: "entry-title", text: e.displayName || "(missing displayName)" }),
      e.type ? el("span", { class: "entry-type", text: String(e.type) }) : null,
    ]);
    card.appendChild(top);

    if (fc.error || fc.warn) {
      const flags = el("div", { class: "entry-flags" });
      if (fc.error) flags.appendChild(el("span", { class: "badge error", text: `${fc.error} error${fc.error > 1 ? "s" : ""}` }));
      if (fc.warn) flags.appendChild(el("span", { class: "badge warn", text: `${fc.warn} warning${fc.warn > 1 ? "s" : ""}` }));
      card.appendChild(flags);
    }

    card.appendChild(el("div", { class: "entry-id", text: e.identifier || "(missing identifier)" }));

    if (e.description) card.appendChild(el("p", { class: "entry-desc", text: String(e.description) }));

    // location: url or inline data
    const loc = el("div", { class: "entry-loc" });
    if (typeof e.url === "string") loc.appendChild(safeLink(e.url));
    else if (e.data && typeof e.data === "object") loc.appendChild(el("span", { class: "inline-tag", text: "inline data" }));
    else loc.appendChild(el("span", { class: "inline-tag", text: "no url / data" }));
    card.appendChild(loc);

    // tags + capabilities
    const chipWrap = el("div", { class: "chips" });
    (Array.isArray(e.tags) ? e.tags : []).forEach((t) => chipWrap.appendChild(el("span", { class: "tag", text: String(t) })));
    (Array.isArray(e.capabilities) ? e.capabilities : []).forEach((t) => chipWrap.appendChild(el("span", { class: "tag cap", text: String(t) })));
    if (chipWrap.childNodes.length) card.appendChild(chipWrap);

    // representative queries
    if (Array.isArray(e.representativeQueries) && e.representativeQueries.length) {
      card.appendChild(el("div", { class: "section-label", text: "representative queries" }));
      const ul = el("ul", { class: "rq" });
      e.representativeQueries.forEach((q) => ul.appendChild(el("li", { text: String(q) })));
      card.appendChild(ul);
    }

    // trust summary
    if (e.trustManifest && typeof e.trustManifest === "object") {
      const tm = e.trustManifest;
      const atts = Array.isArray(tm.attestations) ? tm.attestations.map((a) => a && a.type).filter(Boolean) : [];
      const trust = el("div", { class: "entry-trust" }, [
        "🔐 ", el("code", { text: String(tm.identity || "(no identity)") }),
        atts.length ? ` · ${atts.join(", ")}` : "",
      ]);
      card.appendChild(trust);
    }

    refs.entriesGrid.appendChild(card);
  });
}

let activeFilters = { ERROR: true, WARN: true, INFO: true };

function renderFindings(findings) {
  refs.findingsSection.classList.remove("hidden");
  const total = findings.length;
  refs.findingsEmpty.classList.toggle("hidden", total > 0);

  // filter buttons
  clear(refs.filters);
  for (const level of ["ERROR", "WARN", "INFO"]) {
    const n = findings.filter((f) => f.level === level).length;
    const btn = el("button", { class: "filter-btn", type: "button", "data-level": level,
      "aria-pressed": String(activeFilters[level]), text: `${level} ${n}` });
    btn.addEventListener("click", () => {
      activeFilters[level] = !activeFilters[level];
      btn.setAttribute("aria-pressed", String(activeFilters[level]));
      paint();
    });
    refs.filters.appendChild(btn);
  }

  const paint = () => {
    clear(refs.findingsList);
    findings.filter((f) => activeFilters[f.level]).forEach((f) => {
      const item = el("div", { class: `finding ${LEVEL_CLASS[f.level]}` });
      item.appendChild(el("div", { class: "finding-head" }, [
        el("span", { class: `badge ${LEVEL_CLASS[f.level]}`, text: f.level }),
        el("span", { class: "finding-path", text: f.path }),
        el("span", { class: "finding-code", text: f.code }),
      ]));
      item.appendChild(el("div", { class: "finding-msg", text: f.message }));
      if (f.suggestion) {
        const fix = el("div", { class: "finding-fix" });
        fix.appendChild(el("b", { text: "Fix: " }));
        fix.appendChild(document.createTextNode(f.suggestion));
        item.appendChild(fix);
      }
      refs.findingsList.appendChild(item);
    });
  };
  paint();
}

function combine(transportFindings, validatorResult) {
  const findings = transportFindings.concat(validatorResult ? validatorResult.findings : []);
  const order = { ERROR: 0, WARN: 1, INFO: 2 };
  findings.sort((a, b) => order[a.level] - order[b.level]);
  const counts = {
    error: findings.filter((f) => f.level === "ERROR").length,
    warning: findings.filter((f) => f.level === "WARN").length,
    info: findings.filter((f) => f.level === "INFO").length,
  };
  return { findings, counts, ok: counts.error === 0 };
}

function showResult(doc, transportFindings, sourceLabel) {
  const result = doc ? validateCatalog(doc) : null;
  const combined = combine(transportFindings, result);
  setStatus({ loading: false, sourceLabel, combined, hasDoc: !!doc });
  if (doc) {
    renderHost(doc.host);
    renderEntries(doc.entries, combined.findings);
  } else {
    refs.hostSection.classList.add("hidden");
    refs.entriesSection.classList.add("hidden");
    // no document => offer the paste fallback
    openPaste(true);
  }
  renderFindings(combined.findings);
  refs.status.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ---------- flows ----------
async function explore(rawInput) {
  const url = buildCatalogUrl(rawInput);
  if (!url) { refs.host.focus(); return; }
  refs.exploreBtn.disabled = true;
  setStatus({ loading: true, sourceLabel: url });
  try {
    const { doc, findings } = await fetchCatalog(url);
    showResult(doc, findings, url);
  } finally {
    refs.exploreBtn.disabled = false;
  }
}

function validatePasted() {
  const text = refs.pasteInput.value.trim();
  if (!text) { refs.pasteInput.focus(); return; }
  let doc;
  try { doc = JSON.parse(text); }
  catch (e) {
    showResult(null, [tf("ERROR", "invalid-json", `The pasted text is not valid JSON: ${e.message}`,
      "Fix the JSON syntax and try again.")], "pasted JSON");
    return;
  }
  showResult(doc, [], "pasted JSON");
}

function openPaste(force) {
  const open = force || refs.pasteSection.classList.contains("hidden");
  refs.pasteSection.classList.toggle("hidden", !open);
  refs.togglePaste.setAttribute("aria-expanded", String(open));
}

// ---------- embedded samples (work without network) ----------
const SAMPLE_VALID = {
  specVersion: "1.0",
  host: { displayName: "Acme Dev Tools", identifier: "did:web:acme.com" },
  entries: [
    { identifier: "urn:air:acme.com:weather:telemetry", displayName: "Acme Weather Telemetry Server",
      type: "application/mcp-server-card+json", url: "https://api.acme.com/mcp/weather.json",
      description: "Live weather telemetry MCP server.", capabilities: ["WeatherTool", "ForecastTool"],
      representativeQueries: ["what is the current wind speed in Chicago", "get the 5-day forecast for Seattle"] },
    { identifier: "urn:air:acme.com:travel:concierge", displayName: "Travel Concierge",
      type: "application/a2a-agent-card+json", url: "https://api.acme.com/travel/concierge.json",
      description: "AI-powered travel planning agent.", tags: ["travel", "booking"], version: "2.1.0",
      representativeQueries: ["book me a flight to Tokyo next Friday", "plan a 3-day itinerary in Lisbon"],
      trustManifest: { identity: "spiffe://acme.com/travel/concierge", identityType: "spiffe",
        attestations: [{ type: "SOC2-Type2", uri: "https://trust.acme.com/soc2.pdf", mediaType: "application/pdf" }] } },
  ],
};
const SAMPLE_BROKEN = {
  specVersion: "1.0",
  host: { displayName: "Partnerly" },
  entries: [
    { identifier: "urn:ai:partnerly.io:support:assistant", displayName: "Support Assistant",
      type: "application/a2a-agent-card+json", url: "https://api.partnerly.io/agents/support.json",
      data: { name: "Support Assistant" } },
    { identifier: "urn:air:localhost:billing:reconciler", displayName: "Billing Reconciler",
      type: "mcp-server", representativeQueries: ["reconcile invoices"],
      trustManifest: { identity: "spiffe://other.com/billing", attestations: [{ type: "SOC2-Type2", uri: "https://trust.partnerly.io/soc2.pdf" }] } },
  ],
};

// ---------- wire up ----------
refs.form.addEventListener("submit", (e) => { e.preventDefault(); explore(refs.host.value); });
refs.pasteBtn.addEventListener("click", validatePasted);
refs.togglePaste.addEventListener("click", () => openPaste(false));
document.querySelectorAll("[data-sample]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const sample = btn.dataset.sample === "valid" ? SAMPLE_VALID : SAMPLE_BROKEN;
    showResult(structuredClone(sample), [], `sample: ${btn.dataset.sample} catalog (no network)`);
  });
});
document.querySelectorAll("[data-example]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const host = "ai-catalog.outshift.io";
    refs.host.value = host;
    explore(host);
  });
});

// deep link: ?host=example.com
const params = new URLSearchParams(location.search);
if (params.get("host")) { refs.host.value = params.get("host"); explore(params.get("host")); }
