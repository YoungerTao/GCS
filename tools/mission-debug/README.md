# Mission upload debug (Python)

Standalone MAVLink mission upload test, independent of the browser GCS.

## Setup

```bash
cd tools/mission-debug
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Close Mission Planner / QGC and disconnect the GCS in the browser before running (serial port exclusive).

## Run

```bash
.venv/bin/python mission_upload_test.py
.venv/bin/python mission_upload_test.py --port /dev/cu.usbmodem1301 --baud 115200
.venv/bin/python mission_upload_test.py --list-ports
```

## What we learned (2026-05-17)

On a connected ArduPilot board, HEARTBEAT reported **comp=0**, not comp=1. Mission upload succeeds only when `MISSION_COUNT` targets **sys=1, comp=0**. The web GCS previously forced `comp=0 → 1` in `mavlink.js` and sent missions to comp=1, so the FC never replied with `MISSION_REQUEST`.
