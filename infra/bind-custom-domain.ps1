<#
.SYNOPSIS
  Bind a custom domain to the Static Web App using CNAME delegation, with a DNS preflight check.

.DESCRIPTION
  Run this AFTER you have created the Cloudflare CNAME record (DNS only / grey cloud) pointing the
  subdomain at the SWA default hostname. Azure validates ownership via that CNAME and issues a free
  managed TLS certificate.

.EXAMPLE
  ./bind-custom-domain.ps1 -Domain ard-explorer.isainative.dev
  ./bind-custom-domain.ps1 -Domain ard-explorer.isainative.dev -Force
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$Domain,
  [string]$ResourceGroup = 'rg-ard-explorer',
  [string]$Name = 'ard-catalog-explorer',
  [switch]$Force
)
$ErrorActionPreference = 'Stop'

$swaHost = az staticwebapp show -n $Name -g $ResourceGroup --query defaultHostname -o tsv
$label = $Domain.Split('.')[0]
Write-Host "SWA default hostname : $swaHost"
Write-Host "Expected Cloudflare record: CNAME  $label  ->  $swaHost   (Proxy status: DNS only)"
Write-Host ""

# DNS preflight
$resolved = $null
try {
  $resolved = (Resolve-DnsName -Name $Domain -Type CNAME -ErrorAction Stop |
    Where-Object { $_.Type -eq 'CNAME' } | Select-Object -First 1).NameHost
} catch { }

if ($resolved -ne $swaHost) {
  Write-Warning "DNS preflight FAILED: '$Domain' currently resolves its CNAME to '$resolved' (expected '$swaHost')."
  Write-Warning "Create/fix the Cloudflare CNAME (DNS only) and allow it to propagate, then re-run."
  if (-not $Force) {
    Write-Host "Re-run with -Force to attempt binding anyway."
    exit 1
  }
} else {
  Write-Host "DNS preflight OK: CNAME resolves to the SWA hostname."
}

Write-Host "==> Binding $Domain via cname-delegation (Azure issues a managed certificate)..."
az staticwebapp hostname set -n $Name -g $ResourceGroup --hostname $Domain --validation-method cname-delegation

az staticwebapp hostname show -n $Name -g $ResourceGroup --hostname $Domain `
  --query '{domain:domainName, status:status, createdOn:createdOn}' -o jsonc
Write-Host "If status is not yet 'Ready', certificate issuance is still in progress; re-check in a few minutes."
