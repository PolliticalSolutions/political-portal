# deploy-upload-api.ps1
# Pulls the pconCode fix (PR #33) and deploys the upload API to ps-upload-api-prod.
# Refuses to deploy unless the fix is verifiably present in the working tree.

$ErrorActionPreference = "Stop"

$Repo    = "C:\Users\pauls\Documents\political-portal"
$ApiDir  = Join-Path $Repo "infra\upload-api"

function Fail($msg) {
    Write-Host ""
    Write-Host "STOPPED: $msg" -ForegroundColor Red
    Write-Host ""
    exit 1
}

function Step($msg) {
    Write-Host ""
    Write-Host "==> $msg" -ForegroundColor Cyan
}

# ---------------------------------------------------------------- preflight --
Step "Preflight checks"

if (-not (Test-Path $Repo))   { Fail "Repo not found at $Repo" }
if (-not (Test-Path $ApiDir)) { Fail "upload-api not found at $ApiDir" }

Set-Location $Repo

git rev-parse --is-inside-work-tree *> $null
if ($LASTEXITCODE -ne 0) { Fail "$Repo is not a git repository." }

# AWS credentials must be live in this shell or the deploy dies 10 minutes in.
$identity = aws sts get-caller-identity --output text 2>&1
if ($LASTEXITCODE -ne 0) {
    Fail "AWS credentials not working in this shell.`n$identity`nFix with 'aws sso login' or 'aws configure', then re-run."
}
Write-Host "AWS identity OK: $identity" -ForegroundColor Green

$startCommit = (git rev-parse --short HEAD).Trim()
Write-Host "Current commit: $startCommit"

# -------------------------------------------------------------------- stash --
Step "Stashing local changes"

$dirty = git status --porcelain
if ($dirty) {
    Write-Host "Uncommitted changes found:"
    git status --short
    $stamp = Get-Date -Format "yyyy-MM-dd HH:mm"
    git stash push -u -m "WIP before upload-api deploy $stamp"
    if ($LASTEXITCODE -ne 0) { Fail "git stash failed. Nothing has been changed." }
    $script:Stashed = $true
    Write-Host "Stashed safely. Recover later with: git stash pop" -ForegroundColor Yellow
} else {
    $script:Stashed = $false
    Write-Host "Working tree clean."
}

# --------------------------------------------------------------------- pull --
Step "Switching to main and pulling latest from origin"

# git pull with no arguments follows whatever branch HEAD is on, not
# necessarily main. Force onto main explicitly so a feature branch or
# detached HEAD checkout can never get deployed to prod.
$currentBranch = (git rev-parse --abbrev-ref HEAD).Trim()
if ($currentBranch -ne "main") {
    Write-Host "Currently on '$currentBranch' - switching to main." -ForegroundColor Yellow
    git checkout main
    if ($LASTEXITCODE -ne 0) { Fail "git checkout main failed. Your work is safe in the stash (git stash list)." }
}

git pull origin main
if ($LASTEXITCODE -ne 0) { Fail "git pull failed. Your work is safe in the stash (git stash list)." }

$newCommit = (git rev-parse --short HEAD).Trim()
Write-Host "Now at commit: $newCommit"

# ------------------------------------------------------------ verify the fix --
# This is the guard that was missing. Two independent checks: the deploy profile
# added by PR #33, and the absence of the PCON_REQUIRED validation it removed.
Step "Verifying the pconCode fix is present"

$samConfig = Join-Path $ApiDir "samconfig.toml"
$handler   = Join-Path $ApiDir "src\handler.mjs"

if (-not (Select-String -Path $samConfig -Pattern "\[prod\.deploy\.parameters\]" -Quiet)) {
    Fail "samconfig.toml has no [prod] profile - PR #33 is still missing. Do not deploy."
}
Write-Host "  [ok] prod profile present in samconfig.toml" -ForegroundColor Green

if (Select-String -Path $handler -Pattern "PCON_REQUIRED" -Quiet) {
    Fail "handler.mjs still contains PCON_REQUIRED - this is the OLD broken code. Do not deploy."
}
Write-Host "  [ok] PCON_REQUIRED gone from handler.mjs" -ForegroundColor Green

# -------------------------------------------------------------------- build --
Step "Building (this runs npm tests - a failure here means stop and read)"

Set-Location $ApiDir
sam build
if ($LASTEXITCODE -ne 0) { Fail "sam build failed. Nothing deployed." }

# ------------------------------------------------------------------- deploy --
Step "Deploying to ps-upload-api-prod"
Write-Host "SAM will show a changeset and wait for confirmation. Type 'y' to proceed." -ForegroundColor Yellow

sam deploy --config-env prod
if ($LASTEXITCODE -ne 0) { Fail "sam deploy failed. See the CloudFormation events above." }

# --------------------------------------------------------------------- done --
Write-Host ""
Write-Host "DEPLOY COMPLETE" -ForegroundColor Green
Write-Host "Deployed $startCommit -> $newCommit"
Write-Host ""

# template.yaml hardcodes ANTHROPIC_API_KEY: "" on PersonaFunction (see
# POLITICAL_SOLUTIONS_CONTEXT.md, "Known issues") - every deploy wipes it,
# and CloudFormation does not manage the real value.
Write-Host "ACTION REQUIRED" -ForegroundColor Red
Write-Host "  This deploy just reset PersonaFunction's ANTHROPIC_API_KEY to empty." -ForegroundColor Red
Write-Host "  Re-set it now: Lambda console -> PersonaFunction -> Configuration -> Environment variables." -ForegroundColor Red
Write-Host "  Until you do, the MP persona and draft pipelines will fail." -ForegroundColor Red
Write-Host ""

Write-Host "Next:" -ForegroundColor Cyan
Write-Host "  1. Upload ONE Stafford PDF as a smoke test before sending all seven."
if ($script:Stashed) {
Write-Host "  2. Your local edits are stashed. Restore with:  git stash pop"
Write-Host "     (if it conflicts, stop and get help rather than forcing it)"
}
Write-Host ""
