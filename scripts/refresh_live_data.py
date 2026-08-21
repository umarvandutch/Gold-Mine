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

    # True monetary-policy / central-bank events. Do not use a bare "fed"
    # match because names such as "Philadelphia Fed Manufacturing Survey"
    # are business indicators, not rate decisions.
    if any(k in s for k in [
        "fomc", "interest rate", "fed funds", "federal reserve",
        "powell", "beige book", "jackson hole", "fed chair",
        "fed governor", "fed president", "fed official", "fed policymaker",
        "fed minutes", "fed meeting", "fed rate", "fed's "
    ]):
        return "rates"

    if any(k in s for k in [
        "cpi", "pce", "ppi", "inflation", "price index", "prices paid",
        "prices received", "personal consumption expenditures price",
        "personal consumption expenditures prices"
    ]):
        return "inflation"

    if any(k in s for k in [
        "payroll", "employment", "unemployment", "jobless", "jolts",
        "job openings", "labor", "labour", "wages", "earnings",
        "employment cost"
    ]):
        return "labour"

    if any(k in s for k in ["gdp", "growth rate", "gross domestic product"]):
        return "growth"

    if any(k in s for k in [
        "retail", "consumer confidence", "consumer sentiment",
        "consumer expectations", "personal spending", "personal income",
        "consumer spending"
    ]):
        return "consumer"

    if any(k in s for k in [
        "housing", "home sales", "building permits", "mortgage",
        "construction", "housing starts"
    ]):
        return "housing"

    if any(k in s for k in [
        "pmi", "ism", "industrial production", "factory", "durable",
        "capital goods", "business", "manufacturing", "services",
        "philadelphia fed", "dallas fed", "richmond fed",
        "kansas city fed", "empire state"
    ]):
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
    """Best-effort free current quote. Stooq may throttle automated access."""
    for symbol in candidates:
        try:
            safe_symbol = urllib.parse.quote(symbol, safe=".^=")
            # Stooq's h flag is deliberately left as a bare query flag.
            url = f"https://stooq.com/q/l/?s={safe_symbol}&f=sd2t2ohlcvnp&h&e=csv"
            text = fetch_bytes(url).decode("utf-8", "replace")
            lower = text.lower()
            if "exceeded" in lower or "apikey" in lower or len(text.strip()) < 20:
                continue
            rows = list(csv.DictReader(io.StringIO(text)))
            if not rows:
                continue
            row = rows[0]
            close = parse_float(row.get("Close"))
            prev = parse_float(row.get("Prev") or row.get("Previous"))
            if close is None:
                continue
            change_pct = ((close - prev) / prev * 100.0) if prev not in (None, 0) else None
            return {
                "label": label,
                "symbol": symbol,
                "name": row.get("Name") or label,
                "price": round(close, 4),
                "previous": round(prev, 4) if prev is not None else None,
                "changePct": round(change_pct, 3) if change_pct is not None else None,
                "deltaBps": None,
                "date": row.get("Date"),
                "time": row.get("Time"),
                "kind": kind,
                "source": "Stooq free quote (may be delayed)"
            }
        except Exception:
            continue
    return None


def treasury_rows(data_key, year):
    """Read the official U.S. Treasury XML feed using namespace-agnostic tags."""
    url = (
        "https://home.treasury.gov/resource-center/data-chart-center/"
        f"interest-rates/pages/xml?data={data_key}&field_tdr_date_value={year}"
    )
    root = ET.fromstring(fetch_bytes(url, headers={"Accept": "application/xml,text/xml,*/*"}))
    rows = []
    for elem in root.iter():
        if not elem.tag.endswith("properties"):
            continue
        row = {}
        for child in list(elem):
            key = child.tag.split("}")[-1]
            row[key] = child.text
        if row.get("NEW_DATE"):
            rows.append(row)
    rows.sort(key=lambda r: r.get("NEW_DATE") or "")
    return rows


def treasury_quote(rows, field, label, kind="yield"):
    valid = []
    for row in rows:
        value = parse_float(row.get(field))
        if value is not None:
            valid.append((row.get("NEW_DATE"), value))
    if not valid:
        return None
    latest_date, latest = valid[-1]
    previous = valid[-2][1] if len(valid) > 1 else None
    delta_bps = (latest - previous) * 100.0 if previous is not None else None
    return {
        "label": label,
        "symbol": field,
        "name": label,
        "price": round(latest, 3),
        "previous": round(previous, 3) if previous is not None else None,
        "changePct": None,
        "deltaBps": round(delta_bps, 1) if delta_bps is not None else None,
        "date": (latest_date or "")[:10],
        "time": None,
        "kind": kind,
        "source": "U.S. Treasury official daily rate"
    }


