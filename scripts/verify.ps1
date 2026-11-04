$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskPython = Join-Path $taskRoot '.venv\Scripts\python.exe'
Push-Location -LiteralPath (Join-Path $taskRoot 'backend')
try {
    & $taskPython -m ruff check .
    if ($LASTEXITCODE) { throw 'Backend lint failed' }
    & $taskPython -m ruff format --check .
    if ($LASTEXITCODE) { throw 'Backend formatting failed' }
    & $taskPython -m pytest -q
    if ($LASTEXITCODE) { throw 'Backend tests failed' }
} finally { Pop-Location }
Push-Location -LiteralPath (Join-Path $taskRoot 'frontend')
try {
    npm run format:check
    if ($LASTEXITCODE) { throw 'Frontend formatting failed' }
    npm run typecheck
    if ($LASTEXITCODE) { throw 'Type checking failed' }
    npm run lint
    if ($LASTEXITCODE) { throw 'Frontend unused-code lint failed' }
    npm test
    if ($LASTEXITCODE) { throw 'Frontend tests failed' }
    npm run build
    if ($LASTEXITCODE) { throw 'Frontend build failed' }
    npm audit --audit-level=moderate
    if ($LASTEXITCODE) { throw 'Frontend dependency audit failed' }
} finally { Pop-Location }
