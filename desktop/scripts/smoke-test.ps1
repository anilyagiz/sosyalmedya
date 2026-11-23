# Installs sosyalmedya the way a user would (per-user, no admin) and runs the
# built-in end-to-end check twice: once on a fresh machine (first start creates
# the database) and once more (normal start with existing data).
param(
  [Parameter(Mandatory = $true)][string]$Installer
)
$ErrorActionPreference = 'Stop'

$installDir = Join-Path $env:LOCALAPPDATA 'Programs\sosyalmedya'
$exe = Join-Path $installDir 'sosyalmedya.exe'
$launcherLog = Join-Path $env:LOCALAPPDATA 'sosyalmedya\data\logs\launcher.log'

Write-Host "Installing $Installer"
$p = Start-Process -FilePath $Installer -ArgumentList '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/CURRENTUSER', '/TASKS=desktopicon', "/LOG=$env:RUNNER_TEMP\install.log" -Wait -PassThru
if ($p.ExitCode -ne 0) {
  Get-Content "$env:RUNNER_TEMP\install.log" -Tail 50
  throw "installer exited with $($p.ExitCode)"
}
if (-not (Test-Path $exe)) { throw "sosyalmedya.exe not installed at $exe" }
$shortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) 'sosyalmedya.lnk'
if (-not (Test-Path $shortcut)) { throw 'desktop shortcut missing' }
Write-Host 'Installed OK'

function Invoke-Smoke($label) {
  Write-Host "=== smoke run: $label ==="
  $start = Get-Date
  $proc = Start-Process -FilePath $exe -ArgumentList '--smoke-test' -PassThru
  if (-not $proc.WaitForExit(25 * 60 * 1000)) {
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    throw "$label timed out"
  }
  $secs = [math]::Round(((Get-Date) - $start).TotalSeconds)
  if (Test-Path $launcherLog) { Get-Content $launcherLog -Tail 40 }
  if ($proc.ExitCode -ne 0) { throw "$label failed (exit $($proc.ExitCode)) after $secs s" }
  $passed = Select-String -Path $launcherLog -Pattern 'ALL CHECKS PASSED' -SimpleMatch
  if (-not $passed) { throw "$label did not report success" }
  Write-Host "$label passed in $secs s"
}

Invoke-Smoke 'first start'
Clear-Content $launcherLog
Invoke-Smoke 'second start'

# Nothing should be left running after the app quits.
Start-Sleep -Seconds 5
$left = Get-Process | Where-Object { $_.Path -and $_.Path.StartsWith($installDir) }
if ($left) {
  $left | Format-Table Id, ProcessName, Path
  throw 'processes left running after quit'
}

Write-Host 'Uninstalling'
$uninstaller = Join-Path $installDir 'unins000.exe'
$u = Start-Process -FilePath $uninstaller -ArgumentList '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART' -Wait -PassThru
if ($u.ExitCode -ne 0) { throw "uninstaller exited with $($u.ExitCode)" }
Write-Host 'Smoke test finished: install, two starts, uninstall all OK'
