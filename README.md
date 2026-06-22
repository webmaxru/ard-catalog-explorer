# ARD Catalog Explorer

A **static** single-page app that explores and **strictly validates** any
[Agentic Resource Discovery (ARD)](https://github.com/ards-project) catalog.

Enter a hostname → the app fetches `https://<host>/.well-known/ai-catalog.json` directly in
your browser, lists the host and its resources, and reports every deviation from the ARD
specification with a **concrete suggested fix**. It runs entirely client-side — no backend.

## Features
- **Discover by hostname** — type `acme.com` (or a full catalog URL) and explore.
- **Resource listing** — host info plus a card per entry: identifier, media type, endpoint
  (`url`/inline `data`), description, tags, capabilities, representative queries, and trust manifest.
- **Strict conformance** — full structural validation (JSON Schema rules) **plus** ARD semantic
  rules: `urn:air:` format, the `urn:ai:`→`urn:air:` mistake, Strict Value-or-Reference, duplicate
  identifiers, trust-domain alignment, HTTPS hygiene, the `localhost` anti-pattern, and more —
  each with a suggested fix.
- **Per-entry error/warning badges** and a filterable findings panel (ERROR / WARN / INFO).
- **CORS-aware** — a conformant ARD catalog must send `Access-Control-Allow-Origin: *`; when a host
  doesn't, the app explains why and offers a **paste-JSON** fallback.
- **Built-in samples** (valid + broken) that work with no network.

## Validation engine
`assets/ard-validator.js` is a faithful browser port of the **ard-registry-builder** skill's
`validate_catalog.py`. It emits the same finding `code`s and severities, verified for parity
against the skill's templates and fixtures. The rules are documented in the skill's
`references/validation-rules.md`.

## Run locally
It's plain static files — serve the folder any way you like:

```bash
# Azure Static Web Apps CLI (recommended; mirrors production)
swa start .

# or any static server
npx --yes http-server . -p 8080
```

Then open the printed URL. You can also deep-link: `?host=example.com`.

## Deploy to Azure Static Web Apps (Free tier)

### One-shot deploy from the CLI
```bash
az group create -n rg-ard-explorer -l westeurope
az staticwebapp create -n ard-catalog-explorer -g rg-ard-explorer -l westeurope --sku Free
TOKEN=$(az staticwebapp secrets list -n ard-catalog-explorer -g rg-ard-explorer --query "properties.apiKey" -o tsv)
swa deploy . --deployment-token "$TOKEN" --env production
```

### Continuous deployment (GitHub Actions)
`.github/workflows/azure-static-web-apps.yml` deploys on every push to `main`. Add the deployment
token as a repository secret named `AZURE_STATIC_WEB_APPS_API_TOKEN`:

```bash
gh secret set AZURE_STATIC_WEB_APPS_API_TOKEN -b "$TOKEN"
```

The site is a no-build static app, so the workflow uses `skip_app_build: true` with
`app_location: "/"`.
