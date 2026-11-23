# Collects the Windows programs sosyalmedya runs next to Postiz:
# Node.js, PostgreSQL, Redis and the Temporal dev server.
# Runs on a GitHub Actions Windows runner (needs `gh` with GH_TOKEN).
#
#   pwsh desktop/scripts/prepare-runtime.ps1 -Out stage/runtime
param(
  [Parameter(Mandatory = $true)][string]$Out
)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$ProgressPreference = 'SilentlyContinue'

New-Item -ItemType Directory -Force -Path $Out | Out-Null
$Out = (Resolve-Path $Out).Path
$tmp = Join-Path $env:RUNNER_TEMP 'sm-runtime'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

function Expand-Fresh($zip, $dest) {
  if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
  Expand-Archive -Path $zip -DestinationPath $dest -Force
}

# ---------- Node.js: the exact node.exe this build was made with ----------
$nodeExe = (Get-Command node).Source
New-Item -ItemType Directory -Force -Path "$Out\node" | Out-Null
Copy-Item $nodeExe "$Out\node\node.exe"
Write-Host "node: $(& "$Out\node\node.exe" --version)"

# ---------- PostgreSQL ----------
# The runner image ships PostgreSQL; PGROOT points at it. Only the server
# binaries are copied (no pgAdmin / StackBuilder).
$pgRoot = $env:PGROOT
if (-not $pgRoot -or -not (Test-Path "$pgRoot\bin\pg_ctl.exe")) {
  $pgRoot = Get-ChildItem 'C:\Program Files\PostgreSQL' -Directory |
    Sort-Object { [int]($_.Name -replace '\D.*$', '') } -Descending |
    Select-Object -First 1 -ExpandProperty FullName
}
if (-not $pgRoot -or -not (Test-Path "$pgRoot\bin\pg_ctl.exe")) {
  throw 'PostgreSQL not found on the runner'
}
New-Item -ItemType Directory -Force -Path "$Out\pgsql" | Out-Null
foreach ($d in 'bin', 'lib', 'share') {
  Copy-Item -Recurse -Force "$pgRoot\$d" "$Out\pgsql\$d"
}
# Trim things the app never uses.
foreach ($x in 'pgAdmin 4', 'stackbuilder.exe') {
  Get-ChildItem "$Out\pgsql\bin" -Filter $x -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force
}
Remove-Item -Recurse -Force "$Out\pgsql\lib\*.lib" -ErrorAction SilentlyContinue
Write-Host "postgres: $(& "$Out\pgsql\bin\postgres.exe" --version)"

# ---------- Redis (Windows build) ----------
$redisZip = Join-Path $tmp 'redis.zip'
$got = $false
try {
  gh release download -R redis-windows/redis-windows --pattern '*Windows-x64-msys2.zip' --output $redisZip --clobber
  $got = $true
} catch { Write-Warning "redis-windows download failed: $_" }
if (-not $got) {
  gh release download -R tporadowski/redis --pattern 'Redis-x64-*.zip' --output $redisZip --clobber
}
Expand-Fresh $redisZip "$tmp\redis"
$redisServer = Get-ChildItem "$tmp\redis" -Recurse -Filter 'redis-server.exe' | Select-Object -First 1
if (-not $redisServer) { throw 'redis-server.exe not found in the Redis archive' }
New-Item -ItemType Directory -Force -Path "$Out\redis" | Out-Null
Copy-Item -Recurse -Force "$($redisServer.Directory.FullName)\*" "$Out\redis\"
Write-Host "redis: $(& "$Out\redis\redis-server.exe" --version)"

# ---------- Temporal CLI (includes the single-file dev server) ----------
$temporalZip = Join-Path $tmp 'temporal.zip'
gh release download -R temporalio/cli --pattern '*windows_amd64.zip' --output $temporalZip --clobber
Expand-Fresh $temporalZip "$tmp\temporal"
$temporalExe = Get-ChildItem "$tmp\temporal" -Recurse -Filter 'temporal.exe' | Select-Object -First 1
if (-not $temporalExe) { throw 'temporal.exe not found in the Temporal archive' }
New-Item -ItemType Directory -Force -Path "$Out\temporal" | Out-Null
Copy-Item $temporalExe.FullName "$Out\temporal\temporal.exe"
Write-Host "temporal: $(& "$Out\temporal\temporal.exe" --version)"

# ---------- Small helper preloaded into every Node process ----------
Copy-Item (Join-Path $PSScriptRoot '..\src\loopback.js') "$Out\loopback.js"

$size = (Get-ChildItem $Out -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
Write-Host ("runtime ready: {0:N0} MB" -f $size)
