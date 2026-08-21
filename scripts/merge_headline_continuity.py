#!/usr/bin/env python3
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIVE = ROOT / "live-data.json"
MAX_HEADLINES = 36
MAX_AGE = timedelta(hours=72)


def parse_iso(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).astimezone(timezone.utc)
    except Exception:
        return None


def headline_key(item):
    url = str(item.get("url") or "").strip().lower()
    if url:
        return f"url:{url}"
    title = re.sub(r"\W+", "", str(item.get("title") or "").lower())[:180]
    return f"title:{title}" if title else ""


def sort_key(item):
    dt = parse_iso(item.get("publishedUtc"))
    return dt.timestamp() if dt else 0.0


def merge_headlines(current, previous, now=None):
    now = now or datetime.now(timezone.utc)
    cutoff = now - MAX_AGE
    merged = {}

    for item in current or []:
        key = headline_key(item)
        if not key:
            continue
        merged[key] = dict(item)

    retained = 0
    for item in previous or []:
        key = headline_key(item)
        if not key or key in merged:
            continue
        published = parse_iso(item.get("publishedUtc"))
        if not published or published < cutoff or published > now + timedelta(minutes=10):
            continue
        kept = dict(item)
        kept["retainedFromPreviousSnapshot"] = True
        merged[key] = kept
        retained += 1

    items = list(merged.values())
    items.sort(key=sort_key, reverse=True)
    return items[:MAX_HEADLINES], retained


def main():
    if not LIVE.exists():
        raise SystemExit("live-data.json not found")
    if len(sys.argv) < 2:
        raise SystemExit("usage: merge_headline_continuity.py <previous-live-data.json>")

    previous_path = Path(sys.argv[1])
    current_doc = json.loads(LIVE.read_text(encoding="utf-8"))
    try:
        previous_doc = json.loads(previous_path.read_text(encoding="utf-8")) if previous_path.exists() else {}
    except Exception:
        previous_doc = {}

    current = current_doc.get("headlines") if isinstance(current_doc.get("headlines"), list) else []
    previous = previous_doc.get("headlines") if isinstance(previous_doc.get("headlines"), list) else []
    merged, retained = merge_headlines(current, previous)
    current_doc["headlines"] = merged
    if isinstance(current_doc.get("counts"), dict):
        current_doc["counts"]["headlines"] = len(merged)
    source_status = current_doc.setdefault("sourceStatus", {})
    source_status["headlineContinuity"] = "recent-snapshot-fallback" if retained else "fresh-only"
    current_doc["headlineContinuity"] = {
        "freshCount": len(current),
        "retainedRecentCount": retained,
        "finalCount": len(merged),
        "maxRetainedAgeHours": int(MAX_AGE.total_seconds() // 3600),
    }
    LIVE.write_text(json.dumps(current_doc, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
