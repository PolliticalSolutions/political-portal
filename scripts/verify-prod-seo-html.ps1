$ErrorActionPreference = "Stop"

$routesJson = node --input-type=module -e "import { seoRoutes, siteUrl } from './src/seo/seoRoutes.js'; console.log(JSON.stringify({ siteUrl, routes: seoRoutes }))"
$payload = $routesJson | ConvertFrom-Json
$siteUrl = $payload.siteUrl
$routes = $payload.routes

$failures = @()

foreach ($route in $routes) {
  $path = $route.path
  $normalized = if ($path -and $path -ne "/") { $path.TrimEnd("/") } else { "/" }
  $url = "$siteUrl$normalized"
  $canonical = "$siteUrl$normalized"
  $expectedTitle = $route.title

  $html = curl.exe -sS -L --ssl-no-revoke $url

  if ($html -notmatch [regex]::Escape($expectedTitle)) {
    $failures += "$url missing expected title"
  }
  if ($html -notmatch [regex]::Escape($canonical)) {
    $failures += "$url missing canonical $canonical"
  }
  if ($html -notmatch "og:title") {
    $failures += "$url missing og:title"
  }
  if ($html -notmatch "twitter:title") {
    $failures += "$url missing twitter:title"
  }
}

if ($failures.Count -gt 0) {
  Write-Error "SEO HTML verification failed: $($failures -join '; ')"
}

Write-Host "Production SEO HTML verified for $($routes.Count) routes."
