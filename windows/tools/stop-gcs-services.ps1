$ErrorActionPreference = "SilentlyContinue"
$ports = @(8765, 8766, 8767, 8768)
$log = $env:GCS_INSTALL_LOG

function Log-Error($msg) {
  if ($log) {
    try {
      Add-Content -LiteralPath $log -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [stop-gcs-services] $msg" -ErrorAction Stop
    } catch {
      # parent may hold log; ignore
    }
  }
}

foreach ($p in $ports) {
  $killed = $false
  # Preferred: Get-NetTCPConnection (Win 8 / Server 2012+)
  try {
    Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty OwningProcess -Unique |
      ForEach-Object {
        $proc = Get-Process -Id $_ -ErrorAction SilentlyContinue
        if ($proc -and ($proc.Name -like '*python*')) {
          Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
          $killed = $true
        }
      }
  } catch {
    # older Windows or cmdlet missing -> fallback
  }

  if (-not $killed) {
    # Fallback: netstat -ano + tasklist/taskkill (covers Win7 etc.)
    try {
      $lines = netstat -ano | findstr ":$p" | findstr /I "LISTENING"
      foreach ($line in $lines) {
        $parts = $line.Trim() -split '\s+'
        if ($parts.Count -ge 5) {
          $pid = $parts[-1]
          if ($pid -match '^\d+$') {
            $tl = tasklist /FI "PID eq $pid" /FO CSV /NH 2>$null
            if ($tl -and ($tl -match '(?i)python')) {
              taskkill /PID $pid /F >$null 2>&1
              $killed = $true
            }
          }
        }
      }
    } catch {
      Log-Error "Fallback reaper failed for port ${p}: $_"
    }
  }
}

# Idempotent + silent success. Errors only logged (if GCS_INSTALL_LOG set).
exit 0