def fetch_market(now):
    market = {
        "xau": stooq_quote(["xauusd", "gc.f"], "Gold / XAUUSD", "gold"),
        "dxy": stooq_quote(["dx.f", "^dxy"], "US Dollar Index", "index"),
        "us2y": None,
        "us10y": None,
        "real10y": None
    }

    # Official Treasury data is daily rather than tick-by-tick, but it is free,
    # stable and auditable. It is used as context, not presented as realtime.
    try:
        nominal = treasury_rows("daily_treasury_yield_curve", now.year)
        market["us2y"] = treasury_quote(nominal, "BC_2YEAR", "US 2Y Treasury yield")
        market["us10y"] = treasury_quote(nominal, "BC_10YEAR", "US 10Y Treasury yield")
    except Exception:
        pass

    try:
        real = treasury_rows("daily_treasury_real_yield_curve", now.year)
        market["real10y"] = treasury_quote(real, "TC_10YEAR", "US 10Y real yield", "real-yield")
    except Exception:
        pass

    return market


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

    # Broad but explicitly US/macro-focused context. Precise query phrases stop
    # generic local housing or foreign consumer-confidence stories leaking in.
    items.extend(google_news(
        '("Federal Reserve" OR FOMC OR Powell OR "US Treasury") '
        '(rates OR inflation OR jobs OR debt OR deficit OR yields) when:2d',
        "auto", 12
    ))
    items.extend(google_news(
        '("US inflation" OR "US jobs" OR "US GDP" OR "US retail sales" '
        'OR "US PMI" OR "US ISM" OR "US consumer confidence" '
        'OR "US housing market" OR "US home sales") when:2d',
        "auto", 14
    ))
    items.extend(google_news(
        '("White House" OR Trump OR "US Treasury") '
        '(tariff OR sanctions OR trade OR oil OR debt OR deficit) when:2d',
        "other", 10
    ))
    items.extend(google_news(
        '(gold OR XAUUSD OR "US dollar" OR DXY) '
        '(tariff OR war OR attack OR sanctions OR geopolitics OR recession OR crisis OR oil) when:2d',
        "other", 12
    ))

    seen = set()
    unique = []
    for h in items:
        key = re.sub(r"\W+", "", h["title"].lower())[:140]
        if not key or key in seen:
            continue
        seen.add(key)
        unique.append(h)
    unique.sort(key=lambda x: x.get("publishedUtc") or "", reverse=True)
    return unique[:36]


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
        market = fetch_market(now)
    except Exception as e:
        market = {}
        errors.append(f"Market quotes: {type(e).__name__}: {e}")

    try:
        headlines = fetch_headlines()
    except Exception as e:
        headlines = []
        errors.append(f"Headlines: {type(e).__name__}: {e}")

    market_count = sum(1 for v in market.values() if v) if isinstance(market, dict) else 0

    existing = {}
    if OUT.exists():
        try:
            existing = json.loads(OUT.read_text(encoding="utf-8"))
        except Exception:
            existing = {}

    payload = {
        "generatedAt": iso_z(now),
        "calendarStatus": calendar_status,
        "counts": {
            "events": len(events),
            "headlines": len(headlines),
            "marketFeeds": market_count
        },
        "sourceStatus": {
            "calendar": "live" if calendar_status == "live" else calendar_status,
            "headlines": "live" if headlines else "unavailable",
            "market": "live-or-delayed" if market_count else "unavailable"
        },
        "events": events,
        "market": market,
        "headlines": headlines,
        "errors": errors[:5],
        "sourceNotes": [
            "US economic calendar: FXStreet public web calendar feed (best-effort; not the paid official API).",
            "Fed/BLS headlines: official public RSS feeds.",
            "Broader macro headlines: Google News RSS aggregation; headlines are context, not automatically trusted as trade signals.",
            "Gold/DXY: free Stooq quote when available; may be delayed or throttled.",
            "2Y/10Y/real yields: official U.S. Treasury daily rates; not intraday realtime."
        ]
    }

    if existing and comparable(existing) == comparable(payload):
        print("No material data change; keeping existing live-data.json")
        return 0

    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Updated {OUT.name}: {len(events)} events, {len(headlines)} headlines, {market_count} market feeds")
    if errors:
        print("Warnings:", *errors, sep="\n- ")
    return 0


if __name__ == "__main__":
    sys.exit(main())
