$ErrorActionPreference = "SilentlyContinue"

$checks = @(
    @{ Name = "UI 8766"; Url = "http://127.0.0.1:8766/__gcs/ping" },
    @{ Name = "Launcher 8767"; Url = "http://127.0.0.1:8767/ping" },
    @{ Name = "Tiles 8768"; Url = "http://127.0.0.1:8768/health" }
)

Write-Host "GCS startup self-check" -ForegroundColor Cyan
Write-Host ""

foreach ($check in $checks) {
    try {
        $resp = Invoke-WebRequest -UseBasicParsing $check.Url -TimeoutSec 2
        $json = $null
        try { $json = $resp.Content | ConvertFrom-Json } catch { $json = $null }
        $ok = $resp.StatusCode -eq 200
        if ($json -and $null -ne $json.ok) {
            $ok = [bool]$json.ok
        }
        if ($ok) {
            Write-Host ("[OK ] " + $check.Name + "  " + $check.Url) -ForegroundColor Green
        } else {
            Write-Host ("[FAIL] " + $check.Name + "  " + $check.Url) -ForegroundColor Red
        }
    } catch {
        Write-Host ("[FAIL] " + $check.Name + "  " + $check.Url + "  ->  " + $_.Exception.Message) -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Tip: if Tiles 8768 fails, run .\.venv\Scripts\python.exe .\tools\map-tiles\tile_server.py" -ForegroundColor Yellow
