param(
    [Parameter(Mandatory = $true)]
    [string]$PdfPath,

    [string]$OutputDirectory = "",

    [ValidateRange(1, 100)]
    [int]$ChunkPages = 20,

    [ValidateRange(1, 32)]
    [int]$Workers = 6
)

$ErrorActionPreference = "Stop"

$pdf = Get-Item -LiteralPath $PdfPath -ErrorAction Stop
if ($pdf.PSIsContainer -or $pdf.Extension -ine ".pdf") {
    throw "PdfPath must identify one PDF file."
}

$uploadApiRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = Join-Path $uploadApiRoot "local-trial-output"
}
$output = New-Item -ItemType Directory -Path $OutputDirectory -Force
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$reportName = "gap-inference-trial-$timestamp.json"
$reportPath = Join-Path $output.FullName $reportName

$docker = Get-Command docker -ErrorAction Stop
$dockerVersion = & $docker.Source version 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "Docker Desktop is not running. Start Docker Desktop and try again."
}

$imageName = "political-portal-ocr-gap-trial:local"
$samDependencies = Join-Path $uploadApiRoot ".aws-sam\build\ProcessRegisterFunction\pytesseract"
if (-not (Test-Path -LiteralPath $samDependencies)) {
    $sam = Get-Command sam -ErrorAction Stop
    Write-Host "Preparing the Lambda-compatible Python dependencies..."
    Push-Location $uploadApiRoot
    try {
        & $sam.Source build ProcessRegisterFunction
        if ($LASTEXITCODE -ne 0) {
            throw "SAM could not prepare the OCR Python dependencies."
        }
    }
    finally {
        Pop-Location
    }
}

Write-Host "Building the isolated local OCR trial image..."
& $docker.Source build `
    --file (Join-Path $PSScriptRoot "Dockerfile") `
    --tag $imageName `
    $uploadApiRoot
if ($LASTEXITCODE -ne 0) {
    throw "The local OCR trial image could not be built."
}

$inputMount = "$($pdf.Directory.FullName):/input:ro"
$outputMount = "$($output.FullName):/output"
$containerPdf = "/input/$($pdf.Name)"
$containerReport = "/output/$reportName"

Write-Host "Running the register twice locally (legacy, then candidate)..."
& $docker.Source run --rm `
    --network none `
    --volume $inputMount `
    --volume $outputMount `
    $imageName `
    --pdf $containerPdf `
    --output $containerReport `
    --chunk-pages $ChunkPages `
    --workers $Workers
if ($LASTEXITCODE -ne 0) {
    throw "The local OCR comparison did not complete."
}

Write-Host "Trial complete. Aggregate-only report: $reportPath"
