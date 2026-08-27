#!/usr/bin/env python3
import json
from pathlib import Path

LIVE=Path(__file__).resolve().parents[1]/"live-data.json"
data=json.loads(LIVE.read_text())
s=((data.get("signals") or {}).get("buyLimit") or {})
t=data.get("technical") or {}
if s:
    h4=((t.get("structure4h") or {}).get("state") or "unavailable")
    d1=((t.get("structure1d") or {}).get("state") or "unavailable")
    layers=s.get("layers") or {}
    s["reasons"]=[
        f"Macro score {float(s.get('macroScore') or 0):+.1f} with {int(layers.get('bullishCount') or 0)} bullish layers",
        f"4H structure {h4}; daily structure {d1}",
        f"Bullish order block quality {s.get('orderBlockQuality') or 0}/100",
    ]
    if s.get("status")!="candidate":
        s["confidenceScore"]=0
LIVE.write_text(json.dumps(data,indent=2)+"\n")
