param(
    [Parameter(Mandatory = $true)]
    [Alias("PdfPath")]
    [string]$InputPath,

    [string]$OutputDirectory = "",

    [ValidateRange(1, 100)]
    [int]$ChunkPages = 20,

    [ValidateRange(1, 32)]
    [int]$Workers = 6,

    [ValidateRange(0.0, 100.0)]
    [double]$TolerancePercent = 1.0,

    [string]$BaselinePath = ""
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
$layerRoot = Join-Path $uploadApiRoot "ocr_layer"
if ([string]::IsNullOrWhiteSpace($BaselinePath)) {
    $BaselinePath = Join-Path $layerRoot "parity-baseline.json"
}
$baseline = Get-Content -LiteralPath $BaselinePath -Raw | ConvertFrom-Json
if ($baseline.schema_version -ne 1) {
    throw "Unsupported parity baseline schema: $($baseline.schema_version)"
}
$sourceRecords = @(
    foreach ($pdf in $pdfs) {
        $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $pdf.FullName).Hash
        "$($hash.ToLowerInvariant()):$($pdf.Length)"
    }
)
$fingerprintBytes = [System.Text.Encoding]::UTF8.GetBytes(
    $sourceRecords -join "`n"
)
$sourceSetSha256 = [Convert]::ToHexString(
    [System.Security.Cryptography.SHA256]::HashData($fingerprintBytes)
).ToLowerInvariant()
if (
    $pdfs.Count -ne [int]$baseline.source_document_count -or
    $sourceSetSha256 -cne [string]$baseline.source_set_sha256
) {
    throw (
        "Selected PDFs do not match parity baseline " +
        "'$($baseline.label)'. Refusing to compare unrelated source material."
    )
}
$layerOpt = Join-Path $layerRoot "out\layer\opt"
$artifactManifest = Join-Path $layerRoot "out\artifact-manifest.json"
$samBuild = Join-Path $uploadApiRoot ".aws-sam\build\ProcessRegisterFunction"
$sourcePython = Join-Path $uploadApiRoot "src_python"
if (-not (Test-Path -LiteralPath $artifactManifest)) {
    throw "Build the proposed production layer with build_layer.ps1 first."
}
if (-not (Test-Path -LiteralPath (Join-Path $samBuild "pytesseract"))) {
    throw "Run 'sam build ProcessRegisterFunction' before the parity trial."
}

$versions = @{}
foreach ($line in Get-Content -LiteralPath (Join-Path $layerRoot "versions.env")) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) {
        continue
    }
    $name, $value = $trimmed.Split("=", 2)
    $versions[$name] = $value
}

if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = Join-Path $uploadApiRoot "local-trial-output"
}
$output = New-Item -ItemType Directory -Path $OutputDirectory -Force
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$reportName = "lambda-layer-parity-$timestamp.json"
$reportPath = Join-Path $output.FullName $reportName
$containerReport = "/output/$reportName"

$mounts = @{
    input = "${inputDirectory}:/input:ro"
    output = "$($output.FullName):/output"
    layer = "$($layerOpt):/opt:ro"
    sam = "${samBuild}:/var/task:ro"
    source = "${sourcePython}:/app:ro"
}
$runArguments = @(
    "run", "--rm",
    "--platform", "linux/amd64",
    "--network", "none",
    "--volume", $mounts.input,
    "--volume", $mounts.output,
    "--volume", $mounts.layer,
    "--volume", $mounts.sam,
    "--volume", $mounts.source,
    "--env", "PATH=/opt/bin:/var/lang/bin:/usr/local/bin:/usr/bin:/bin",
    "--env", "LD_LIBRARY_PATH=/opt/lib:/var/lang/lib:/lib64:/usr/lib64",
    "--env", "TESSDATA_PREFIX=/opt/tessdata",
    "--env", "OCR_RUNTIME_MANIFEST=/opt/ocr-runtime-manifest.json",
    "--env", "LOCAL_POPPLER_PATH=/opt/bin",
    "--env", "LOCAL_TESSERACT_CMD=/opt/bin/tesseract",
    "--env", "LOCAL_OCR_TRIAL_STUB_AWS=true",
    "--env", "AWS_EC2_METADATA_DISABLED=true",
    "--env", "AWS_REGION=eu-west-2",
    "--env", "AWS_DEFAULT_REGION=eu-west-2",
    "--env", "PYTHONPATH=/var/task:/app",
    "--entrypoint", "python",
    $versions.LAMBDA_BASE_IMAGE,
    "/app/local_row_trial.py"
)
foreach ($pdf in $pdfs) {
    $runArguments += @("--pdf", "/input/$($pdf.Name)")
}
$runArguments += @(
    "--output", $containerReport,
    "--chunk-pages", $ChunkPages,
    "--workers", $Workers
)

Write-Host (
    "Running $($pdfs.Count) PDF file(s) with the unpacked proposed Lambda " +
    "layer in the pinned Python 3.12 Lambda runtime..."
)
& docker @runArguments
if ($LASTEXITCODE -ne 0) {
    throw "The production-layer parity trial did not complete."
}

$report = Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json
$candidate = $report.candidate_row_eligibility
$expected = $baseline.metrics
$failures = @()
foreach ($metric in $expected.PSObject.Properties.Name) {
    $actual = [double]$candidate.$metric
    $reference = [double]$expected.$metric
    $differencePercent = [math]::Abs($actual - $reference) / $reference * 100
    if ($differencePercent -gt $TolerancePercent) {
        $failures += (
            "$metric actual=$actual expected=$reference " +
            "difference=$([math]::Round($differencePercent, 3))%"
        )
    }
}
$manifestMatches = @(
    $report.ocr_runtime.matches_manifest.psobject.Properties.Value
)
if ($manifestMatches.Count -eq 0 -or $manifestMatches -contains $false) {
    $failures += "The executed OCR runtime did not fully match its layer manifest."
}
if (
    [string]$report.ocr_runtime.manifest_sha256 -cne
    [string]$baseline.ocr_manifest_sha256
) {
    $failures += "The OCR runtime manifest does not match the baseline manifest."
}

Write-Host "Aggregate-only parity report: $reportPath"
Write-Host "Baseline: $($baseline.label) ($($baseline.source_commit))"
Write-Host (
    "Candidate: $($candidate.rows_before_deduplication) rows before dedupe; " +
    "$($candidate.rows_after_deduplication) after dedupe; " +
    "$($candidate.voted_y) marked Y."
)
if ($failures.Count -gt 0) {
    throw "Parity failed: $($failures -join '; ')"
}
Write-Host "Parity passed within the configured $TolerancePercent% tolerance."
