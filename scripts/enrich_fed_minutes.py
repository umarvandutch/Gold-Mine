#!/usr/bin/env python3
import json
import re
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIVE = ROOT / "live-data.json"
UA = "Mozilla/5.0 (compatible; GoldMineMacro/2.3; +https://github.com/umarvandutch/Gold-Mine)"


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


def fetch_text(url, timeout=15):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": "text/html,application/xhtml+xml,*/*",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return response.read().decode("utf-8", "replace")


def find_minutes_html_url(wrapper_url, html):
    candidates = []
    for match in re.finditer(r'href=["\']([^"\']+)["\']', html, flags=re.I):
        href = match.group(1).strip()
        lower = href.lower()
        if "fomcminutes" not in lower:
            continue
        if not re.search(r"\.html?(?:[?#].*)?$", lower):
            continue
        absolute = urllib.parse.urljoin(wrapper_url, href)
        parsed = urllib.parse.urlparse(absolute)
        if parsed.scheme == "https" and parsed.netloc.lower() == "www.federalreserve.gov":
            candidates.append(absolute)
    return candidates[0] if candidates else None


def extract_policy_text(html):
    parser = ParagraphCollector()
    parser.feed(html)
    text = " ".join(parser.paragraphs)
    if not text:
        return ""
    sentences = re.split(r"(?<=[.!?])\s+", text)
    key = re.compile(
        r"inflation|employment|labor market|labour market|federal funds|interest rate|policy rate|"
        r"monetary policy|balance sheet|economic activity|economic outlook|risks|2 percent|"
        r"maximum employment|restrictive|easing|tightening|rate cut|rate increase|rate reduction|"
        r"participant|committee|target range",
        re.I,
    )
    chosen = []
    for sentence in sentences:
        clean = re.sub(r"\s+", " ", sentence).strip()
        if len(clean) < 45 or not key.search(clean):
            continue
        chosen.append(clean)
        if len(" ".join(chosen)) >= 7000 or len(chosen) >= 30:
            break
    return " ".join(chosen)[:7200]


def enrich(live):
    attempted = 0
    followed = 0
    enriched = 0
    for headline in live.get("headlines") or []:
        if str(headline.get("source") or "") != "Federal Reserve":
            continue
        if "minute" not in str(headline.get("title") or "").lower():
            continue
        wrapper_url = str(headline.get("url") or "")
        if not wrapper_url.startswith("https://www.federalreserve.gov/"):
            continue
        attempted += 1
        try:
            wrapper_html = fetch_text(wrapper_url)
            document_url = find_minutes_html_url(wrapper_url, wrapper_html)
            if not document_url:
                continue
            followed += 1
            document_html = fetch_text(document_url)
            policy_text = extract_policy_text(document_html)
            if not policy_text:
                continue
            headline["officialText"] = policy_text
            headline["officialTextSource"] = "Federal Reserve FOMC minutes HTML"
            headline["officialDocumentUrl"] = document_url
            enriched += 1
        except Exception:
            continue
    return {"status": "live" if enriched else "not-needed" if not attempted else "unavailable", "attempted": attempted, "followed": followed, "enriched": enriched}


def main():
    if not LIVE.exists():
        raise SystemExit("live-data.json not found")
    live = json.loads(LIVE.read_text(encoding="utf-8"))
    status = enrich(live)
    source_status = live.setdefault("officialSourceStatus", {})
    source_status["fedMinutes"] = status
    LIVE.write_text(json.dumps(live, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
