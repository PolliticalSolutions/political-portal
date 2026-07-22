param(
    [Parameter(Mandatory = $true)]
    [Alias("PdfPath")]
    [string]$InputPath,

    [string]$OutputDirectory = "",

    [ValidateRange(1, 100)]
    [int]$ChunkPages = 20,

    [ValidateRange(1, 32)]
    [int]$Workers = 6
)

$ErrorActionPreference = "Stop"

$inputItem = Get-Item -LiteralPath $InputPath -ErrorAction Stop
if ($inputItem.PSIsContainer) {
    $pdfs = @(Get-ChildItem -LiteralPath $inputItem.FullName -File -Filter "*.pdf" | Sort-Object Name)
    $inputDirectory = $inputItem.FullName
}
elseif ($inputItem.Extension -ieq ".pdf") {
    $pdfs = @($inputItem)
    $inputDirectory = $inputItem.Directory.FullName
}
else {
    throw "InputPath must identify one PDF file or a folder containing PDFs."
}
if ($pdfs.Count -eq 0) {
    throw "No PDF files were found in the selected folder."
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

$inputMount = "${inputDirectory}:/input:ro"
$outputMount = "$($output.FullName):/output"
$containerReport = "/output/$reportName"

Write-Host "Running $($pdfs.Count) PDF file(s) twice locally (legacy, then candidate)..."
$runArguments = @(
    "run", "--rm",
    "--network", "none",
    "--volume", $inputMount,
    "--volume", $outputMount,
    $imageName
)
foreach ($pdf in $pdfs) {
    $runArguments += @("--pdf", "/input/$($pdf.Name)")
}
$runArguments += @(
    "--output", $containerReport,
    "--chunk-pages", $ChunkPages,
    "--workers", $Workers
)
& $docker.Source @runArguments
if ($LASTEXITCODE -ne 0) {
    throw "The local OCR comparison did not complete."
}

Write-Host "Trial complete. Aggregate-only report: $reportPath"
