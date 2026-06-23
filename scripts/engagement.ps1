<#
.SYNOPSIS
    Pull engagement metrics for the ARD Explorer from Application Insights.

.DESCRIPTION
    Queries Azure Application Insights (appi-ard-explorer) for page-view and
    custom-event telemetry, then prints clean terminal tables covering:

      1. Summary        - total page views, custom events, unique sessions
      2. Events by name - breakdown of all custom event names
      3. Probe outcomes - probe_result.outcome (conformant / warnings / ...)
      4. Probe sources  - probe_result.source (network / paste / sample)
      5. Outbound clicks - outbound_click.which (spec / pitch / linkedin / github)
      6. Daily trend    - events per day over the look-back window

    Empty result sets are handled gracefully with a "(no data ...)" message.
    ASCII-only output, so it runs identically in Windows PowerShell 5.1 and pwsh 7.

.PREREQUISITES
    - Azure CLI logged in:                az login
    - Application Insights extension:      az extension add --name application-insights
    - Reader / Monitoring Reader on the App Insights resource.

.PARAMETER Days
    Look-back window in days. Default: 7.

.PARAMETER Raw
    Also dump the raw JSON body for the summary query.

.PARAMETER App
    Application Insights resource name. Default: appi-ard-explorer.

.PARAMETER ResourceGroup
    Azure resource group. Default: rg-ard-explorer.

.EXAMPLE
    powershell -File scripts\engagement.ps1
.EXAMPLE
    pwsh -File scripts/engagement.ps1 -Days 30
.EXAMPLE
    powershell -File scripts\engagement.ps1 -Days 1 -Raw
#>
[CmdletBinding()]
param(
    [int]   $Days          = 7,
    [switch]$Raw,
    [string]$App           = 'appi-ard-explorer',
    [string]$ResourceGroup = 'rg-ard-explorer'
)

$ErrorActionPreference = 'Stop'
$script:LastRawJson = $null

function Invoke-AiQuery {
    # Run a KQL query and emit one PSCustomObject per result row. Sets $script:LastRawJson.
    # Use index-based loops so PowerShell never unrolls single-row nested arrays.
    # Capture results with @(Invoke-AiQuery ...) so callers always get an array.
    param([Parameter(Mandatory)][string]$Kql)

    $jsonOutput = az monitor app-insights query --app $App -g $ResourceGroup --analytics-query $Kql -o json

    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: 'az monitor app-insights query' exited with code $LASTEXITCODE." -ForegroundColor Red
        Write-Host "  App : $App"
        Write-Host "  RG  : $ResourceGroup"
        Write-Host "  KQL : $Kql"
        Write-Host "  Hint: run 'az login' and 'az extension add --name application-insights'." -ForegroundColor DarkGray
        exit 1
    }

    $script:LastRawJson = if ($jsonOutput -is [System.Array]) { $jsonOutput -join "`n" } else { [string]$jsonOutput }

    try { $parsed = $script:LastRawJson | ConvertFrom-Json }
    catch { Write-Host "ERROR: Failed to parse JSON response: $_" -ForegroundColor Red; exit 1 }

    $table = $parsed.tables[0]
    if (-not $table -or $null -eq $table.rows -or $table.rows.Count -eq 0) { return }

    $columns = @($table.columns | ForEach-Object { $_.name })
    for ($ri = 0; $ri -lt $table.rows.Count; $ri++) {
        $row = $table.rows[$ri]
        $obj = [ordered]@{}
        for ($ci = 0; $ci -lt $columns.Count; $ci++) { $obj[$columns[$ci]] = $row[$ci] }
        [PSCustomObject]$obj
    }
}

function Write-Section ([string]$Title) {
    $pad = [Math]::Max(1, 62 - $Title.Length)
    Write-Host ''
    Write-Host ("--- $Title " + ('-' * $pad)) -ForegroundColor Cyan
}

