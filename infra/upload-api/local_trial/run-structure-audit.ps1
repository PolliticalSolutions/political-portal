param(
    [Parameter(Mandatory = $true)]
    [Alias("PdfPath")]
    [string]$InputPath,

    [string]$OutputDirectory = "",

    [ValidateRange(100, 600)]
    [int]$Dpi = 200,

    [ValidateRange(1, 32)]
    [int]$Workers = 4,

    [ValidateRange(0, 100)]
    [int]$SamplePagesPerDocument = 0
)

$ErrorActionPreference = "Stop"

$inputItem = Get-Item -LiteralPath $InputPath -ErrorAction Stop
if ($inputItem.PSIsContainer) {
    $pdfs = @(
        Get-ChildItem -LiteralPath $inputItem.FullName -File -Filter "*.pdf" |
            Sort-Object Name
    )
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
$reportName = "register-structure-audit-$timestamp.json"
$reportPath = Join-Path $output.FullName $reportName
$auditScript = Join-Path `
    $uploadApiRoot "src_python\local_register_structure_audit.py"
$processSource = Join-Path $uploadApiRoot "src_python\process_register"

$docker = Get-Command docker -ErrorAction Stop
$dockerVersion = & $docker.Source version 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "Docker Desktop is not running. Start Docker Desktop and try again."
}

$imageName = "political-portal-ocr-gap-trial:local"
$imageExists = & $docker.Source image inspect $imageName 2>$null
if ($LASTEXITCODE -ne 0) {
    $samDependencies = Join-Path `
        $uploadApiRoot ".aws-sam\build\ProcessRegisterFunction\pytesseract"
    if (-not (Test-Path -LiteralPath $samDependencies)) {
        $sam = Get-Command sam -ErrorAction Stop
        Write-Host "Preparing the local OCR dependencies..."
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

    Write-Host "Building the isolated local OCR image..."
    & $docker.Source build `
        --file (Join-Path $PSScriptRoot "Dockerfile") `
        --tag $imageName `
        $uploadApiRoot
    if ($LASTEXITCODE -ne 0) {
        throw "The local OCR image could not be built."
    }
}

$inputMount = "${inputDirectory}:/input:ro"
$outputMount = "$($output.FullName):/output"
$scriptMount = "${auditScript}:/app/local_register_structure_audit.py:ro"
$processMount = "${processSource}:/app/process_register:ro"
$containerReport = "/output/$reportName"
$runArguments = @(
    "run", "--rm",
    "--network", "none",
    "--volume", $inputMount,
    "--volume", $outputMount,
    "--volume", $scriptMount,
    "--volume", $processMount,
    "--entrypoint", "python",
    $imageName,
    "/app/local_register_structure_audit.py"
)
foreach ($pdf in $pdfs) {
    $runArguments += @("--pdf", "/input/$($pdf.Name)")
}
$runArguments += @(
    "--output", $containerReport,
    "--dpi", "$Dpi",
    "--workers", "$Workers",
    "--skip-pages", "2",
    "--sample-pages-per-document", "$SamplePagesPerDocument"
)

Write-Host (
    "Scanning header structure for $($pdfs.Count) PDF file(s) locally. " +
    "The container has no network access and the source mount is read-only."
)
& $docker.Source @runArguments
if ($LASTEXITCODE -ne 0) {
    throw "The local structure audit did not complete."
}

Write-Host "Privacy-safe aggregate report: $reportPath"
