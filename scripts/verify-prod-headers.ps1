$ErrorActionPreference = "Stop"

$rootUrl = "https://politicalsolutions.uk/"
$indexUrl = "https://politicalsolutions.uk/index.html"
$robotsUrl = "https://politicalsolutions.uk/robots.txt"
$sitemapUrl = "https://politicalsolutions.uk/sitemap.xml"

$headerKeys = @(
  "strict-transport-security",
  "cache-control",
  "x-content-type-options",
  "x-frame-options",
  "referrer-policy",
  "permissions-policy",
  "content-type"
)

function Get-HeaderMap {
  param([string]$Url)

  $raw = & curl.exe -I -L --ssl-no-revoke -sS $Url 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "curl.exe failed for $Url`n$raw"
  }

  $normalized = $raw -replace "`r`n", "`n"
  $headers = @{}
  foreach ($line in ($normalized -split "\n")) {
    if ($line -match "^HTTP/") {
      $headers = @{}
      continue
    }
    if ($line -match "^\s*$") { continue }
    if ($line -notmatch ":") { continue }
    $parts = $line -split ":", 2
    $key = $parts[0].Trim().ToLowerInvariant()
    $value = $parts[1].Trim()
    if ($key) { $headers[$key] = $value }
  }

  if ($headers.Count -eq 0) {
    throw "No HTTP headers found for $Url"
  }

  return $headers
}

function Write-Headers {
  param([string]$Url, [hashtable]$Headers)

  Write-Host "URL: $Url"
  foreach ($key in $headerKeys) {
    if ($Headers.ContainsKey($key)) {
      Write-Host "${key}: $($Headers[$key])"
    } else {
      Write-Host "${key}: <missing>"
    }
  }
  Write-Host ""
}

function Contains-Token {
  param([string]$Value, [string]$Token)
  if (-not $Value) { return $false }
  return $Value.ToLowerInvariant().Contains($Token)
}

$failureCount = 0

 $html = & curl.exe --ssl-no-revoke -sS -L $rootUrl 2>&1
 if ($LASTEXITCODE -ne 0) {
   throw "curl.exe failed to fetch HTML from $rootUrl`n$html"
 }

$assetMatch = [regex]::Match($html, '/assets/[^"'' ]+')
if (-not $assetMatch.Success) {
  Write-Error "Could not find an asset reference in production HTML."
  $lines = $html -split "`n"
  $previewLines = $lines[0..([Math]::Min(39, $lines.Length - 1))] | ForEach-Object { $_.TrimEnd("`r") }
  Write-Host ($previewLines -join "`n")
  exit 1
}
$assetPath = $assetMatch.Value
$assetUrl = "https://politicalsolutions.uk$assetPath"

$rootHeaders = Get-HeaderMap -Url $rootUrl
Write-Headers -Url $rootUrl -Headers $rootHeaders

$securityKeys = @(
  "strict-transport-security",
  "x-content-type-options",
  "x-frame-options",
  "referrer-policy",
  "permissions-policy"
)

$missingSecurity = @()
foreach ($key in $securityKeys) {
  if (-not $rootHeaders.ContainsKey($key)) {
    $missingSecurity += $key
  }
}
if ($missingSecurity.Count -gt 0) {
  Write-Warning "Missing security headers on root: $($missingSecurity -join ", ")"
  $failureCount++
}

$indexHeaders = Get-HeaderMap -Url $indexUrl
Write-Headers -Url $indexUrl -Headers $indexHeaders
if (-not (Contains-Token $indexHeaders["cache-control"] "no-store")) {
  Write-Warning "index.html Cache-Control missing no-store"
  $failureCount++
}

$assetHeaders = Get-HeaderMap -Url $assetUrl
Write-Headers -Url $assetUrl -Headers $assetHeaders
if (-not (Contains-Token $assetHeaders["cache-control"] "max-age")) {
  Write-Warning "Asset Cache-Control missing max-age"
  $failureCount++
}
if (-not (Contains-Token $assetHeaders["cache-control"] "immutable")) {
  Write-Warning "Asset Cache-Control missing immutable"
  $failureCount++
}

$robotsHeaders = Get-HeaderMap -Url $robotsUrl
Write-Headers -Url $robotsUrl -Headers $robotsHeaders
$robotsContentType = $robotsHeaders["content-type"]
if (-not $robotsContentType -or -not ($robotsContentType.ToLowerInvariant() -match "^text/plain")) {
  Write-Warning "robots.txt content-type is not text/plain"
  $failureCount++
}

$sitemapHeaders = Get-HeaderMap -Url $sitemapUrl
Write-Headers -Url $sitemapUrl -Headers $sitemapHeaders
$sitemapContentType = $sitemapHeaders["content-type"]
if (-not $sitemapContentType -or -not ($sitemapContentType.ToLowerInvariant() -match "^(application|text)/xml")) {
  Write-Warning "sitemap.xml content-type is not application/xml or text/xml"
  $failureCount++
}

if ($failureCount -gt 0) {
  exit 1
}
