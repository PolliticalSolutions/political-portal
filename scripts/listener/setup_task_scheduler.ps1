# Political Portal — Register listener as a Windows Task Scheduler task.
# Run once as Administrator (or your own account if it has Task Scheduler access).
# The task will start automatically at Windows login and restart on failure.

$TaskName  = "PoliticalPortalListener"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BatchFile = Join-Path $ScriptDir "run_listener.bat"

if (-not (Test-Path $BatchFile)) {
    Write-Error "run_listener.bat not found at $BatchFile"
    exit 1
}

# Remove any existing task with the same name
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Removed existing task '$TaskName'."
}

$Action  = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$BatchFile`"" -WorkingDirectory $ScriptDir
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

$Settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Days 0) `
    -RestartCount 10 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable

$Principal = New-ScheduledTaskPrincipal `
    -UserId $env:USERNAME `
    -LogonType Interactive `
    -RunLevel Limited

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Principal $Principal `
    -Description "Polls AWS SQS for marked register upload jobs and processes them locally."

Write-Host ""
Write-Host "Task '$TaskName' registered successfully."
Write-Host "It will start automatically at next login."
Write-Host ""
Write-Host "To start it now without rebooting:"
Write-Host "  Start-ScheduledTask -TaskName '$TaskName'"
Write-Host ""
Write-Host "To check status:"
Write-Host "  Get-ScheduledTask -TaskName '$TaskName' | Get-ScheduledTaskInfo"
