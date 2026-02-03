$ErrorActionPreference = "Stop"

$routesJson = node --input-type=module -e "import { seoRoutes } from './src/seo/seoRoutes.js'; console.log(JSON.stringify(seoRoutes.map(r => r.path)))"
$routes = $routesJson | ConvertFrom-Json

$missing = @()
$invalid = @()

foreach ($route in $routes) {
  $normalized = if ($route -and $route -ne "/") { $route.TrimEnd("/") } else { "/" }
  $relativePath = if ($normalized -eq "/") { "dist/index.html" } else { "dist$normalized/index.html" }
  $fullPath = Join-Path -Path (Get-Location) -ChildPath $relativePath

  if (-not (Test-Path -Path $fullPath)) {
    $missing += $relativePath
    continue
  }

  $html = Get-Content -Path $fullPath -Raw
  if ($html -notmatch "<title>") {
    $invalid += "$relativePath missing <title>"
  }
  if ($html -notmatch 'rel="canonical"') {
    $invalid += "$relativePath missing canonical"
  }
}

if ($missing.Count -gt 0) {
  Write-Error "Missing prerendered files: $($missing -join ', ')"
}
if ($invalid.Count -gt 0) {
  Write-Error "Invalid prerendered HTML: $($invalid -join '; ')"
}

Write-Host "Prerendered HTML verified for $($routes.Count) routes."
