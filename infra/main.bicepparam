using './main.bicep'

param name = 'ard-catalog-explorer'
param location = 'westeurope'
param sku = 'Free'

// The custom domain is bound (via cname-delegation). The Cloudflare CNAME
// (ard-explorer -> <defaultHostname>, DNS only) is in place and Azure has issued
// a managed certificate, so this stays asserted on declarative deployments.
param customDomain = 'ard-explorer.isainative.dev'
