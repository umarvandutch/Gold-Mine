#!/usr/bin/env python3
import json
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIVE = ROOT / "live-data.json"
CACHE = ROOT / "data" / "policy-history.json"
UA = "Mozilla/5.0 (compatible; GoldMineMacro/1.0; +https://github.com/umarvandutch/Gold-Mine)"


def now_utc():
    return datetime.now(timezone.utc)


def iso_z(dt):
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_dt(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).astimezone(timezone.utc)
    except Exception:
        return None


def fetch_bytes(url, headers=None, timeout=22):
    h = {"User-Agent": UA, "Accept": "*/*"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return response.read()


def fetch_json(url, headers=None):
    return json.loads(fetch_bytes(url, headers=headers).decode("utf-8"))


def category_for(name):
    s = (name or "").lower()
    if any(k in s for k in [
        "fomc", "interest rate", "fed funds", "federal reserve", "powell",
        "beige book", "jackson hole", "fed chair", "fed governor",
        "fed president", "fed official", "fed policymaker", "fed minutes",
        "fed meeting", "fed rate", "fed's "
    ]):
        return "rates"
    if any(k in s for k in ["cpi", "pce", "ppi", "inflation", "price index", "prices paid", "prices received"]):
        return "inflation"
    if any(k in s for k in ["payroll", "employment", "unemployment", "jobless", "jolts", "job openings", "labor", "labour", "wage", "earnings"]):
        return "labour"
    if any(k in s for k in ["gdp", "gross domestic product"]):
        return "growth"
    if any(k in s for k in ["retail", "consumer confidence", "consumer sentiment", "personal spending", "personal income"]):
        return "consumer"
    if any(k in s for k in ["housing", "home sales", "building permits", "mortgage", "construction", "housing starts"]):
        return "housing"
    if any(k in s for k in ["pmi", "ism", "industrial production", "factory", "durable", "manufacturing", "services", "philadelphia fed", "dallas fed", "richmond fed", "kansas city fed", "empire state"]):
        return "business"
    if any(k in s for k in ["trade", "exports", "imports", "current account"]):
        return "trade"
    if any(k in s for k in ["treasury", "auction", "budget", "government"]):
        return "government"
    return "other"


def is_cpi(text):
    s = (text or "").lower()
    return bool(re.search(r"\bcpi\b|consumer price index", s))


def is_rate_context(text, category=None):
    s = (text or "").lower()
    if category == "rates":
        return True
    return bool(re.search(r"\bfomc\b|federal reserve|interest rate|fed funds|rate decision|rate cut|rate hike|powell|fed minutes|hawkish|dovish|higher for longer", s))


def is_long_memory(text, category=None):
    return is_cpi(text) or is_rate_context(text, category)


def normalize_event(e):
    name = e.get("name") or "US economic event"
    return {
        "id": str(e.get("id") or e.get("eventId") or f"{name}-{e.get('dateUtc', '')}")[:180],
        "dateUtc": e.get("dateUtc"),
        "periodDateUtc": e.get("periodDateUtc"),
        "name": name,
        "actual": e.get("actual"),
        "revised": e.get("revised"),
        "consensus": e.get("consensus"),
        "previous": e.get("previous"),
        "unit": e.get("unit"),
        "volatility": str(e.get("volatility") or "NONE").upper(),
        "isSpeech": bool(e.get("isSpeech")),
        "isTentative": bool(e.get("isTentative")),
        "category": category_for(name),
        "source": "FXStreet public calendar",
    }


def fetch_fxstreet(start, end):
    start_s = start.strftime("%Y-%m-%dT%H:%M:%SZ")
    end_s = end.strftime("%Y-%m-%dT%H:%M:%SZ")
    qs = urllib.parse.urlencode([
        ("volatilities", "MEDIUM"),
        ("volatilities", "HIGH"),
        ("countries", "US"),
    ])
    url = f"https://calendar-api.fxstreet.com/en/api/v1/eventDates/{start_s}/{end_s}?{qs}"
    raw = fetch_json(url, headers={
        "Accept": "application/json",
        "Origin": "https://www.fxstreet.com",
        "Referer": "https://www.fxstreet.com/",
    })
    return [normalize_event(e) for e in raw if isinstance(e, dict) and str(e.get("countryCode", "")).upper() == "US"] if isinstance(raw, list) else []


def rss_items(url, source, category="auto", limit=30):
    try:
        root = ET.fromstring(fetch_bytes(url))
    except Exception:
        return []
    out = []
    for item in root.findall(".//item")[:limit]:
        title = re.sub(r"\s+", " ", (item.findtext("title") or "").strip())
        if not title:
            continue
        link = (item.findtext("link") or "").strip()
        pub = (item.findtext("pubDate") or item.findtext("date") or "").strip()
        dt = None
        if pub:
            try:
                dt = parsedate_to_datetime(pub)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
            except Exception:
                dt = None
        out.append({
            "title": title,
            "url": link,
            "publishedUtc": iso_z(dt) if dt else None,
            "source": source,
            "category": category_for(title) if category == "auto" else category,
        })
    return out


def google_news(query, category="auto", limit=30):
    params = urllib.parse.urlencode({"q": query, "hl": "en-US", "gl": "US", "ceid": "US:en"})
    return rss_items(f"https://news.google.com/rss/search?{params}", "Google News aggregation", category, limit)


def headline_impact(headline):
    text = f"{headline.get('title', '')} {headline.get('officialText', '')}".lower()
    category = headline.get("category") or category_for(text)
    if is_cpi(text) or is_rate_context(text, category):
        return "high"
    if re.search(r"non.?farm|payroll|unemployment|average hourly earnings|\bpce\b|\bppi\b|\bgdp\b|retail sales|\bism\b|\bpmi\b|jobless claims|jolts|tariff|sanction|war|attack|geopolit|recession|financial stress|banking stress", text):
        return "medium"
    return "low"


def dedupe(items, key_fn):
    seen = set()
    out = []
    for item in items:
        key = key_fn(item)
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def read_cache():
    if not CACHE.exists():
        return {}
    try:
        return json.loads(CACHE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def cache_fresh(cache, now, hours=12):
    stamp = parse_dt(cache.get("refreshedAt"))
    return bool(stamp and now - stamp < timedelta(hours=hours))


def refresh_long_memory(now):
    events = []
    cursor = now - timedelta(days=90)
    stop = now - timedelta(days=6)
    while cursor < stop:
        end = min(cursor + timedelta(days=28), stop)
        try:
            events.extend(fetch_fxstreet(cursor, end))
        except Exception:
            pass
        cursor = end
    events = [e for e in events if is_long_memory(e.get("name"), e.get("category"))]

    headlines = []
    try:
        headlines.extend(google_news(
            '("US CPI" OR "Consumer Price Index") (inflation OR "Federal Reserve" OR rates OR dollar OR gold) when:90d',
            "inflation", 35,
        ))
    except Exception:
        pass
    try:
        headlines.extend(google_news(
            '("Federal Reserve" OR FOMC OR Powell) ("interest rates" OR "rate decision" OR "rate cut" OR "rate hike" OR hawkish OR dovish) when:90d',
            "rates", 35,
        ))
    except Exception:
        pass

    headlines = [h for h in headlines if headline_impact(h) != "low" and is_long_memory(h.get("title"), h.get("category"))]
    return {
        "refreshedAt": iso_z(now),
        "events": dedupe(events, lambda e: str(e.get("id") or f"{e.get('name')}-{e.get('dateUtc')}")),
        "headlines": dedupe(headlines, lambda h: re.sub(r"\W+", "", h.get("title", "").lower())[:180]),
    }


def within_policy(dt, now, long_memory):
    if not dt:
        return False
    if dt > now + timedelta(days=8):
        return False
    if dt > now:
        return True
    max_age = timedelta(days=90 if long_memory else 7)
    return now - dt <= max_age


def main():
    now = now_utc()
    if not LIVE.exists():
        raise SystemExit("live-data.json missing")
    payload = json.loads(LIVE.read_text(encoding="utf-8"))

    # Re-query the recent calendar with only medium/high impact. This both
    # removes low-impact releases and gives the model a full 7-day ordinary
    # history instead of the base collector's shorter lookback.
    recent_events = []
    try:
        recent_events = fetch_fxstreet(now - timedelta(days=7), now + timedelta(days=8))
    except Exception:
        recent_events = list(payload.get("events") or [])

    cache = read_cache()
    if not cache_fresh(cache, now):
        refreshed = refresh_long_memory(now)
        if refreshed.get("events") or refreshed.get("headlines"):
            cache = refreshed
            CACHE.parent.mkdir(parents=True, exist_ok=True)
            CACHE.write_text(json.dumps(cache, indent=2) + "\n", encoding="utf-8")

    merged_events = dedupe(
        recent_events + list(cache.get("events") or []) + list(payload.get("events") or []),
        lambda e: str(e.get("id") or f"{e.get('name')}-{e.get('dateUtc')}"),
    )
    events = []
    for event in merged_events:
        vol = str(event.get("volatility") or "NONE").upper()
        if vol not in {"MEDIUM", "HIGH"}:
            continue
        event["category"] = event.get("category") or category_for(event.get("name"))
        dt = parse_dt(event.get("dateUtc"))
        long_memory = is_long_memory(event.get("name"), event.get("category"))
        if not within_policy(dt, now, long_memory):
            continue
        event["memoryWindowDays"] = 90 if long_memory else 7
        event["impactPolicy"] = "high-or-medium-only"
        events.append(event)
    events.sort(key=lambda e: e.get("dateUtc") or "")

    fresh_headlines = list(payload.get("headlines") or [])
    try:
        fresh_headlines.extend(google_news(
            '("Federal Reserve" OR FOMC OR Powell OR "US CPI" OR "US jobs" OR "US GDP" OR "US retail sales" OR "US PMI" OR "US ISM") when:7d',
            "auto", 40,
        ))
    except Exception:
        pass
    try:
        fresh_headlines.extend(google_news(
            '(gold OR XAUUSD OR "US dollar" OR DXY) (tariff OR war OR attack OR sanctions OR recession OR crisis OR "Federal Reserve" OR CPI) when:7d',
            "other", 35,
        ))
    except Exception:
        pass

    merged_headlines = dedupe(
        fresh_headlines + list(cache.get("headlines") or []),
        lambda h: re.sub(r"\W+", "", h.get("title", "").lower())[:180],
    )
    recent_news = []
    long_news = []
    for headline in merged_headlines:
        impact = headline_impact(headline)
        if impact == "low":
            continue
        headline["category"] = headline.get("category") or category_for(headline.get("title"))
        dt = parse_dt(headline.get("publishedUtc"))
        long_memory = is_long_memory(headline.get("title"), headline.get("category"))
        if not within_policy(dt, now, long_memory):
            continue
        headline["impact"] = impact
        headline["memoryWindowDays"] = 90 if long_memory else 7
        if long_memory and dt and now - dt > timedelta(days=7):
            long_news.append(headline)
        else:
            recent_news.append(headline)

    recent_news.sort(key=lambda h: h.get("publishedUtc") or "", reverse=True)
    long_news.sort(key=lambda h: h.get("publishedUtc") or "", reverse=True)
    headlines = recent_news[:55] + long_news[:25]

    payload["events"] = events
    payload["headlines"] = headlines
    payload.setdefault("counts", {})["events"] = len(events)
    payload.setdefault("counts", {})["headlines"] = len(headlines)
    payload.setdefault("sourceStatus", {})["signalPolicy"] = "medium-high-only; 7d ordinary; 90d CPI-rates"
    payload["signalPolicy"] = {
        "minimumImpact": "MEDIUM",
        "ordinaryLookbackDays": 7,
        "cpiAndRatesLookbackDays": 90,
        "longMemoryDecayRequired": True,
        "updatedAt": iso_z(now),
    }
    LIVE.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
