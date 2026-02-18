[CmdletBinding()]
param(
    [string]$Message = "chore: sync updates"
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

git add -A
if ($LASTEXITCODE -ne 0) { throw "git add -A failed." }

git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
    Write-Host "No staged changes to commit."
} else {
    git commit -m "$Message"
    if ($LASTEXITCODE -ne 0) { throw "git commit failed." }
}

git push
if ($LASTEXITCODE -ne 0) { throw "git push failed." }

git status
