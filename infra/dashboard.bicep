// dashboard.bicep — Azure Portal engagement dashboard for ARD Explorer.
// Tiles bind to the App Insights workspace-based component via LogsDashboardPart
// (Extension/Microsoft_OperationsManagementSuite_Workspace/PartType/LogsDashboardPart).
// No data will appear until the site emits telemetry — tiles are pre-wired and ready.

targetScope = 'resourceGroup'

@description('Resource ID of the Application Insights component to bind tiles to.')
param appInsightsResourceId string = '/subscriptions/d0b7d6ee-17bf-4c4f-b79d-4f6c2cb583fd/resourceGroups/rg-ard-explorer/providers/microsoft.insights/components/appi-ard-explorer'

@description('Azure region for the dashboard resource.')
param location string = 'westeurope'

// ── Derived vars ─────────────────────────────────────────────────────────────
var appInsightsSub  = 'd0b7d6ee-17bf-4c4f-b79d-4f6c2cb583fd'
var appInsightsRg   = 'rg-ard-explorer'
var appInsightsName = 'appi-ard-explorer'

// ComponentId object consumed by every LogsDashboardPart tile.
var componentId = {
  SubscriptionId: appInsightsSub
  ResourceGroup:  appInsightsRg
  Name:           appInsightsName
  ResourceId:     appInsightsResourceId
}

var logsPart = 'Extension/Microsoft_OperationsManagementSuite_Workspace/PartType/LogsDashboardPart'

// Helper: builds a standard LogsDashboardPart metadata block.
// All query-driven tiles share the same five inputs; only query/title/timeRange change.
var p7d  = 'P7D'
var p30d = 'P30D'

