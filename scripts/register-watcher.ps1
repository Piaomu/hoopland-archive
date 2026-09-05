# Registers a scheduled task that watches the OneDrive inbox for new save files at logon.
# Run once from PowerShell:  .\scripts\register-watcher.ps1
# Remove with:               Unregister-ScheduledTask -TaskName "HoopLandArchiveWatcher" -Confirm:$false

$repo = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node).Source
$action = New-ScheduledTaskAction -Execute $node `
  -Argument "--max-old-space-size=8192 --import tsx ingest/cli.ts watch" `
  -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName "HoopLandArchiveWatcher" -Action $action -Trigger $trigger -Settings $settings -Description "Ingests Hoop Land save files dropped in the OneDrive archive inbox." -Force | Out-Null
Write-Host "Registered HoopLandArchiveWatcher (runs at logon). Start it now with: Start-ScheduledTask -TaskName HoopLandArchiveWatcher"
