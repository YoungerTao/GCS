#!/usr/bin/env python3
"""CLI to prefetch SRTM terrain tiles."""
from __future__ import annotations

import argparse
import json
import time

from terrain_elevation import cancel_prefetch, prefetch_bbox, prefetch_status


def main() -> None:
    parser = argparse.ArgumentParser(description="Prefetch SRTM Skadi terrain tiles")
    parser.add_argument("--south", type=float, required=True)
    parser.add_argument("--west", type=float, required=True)
    parser.add_argument("--north", type=float, required=True)
    parser.add_argument("--east", type=float, required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    body = {
        "south": args.south,
        "west": args.west,
        "north": args.north,
        "east": args.east,
    }
    if args.dry_run:
        print(json.dumps(prefetch_bbox(body, dry_run=True)))
        return
    print(json.dumps(prefetch_bbox(body)))
    while True:
        st = prefetch_status()
        print(json.dumps(st))
        if not st.get("running"):
            break
        time.sleep(0.5)


if __name__ == "__main__":
    main()
