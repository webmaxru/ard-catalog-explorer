#!/usr/bin/env bash
# Provision (or update) the ARD Catalog Explorer Static Web App from Bicep, idempotently.
#
# Usage:
#   ./deploy.sh
#   RESOURCE_GROUP=rg-ard-explorer LOCATION=westeurope CUSTOM_DOMAIN=ard-explorer.isainative.dev ./deploy.sh
set -euo pipefail

RESOURCE_GROUP="${RESOURCE_GROUP:-rg-ard-explorer}"
LOCATION="${LOCATION:-westeurope}"
NAME="${NAME:-ard-catalog-explorer}"
CUSTOM_DOMAIN="${CUSTOM_DOMAIN:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Ensuring resource group '$RESOURCE_GROUP' in '$LOCATION'"
az group create -n "$RESOURCE_GROUP" -l "$LOCATION" -o none

echo "==> Deploying Bicep (name=$NAME, sku=Free, customDomain='$CUSTOM_DOMAIN')"
az deployment group create \
  -g "$RESOURCE_GROUP" \
  -f "$SCRIPT_DIR/main.bicep" \
  -p name="$NAME" location="$LOCATION" sku=Free customDomain="$CUSTOM_DOMAIN" \
  -o none

SWA_HOST="$(az staticwebapp show -n "$NAME" -g "$RESOURCE_GROUP" --query defaultHostname -o tsv)"
echo
echo "Default hostname : $SWA_HOST"
echo "Live URL         : https://$SWA_HOST"
echo
echo "Deployment token (store as GitHub secret AZURE_STATIC_WEB_APPS_API_TOKEN):"
az staticwebapp secrets list -n "$NAME" -g "$RESOURCE_GROUP" --query properties.apiKey -o tsv
