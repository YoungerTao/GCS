# GitHub Issues Drafts - 2026-06-06

Below are draft issue bodies for the problems investigated today. They are written so they can be pasted directly into GitHub Issues.

---

## Issue 1

Title:

```text
[bug] DroneCAN SLCAN parameter read may route GetSet requests through the wrong transport
```

Body:

```md
## Summary

When the DroneCAN panel shows `SLCAN 直连`, clicking `设置菜单 -> Parameters` may still send DroneCAN GetSet requests through the MAVLink CAN_FORWARD path instead of the active SLCAN path.

## Environment

- OS: Windows
- Hardware / device: ArduPilot FC + SLCAN virtual port pair (COM8 MAVLink / COM9 SLCAN)
- Connection mode: MAVLink on COM8, SLCAN direct on COM9
- Browser: In-app browser
- GCS commit / branch: current local workspace on 2026-06-06

## Reproduction Steps

1. Connect MAVLink through COM8.
2. Open `初始设置 -> DroneCAN`.
3. Ensure the UI shows `SLCAN 直连 · COM9`.
4. Open `设置菜单 -> Parameters` for a DroneCAN node.

## Expected Result

The parameter read should use the current SLCAN direct transport.

## Actual Result

The request may be handled as if the transport were MAVLink CAN_FORWARD, causing misleading errors such as:

`MAVLink CAN转发失败: COM端口访问被拒绝。`

## Logs / Screenshots

- Browser console captured stack trace pointing to `sendSlcanAsciiLine()` in `JS/ui/dronecan-setup.js`

## Technical Notes

- Affected files / modules:
  - `JS/ui/dronecan-setup.js`
- Related ports / services:
  - COM8, COM9, 8765
- Whether issue is stable or intermittent:
  - Intermittent, state-dependent

## Root Cause

Frontend transport state can drift: the UI may show SLCAN direct while the request path still treats the session as `mavlink`.

## Fix

Update `sendSlcanAsciiLine()` to choose the request path from the current UI mode instead of trusting stale transport state.

## Verification

- [x] Reproduced locally
- [x] Fix applied
- [x] Verified in app browser
- [x] Verified with real hardware
- [x] Documentation updated

## Related Issues

- See also: SLCAN zombie bridge state / 8765 recovery issue
```

---

## Issue 2

Title:

```text
[bug] SLCAN COM bridge can remain open while reader thread is dead, causing misleading serial access errors
```

Body:

```md
## Summary

The SLCAN COM bridge can enter a zombie state where the port still reports as open, but the reader thread has already died. Subsequent parameter reads fail and are surfaced as misleading "serial access denied" errors.

## Environment

- OS: Windows
- Hardware / device: COM9 ArduPilot SLCAN virtual port
- Connection mode: SLCAN direct via 8765 bridge
- Browser: In-app browser
- GCS commit / branch: current local workspace on 2026-06-06

## Reproduction Steps

1. Run the normal GCS stack with SLCAN direct on COM9.
2. Trigger DroneCAN parameter reads over time.
3. Inspect `http://127.0.0.1:8765/slcan-status` after failures.

## Expected Result

If the bridge is unhealthy, it should either recover automatically or expose a precise bridge-state error.

## Actual Result

`/slcan-status` can return:

```json
{
  "open": true,
  "port": "COM9",
  "readerAlive": false,
  "error": "ClearCommError failed (PermissionError(13, '设备不识别此命令。', None, 22))"
}
```

The UI then reports a generic serial-access error, which looks like external port contention even when no other GCS app is connected.

## Logs / Screenshots

- `slcan-status` response captured during failure
- Browser UI showed `读取失败：串口访问被拒绝...`

## Technical Notes

- Affected files / modules:
  - `tools/com-bridge/server.py`
  - `JS/ui/dronecan-setup.js`
- Related ports / services:
  - 8765, COM9
- Whether issue is stable or intermittent:
  - Intermittent, stateful

## Root Cause

The SLCAN bridge can keep a serial object that still appears open while the underlying reader loop has already exited.

## Fix

Add bridge self-healing:

- Frontend checks `/slcan-status` before DroneCAN GetSet and reopens SLCAN if needed
- Backend `/slcan-write` performs the same recovery if it detects `readerAlive=false` or `ClearCommError failed`

## Verification

- [x] Reproduced locally
- [x] Fix applied
- [x] Verified in app browser
- [x] Verified with real hardware
- [x] Documentation updated

## Related Issues

- See also: wrong DroneCAN transport selection issue
```

---

## Issue 3

Title:

```text
[bug] Launcher 8767 may fail to start when watchdog is spawned through Microsoft Store Python
```

Body:

```md
## Summary

The launcher/watchdog on port 8767 can fail to start even while UI, COM bridge, and tile services are already running. Self-check then reports `Launcher 8767: timeout`.

## Environment

- OS: Windows
- Browser: In-app browser
- GCS commit / branch: current local workspace on 2026-06-06

## Reproduction Steps

1. Start the stack from a path that may invoke system Python rather than the repo `.venv`.
2. Open the UI and wait for self-check.
3. Observe `Launcher 8767: timeout`.

## Expected Result

The watchdog/launcher should start reliably and answer `http://127.0.0.1:8767/ping`.

## Actual Result

- `8766`: up
- `8765`: up
- `8768`: up
- `8767`: timeout

Historical `tools/watchdog.stderr.log` also showed watchdog activity under:

