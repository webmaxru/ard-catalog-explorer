# ARD Catalog Explorer

A **static** single-page app that explores and **strictly validates** any
[Agentic Resource Discovery (ARD)](https://github.com/ards-project) catalog. Enter a hostname → it
fetches `https://<host>/.well-known/ai-catalog.json` in your browser, lists the resources, and
reports every deviation from the ARD specification with a concrete **suggested fix**. No backend.

**Live:** https://delightful-tree-0725d2503.7.azurestaticapps.net

## Repository layout
```
.
├─ site/                       # the static web app (deployed; app_location = "site")
│  ├─ index.html
│  ├─ assets/{app.js, ard-validator.js, styles.css}
│  └─ staticwebapp.config.json
├─ infra/                      # Azure IaC (Bicep) + deploy / domain scripts  → see infra/README.md
├─ tests/                      # self-contained unit tests for the validator
├─ package.json                # `npm test` → node --test
└─ .github/workflows/
   ├─ deploy.yml               # test → deploy site to Azure Static Web Apps
   └─ infra.yml                # provision/update Azure infrastructure (Bicep, via OIDC)
```

The validation engine (`site/assets/ard-validator.js`) is a faithful browser port of the
**ard-registry-builder** skill's `validate_catalog.py` — same finding codes and severities, plus a
suggested fix per finding.

## Local development
```bash
npm test                       # run the validator unit tests
swa start ./site               # serve like production (Azure SWA CLI)
# or: npx http-server ./site -p 8080
```

## Deploy

### Infrastructure (once)
See [`infra/README.md`](infra/README.md). In short:
```bash
az login
pwsh infra/deploy.ps1          # creates rg-ard-explorer + the Free Static Web App; prints the token
```

### Content
- **CI (recommended):** push to `main` → `deploy.yml` runs the tests, then deploys `site/`.
- **Manual:** `swa deploy ./site --deployment-token <token> --env production`.

## CI/CD

`deploy.yml` (content) and `infra.yml` (infrastructure) form the pipeline.

**Secrets / variables to configure** (`gh secret set <NAME> -R <owner/repo>`):

| Name | Used by | Notes |
| :-- | :-- | :-- |
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | `deploy.yml` | SWA deployment token (`infra/deploy.ps1` prints it). |
| `AZURE_CLIENT_ID` | `infra.yml` | App registration (OIDC) client id. |
| `AZURE_TENANT_ID` | `infra.yml` | Entra tenant id. |
| `AZURE_SUBSCRIPTION_ID` | `infra.yml` | Target subscription. |

`infra.yml` authenticates to Azure with **OIDC** (federated credentials — no stored Azure password).
Create the identity once:
```bash
az ad app create --display-name ard-explorer-github-oidc
# create a service principal, add a federated credential for
#   subject: repo:<owner>/<repo>:ref:refs/heads/main
# and grant it Contributor on rg-ard-explorer; then set the three AZURE_* secrets above.
```

## Custom domain
`ard-explorer.isainative.dev` is bound via CNAME delegation. The DNS record lives in **Cloudflare**;
the full, copy-pasteable steps (record values, the DNS-only/`.dev` HSTS caveats, and the bind
command) are in [`infra/README.md`](infra/README.md#custom-domain-ard-explorerisainativedev).
