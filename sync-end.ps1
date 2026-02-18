[CmdletBinding()]
param(
  [string]$Message = ""
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

git rev-parse --is-inside-work-tree | Out-Null

# Nothing to do?
if (-not (git status --porcelain)) {
  Write-Host "No changes to commit."
  git status
  exit 0
}

git add -A

# Commit message
if ([string]::IsNullOrWhiteSpace($Message)) {
  $Message = Read-Host "Commit message"
}
if ([string]::IsNullOrWhiteSpace($Message)) {
  throw "Commit message cannot be empty."
}

git commit -m $Message
git push
git status
