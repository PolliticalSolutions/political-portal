# Political Portal — register the local upload listener as a Windows Scheduled Task.
# Registers startup and logon triggers, runs as the current user, and restarts on failure.

$TaskName = "PoliticalPortalListener"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BatchFile = Join-Path $ScriptDir "run_listener.bat"
$CurrentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

if (-not (Test-Path $BatchFile)) {
    Write-Error "run_listener.bat not found at $BatchFile"
    exit 1
}

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Removed existing task '$TaskName'."
}

$Action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$BatchFile`"" -WorkingDirectory $ScriptDir
$Triggers = @(
    New-ScheduledTaskTrigger -AtStartup
    New-ScheduledTaskTrigger -AtLogOn -User $CurrentUser
)

$Settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Days 0) `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -MultipleInstances IgnoreNew `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries

$Principal = New-ScheduledTaskPrincipal `
    -UserId $CurrentUser `
    -LogonType Interactive `
    -RunLevel Limited

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Triggers `
    -Settings $Settings `
    -Principal $Principal `
    -Description "Polls AWS SQS for portal upload jobs and processes them locally."

Write-Host ""
Write-Host "Task '$TaskName' registered successfully for user $CurrentUser."
Write-Host "Triggers: Windows startup and user logon."
Write-Host ""
Write-Host "To start it now:"
Write-Host "  Start-ScheduledTask -TaskName '$TaskName'"
Write-Host ""
Write-Host "To check status:"
Write-Host "  Get-ScheduledTask -TaskName '$TaskName' | Get-ScheduledTaskInfo"
