[CmdletBinding()]
param(
    [switch]$InsecureAmazonLinuxRepo
)

$ErrorActionPreference = "Stop"

$uploadApiRoot = $PSScriptRoot
$layerRoot = Join-Path $uploadApiRoot "ocr_layer"
$versionsPath = Join-Path $layerRoot "versions.env"
$sourceDirectory = Join-Path $layerRoot ".sources"
$outputDirectory = Join-Path $layerRoot "out"

$versions = @{}
foreach ($line in Get-Content -LiteralPath $versionsPath) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) {
        continue
    }
    $name, $value = $trimmed.Split("=", 2)
    $versions[$name] = $value
}

function Get-VerifiedSource {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [Parameter(Mandatory = $true)][string]$Destination,
        [Parameter(Mandatory = $true)][string]$ExpectedSha256
    )

    if (Test-Path -LiteralPath $Destination) {
        $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $Destination).Hash
        if ($actual -ieq $ExpectedSha256) {
            Write-Host "Using verified cached input: $(Split-Path -Leaf $Destination)"
            return
        }
        Remove-Item -LiteralPath $Destination -Force
    }

    $partial = "$Destination.part"
    Write-Host "Downloading: $Url"
    Invoke-WebRequest -Uri $Url -OutFile $partial
    $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $partial).Hash
    if ($actual -ine $ExpectedSha256) {
        Remove-Item -LiteralPath $partial -Force
        throw (
            "SHA-256 mismatch for $Url. Expected $ExpectedSha256; " +
            "received $actual."
        )
    }
    Move-Item -LiteralPath $partial -Destination $Destination -Force
}

New-Item -ItemType Directory -Path $sourceDirectory -Force | Out-Null
Get-VerifiedSource `
    -Url $versions.TESSERACT_SOURCE_URL `
    -Destination (Join-Path $sourceDirectory "tesseract-$($versions.TESSERACT_VERSION).tar.gz") `
    -ExpectedSha256 $versions.TESSERACT_SOURCE_SHA256
Get-VerifiedSource `
    -Url $versions.LEPTONICA_SOURCE_URL `
    -Destination (Join-Path $sourceDirectory "leptonica-$($versions.LEPTONICA_VERSION).tar.gz") `
    -ExpectedSha256 $versions.LEPTONICA_SOURCE_SHA256
Get-VerifiedSource `
    -Url $versions.POPPLER_SOURCE_URL `
    -Destination (Join-Path $sourceDirectory "poppler-$($versions.POPPLER_VERSION).tar.xz") `
    -ExpectedSha256 $versions.POPPLER_SOURCE_SHA256
Get-VerifiedSource `
    -Url $versions.ENG_TRAINEDDATA_URL `
    -Destination (Join-Path $sourceDirectory "eng.traineddata") `
    -ExpectedSha256 $versions.ENG_TRAINEDDATA_SHA256
Get-VerifiedSource `
    -Url $versions.OSD_TRAINEDDATA_URL `
    -Destination (Join-Path $sourceDirectory "osd.traineddata") `
    -ExpectedSha256 $versions.OSD_TRAINEDDATA_SHA256

$resolvedLayerRoot = [System.IO.Path]::GetFullPath($layerRoot)
$resolvedOutput = [System.IO.Path]::GetFullPath($outputDirectory)
if (-not $resolvedOutput.StartsWith(
        "$resolvedLayerRoot$([System.IO.Path]::DirectorySeparatorChar)",
        [System.StringComparison]::OrdinalIgnoreCase
    )) {
    throw "Refusing to replace output outside the OCR layer directory."
}
if (Test-Path -LiteralPath $resolvedOutput) {
    Remove-Item -LiteralPath $resolvedOutput -Recurse -Force
}
New-Item -ItemType Directory -Path $resolvedOutput -Force | Out-Null

$repoSslVerify = if ($InsecureAmazonLinuxRepo) { "0" } else { "1" }
$argumentNames = @(
    "LAMBDA_BASE_IMAGE",
    "LAMBDA_BASE_OS",
    "TARGET_RUNTIME",
    "TARGET_ARCHITECTURE",
    "TESSERACT_VERSION",
    "TESSERACT_SOURCE_URL",
    "TESSERACT_SOURCE_SHA256",
    "LEPTONICA_VERSION",
    "LEPTONICA_SOURCE_URL",
    "LEPTONICA_SOURCE_SHA256",
    "POPPLER_VERSION",
    "POPPLER_SOURCE_URL",
    "POPPLER_SOURCE_SHA256",
    "TESSDATA_COMMIT",
    "ENG_TRAINEDDATA_SHA256",
    "OSD_TRAINEDDATA_SHA256",
    "SOURCE_DATE_EPOCH"
)
$dockerArguments = @(
    "build",
    "--platform", "linux/amd64",
    "--file", (Join-Path $layerRoot "Dockerfile"),
    "--output", "type=local,dest=$resolvedOutput",
    "--build-arg", "AL2023_REPO_SSLVERIFY=$repoSslVerify"
)
foreach ($name in $argumentNames) {
    $dockerArguments += @("--build-arg", "$name=$($versions[$name])")
}
$dockerArguments += $layerRoot

& docker @dockerArguments
if ($LASTEXITCODE -ne 0) {
    throw "The AL2023 OCR layer build failed."
}

Write-Host ""
Write-Host "Layer build complete:"
Write-Host "  $(Join-Path $resolvedOutput 'tesseract5-al2023-python312-x86_64.zip')"
Write-Host "  $(Join-Path $resolvedOutput 'artifact-manifest.json')"
Write-Host "  $(Join-Path $resolvedOutput 'layer\\opt')"
