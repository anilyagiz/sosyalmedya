# Puts the built pieces into one folder that the installer packs:
#   stage\sosyalmedya.exe (+ Electron files)   desktop launcher
#   stage\runtime\                             node, postgres, redis, temporal
#   stage\app\                                 built Postiz monorepo
param(
  [Parameter(Mandatory = $true)][string]$Repo,
  [Parameter(Mandatory = $true)][string]$Stage
)
$ErrorActionPreference = 'Stop'

$Repo = (Resolve-Path $Repo).Path
New-Item -ItemType Directory -Force -Path $Stage | Out-Null
$Stage = (Resolve-Path $Stage).Path

function Robo($from, $to, [string[]]$xd = @(), [string[]]$xf = @()) {
  $rargs = @($from, $to, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/R:2', '/W:1', '/MT:16')
  if ($xd.Count) { $rargs += '/XD'; $rargs += $xd }
  if ($xf.Count) { $rargs += '/XF'; $rargs += $xf }
  $output = & robocopy @rargs 2>&1
  if ($LASTEXITCODE -ge 8) {
    $output | Select-Object -Last 40 | ForEach-Object { Write-Host $_ }
    throw "robocopy failed ($LASTEXITCODE): $from -> $to"
  }
  $global:LASTEXITCODE = 0
}

# 1. Electron launcher
$launcher = "$Repo\desktop\dist\win-unpacked"
if (-not (Test-Path "$launcher\sosyalmedya.exe")) {
  Get-ChildItem "$Repo\desktop\dist" -Recurse -Depth 1 | Select-Object FullName
  throw "launcher build not found in $launcher"
}
Copy-Item -Recurse -Force "$launcher\*" $Stage

# 2. Postiz
$app = Join-Path $Stage 'app'
$skipDirs = @(
  "$Repo\.git", "$Repo\.github", "$Repo\desktop", "$Repo\Jenkins", "$Repo\reports",
  "$Repo\apps\extension", "$Repo\apps\sdk", "$Repo\apps\commands",
  "$Repo\apps\frontend\.next\cache", "$Repo\node_modules\.cache", "$Repo\stage"
)
Robo $Repo $app $skipDirs @('*.map', '.env', '.env.*')

# The upstream .env.example is not used on the desktop.
Remove-Item -Force "$app\.env.example" -ErrorAction SilentlyContinue

# 3. Sanity checks: fail the build early instead of shipping a broken installer.
$must = @(
  "$app\apps\backend\dist\apps\backend\src\main.js",
  "$app\apps\orchestrator\dist\apps\orchestrator\src\main.js",
  "$app\apps\frontend\.next\BUILD_ID",
  "$app\node_modules\next\dist\bin\next",
  "$app\node_modules\prisma\build\index.js",
  "$app\libraries\nestjs-libraries\src\database\prisma\schema.prisma",
  "$Stage\runtime\node\node.exe",
  "$Stage\runtime\pgsql\bin\pg_ctl.exe",
  "$Stage\runtime\redis\redis-server.exe",
  "$Stage\runtime\temporal\temporal.exe",
  "$Stage\runtime\loopback.js",
  "$Stage\sosyalmedya.exe"
)
foreach ($f in $must) {
  if (-not (Test-Path $f)) { throw "missing in package: $f" }
}
$engines = Get-ChildItem "$app\node_modules" -Recurse -Filter 'schema-engine*.exe' -ErrorAction SilentlyContinue
if (-not $engines) { throw 'Prisma schema engine (schema-engine-windows.exe) is not in the package' }
$queryEngine = Get-ChildItem "$app\node_modules" -Recurse -Filter 'query_engine-windows*' -ErrorAction SilentlyContinue
if (-not $queryEngine) { throw 'Prisma query engine for Windows is not in the package' }

# Long paths break some installers and older Windows setups: report the worst.
$longest = Get-ChildItem $Stage -Recurse -File |
  ForEach-Object { $_.FullName.Substring($Stage.Length).Length } |
  Measure-Object -Maximum
Write-Host "longest relative path: $($longest.Maximum) chars"

$files = (Get-ChildItem $Stage -Recurse -File | Measure-Object -Property Length -Sum)
Write-Host ("stage: {0:N0} files, {1:N0} MB" -f $files.Count, ($files.Sum / 1MB))
