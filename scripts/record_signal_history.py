#!/usr/bin/env python3
import json
import math
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIVE = ROOT / "live-data.json"
HISTORY = ROOT / "data" / "signal-history.json"

BASE_WEIGHT = {
    "rates": 45, "inflation": 28, "labour": 22, "growth": 18,
    "consumer": 12, "business": 10, "trade": 9, "housing": 8,
    "government": 7, "other": 5,
}
VOL_MULT = {"HIGH": 1.0, "MEDIUM": 0.62, "LOW": 0.34, "NONE": 0.22}
AMBIGUOUS = re.compile(
    r"speech|speaks|auction|inventory|inventories|stocks change|storage change|"
    r"rig count|net positions|cftc|budget balance|mortgage rate|oil stocks|"
    r"gasoline stocks|distillate stocks|heating oil|natural gas storage",
    re.I,
)

PROFILES = [
    (re.compile(r"core.*cpi|cpi.*core", re.I), "Core CPI", 0.15, None, 1.18, False),
    (re.compile(r"\bcpi\b", re.I), "CPI", 0.20, None, 1.12, False),
    (re.compile(r"core.*pce|pce.*core", re.I), "Core PCE", 0.15, None, 1.20, False),
    (re.compile(r"\bpce\b.*price|personal consumption expenditures.*price", re.I), "PCE inflation", 0.18, None, 1.16, False),
    (re.compile(r"\bppi\b|producer price", re.I), "PPI", 0.25, None, 1.00, False),
    (re.compile(r"non.?farm payroll|nonfarm payroll|payrolls", re.I), "Payrolls", 75.0, None, 1.18, False),
    (re.compile(r"unemployment rate", re.I), "Unemployment", 0.15, None, 1.12, True),
    (re.compile(r"average hourly earnings|wage growth|earnings.*(mom|yoy)", re.I), "Wages", 0.18, None, 1.08, False),
    (re.compile(r"initial jobless claims", re.I), "Jobless claims", 15.0, None, 0.92, True),
    (re.compile(r"continuing jobless claims", re.I), "Continuing claims", 35.0, None, 0.72, True),
    (re.compile(r"jolts|job openings", re.I), "JOLTS", None, 0.05, 0.92, False),
    (re.compile(r"\bgdp\b|gross domestic product", re.I), "GDP", 0.50, None, 1.06, False),
    (re.compile(r"retail sales", re.I), "Retail sales", 0.40, None, 1.02, False),
    (re.compile(r"\bism\b.*(manufacturing|services)|ism manufacturing|ism services", re.I), "ISM", 1.5, None, 1.06, False),
    (re.compile(r"s&p global.*pmi|\bpmi\b", re.I), "PMI", 1.6, None, 0.94, False),
    (re.compile(r"consumer confidence|consumer sentiment", re.I), "Consumer confidence", 4.5, None, 0.88, False),
    (re.compile(r"durable goods", re.I), "Durable goods", None, 0.06, 0.84, False),
    (re.compile(r"industrial production", re.I), "Industrial production", 0.45, None, 0.82, False),
    (re.compile(r"housing starts|building permits|home sales", re.I), "Housing", None, 0.045, 0.72, False),
    (re.compile(r"trade deficit|trade balance", re.I), "Trade", None, 0.08, 0.68, True),
    (re.compile(r"fomc.*rate|interest rate decision|fed funds rate", re.I), "Fed rate decision", 0.25, None, 1.30, False),
]


def now_utc():
    return datetime.now(timezone.utc)


def iso_z(dt):
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_iso(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).astimezone(timezone.utc)
    except Exception:
        return None


def parse_num(value):
    try:
        if value is None or value == "":
            return None
        return float(str(value).replace(",", ""))
    except Exception:
        return None


def clamp(value, low, high):
    return max(low, min(high, value))


