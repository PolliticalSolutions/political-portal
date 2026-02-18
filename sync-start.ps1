[CmdletBinding()]
param(
    [switch]$AutoStash,
    [switch]$FixOrigin,
    [string]$ExpectedOrigin = "https://github.com/PolliticalSolutions/political-portal.git"
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$actualOrigin = git remote get-url origin 2>$null
if (-not $actualOrigin) {
    if ($FixOrigin) {
        git remote add origin "$ExpectedOrigin"
    } else {
        throw "origin remote is missing. Re-run with -FixOrigin to set it."
    }
} elseif ($actualOrigin -ne $ExpectedOrigin) {
    if ($FixOrigin) {
        git remote set-url origin "$ExpectedOrigin"
    } else {
        throw "origin mismatch. Expected '$ExpectedOrigin' but found '$actualOrigin'. Re-run with -FixOrigin."
    }
}

$didStash = $false
if ($AutoStash) {
    git update-index -q --refresh
    git diff-index --quiet HEAD --
    if ($LASTEXITCODE -ne 0) {
        git stash push -u -m "sync-start auto-stash $(Get-Date -Format o)"
        if ($LASTEXITCODE -eq 0) {
            $didStash = $true
        }
    }
}

try {
    git fetch --prune
    if ($LASTEXITCODE -ne 0) { throw "git fetch --prune failed." }

    git rev-parse --abbrev-ref --symbolic-full-name "@{u}" 1>$null 2>$null
    if ($LASTEXITCODE -eq 0) {
        git pull --ff-only
        if ($LASTEXITCODE -ne 0) { throw "git pull --ff-only failed." }
    } else {
        $originHeadRef = git symbolic-ref refs/remotes/origin/HEAD 2>$null
        if (-not $originHeadRef) { throw "No upstream set and unable to resolve origin default branch." }
        $defaultBranch = ($originHeadRef -replace "^refs/remotes/origin/", "")
        git pull --ff-only origin $defaultBranch
        if ($LASTEXITCODE -ne 0) { throw "git pull --ff-only origin $defaultBranch failed." }
    }
}
finally {
    if ($didStash) {
        git stash pop
    }
}

git status
