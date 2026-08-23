param(
    [Parameter(Mandatory = $true)]
    [Alias("PdfPath")]
    [string]$InputPath,

    [string]$OutputDirectory = "",

    [ValidateRange(1, 100)]
    [int]$ChunkPages = 20,

    [ValidateRange(1, 32)]
    [int]$Workers = 6,

    [ValidateRange(1, 16)]
    [int]$DocumentWorkers = 1,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$ElectionName
)

$ErrorActionPreference = "Stop"

$inputItem = Get-Item -LiteralPath $InputPath -ErrorAction Stop
if ($inputItem.PSIsContainer) {
    $inputs = @(
        Get-ChildItem -LiteralPath $inputItem.FullName -File |
            Where-Object { $_.Extension -in @(".pdf", ".xlsx") } |
            Sort-Object Name
    )
    $inputDirectory = $inputItem.FullName
}
elseif ($inputItem.Extension -in @(".pdf", ".xlsx")) {
    $inputs = @($inputItem)
    $inputDirectory = $inputItem.Directory.FullName
}
else {
    throw "InputPath must identify one PDF/XLSX file or a folder containing them."
}
if ($inputs.Count -eq 0) {
    throw "No PDF or XLSX files were found in the selected folder."
}
$pdfs = @($inputs | Where-Object { $_.Extension -ieq ".pdf" })
$workbooks = @($inputs | Where-Object { $_.Extension -ieq ".xlsx" })

$uploadApiRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = Join-Path $uploadApiRoot "local-trial-output"
}
$output = New-Item -ItemType Directory -Path $OutputDirectory -Force
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$reportName = "register-fix-validation-$timestamp.json"
$reportPath = Join-Path $output.FullName $reportName
$validationScript = Join-Path `
    $uploadApiRoot "src_python\local_register_fix_validation.py"
$gapTrialScript = Join-Path $uploadApiRoot "src_python\local_gap_trial.py"
$runtimeScript = Join-Path $uploadApiRoot "src_python\ocr_runtime_versions.py"
$processSource = Join-Path $uploadApiRoot "src_python\process_register"
$combineSource = Join-Path $uploadApiRoot "src_python\combine_register"

$docker = Get-Command docker -ErrorAction Stop
$dockerVersion = & $docker.Source version 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "Docker Desktop is not running. Start Docker Desktop and try again."
}

$imageName = "political-portal-ocr-gap-trial:local"
$samDependencies = Join-Path `
    $uploadApiRoot ".aws-sam\build\ProcessRegisterFunction"
$imageExists = & $docker.Source image inspect $imageName 2>$null
if ($LASTEXITCODE -ne 0) {
    $pytesseractDependency = Join-Path $samDependencies "pytesseract"
    if (-not (Test-Path -LiteralPath $pytesseractDependency)) {
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
if (-not (Test-Path -LiteralPath (Join-Path $samDependencies "openpyxl"))) {
    throw "The secure XLSX dependencies are missing from the SAM build."
}

$inputMount = "${inputDirectory}:/input:ro"
$outputMount = "$($output.FullName):/output"
$validationMount = "${validationScript}:/app/local_register_fix_validation.py:ro"
$gapTrialMount = "${gapTrialScript}:/app/local_gap_trial.py:ro"
$runtimeMount = "${runtimeScript}:/app/ocr_runtime_versions.py:ro"
$processMount = "${processSource}:/app/process_register:ro"
$combineMount = "${combineSource}:/app/combine_register:ro"
$dependencyMount = "${samDependencies}:/deps:ro"
$containerReport = "/output/$reportName"
$runArguments = @(
    "run", "--rm",
    "--network", "none",
    "--env", "PYTHONPATH=/deps:/app",
    "--volume", $inputMount,
    "--volume", $outputMount,
    "--volume", $validationMount,
    "--volume", $gapTrialMount,
    "--volume", $runtimeMount,
    "--volume", $processMount,
    "--volume", $combineMount,
    "--volume", $dependencyMount,
    "--entrypoint", "python",
    $imageName,
    "/app/local_register_fix_validation.py"
)
foreach ($pdf in $pdfs) {
    $runArguments += @("--pdf", "/input/$($pdf.Name)")
}
foreach ($workbook in $workbooks) {
    $runArguments += @("--xlsx", "/input/$($workbook.Name)")
}
$runArguments += @(
    "--output", $containerReport,
    "--chunk-pages", "$ChunkPages",
    "--workers", "$Workers"
    "--document-workers", "$DocumentWorkers",
    "--election-name", $ElectionName
)

Write-Host (
    "Running the revised pipeline over $($pdfs.Count) PDF and " +
    "$($workbooks.Count) XLSX file(s) locally. " +
    "The container has no network access, the sources are read-only, and only " +
    "aggregate results will be saved."
)
& $docker.Source @runArguments
if ($LASTEXITCODE -ne 0) {
    throw "The revised marked-register validation did not complete."
}

Write-Host "Privacy-safe aggregate report: $reportPath"