def category_for(event):
    category = event.get("category")
    if category in BASE_WEIGHT:
        return category
    s = str(event.get("name") or "").lower()
    if re.search(r"fomc|interest rate|fed funds|federal reserve|powell|beige book|jackson hole|fed chair|fed governor|fed president|fed minutes|fed meeting|fed rate", s):
        return "rates"
    if re.search(r"cpi|pce|ppi|inflation|price index|prices paid|prices received", s):
        return "inflation"
    if re.search(r"payroll|employment|unemployment|jobless|jolts|job openings|labor|labour|wage|earnings", s):
        return "labour"
    if re.search(r"gdp|gross domestic product", s):
        return "growth"
    if re.search(r"retail|consumer confidence|consumer sentiment|personal spending|personal income", s):
        return "consumer"
    if re.search(r"housing|home sales|building permits|mortgage|construction|housing starts", s):
        return "housing"
    if re.search(r"pmi|ism|industrial production|factory|durable|manufacturing|services|philadelphia fed|dallas fed|richmond fed|empire state", s):
        return "business"
    if re.search(r"trade|export|import|current account", s):
        return "trade"
    if re.search(r"treasury|auction|budget|government", s):
        return "government"
    return "other"


def profile_for(event):
    name = str(event.get("name") or "")
    for regex, family, scale, relative, mult, inverse in PROFILES:
        if regex.search(name):
            return {
                "family": family,
                "scale": scale,
                "relative": relative,
                "mult": mult,
                "inverse": inverse,
            }
    return {
        "family": category_for(event),
        "scale": None,
        "relative": 0.04,
        "mult": 1.0,
        "inverse": False,
    }


def scale_for(profile, consensus):
    if profile["scale"] is not None:
        return profile["scale"]
    c = abs(consensus or 0)
    return max(c * (profile["relative"] or 0.04), 0.12 if c < 2 else 1.0)


def event_model(event):
    if event.get("isSpeech") or AMBIGUOUS.search(str(event.get("name") or "")):
        return None

    actual = parse_num(event.get("actual"))
    consensus = parse_num(event.get("consensus"))
    previous = parse_num(event.get("previous"))
    revised = parse_num(event.get("revised"))
    profile = profile_for(event)

    usd = 0.0
    pieces = 0.0
    surprise_z = None
    revision_z = None

    if actual is not None and consensus is not None:
        surprise_z = (actual - consensus) / scale_for(profile, consensus)
        if profile["inverse"]:
            surprise_z *= -1
        usd += math.tanh(surprise_z * 0.78)
        pieces += 1.0

    if revised is not None and previous is not None and revised != previous:
        revision_z = (revised - previous) / scale_for(profile, previous)
        if profile["inverse"]:
            revision_z *= -1
        usd += 0.28 * math.tanh(revision_z * 0.72)
        pieces += 0.28

    if not pieces:
        return None

    usd /= pieces
    gold = -usd
    category = category_for(event)
    vol = VOL_MULT.get(str(event.get("volatility") or "NONE").upper(), 0.22)
    importance = BASE_WEIGHT.get(category, 5) * vol * profile["mult"]
    weighted = gold * importance
    normalized = clamp(weighted / max(importance, 1) * 100, -100, 100)

    if normalized > 12:
        bias = "bullish"
    elif normalized < -12:
        bias = "bearish"
    else:
        bias = "mixed"

    return {
        "bias": bias,
        "score": round(normalized, 2),
        "surpriseZ": round(surprise_z, 3) if surprise_z is not None else None,
        "revisionZ": round(revision_z, 3) if revision_z is not None else None,
        "importance": round(importance, 2),
        "family": profile["family"],
    }


def market_snapshot(live):
    market = live.get("market") if isinstance(live.get("market"), dict) else {}

    def price(key):
        item = market.get(key)
        if not isinstance(item, dict):
            return None
        value = parse_num(item.get("price"))
        return value

    return {
        "xau": price("xau"),
        "dxy": price("dxy"),
        "us2y": price("us2y"),
        "us10y": price("us10y"),
        "real10y": price("real10y"),
    }


