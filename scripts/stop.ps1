$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskFile = Join-Path $taskRoot 'data\runtime.json'
if (!(Test-Path -LiteralPath $taskFile)) { throw 'No background workspace record found.' }
$taskProcesses = Get-Content -LiteralPath $taskFile -Raw | ConvertFrom-Json
foreach ($taskProperty in $taskProcesses.PSObject.Properties) {
    $taskProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$($taskProperty.Value)"
    if (!$taskProcess) { continue }
    if (!$taskProcess.ExecutablePath -or !$taskProcess.CommandLine) {
        throw 'Cannot verify a recorded process. If ports 3001 and 8001 are free, start SENSA to replace the stale runtime record.'
    }
    if ($taskProperty.Name -eq 'frontend' -and $taskProcess.CommandLine.Contains($taskRoot)) {
        Stop-Process -Id $taskProcess.ProcessId
    } elseif ($taskProperty.Name -eq 'backend' -and $taskProcess.ExecutablePath.StartsWith($taskRoot) -and $taskProcess.CommandLine.Contains('app.main:app')) {
        # Windows venv launchers can own a second Python process; stop only these known app children.
        Get-CimInstance Win32_Process -Filter "ParentProcessId=$($taskProcess.ProcessId)" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains('app.main:app') -and $_.CommandLine.Contains('8001') } | ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue }
        Stop-Process -Id $taskProcess.ProcessId
    } elseif ($taskProperty.Name -match '^worker[0-9]+$' -and $taskProcess.ExecutablePath.StartsWith($taskRoot) -and $taskProcess.CommandLine.Contains('app.worker')) {
        Get-CimInstance Win32_Process -Filter "ParentProcessId=$($taskProcess.ProcessId)" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains('app.worker') } | ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue }
        Stop-Process -Id $taskProcess.ProcessId
    } else { throw 'Process identity changed; refusing to stop an unrelated process.' }
}
Remove-Item -LiteralPath $taskFile
Write-Host 'SENSA background processes stopped. Workspace data preserved.'
