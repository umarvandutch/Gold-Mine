#!/usr/bin/env python3
import json
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIVE = ROOT / "live-data.json"
HISTORY = ROOT / "data" / "trade-setup-history.json"


def parse_dt(v):
    if not v:
        return None
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00")).astimezone(timezone.utc)
    except Exception:
        return None


def num(v):
    try:
        return float(v)
    except Exception:
        return None


def clamp(x, a, b):
    return max(a, min(b, x))


def key_for(ob):
    return f"{ob.get('side')}|{ob.get('blockCandleAt')}|{ob.get('zoneLow')}|{ob.get('zoneHigh')}"


def touched(c, rec):
    return c["low"] <= rec["zoneHigh"] and c["high"] >= rec["zoneLow"]


def update_record(rec, candles):
    created = parse_dt(rec.get("createdAt"))
    if not created:
        return
    after = [c for c in candles if parse_dt(c.get("time")) and parse_dt(c.get("time")) >= created]
    if not after:
        return
    side = rec.get("side")
    stop = num(rec.get("planning", {}).get("invalidationReference"))
    targets = rec.get("planning", {}).get("targets") or []
    t1 = num(targets[0].get("price")) if targets else None
    t2 = num(targets[1].get("price")) if len(targets) > 1 else None
    r1 = num(targets[0].get("rMultiple")) if targets else None
    r2 = num(targets[1].get("rMultiple")) if len(targets) > 1 else None

    trigger_index = rec.get("triggerIndex")
    if trigger_index is None:
        for i, c in enumerate(after):
            if touched(c, rec):
                rec["triggerIndex"] = i
                rec["triggeredAt"] = c.get("time")
                rec["status"] = "triggered"
                trigger_index = i
                break
    if trigger_index is None:
        if datetime.now(timezone.utc) - created > timedelta(days=30):
            rec["status"] = "expired"
            rec["completedAt"] = after[-1].get("time")
            rec["outcomeR"] = 0.0
        return

    best_r = num(rec.get("bestR")) or 0.0
    for c in after[trigger_index:]:
        low, high = num(c.get("low")), num(c.get("high"))
        if low is None or high is None:
            continue
        stop_hit = stop is not None and (low <= stop if side == "bullish" else high >= stop)
        if stop_hit:
            rec["status"] = "stopped"
            rec["completedAt"] = c.get("time")
            rec["outcomeR"] = -1.0 if best_r <= 0 else best_r
            rec["bestR"] = best_r
            return
        if side == "bullish":
            if t2 is not None and high >= t2:
                best_r = max(best_r, r2 or 0)
                rec["status"] = "tp2"
                rec["completedAt"] = c.get("time")
                rec["outcomeR"] = best_r
                rec["bestR"] = best_r
                return
            if t1 is not None and high >= t1:
                best_r = max(best_r, r1 or 0)
                rec["status"] = "tp1"
        else:
            if t2 is not None and low <= t2:
                best_r = max(best_r, r2 or 0)
                rec["status"] = "tp2"
                rec["completedAt"] = c.get("time")
                rec["outcomeR"] = best_r
                rec["bestR"] = best_r
                return
            if t1 is not None and low <= t1:
                best_r = max(best_r, r1 or 0)
                rec["status"] = "tp1"
        rec["bestR"] = best_r


def calibration(records):
    completed = [r for r in records if r.get("status") in {"stopped", "tp1", "tp2"} and num(r.get("outcomeR")) is not None]
    n = len(completed)
    wins = [r for r in completed if num(r.get("outcomeR")) > 0]
    win_rate = len(wins) / n if n else None
    avg_r = sum(num(r.get("outcomeR")) for r in completed) / n if n else None
    factor = 1.0
    if n >= 30:
        factor = clamp(0.82 + (win_rate - 0.5) * 0.65 + max(-1.0, min(2.0, avg_r)) * 0.06, 0.75, 1.20)
    return {"completed": n, "wins": len(wins), "winRate": round(win_rate, 4) if win_rate is not None else None,
            "averageR": round(avg_r, 3) if avg_r is not None else None, "factor": round(factor, 3),
            "minimumSamplesForAdjustment": 30}


def main():
    if not LIVE.exists():
        raise SystemExit("live-data.json missing")
    live = json.loads(LIVE.read_text(encoding="utf-8"))
    technical = live.get("technical") if isinstance(live.get("technical"), dict) else {}
    candles = technical.get("candles4h") or []

    HISTORY.parent.mkdir(parents=True, exist_ok=True)
    if HISTORY.exists():
        try:
            hist = json.loads(HISTORY.read_text(encoding="utf-8"))
        except Exception:
            hist = {"version": 1, "updatedAt": None, "setups": []}
    else:
        hist = {"version": 1, "updatedAt": None, "setups": []}
    records = hist.setdefault("setups", [])
    by_key = {r.get("key"): r for r in records if r.get("key")}

    if technical.get("status") == "live":
        for ob in (technical.get("orderBlocks") or [])[:8]:
            planning = ob.get("planning") or {}
            if not planning.get("passesRewardRiskGate"):
                continue
            key = key_for(ob)
            if key in by_key:
                continue
            rec = {"key": key, "side": ob.get("side"), "createdAt": ob.get("createdAt"), "blockCandleAt": ob.get("blockCandleAt"),
                   "zoneLow": ob.get("zoneLow"), "zoneHigh": ob.get("zoneHigh"), "quality": ob.get("quality"),
                   "confluence": {"fairValueGap": ob.get("fairValueGap"), "liquiditySweep": ob.get("liquiditySweep"),
                                   "premiumDiscountAligned": ob.get("premiumDiscountAligned")},
                   "planning": planning, "source": technical.get("source"), "firstObservedAt": live.get("generatedAt"),
                   "status": "waiting", "triggerIndex": None, "triggeredAt": None, "completedAt": None, "bestR": 0.0, "outcomeR": None}
            records.append(rec)
            by_key[key] = rec

    if candles:
        for rec in records:
            if rec.get("status") not in {"stopped", "tp2", "expired"}:
                update_record(rec, candles)

    records.sort(key=lambda r: r.get("createdAt") or "", reverse=True)
    hist["setups"] = records[:600]
    hist["updatedAt"] = live.get("generatedAt") or datetime.now(timezone.utc).isoformat()
    hist["calibration"] = calibration(hist["setups"])
    HISTORY.write_text(json.dumps(hist, indent=2) + "\n", encoding="utf-8")

    live.setdefault("technical", {})["calibration"] = hist["calibration"]
    LIVE.write_text(json.dumps(live, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