def update_outcomes(record):
    observations = record.get("marketObservations") or []
    xau_obs = [o for o in observations if o.get("xau") is not None and parse_iso(o.get("at"))]
    if not xau_obs:
        return

    event_dt = parse_iso(record.get("dateUtc"))
    if not event_dt:
        return

    baseline = None
    for obs in xau_obs:
        dt = parse_iso(obs.get("at"))
        mins = (dt - event_dt).total_seconds() / 60
        if 0 <= mins <= 20:
            baseline = obs
            break
    if baseline is None:
        return

    base_price = parse_num(baseline.get("xau"))
    if base_price in (None, 0):
        return

    outcomes = record.setdefault("outcomes", {"m15": None, "m60": None, "m240": None})
    for key, target, before, after in [
        ("m15", 15, 5, 12),
        ("m60", 60, 10, 15),
        ("m240", 240, 15, 25),
    ]:
        if outcomes.get(key):
            continue
        candidates = []
        for obs in xau_obs:
            dt = parse_iso(obs.get("at"))
            mins = (dt - event_dt).total_seconds() / 60
            if target - before <= mins <= target + after:
                candidates.append((abs(mins - target), obs, mins))
        if not candidates:
            continue
        _, obs, mins = min(candidates, key=lambda x: x[0])
        px = parse_num(obs.get("xau"))
        if px is None:
            continue
        change = (px - base_price) / base_price * 100
        outcomes[key] = {
            "changePct": round(change, 4),
            "observedAt": obs.get("at"),
            "minutesAfterRelease": round(mins, 1),
            "baselinePrice": base_price,
            "observedPrice": px,
        }


def main():
    if not LIVE.exists():
        raise SystemExit("live-data.json not found")

    live = json.loads(LIVE.read_text(encoding="utf-8"))
    HISTORY.parent.mkdir(parents=True, exist_ok=True)
    if HISTORY.exists():
        try:
            history = json.loads(HISTORY.read_text(encoding="utf-8"))
        except Exception:
            history = {"version": 1, "updatedAt": None, "events": []}
    else:
        history = {"version": 1, "updatedAt": None, "events": []}

    rows = history.setdefault("events", [])
    by_key = {row.get("key"): row for row in rows if row.get("key")}
    now = now_utc()
    observed_at = live.get("generatedAt") or iso_z(now)
    observed_dt = parse_iso(observed_at) or now
    market = market_snapshot(live)

    for event in live.get("events") or []:
        event_dt = parse_iso(event.get("dateUtc"))
        if not event_dt or event_dt > now:
            continue
        if event_dt < now - timedelta(days=10):
            continue
        model = event_model(event)
        if model is None:
            continue
        if parse_num(event.get("actual")) is None and parse_num(event.get("revised")) is None:
            continue

        key = f"{event.get('id') or event.get('name')}|{event.get('dateUtc')}"
        record = by_key.get(key)
        if record is None:
            record = {
                "key": key,
                "id": event.get("id"),
                "dateUtc": event.get("dateUtc"),
                "name": event.get("name"),
                "family": model["family"],
                "category": category_for(event),
                "volatility": event.get("volatility"),
                "unit": event.get("unit"),
                "source": event.get("source"),
                "actual": event.get("actual"),
                "consensus": event.get("consensus"),
                "previous": event.get("previous"),
                "revised": event.get("revised"),
                "firstObservedAt": observed_at,
                "lastObservedAt": observed_at,
                "model": model,
                "marketObservations": [],
                "outcomes": {"m15": None, "m60": None, "m240": None},
            }
            rows.append(record)
            by_key[key] = record
        else:
            record.update({
                "actual": event.get("actual"),
                "consensus": event.get("consensus"),
                "previous": event.get("previous"),
                "revised": event.get("revised"),
                "lastObservedAt": observed_at,
                "model": model,
                "family": model["family"],
                "category": category_for(event),
            })

        age_minutes = (observed_dt - event_dt).total_seconds() / 60
        if 0 <= age_minutes <= 300 and market.get("xau") is not None:
            obs = {
                "at": observed_at,
                "xau": market.get("xau"),
                "dxy": market.get("dxy"),
                "us2y": market.get("us2y"),
                "us10y": market.get("us10y"),
                "real10y": market.get("real10y"),
            }
            existing_times = {o.get("at") for o in record.get("marketObservations") or []}
            if obs["at"] not in existing_times:
                record.setdefault("marketObservations", []).append(obs)
                record["marketObservations"] = record["marketObservations"][-80:]

        update_outcomes(record)

    rows.sort(key=lambda x: x.get("dateUtc") or "", reverse=True)
    history["events"] = rows[:1200]
    history["updatedAt"] = iso_z(now)
    history["note"] = (
        "Free calibration log. XAU outcomes populate only when the configured free market source "
        "provides a usable gold quote near the release; missing outcomes are left null rather than estimated."
    )
    HISTORY.write_text(json.dumps(history, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