// ── Dashboard resource ────────────────────────────────────────────────────────
resource dashboard 'Microsoft.Portal/dashboards@2020-09-01-preview' = {
  name:     'dash-ard-explorer'
  location: location
  tags: {
    'hidden-title': 'ARD Explorer — Engagement'
  }
  properties: {
    lenses: [
      {
        order: 0
        parts: [

          // ── a) Markdown header ──────────────────────────────────────────
          {
            position: { x: 0, y: 0, colSpan: 12, rowSpan: 2 }
            metadata: {
              inputs: []
              type: 'Extension/HubsExtension/PartType/MarkdownPart'
              settings: {
                content: {
                  settings: {
                    content:        '# ARD Explorer — Engagement\n\n[→ Open ARD Explorer](https://ard-explorer.isainative.dev)'
                    title:          'ARD Explorer'
                    subtitle:       'Engagement Dashboard'
                    markdownSource: 1
                  }
                }
              }
            }
          }

          // ── b) Page views (30d) — timechart ────────────────────────────
          {
            position: { x: 0, y: 2, colSpan: 6, rowSpan: 4 }
            metadata: {
              inputs: [
                { name: 'resourceTypeMode', value: 'components' }
                { name: 'ComponentId',      value: componentId  }
                { name: 'Query',            value: 'pageViews | where timestamp > ago(30d) | summarize PageViews=count() by bin(timestamp, 1d) | render timechart' }
                { name: 'TimeRange',        value: p30d         }
                { name: 'PartTitle',        value: 'Page views (30d)' }
                { name: 'PartSubTitle',     value: appInsightsName    }
              ]
              type:     logsPart
              settings: {}
            }
          }

          // ── c) Events & sessions (7d/day) — columnchart ────────────────
          {
            position: { x: 6, y: 2, colSpan: 6, rowSpan: 4 }
            metadata: {
              inputs: [
                { name: 'resourceTypeMode', value: 'components' }
                { name: 'ComponentId',      value: componentId  }
                { name: 'Query',            value: 'union pageViews, customEvents | where timestamp > ago(7d) | summarize Events=count(), Sessions=dcount(session_Id) by bin(timestamp, 1d) | render columnchart' }
                { name: 'TimeRange',        value: p7d          }
                { name: 'PartTitle',        value: 'Events & sessions (7d/day)' }
                { name: 'PartSubTitle',     value: appInsightsName              }
              ]
              type:     logsPart
              settings: {}
            }
          }

          // ── d) Top events (7d) — barchart ──────────────────────────────
          {
            position: { x: 0, y: 6, colSpan: 4, rowSpan: 4 }
            metadata: {
              inputs: [
                { name: 'resourceTypeMode', value: 'components' }
                { name: 'ComponentId',      value: componentId  }
                { name: 'Query',            value: 'customEvents | where timestamp > ago(7d) | summarize Count=count() by name | order by Count desc | render barchart' }
                { name: 'TimeRange',        value: p7d          }
                { name: 'PartTitle',        value: 'Top events (7d)' }
                { name: 'PartSubTitle',     value: appInsightsName   }
              ]
              type:     logsPart
              settings: {}
            }
          }

          // ── e) Probe outcomes (7d) — piechart ──────────────────────────
          {
            position: { x: 4, y: 6, colSpan: 4, rowSpan: 4 }
            metadata: {
              inputs: [
                { name: 'resourceTypeMode', value: 'components' }
                { name: 'ComponentId',      value: componentId  }
                { name: 'Query',            value: 'customEvents | where name == "probe_result" and timestamp > ago(7d) | extend outcome=tostring(customDimensions.outcome) | summarize Count=count() by outcome | render piechart' }
                { name: 'TimeRange',        value: p7d          }
                { name: 'PartTitle',        value: 'Probe outcomes (7d)' }
                { name: 'PartSubTitle',     value: appInsightsName       }
              ]
              type:     logsPart
              settings: {}
            }
          }

          // ── f) Probe sources (7d) — piechart ───────────────────────────
          {
            position: { x: 8, y: 6, colSpan: 4, rowSpan: 4 }
            metadata: {
              inputs: [
                { name: 'resourceTypeMode', value: 'components' }
                { name: 'ComponentId',      value: componentId  }
                { name: 'Query',            value: 'customEvents | where name == "probe_result" and timestamp > ago(7d) | extend source=tostring(customDimensions.source) | summarize Count=count() by source | render piechart' }
                { name: 'TimeRange',        value: p7d          }
                { name: 'PartTitle',        value: 'Probe sources (7d)' }
                { name: 'PartSubTitle',     value: appInsightsName      }
              ]
              type:     logsPart
              settings: {}
            }
          }

          // ── g) Outbound clicks (30d) — barchart ────────────────────────
          {
            position: { x: 0, y: 10, colSpan: 6, rowSpan: 4 }
            metadata: {
              inputs: [
                { name: 'resourceTypeMode', value: 'components' }
                { name: 'ComponentId',      value: componentId  }
                { name: 'Query',            value: 'customEvents | where name == "outbound_click" and timestamp > ago(30d) | extend which=tostring(customDimensions.which) | summarize Count=count() by which | render barchart' }
                { name: 'TimeRange',        value: p30d         }
                { name: 'PartTitle',        value: 'Outbound clicks (30d)' }
                { name: 'PartSubTitle',     value: appInsightsName         }
              ]
              type:     logsPart
              settings: {}
            }
          }

          // ── h) Unique sessions (7d) — single-stat table ────────────────
          {
            position: { x: 6, y: 10, colSpan: 6, rowSpan: 4 }
            metadata: {
              inputs: [
                { name: 'resourceTypeMode', value: 'components' }
                { name: 'ComponentId',      value: componentId  }
                { name: 'Query',            value: 'union pageViews, customEvents | where timestamp > ago(7d) | summarize Sessions=dcount(session_Id)' }
                { name: 'TimeRange',        value: p7d          }
                { name: 'PartTitle',        value: 'Unique sessions (7d)' }
                { name: 'PartSubTitle',     value: appInsightsName        }
              ]
              type:     logsPart
              settings: {}
            }
          }

        ]
      }
    ]

    metadata: {
      model: {
        timeRange: {
          value: {
            relative: {
              duration: 24
              timeUnit: 1
            }
          }
          type: 'MsPortalFx.Composition.Configuration.ValueTypes.TimeRange'
        }
        filterLocale: {
          value: 'en-us'
        }
        filters: {
          value: {
            MsPortalFx_TimeRange: {
              model: {
                format:      'local'
                granularity: 'auto'
                relative:    '24h'
              }
              displayCache: {
                name:  'Local Time'
                value: 'Past 24 hours'
              }
              filteredPartIds: []
            }
          }
        }
      }
    }
  }
}

// ── Outputs ───────────────────────────────────────────────────────────────────
output dashboardId   string = dashboard.id
output dashboardName string = dashboard.name
output portalUrl     string = 'https://portal.azure.com/#@/dashboard/arm/subscriptions/${appInsightsSub}/resourcegroups/${appInsightsRg}/providers/microsoft.portal/dashboards/dash-ard-explorer'
