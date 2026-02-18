[CmdletBinding()]
param(
  [switch]$AutoStash,
  [switch]$FixOrigin,
  [string]$ExpectedOrigin = "https://github.com/PolliticalSolutions/political-portal.git"
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# Sanity: inside git repo
git rev-parse --is-inside-work-tree | Out-Null

# Origin check (warn; optionally fix)
$origin = ""
try { $origin = (git remote get-url origin).Trim() } catch { $origin = "" }

if ([string]::IsNullOrWhiteSpace($origin)) {
  Write-Host "No 'origin' remote set."
  if ($FixOrigin) {
    git remote add origin $ExpectedOrigin
    Write-Host "Set origin -> $ExpectedOrigin"
  } else {
    Write-Host "Run: git remote add origin `"$ExpectedOrigin`"   (or re-run with -FixOrigin)"
  }
} elseif ($origin -notmatch "PolliticalSolutions/political-portal") {
  Write-Host "WARNING: origin does not look like PolliticalSolutions/political-portal"
  Write-Host "origin = $origin"
  if ($FixOrigin) {
    git remote remove origin
    git remote add origin $ExpectedOrigin
    Write-Host "Reset origin -> $ExpectedOrigin"
  }
}

# Sync
git fetch --prune

$hadLocalChanges = $false
$porcelain = (git status --porcelain)
if ($porcelain) {
  $hadLocalChanges = $true
  if ($AutoStash) {
    $stamp = (Get-Date).ToString("s").Replace(":","-")
    git stash push -u -m "autostash: sync-start $stamp"
  } else {
    Write-Host "Local changes detected. Re-run with -AutoStash or commit first."
  }
}

try {
  git pull --ff-only
} catch {
  Write-Host "git pull --ff-only failed (likely divergent history)."
  Write-Host "If needed: git pull --rebase  (or resolve manually)"
  throw
}

if ($hadLocalChanges -and $AutoStash) {
  try {
    git stash pop
  } catch {
    Write-Host "Stash pop produced conflicts. Resolve conflicts, then run: git status"
    throw
  }
}

git status
