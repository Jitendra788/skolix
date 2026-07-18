Set-Location $PSScriptRoot
if (-not (Test-Path ".\.venv")) { python -m venv .venv }
$py = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
& $py -m pip install -r requirements.txt -q
& $py -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
