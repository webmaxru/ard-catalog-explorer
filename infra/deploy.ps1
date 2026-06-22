<#
.SYNOPSIS
  Provision (or update) the ARD Catalog Explorer Static Web App from Bicep, idempotently.

.EXAMPLE
  ./deploy.ps1
  ./deploy.ps1 -ResourceGroup rg-ard-explorer -Location westeurope -CustomDomain ard-explorer.isainative.dev
#>
[CmdletBinding()]
param(
  [string]$ResourceGroup = 'rg-ard-explorer',
  [string]$Location = 'westeurope',
  [string]$Name = 'ard-catalog-explorer',
  [string]$CustomDomain = ''
)
$ErrorActionPreference = 'Stop'
$bicep = Join-Path $PSScriptRoot 'main.bicep'

Write-Host "==> Ensuring resource group '$ResourceGroup' in '$Location'"
az group create -n $ResourceGroup -l $Location -o none

Write-Host "==> Deploying Bicep (name=$Name, sku=Free, customDomain='$CustomDomain')"
az deployment group create `
  -g $ResourceGroup `
  -f $bicep `
  -p name=$Name location=$Location sku=Free customDomain=$CustomDomain `
  -o none

$swaHost = az staticwebapp show -n $Name -g $ResourceGroup --query defaultHostname -o tsv
Write-Host ""
Write-Host "Default hostname : $swaHost"
Write-Host "Live URL         : https://$swaHost"
Write-Host ""
Write-Host "Deployment token (store as GitHub secret AZURE_STATIC_WEB_APPS_API_TOKEN):"
az staticwebapp secrets list -n $Name -g $ResourceGroup --query properties.apiKey -o tsv
Write-Host ""
Write-Host "Next: push to main (GitHub Actions deploys site/) or run from repo root:"
Write-Host "  swa deploy ./site --deployment-token <token> --env production"
