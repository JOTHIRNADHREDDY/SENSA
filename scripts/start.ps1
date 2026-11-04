param([switch]$Production, [switch]$Background, [ValidateRange(0,8)][int]$Workers = 0, [string]$IsolatedData)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $taskRoot
if ($IsolatedData) {
    $taskIsolated = if ([IO.Path]::IsPathRooted($IsolatedData)) { [IO.Path]::GetFullPath($IsolatedData) } else { [IO.Path]::GetFullPath((Join-Path $taskRoot $IsolatedData)) }
    $taskPrivateRoot = Join-Path $taskRoot 'data'
    if ((Split-Path -Parent $taskIsolated) -ne $taskPrivateRoot -or (Test-Path -LiteralPath $taskIsolated)) {
        throw 'Isolated data must be a new directory below the workspace data directory.'
    }
    [Environment]::SetEnvironmentVariable('SENSA_DATA_DIR', $taskIsolated, 'Process')
    Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
    [Environment]::SetEnvironmentVariable('SENSA_ENV', 'local', 'Process')
    [Environment]::SetEnvironmentVariable('SENSA_AUTH_MODE', 'local', 'Process')
    [Environment]::SetEnvironmentVariable('SENSA_ORIGINS', 'http://127.0.0.1:3001,http://localhost:3001', 'Process')
    [Environment]::SetEnvironmentVariable('MODEL_API_KEY', $null, 'Process')
} elseif (Test-Path -LiteralPath '.env') {
    foreach ($line in Get-Content -LiteralPath '.env') {
        if ($line -match '^([A-Z_][A-Z0-9_]*)=(.+)$') {
            [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2].Trim('"', "'"), 'Process')
        }
    }
}
$taskPython = Join-Path $taskRoot '.venv\Scripts\python.exe'
if (!(Test-Path -LiteralPath $taskPython)) { throw 'Run python -m venv .venv and install backend/requirements-lock.txt first.' }
foreach ($taskPort in 3001,8001) {
    if (Get-NetTCPConnection -State Listen -LocalPort $taskPort -ErrorAction SilentlyContinue) { throw "Port $taskPort is already in use. Stop that workspace or use the documented two-terminal path with matching configuration." }
}
Push-Location -LiteralPath (Join-Path $taskRoot 'backend')
& $taskPython -m app.db
if ($LASTEXITCODE -ne 0) { throw 'Migration failed' }
Pop-Location
if ($Workers -gt 0) { [Environment]::SetEnvironmentVariable('SENSA_WORKER_MODE', 'external', 'Process') }
[Environment]::SetEnvironmentVariable('SENSA_WORKER_SESSION', [guid]::NewGuid().ToString('N'), 'Process')
$taskApi = Start-Process -FilePath $taskPython -ArgumentList '-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8001','--timeout-keep-alive','60' -WorkingDirectory (Join-Path $taskRoot 'backend') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskRoot 'data\backend.log') -RedirectStandardError (Join-Path $taskRoot 'data\backend-errors.log')
$taskRuntime = @{ backend = $taskApi.Id }
for ($taskIndex = 1; $taskIndex -le $Workers; $taskIndex++) {
    $taskWorker = Start-Process -FilePath $taskPython -ArgumentList '-m','app.worker' -WorkingDirectory (Join-Path $taskRoot 'backend') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskRoot "data\worker-$taskIndex.log") -RedirectStandardError (Join-Path $taskRoot "data\worker-$taskIndex-errors.log")
    $taskRuntime["worker$taskIndex"] = $taskWorker.Id
}
# The model credential belongs only to API/worker processes, never the Next.js process.
[Environment]::SetEnvironmentVariable('MODEL_API_KEY', $null, 'Process')
if ($Background) {
    $taskNode = (Get-Command node -ErrorAction Stop).Source
    $taskNext = Join-Path $taskRoot 'frontend\node_modules\next\dist\bin\next'
    $taskMode = if ($Production) { 'start' } else { 'dev' }
    $taskFront = Start-Process -FilePath $taskNode -ArgumentList "`"$taskNext`"",$taskMode,'--hostname','127.0.0.1','--port','3001' -WorkingDirectory (Join-Path $taskRoot 'frontend') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskRoot 'data\frontend.log') -RedirectStandardError (Join-Path $taskRoot 'data\frontend-errors.log')
    $taskRuntime["frontend"] = $taskFront.Id
    $taskRuntime | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskRoot 'data\runtime.json')
    $taskDeadline = (Get-Date).AddSeconds(25)
    do {
        try {
            $taskHealth = Invoke-RestMethod -Uri 'http://127.0.0.1:8001/api/health' -TimeoutSec 2
            $taskPage = Invoke-WebRequest -Uri 'http://127.0.0.1:3001/' -TimeoutSec 2 -UseBasicParsing
            if ($taskHealth.active_workers -ge [Math]::Max(1,$Workers) -and $taskPage.StatusCode -eq 200) { break }
        } catch { }
        if ((Get-Date) -ge $taskDeadline) { throw 'SENSA did not become ready. Check the local service logs and use scripts\stop.ps1 before retrying.' }
        Start-Sleep -Milliseconds 500
    } while ($true)
    Write-Host "SENSA started at http://127.0.0.1:3001 (API PID $($taskApi.Id), frontend PID $($taskFront.Id))."
    Write-Host 'Use scripts\stop.ps1 to stop these background processes.'
    return
}
try {
    Write-Host 'SENSA: http://127.0.0.1:3001   API: http://127.0.0.1:8001/docs'
    Write-Host 'Create your administrator account in the browser. Ctrl+C stops the workspace.'
    Set-Location -LiteralPath (Join-Path $taskRoot 'frontend')
    if ($Production) { npm run start } else { npm run dev }
} finally {
    foreach ($taskEntry in $taskRuntime.GetEnumerator()) {
        if ($taskEntry.Key.StartsWith('worker')) {
            Get-CimInstance Win32_Process -Filter "ParentProcessId=$($taskEntry.Value)" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains('app.worker') } | ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue }
            Stop-Process -Id $taskEntry.Value -ErrorAction SilentlyContinue
        }
    }
    Get-CimInstance Win32_Process -Filter "ParentProcessId=$($taskApi.Id)" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains('app.main:app') -and $_.CommandLine.Contains('8001') } | ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue }
    Stop-Process -Id $taskApi.Id -ErrorAction SilentlyContinue
    Set-Location -LiteralPath $taskRoot
}
