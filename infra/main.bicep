// main.bicep — Azure Static Web App (Free) for the ARD Catalog Explorer.
//
// The app is deployed with a "bring your own" content pipeline (deployment token used by the
// GitHub Actions workflow / swa CLI), so no repositoryUrl is wired here. Custom domain binding
// is optional and gated behind `customDomain` — leave it empty until the Cloudflare CNAME exists,
// otherwise the cname-delegation validation has nothing to validate against and the deployment
// will fail.

targetScope = 'resourceGroup'

@description('Name of the Static Web App resource.')
param name string = 'ard-catalog-explorer'

@description('Region for the Static Web App (must be a Static Web Apps-supported region).')
@allowed([
  'westus2'
  'centralus'
  'eastus2'
  'westeurope'
  'eastasia'
])
param location string = 'westeurope'

@description('SKU tier. Free is sufficient for this static site and supports one custom domain.')
@allowed([
  'Free'
  'Standard'
])
param sku string = 'Free'

@description('Custom domain to bind (e.g. ard-explorer.isainative.dev). Leave empty to skip. Add the DNS CNAME in Cloudflare BEFORE setting this.')
param customDomain string = ''

@description('Resource tags.')
param tags object = {
  app: 'ard-catalog-explorer'
  managedBy: 'bicep'
}

resource staticSite 'Microsoft.Web/staticSites@2024-04-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: sku
    tier: sku
  }
  properties: {
    // Lets staticwebapp.config.json from the uploaded content take effect.
    allowConfigFileUpdates: true
    // Free tier permits preview environments for PRs (used by the deploy workflow).
    stagingEnvironmentPolicy: 'Enabled'
  }
}

// Bind a custom domain via CNAME delegation. Requires the CNAME record to already resolve to
// staticSite.properties.defaultHostname; Azure then validates ownership and issues a managed cert.
resource domain 'Microsoft.Web/staticSites/customDomains@2024-04-01' = if (!empty(customDomain)) {
  parent: staticSite
  name: customDomain
  properties: {
    validationMethod: 'cname-delegation'
  }
}

@description('The Azure-assigned default hostname. Point your Cloudflare CNAME at this value.')
output defaultHostname string = staticSite.properties.defaultHostname

@description('The Static Web App resource name.')
output staticWebAppName string = staticSite.name

@description('The custom domain that was bound (or "none").')
output customDomainBound string = empty(customDomain) ? 'none' : customDomain
