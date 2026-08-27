#!/usr/bin/env python3
import json
from pathlib import Path

LIVE=Path(__file__).resolve().parents[1]/"live-data.json"
data=json.loads(LIVE.read_text())
t=data.get("technical") or {}
h4=((t.get("structure4h") or {}).get("state") or "unavailable")
d1=((t.get("structure1d") or {}).get("state") or "unavailable")
for key,side in (("buyLimit","buy"),("sellLimit","sell")):
    s=((data.get("signals") or {}).get(key) or {})
    if not s: continue
    layers=s.get("layers") or {}
    aligned="bullish" if side=="buy" else "bearish"
    count=int(layers.get("bullishCount" if side=="buy" else "bearishCount") or 0)
    s["reasons"]=[
        f"Macro score {float(s.get('macroScore') or 0):+.1f} with {count} {aligned} layers",
        f"4H structure {h4}; daily structure {d1}",
        f"{aligned.title()} order block quality {s.get('orderBlockQuality') or 0}/100",
    ]
    if s.get("status")!="candidate": s["confidenceScore"]=0
LIVE.write_text(json.dumps(data,indent=2)+"\n")
