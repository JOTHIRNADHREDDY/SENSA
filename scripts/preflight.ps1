param([switch]$Containers, [ValidateRange(1,8)][int]$ExpectedWorkers = 1)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $taskRoot
$taskPython = Join-Path $taskRoot '.venv\Scripts\python.exe'
if (!(Test-Path -LiteralPath $taskPython)) { throw 'Python environment is missing.' }
if (!(Test-Path -LiteralPath 'frontend\.next\BUILD_ID')) { throw 'Build the frontend first.' }
& $taskPython -c "import sys;sys.path.insert(0,'backend');from app.db import engine;from sqlalchemy import text;from app.media import ffmpeg;r=ffmpeg(['-version']);assert r.returncode==0;db=engine.connect();assert db.execute(text('SELECT MAX(version) FROM schema_migrations')).scalar()==4;print('Schema v4 and FFmpeg: PASS')"
if ($LASTEXITCODE -ne 0) { throw 'Backend preflight failed.' }
$taskHealth = Invoke-RestMethod -Uri 'http://127.0.0.1:8001/api/health' -TimeoutSec 10
if ($taskHealth.version -ne '4.0.0' -or $taskHealth.database -ne 'ready') { throw 'The running API or database is not ready.' }
if ($taskHealth.active_workers -lt $ExpectedWorkers) { throw "Expected $ExpectedWorkers active workers, found $($taskHealth.active_workers)." }
$taskFront = Invoke-WebRequest -Uri 'http://127.0.0.1:3001/' -TimeoutSec 10 -UseBasicParsing
if ($taskFront.StatusCode -ne 200) { throw 'The frontend did not return HTTP 200.' }
Write-Host "API, frontend HTTP 200, and $($taskHealth.active_workers) active workers: PASS."
if ($Containers) {
    if (!(Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Container runtime unavailable: install/start Docker before container validation.' }
    # --quiet validates interpolation without printing environment secrets into logs.
    docker compose config --quiet
    if ($LASTEXITCODE -ne 0) { throw 'Compose validation failed.' }
    docker compose ps --status running --services
}
