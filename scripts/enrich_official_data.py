#!/usr/bin/env python3
import json
import re
import urllib.request
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIVE = ROOT / "live-data.json"
UA = "Mozilla/5.0 (compatible; GoldMineMacro/2.1; +https://github.com/umarvandutch/Gold-Mine)"
BLS_URL = "https://api.bls.gov/publicAPI/v2/timeseries/data/"

BLS_SERIES = {
    "unemployment": "LNS14000000",
    "payrolls": "CES0000000001",
    "ahe": "CES0500000003",
    "cpi_sa": "CUSR0000SA0",
    "cpi_nsa": "CUUR0000SA0",
    "core_cpi_sa": "CUSR0000SA0L1E",
    "core_cpi_nsa": "CUUR0000SA0L1E",
}


class ParagraphCollector(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_p = 0
        self.skip = 0
        self.current = []
        self.paragraphs = []

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag in ("script", "style", "nav", "footer"):
            self.skip += 1
        if tag == "p" and not self.skip:
            self.in_p += 1
            self.current = []

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag == "p" and self.in_p:
            text = re.sub(r"\s+", " ", "".join(self.current)).strip()
            if len(text) >= 35:
                self.paragraphs.append(text)
            self.current = []
            self.in_p = max(0, self.in_p - 1)
        if tag in ("script", "style", "nav", "footer") and self.skip:
            self.skip -= 1

    def handle_data(self, data):
        if self.in_p and not self.skip:
            self.current.append(data)


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


def fetch_bytes(url, data=None, headers=None, timeout=15):
    h = {"User-Agent": UA, "Accept": "*/*"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, data=data, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return response.read()


def fetch_bls(start_year, end_year):
    payload = json.dumps({
        "seriesid": list(BLS_SERIES.values()),
        "startyear": str(start_year),
        "endyear": str(end_year),
    }).encode("utf-8")
    raw = fetch_bytes(
        BLS_URL,
        data=payload,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        timeout=20,
    )
    doc = json.loads(raw.decode("utf-8"))
    if doc.get("status") != "REQUEST_SUCCEEDED":
        raise RuntimeError("BLS public API request did not succeed")
    series_out = {}
    for series in doc.get("Results", {}).get("series", []):
        sid = series.get("seriesID")
        values = {}
        for item in series.get("data", []):
            period = str(item.get("period") or "")
            if not re.fullmatch(r"M\d{2}", period) or period == "M13":
                continue
            year = int(item.get("year"))
            month = int(period[1:])
            value = parse_num(item.get("value"))
            if value is not None:
                values[(year, month)] = value
        series_out[sid] = values
    return series_out


def shift_month(year, month, delta):
    total = year * 12 + (month - 1) + delta
    return total // 12, total % 12 + 1


def series_value(series, sid, year, month):
    return (series.get(sid) or {}).get((year, month))


def pct_change(current, prior):
    if current is None or prior in (None, 0):
        return None
    return (current / prior - 1.0) * 100.0


def official_bls_actual(event, series):
    name = str(event.get("name") or "")
    lower = name.lower()
    period_dt = parse_iso(event.get("periodDateUtc"))
    if not period_dt:
        return None
    year, month = period_dt.year, period_dt.month
    py, pm = shift_month(year, month, -1)
    yy, ym = shift_month(year, month, -12)

    if "unemployment rate" in lower:
        value = series_value(series, BLS_SERIES["unemployment"], year, month)
        return (value, 0.06, "Unemployment Rate") if value is not None else None

    if re.search(r"non.?farm payroll|nonfarm payroll", lower):
        current = series_value(series, BLS_SERIES["payrolls"], year, month)
        prior = series_value(series, BLS_SERIES["payrolls"], py, pm)
        if current is None or prior is None:
            return None
        return (current - prior, 15.0, "Nonfarm Payrolls")

    if "average hourly earnings" in lower:
        current = series_value(series, BLS_SERIES["ahe"], year, month)
        if re.search(r"yoy|year.?over.?year|year on year", lower):
            prior = series_value(series, BLS_SERIES["ahe"], yy, ym)
            value = pct_change(current, prior)
            return (value, 0.12, "Average Hourly Earnings YoY") if value is not None else None
        if re.search(r"mom|month.?over.?month|month on month", lower):
            prior = series_value(series, BLS_SERIES["ahe"], py, pm)
            value = pct_change(current, prior)
            return (value, 0.10, "Average Hourly Earnings MoM") if value is not None else None

    if re.search(r"\bcpi\b|consumer price index", lower):
        core = "core" in lower or "excluding food" in lower
        yoy = bool(re.search(r"yoy|year.?over.?year|year on year", lower))
        mom = bool(re.search(r"mom|month.?over.?month|month on month", lower))
        if not (yoy or mom):
            return None
        sid = BLS_SERIES["core_cpi_nsa" if core and yoy else "core_cpi_sa" if core else "cpi_nsa" if yoy else "cpi_sa"]
        current = series_value(series, sid, year, month)
        prior_key = (yy, ym) if yoy else (py, pm)
        prior = series_value(series, sid, *prior_key)
        value = pct_change(current, prior)
        if value is None:
            return None
        label = f"{'Core ' if core else ''}CPI {'YoY' if yoy else 'MoM'}"
        return (value, 0.12 if yoy else 0.10, label)

    return None


def apply_bls_checks(live, now):
    relevant = []
    for event in live.get("events") or []:
        event_dt = parse_iso(event.get("dateUtc"))
        if not event_dt or event_dt > now or event_dt < now - timedelta(days=4):
            continue
        name = str(event.get("name") or "").lower()
        if re.search(r"unemployment rate|non.?farm payroll|average hourly earnings|\bcpi\b|consumer price index", name):
            relevant.append(event)
    if not relevant:
        return {"status": "not-needed", "checked": 0, "matched": 0, "filled": 0}

    start_year = min((parse_iso(e.get("periodDateUtc")) or now).year for e in relevant) - 1
    series = fetch_bls(start_year, now.year)
    checked = matched = filled = 0
    for event in relevant:
        result = official_bls_actual(event, series)
        if not result:
            continue
        official, tolerance, label = result
        official = round(float(official), 3)
        calendar_actual = parse_num(event.get("actual"))
        diff = None if calendar_actual is None else official - calendar_actual
        status = "available"
        if calendar_actual is not None:
            checked += 1
            status = "matched" if abs(diff) <= tolerance else "mismatch"
            if status == "matched":
                matched += 1
        else:
            event["actual"] = official
            event["actualSource"] = "U.S. Bureau of Labor Statistics public API"
            filled += 1
            status = "official-filled"
        event["officialVerification"] = {
            "source": "U.S. Bureau of Labor Statistics public API",
            "seriesCheck": label,
            "officialActual": official,
            "calendarActual": calendar_actual,
            "difference": round(diff, 3) if diff is not None else None,
            "tolerance": tolerance,
            "status": status,
            "checkedAt": iso_z(now),
        }
    return {"status": "live", "checked": checked, "matched": matched, "filled": filled}


def extract_relevant_fed_text(html):
    parser = ParagraphCollector()
    parser.feed(html)
    text = " ".join(parser.paragraphs)
    if not text:
        return ""
    sentences = re.split(r"(?<=[.!?])\s+", text)
    key = re.compile(
        r"inflation|employment|labor market|labour market|federal funds|interest rate|policy rate|"
        r"monetary policy|balance sheet|economic activity|economic outlook|risks|2 percent|"
        r"maximum employment|restrictive|easing|tightening|rate cut|rate increase|rate reduction",
        re.I,
    )
    chosen = []
    for sentence in sentences:
        clean = re.sub(r"\s+", " ", sentence).strip()
        if len(clean) < 35 or not key.search(clean):
            continue
        chosen.append(clean)
        if len(" ".join(chosen)) >= 4200 or len(chosen) >= 20:
            break
    if chosen:
        return " ".join(chosen)[:4500]
    return text[:2600]


def apply_fed_text(live, now):
    enriched = 0
    for headline in live.get("headlines") or []:
        if enriched >= 6:
            break
        if str(headline.get("source") or "") != "Federal Reserve":
            continue
        url = str(headline.get("url") or "")
        if not url.startswith("https://www.federalreserve.gov/"):
            continue
        published = parse_iso(headline.get("publishedUtc"))
        if published and published < now - timedelta(days=3):
            continue
        try:
            html = fetch_bytes(url, headers={"Accept": "text/html"}, timeout=12).decode("utf-8", "replace")
            official_text = extract_relevant_fed_text(html)
            if official_text:
                headline["officialText"] = official_text
                headline["officialTextSource"] = "Federal Reserve page text"
                enriched += 1
        except Exception:
            continue
    return {"status": "live" if enriched else "unavailable", "enriched": enriched}


def main():
    if not LIVE.exists():
        raise SystemExit("live-data.json not found")
    live = json.loads(LIVE.read_text(encoding="utf-8"))
    now = now_utc()
    status = {}
    errors = []
    try:
        status["bls"] = apply_bls_checks(live, now)
    except Exception as exc:
        status["bls"] = {"status": "error"}
        errors.append(f"BLS official verification: {type(exc).__name__}: {exc}")
    try:
        status["fedText"] = apply_fed_text(live, now)
    except Exception as exc:
        status["fedText"] = {"status": "error"}
        errors.append(f"Federal Reserve text enrichment: {type(exc).__name__}: {exc}")

    live["officialSourceStatus"] = status
    if errors:
        existing = live.get("errors") if isinstance(live.get("errors"), list) else []
        live["errors"] = (existing + errors)[:16]
    LIVE.write_text(json.dumps(live, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
