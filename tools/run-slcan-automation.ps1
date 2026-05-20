# Ensure COM bridge via gcs supervisor and run SLCAN automation (no hardware).
$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")

Write-Host "==> Ensuring COM bridge (gcs_supervisor) ..."
Push-Location (Join-Path $Root "tools")
python -c "from gcs_supervisor import ensure_bridge_process; import sys; sys.exit(0 if ensure_bridge_process(wait_s=15) else 1)"
if ($LASTEXITCODE -ne 0) { throw "com-bridge did not start" }
Pop-Location

Write-Host "==> Running Python SLCAN tests ..."
Push-Location (Join-Path $Root "tools\com-bridge")
python test_slcan_auto.py
$exitCode = $LASTEXITCODE
Pop-Location
if ($exitCode -ne 0) { exit $exitCode }

Write-Host "==> Injecting BatteryInfo frame for UI autotest ..."
$injectBody = @{ line = "T180444338000066412C004000000000C0" } | ConvertTo-Json -Compress
Invoke-RestMethod -Uri "http://127.0.0.1:8765/slcan-inject" -Method POST -Body $injectBody -ContentType "application/json" | Out-Null

Write-Host "==> Optional Playwright UI test ..."
python (Join-Path $Root "tools\com-bridge\test_ui_slcan_autotest.py")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$uiUrl = "http://127.0.0.1:8766/index.html?dc_autotest=1"
Write-Host "PASS: SLCAN automation (bridge managed by gcs_supervisor)"
Write-Host "UI autotest: $uiUrl"