`C:\\Program Files\\WindowsApps\\PythonSoftwareFoundation.Python.3.13...`

## Logs / Screenshots

- UI self-check banner showing `Launcher 8767: timeout`
- `watchdog.stderr.log` containing traces from Store Python

## Technical Notes

- Affected files / modules:
  - `tools/gcs-launch.py`
  - `windows/GCS.cmd`
  - `tools/gcs_watchdog.py`
- Related ports / services:
  - 8767
- Whether issue is stable or intermittent:
  - Environment-dependent

## Root Cause

`gcs_watchdog.py` correctly rejects Microsoft Store Python, but `gcs-launch.py` could still spawn it using `sys.executable`. In addition, `windows/GCS.cmd` could fall back to system `pythonw/python` if `.venv` was missing.

## Fix

- Make `tools/gcs-launch.py` use `gcs_supervisor.gcs_python()`
- Remove dangerous fallback from `windows/GCS.cmd`; require repo `.venv`

## Verification

- [x] Reproduced locally
- [x] Fix applied
- [x] Verified in app browser
- [x] Verified with real hardware
- [x] Documentation updated

## Related Issues

- Related to Windows Store Python environment problems
```

---

## Issue 4

Title:

```text
[bug] DroneCAN page mixes SLCAN and MAVLink CAN sources; transport tabs not isolated
```

Body:

```md
## Summary

On `初始设置 -> DroneCAN`, the UI could show `SLCAN 直连` while the node list, inspector, and parameter paths still mixed data or fell back to MAVLink CAN_FORWARD. Users could click nodes from the wrong transport (e.g. `MAVLink CAN2` on the SLCAN tab), causing misleading `Parameter service response timeout` errors.

With only one USB serial port (MAVLink occupied), the SLCAN tab remained visible and silently fell back to MAVLink instead of hiding unavailable transport.

## Environment

- OS: Windows
- Hardware: ArduPilot FC; optional second USB virtual port or USB-CAN SLCAN adapter
- Connection mode: single-port MAVLink only, or dual-port MAVLink + SLCAN
- Browser: In-app browser / Chrome Web Serial
- GCS commit / branch: local workspace, fixed 2026-06-07

## Reproduction Steps

1. Connect MAVLink on the only available COM port.
2. Open `初始设置 -> DroneCAN` — SLCAN tab still visible.
3. Observe nodes with `source: MAVLink CAN2` while badge says `SLCAN 直连`, or empty inspector.
4. Alternatively: dual-path setup, stay on SLCAN tab, open Parameters on a MAVLink-sourced node → timeout.

## Expected Result

- Three isolated transport tabs: `SLCAN 直连`, `MAVLink CAN1`, `MAVLink CAN2`
- SLCAN tab only uses SLCAN ASCII; MAVLink tabs only use CAN_FORWARD + CAN_FRAME
- No automatic SLCAN → MAVLink fallback
- Single serial / no SLCAN hardware: hide SLCAN tab, default to MAVLink CAN1
- Inspector: prefer SLCAN when available, else MAVLink CAN1; single source, no merge

## Actual Result

- `SLCAN_MONITOR` aggregated both SLCAN and MAVLink hub data
- `ensureSlcanDirectSession()` fell back to `ensureMavlinkCanForward()` in several branches
- `pollSlcanTraffic()` always called `/slcan-nodes`; no `/mavlink-can-nodes`
- `mavlink.js` fed all CAN_FRAME into one store regardless of active tab
- MAVLink parameter egress incorrectly used `/slcan-write`

## Logs / Screenshots

Example mixed snapshot:

```json
{ "nodeId": 10, "source": "SLCAN Direct" }
{ "nodeId": 25, "source": "MAVLink CAN2" }
```

## Technical Notes

- Affected files / modules:
  - `JS/ui/dronecan-setup.js`
  - `JS/core/mavlink.js`
  - `JS/services/serial.js`
  - `JS/services/slcan-web-serial.js`
  - `tools/com-bridge/server.py`
- Related ports / services: 8765, COM bridge SLCAN + MAVLink hubs
- Whether issue is stable or intermittent: stable design flaw; fallback intermittent

## Root Cause

Transport protocol, UI mode, node store, poll API, and egress path were not separated. SLCAN page could display or operate on MAVLink CAN metadata.

## Fix

- Split `currentTransport` / `currentView`; single-row toolbar with 7 tabs
- Independent runtimes: `slcanRuntime`, `mavlinkCan1Runtime`, `mavlinkCan2Runtime`
- `syncTransportTabs()` hides SLCAN when unavailable; remove all SLCAN→MAVLink fallback
- Backend: `GET /mavlink-can-nodes?bus=1|2`, `POST /mavlink-can-write`, `status()` bus filter
- `feedMavlinkCanFrameIfActive` / `feedSlcanCanFrame` gating; `resolveInspectorTransport()`
- `sendMavlinkCanFrame` for MAVLink parameter egress

## Verification

- [x] Reproduced locally (mixed sources / single-port fallback)
- [x] Fix applied
- [ ] Verified in app browser (pending hardware regression)
- [ ] Verified with real hardware
- [x] Documentation updated

## Related Issues

- Issue 1: wrong GetSet transport selection
- Issue 2: SLCAN zombie bridge state
- Docs: `docs/dronecan-slcan-mavlink-source-mixing-20260606.md`
- Plan: `docs/dronecan-transport-isolation-plan.md`
```

