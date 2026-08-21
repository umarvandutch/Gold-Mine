#!/usr/bin/env python3
import csv
import io
import json
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "live-data.json"
UA = "Mozilla/5.0 (compatible; GoldMineMacro/1.0; +https://github.com/umarvandutch/Gold-Mine)"


def fetch_bytes(url, headers=None, timeout=20):
    h = {"User-Agent": UA, "Accept": "*/*"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def fetch_json(url, headers=None):
    return json.loads(fetch_bytes(url, headers=headers).decode("utf-8"))


def iso_z(dt):
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def category_for(name):
    s = (name or "").lower()
    if any(k in s for k in ["fed", "fomc", "interest rate", "powell", "beige book", "fed funds"]):
        return "rates"
    if any(k in s for k in ["cpi", "pce", "ppi", "inflation", "price index", "prices paid", "prices received"]):
        return "inflation"
    if any(k in s for k in ["payroll", "employment", "unemployment", "jobless", "jolts", "job openings", "labor", "labour", "wages", "earnings"]):
        return "labour"
    if any(k in s for k in ["gdp", "growth rate"]):
        return "growth"
    if any(k in s for k in ["retail", "consumer confidence", "consumer sentiment", "personal spending", "personal income"]):
        return "consumer"
    if any(k in s for k in ["housing", "home sales", "building permits", "mortgage", "construction"]):
        return "housing"
    if any(k in s for k in ["pmi", "ism", "industrial production", "factory", "durable", "business", "manufacturing", "services"]):
        return "business"
    if any(k in s for k in ["trade", "exports", "imports", "current account"]):
        return "trade"
    if any(k in s for k in ["treasury", "auction", "budget", "government"]):
        return "government"
    return "other"


def fetch_fxstreet_calendar(now):
    start = now - timedelta(days=2)
    end = now + timedelta(days=8)
    start_s = start.strftime("%Y-%m-%dT%H:%M:%SZ")
    end_s = end.strftime("%Y-%m-%dT%H:%M:%SZ")
    qs = urllib.parse.urlencode([
        ("volatilities", "NONE"), ("volatilities", "LOW"),
        ("volatilities", "MEDIUM"), ("volatilities", "HIGH"),
        ("countries", "US")
    ])
    url = f"https://calendar-api.fxstreet.com/en/api/v1/eventDates/{start_s}/{end_s}?{qs}"
    raw = fetch_json(url, headers={
        "Accept": "application/json",
        "Origin": "https://www.fxstreet.com",
        "Referer": "https://www.fxstreet.com/"
    })
    events = []
    for e in raw if isinstance(raw, list) else []:
        if str(e.get("countryCode", "")).upper() != "US":
            continue
        name = e.get("name") or "US economic event"
        events.append({
            "id": str(e.get("id") or e.get("eventId") or f"{name}-{e.get('dateUtc','')}")[:180],
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
            "source": "FXStreet public calendar"
        })
    events.sort(key=lambda x: x.get("dateUtc") or "")
    return events


def parse_float(v):
    try:
        if v is None or str(v).strip() in ("", "N/D", "N/A", "-"):
            return None
        return float(str(v).replace(",", ""))
    except Exception:
        return None


def stooq_quote(candidates, label, kind):
    for symbol in candidates:
        try:
            q = urllib.parse.urlencode({"s": symbol, "f": "sd2t2ohlcvnp", "h": "", "e": "csv"})
            text = fetch_bytes(f"https://stooq.com/q/l/?{q}").decode("utf-8", "replace")
            rows = list(csv.DictReader(io.StringIO(text)))
            if not rows:
                continue
            row = rows[0]
            close = parse_float(row.get("Close"))
            prev = parse_float(row.get("Prev"))
            if close is None:
                continue
            change_pct = ((close - prev) / prev * 100.0) if prev not in (None, 0) else None
            delta_bps = ((close - prev) * 100.0) if kind == "yield" and prev is not None else None
            return {
                "label": label,
                "symbol": symbol,
                "name": row.get("Name") or label,
                "price": round(close, 4),
                "previous": round(prev, 4) if prev is not None else None,
                "changePct": round(change_pct, 3) if change_pct is not None else None,
                "deltaBps": round(delta_bps, 1) if delta_bps is not None else None,
                "date": row.get("Date"),
                "time": row.get("Time"),
                "kind": kind,
                "source": "Stooq free quote"
            }
        except Exception:
            continue
    return None


def fetch_market():
    return {
        "xau": stooq_quote(["xauusd", "gc.f"], "Gold / XAUUSD proxy", "gold"),
        "dxy": stooq_quote(["^dxy", "dx.f"], "US Dollar Index", "index"),
        "us2y": stooq_quote(["^uts"], "US 2Y yield", "yield"),
        "us10y": stooq_quote(["^tnx"], "US 10Y yield", "yield")
    }


def rss_items(url, source, category, limit=10):
    try:
        root = ET.fromstring(fetch_bytes(url))
    except Exception:
        return []
    out = []
    for item in root.findall(".//item")[:limit]:
        title = (item.findtext("title") or "").strip()
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
        if title:
            out.append({
                "title": re.sub(r"\s+", " ", title),
                "url": link,
                "publishedUtc": iso_z(dt) if dt else None,
                "source": source,
                "category": category_for(title) if category == "auto" else category
            })
    return out


def google_news(query, category, limit=12):
    params = urllib.parse.urlencode({"q": query, "hl": "en-US", "gl": "US", "ceid": "US:en"})
    return rss_items(f"https://news.google.com/rss/search?{params}", "Google News aggregation", category, limit)


def fetch_headlines():
    items = []
    feeds = [
        ("https://www.federalreserve.gov/feeds/press_monetary.xml", "Federal Reserve", "rates"),
        ("https://www.federalreserve.gov/feeds/speeches_and_testimony.xml", "Federal Reserve", "rates"),
        ("https://www.bls.gov/feed/bls_latest.rss", "U.S. Bureau of Labor Statistics", "auto")
    ]
    for url, source, category in feeds:
        items.extend(rss_items(url, source, category, 12))
    items.extend(google_news('("Federal Reserve" OR FOMC OR Powell) when:2d', "rates", 10))
    items.extend(google_news('("US inflation" OR "US jobs" OR "US GDP" OR "US retail sales" OR "US economy") when:2d', "auto", 12))
    items.extend(google_news('(gold OR XAUUSD OR "US dollar" OR DXY) (tariff OR war OR sanctions OR geopolitics OR recession) when:2d', "other", 10))
    seen = set()
    unique = []
    for h in items:
        key = re.sub(r"\W+", "", h["title"].lower())[:140]
        if not key or key in seen:
            continue
        seen.add(key)
        unique.append(h)
    unique.sort(key=lambda x: x.get("publishedUtc") or "", reverse=True)
    return unique[:30]


def comparable(payload):
    return {
        "calendarStatus": payload.get("calendarStatus"),
        "events": payload.get("events", []),
        "market": payload.get("market", {}),
        "headlines": payload.get("headlines", [])
    }


def main():
    now = datetime.now(timezone.utc)
    errors = []
    try:
        events = fetch_fxstreet_calendar(now)
        calendar_status = "live" if events else "empty"
    except Exception as e:
        events = []
        calendar_status = "error"
        errors.append(f"FXStreet calendar: {type(e).__name__}: {e}")

    try:
        market = fetch_market()
    except Exception as e:
        market = {}
        errors.append(f"Market quotes: {type(e).__name__}: {e}")

    try:
        headlines = fetch_headlines()
    except Exception as e:
        headlines = []
        errors.append(f"Headlines: {type(e).__name__}: {e}")

    existing = {}
    if OUT.exists():
        try:
            existing = json.loads(OUT.read_text(encoding="utf-8"))
        except Exception:
            existing = {}

    payload = {
        "generatedAt": iso_z(now),
        "calendarStatus": calendar_status,
        "events": events,
        "market": market,
        "headlines": headlines,
        "errors": errors[:5],
        "sourceNotes": [
            "US economic calendar: FXStreet public web calendar feed (best-effort; not the paid official API).",
            "Fed/BLS headlines: official public RSS feeds.",
            "Broader macro headlines: Google News RSS aggregation; headlines are context, not automatically trusted as trade signals.",
            "Market confirmation: free Stooq quotes; may be delayed and are labelled as such in the app."
        ]
    }

    if existing and comparable(existing) == comparable(payload):
        print("No material data change; keeping existing live-data.json")
        return 0

    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Updated {OUT.name}: {len(events)} events, {len(headlines)} headlines")
    if errors:
        print("Warnings:", *errors, sep="\n- ")
    return 0


if __name__ == "__main__":
    sys.exit(main())
