using './main.bicep'

param name = 'ard-catalog-explorer'
param location = 'westeurope'
param sku = 'Free'

// Leave empty for the first deployment. After you create the Cloudflare CNAME
// (ard-explorer -> <defaultHostname>, DNS only), set this to 'ard-explorer.isainative.dev'
// and redeploy to bind the custom domain.
param customDomain = ''
