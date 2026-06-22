# Infrastructure (Azure Static Web App)

Infrastructure-as-Code for the ARD Catalog Explorer. The app is a no-build static site deployed
to **Azure Static Web Apps (Free)**; content is pushed with a deployment token (GitHub Actions or
the `swa` CLI), so the SWA is provisioned in "bring your own pipeline" mode.

## Files
| File | Purpose |
| :-- | :-- |
| `main.bicep` | The Static Web App (Free) + optional custom-domain binding. |
| `main.bicepparam` | Declarative parameters for `main.bicep`. |
| `deploy.ps1` / `deploy.sh` | Idempotently provision/update the SWA and print the deployment token. |
| `bind-custom-domain.ps1` | Bind a custom domain via CNAME delegation, with a DNS preflight. |

## Provision

```bash
# from this folder, logged in with `az login`
az group create -n rg-ard-explorer -l westeurope
az deployment group create -g rg-ard-explorer -f main.bicep -p main.bicepparam
# …or simply:
pwsh ./deploy.ps1          # Windows / pwsh
./deploy.sh                # bash
```

Outputs include `defaultHostname` (e.g. `delightful-tree-0725d2503.7.azurestaticapps.net`) — the
target for your DNS CNAME — and the deployment token for the `AZURE_STATIC_WEB_APPS_API_TOKEN`
GitHub secret.

## Custom domain: `ard-explorer.isainative.dev`

Azure Static Web Apps validates a **subdomain** with the `cname-delegation` method: the domain is
proven (and routed) by a CNAME that points at the SWA default hostname. Order matters — create the
DNS record **first**, then bind.

### Step 1 — Configure Cloudflare (DNS for `isainative.dev`)
In the Cloudflare dashboard → **DNS → Records**, add:

| Field | Value |
| :-- | :-- |
| **Type** | `CNAME` |
| **Name** | `ard-explorer` |
| **Target** | `<defaultHostname>` (e.g. `delightful-tree-0725d2503.7.azurestaticapps.net`) |
| **Proxy status** | **DNS only (grey cloud)** — important, see below |
| **TTL** | Auto |

Why **DNS only**:
- With the orange-cloud **proxy on**, the name resolves to Cloudflare's IPs, not the SWA host. That
  breaks Azure's `cname-delegation` ownership check **and** the managed-certificate (ACME) issuance,
  which needs the domain to reach Azure directly.
- `.dev` is on the **HSTS preload list**, so the domain is HTTPS-only in browsers. Azure issues and
  renews a free managed certificate once the domain is bound — but only if traffic reaches Azure,
  i.e. DNS-only.

If you later want Cloudflare's proxy/CDN/WAF in front, switch the record to proxied **after** the
Azure certificate is `Ready`, and set Cloudflare **SSL/TLS mode = Full (strict)**. Leave it DNS-only
for setup.

> Do **not** also create a Cloudflare “Redirect Rule” or “Page Rule” for this host during setup; let
> Azure terminate TLS. No `A`/`AAAA` record is needed — the CNAME is sufficient for a subdomain.

### Step 2 — Bind the domain in Azure
After the CNAME has propagated (check with `nslookup ard-explorer.isainative.dev`):

```bash
pwsh ./bind-custom-domain.ps1 -Domain ard-explorer.isainative.dev
# or declaratively, via Bicep:
az deployment group create -g rg-ard-explorer -f main.bicep \
  -p name=ard-catalog-explorer location=westeurope sku=Free customDomain=ard-explorer.isainative.dev
# or via the CLI directly:
az staticwebapp hostname set -n ard-catalog-explorer -g rg-ard-explorer \
  --hostname ard-explorer.isainative.dev --validation-method cname-delegation
```

Azure moves the domain to `Validating` → `Ready` and provisions the certificate (usually a few
minutes). Then `https://ard-explorer.isainative.dev` serves the app.

### CI alternative
The **Provision infrastructure** GitHub workflow (`.github/workflows/infra.yml`) can do the bind:
run it via *workflow_dispatch* with the `customDomain` input set (after the Cloudflare CNAME exists).
It requires the Azure OIDC secrets described in the root `README.md`.