function Show-Table {
    param([object[]]$Data)
    $items = @($Data) | Where-Object { $_ -ne $null }
    if (@($items).Count -eq 0) {
        Write-Host "  (no data in the last $Days day(s))" -ForegroundColor DarkGray
    }
    else {
        @($items) | Format-Table -AutoSize | Out-String -Stream |
            Where-Object { $_ -ne '' } |
            ForEach-Object { Write-Host "  $_" }
    }
}

$bar = '=' * 66

Write-Host ''
Write-Host $bar -ForegroundColor Cyan
Write-Host "  ARD Explorer  |  Engagement Metrics  |  Last $Days day(s)" -ForegroundColor White
Write-Host "  App: $App   RG: $ResourceGroup" -ForegroundColor DarkGray
Write-Host $bar -ForegroundColor Cyan

# --- 1. SUMMARY -------------------------------------------------------------
Write-Section 'SUMMARY'
$kqlSummary = (
    "union pageViews, customEvents" +
    " | where timestamp > ago(${Days}d)" +
    " | summarize PageViews = countif(itemType == 'pageView')," +
    " Events = countif(itemType == 'customEvent')," +
    " Sessions = dcount(session_Id)"
)
$summaryData = @(Invoke-AiQuery -Kql $kqlSummary)
if ($Raw) {
    Write-Host '  [Raw JSON - summary query]' -ForegroundColor Yellow
    Write-Host $script:LastRawJson -ForegroundColor DarkYellow
    Write-Host ''
}
Show-Table -Data $summaryData

# --- 2. EVENTS BY NAME ------------------------------------------------------
Write-Section 'EVENTS BY NAME'
$eventsByName = @(Invoke-AiQuery -Kql (
    "customEvents | where timestamp > ago(${Days}d)" +
    " | summarize Count = count() by name | order by Count desc"
))
Show-Table -Data $eventsByName

# --- 3. PROBE OUTCOMES ------------------------------------------------------
Write-Section 'PROBE OUTCOMES  (probe_result.outcome)'
$probeOutcomes = @(Invoke-AiQuery -Kql (
    "customEvents | where name == 'probe_result' and timestamp > ago(${Days}d)" +
    " | extend outcome = tostring(customDimensions.outcome)" +
    " | summarize Count = count() by outcome | order by Count desc"
))
Show-Table -Data $probeOutcomes

# --- 4. PROBE SOURCES -------------------------------------------------------
Write-Section 'PROBE SOURCES  (probe_result.source)'
$probeSources = @(Invoke-AiQuery -Kql (
    "customEvents | where name == 'probe_result' and timestamp > ago(${Days}d)" +
    " | extend source = tostring(customDimensions.source)" +
    " | summarize Count = count() by source | order by Count desc"
))
Show-Table -Data $probeSources

# --- 5. OUTBOUND CLICKS -----------------------------------------------------
Write-Section 'OUTBOUND CLICKS  (outbound_click.which)'
$outboundClicks = @(Invoke-AiQuery -Kql (
    "customEvents | where name == 'outbound_click' and timestamp > ago(${Days}d)" +
    " | extend which = tostring(customDimensions.which)" +
    " | summarize Count = count() by which | order by Count desc"
))
Show-Table -Data $outboundClicks

# --- 6. DAILY TREND ---------------------------------------------------------
Write-Section 'DAILY TREND  (page views + events, 1-day bins)'
$dailyTrend = @(Invoke-AiQuery -Kql (
    "union pageViews, customEvents | where timestamp > ago(${Days}d)" +
    " | summarize Events = count() by Day = bin(timestamp, 1d) | order by Day asc"
))
Show-Table -Data $dailyTrend

Write-Host ''
Write-Host $bar -ForegroundColor DarkGray
Write-Host "  Done.  Use -Days <N> to widen the window, -Raw to dump JSON." -ForegroundColor DarkGray
Write-Host $bar -ForegroundColor DarkGray
Write-Host ''
