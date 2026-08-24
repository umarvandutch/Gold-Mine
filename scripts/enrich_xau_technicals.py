#!/usr/bin/env python3
import json
import math
import os
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIVE = ROOT / "live-data.json"
UA = "GoldMineTechnical/4.0 (+https://github.com/umarvandutch/Gold-Mine)"


def now_utc():
    return datetime.now(timezone.utc)


def iso_z(dt):
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_num(value):
    try:
        if value is None or value == "":
            return None
        n = float(str(value).replace(",", ""))
        return n if math.isfinite(n) else None
    except Exception:
        return None


def fetch_json(url, headers=None, timeout=20):
    h = {"User-Agent": UA, "Accept": "application/json"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def oanda_host():
    return "https://api-fxtrade.oanda.com" if os.getenv("OANDA_ENV", "practice").strip().lower() == "live" else "https://api-fxpractice.oanda.com"


def oanda_headers():
    token = os.getenv("OANDA_API_TOKEN", "").strip()
    return {"Authorization": f"Bearer {token}", "Accept": "application/json"}


def normalize_oanda_candles(doc):
    out = []
    for item in doc.get("candles") or []:
        if not item.get("complete"):
            continue
        mid = item.get("mid") or {}
        o, h, l, c = (parse_num(mid.get(k)) for k in ("o", "h", "l", "c"))
        if None in (o, h, l, c):
            continue
        out.append({
            "time": item.get("time"), "open": o, "high": h, "low": l, "close": c,
            "volume": item.get("volume"),
        })
    return out


def fetch_oanda():
    token = os.getenv("OANDA_API_TOKEN", "").strip()
    account = os.getenv("OANDA_ACCOUNT_ID", "").strip()
    if not token or not account:
        return None
    host = oanda_host()
    headers = oanda_headers()
    account_q = urllib.parse.quote(account, safe="")
    candle_base = f"{host}/v3/accounts/{account_q}/instruments/XAU_USD/candles"
    h4 = fetch_json(f"{candle_base}?price=M&granularity=H4&count=320", headers=headers)
    d1 = fetch_json(f"{candle_base}?price=M&granularity=D&count=140&dailyAlignment=17&alignmentTimezone=America%2FNew_York", headers=headers)

    instruments = ["XAU_USD", "EUR_USD", "USD_JPY", "GBP_USD", "USD_CAD", "USD_SEK", "USD_CHF"]
    price_url = f"{host}/v3/accounts/{account_q}/pricing?instruments=" + "%2C".join(instruments)
    price_doc = fetch_json(price_url, headers=headers)
    prices = {}
    observed_at = price_doc.get("time") or iso_z(now_utc())
    for p in price_doc.get("prices") or []:
        bid = parse_num(p.get("closeoutBid") or ((p.get("bids") or [{}])[0].get("price")))
        ask = parse_num(p.get("closeoutAsk") or ((p.get("asks") or [{}])[0].get("price")))
        if bid is None or ask is None:
            continue
        prices[p.get("instrument")] = (bid + ask) / 2.0
        if p.get("time"):
            observed_at = p.get("time")
    return {
        "source": f"OANDA v20 {'live' if os.getenv('OANDA_ENV','practice').strip().lower() == 'live' else 'practice'}",
        "observedAt": observed_at,
        "price": prices.get("XAU_USD"), "prices": prices,
        "candles4h": normalize_oanda_candles(h4), "candles1d": normalize_oanda_candles(d1),
    }


def normalize_twelve_values(values):
    out = []
    for item in reversed(values or []):
        o, h, l, c = (parse_num(item.get(k)) for k in ("open", "high", "low", "close"))
        if None in (o, h, l, c):
            continue
        dt = str(item.get("datetime") or "")
        if dt and "T" not in dt:
            dt = dt + "T00:00:00Z"
        elif dt and not dt.endswith("Z") and "+" not in dt[-6:]:
            dt = dt.replace(" ", "T") + "Z"
        out.append({"time": dt, "open": o, "high": h, "low": l, "close": c, "volume": None})
    return out


def fetch_twelve_data():
    key = os.getenv("TWELVE_DATA_API_KEY", "").strip()
    if not key:
        return None
    base = "https://api.twelvedata.com/time_series"
    common = {"symbol": "XAU/USD", "apikey": key, "timezone": "UTC", "format": "JSON"}
    h4 = fetch_json(base + "?" + urllib.parse.urlencode({**common, "interval": "4h", "outputsize": 320}))
    d1 = fetch_json(base + "?" + urllib.parse.urlencode({**common, "interval": "1day", "outputsize": 140}))
    if h4.get("status") == "error" or not h4.get("values"):
        return None
    candles4h = normalize_twelve_values(h4.get("values"))
    candles1d = normalize_twelve_values(d1.get("values")) if d1.get("values") else []
    latest = candles4h[-1]["close"] if candles4h else None
    return {"source": "Twelve Data XAU/USD trial/free REST", "observedAt": iso_z(now_utc()), "price": latest,
            "prices": {"XAU_USD": latest} if latest is not None else {}, "candles4h": candles4h, "candles1d": candles1d}


def find_numeric_by_keys(obj, keys):
    if isinstance(obj, dict):
        for key in keys:
            if key in obj:
                n = parse_num(obj.get(key))
                if n is not None:
                    return n
        for value in obj.values():
            n = find_numeric_by_keys(value, keys)
            if n is not None:
                return n
    elif isinstance(obj, list):
        for value in obj:
            n = find_numeric_by_keys(value, keys)
            if n is not None:
                return n
    return None


def fetch_alpha_spot():
    key = os.getenv("ALPHA_VANTAGE_API_KEY", "").strip()
    if not key:
        return None
    url = "https://www.alphavantage.co/query?" + urllib.parse.urlencode({"function": "GOLD_SILVER_SPOT", "symbol": "XAU", "apikey": key})
    doc = fetch_json(url)
    bid = find_numeric_by_keys(doc, ["bid", "Bid"])
    ask = find_numeric_by_keys(doc, ["ask", "Ask"])
    px = (bid + ask) / 2 if bid is not None and ask is not None else find_numeric_by_keys(doc, ["price", "spot_price", "spotPrice", "value"])
    if px is None:
        return None
    return {"source": "Alpha Vantage GOLD_SILVER_SPOT", "observedAt": iso_z(now_utc()), "price": px}


def atr_series(candles, period=14):
    trs, out, prev = [], [None] * len(candles), None
    for i, c in enumerate(candles):
        tr = c["high"] - c["low"] if prev is None else max(c["high"] - c["low"], abs(c["high"] - prev), abs(c["low"] - prev))
        trs.append(tr)
        if i + 1 >= period:
            out[i] = sum(trs[i + 1 - period:i + 1]) / period
        prev = c["close"]
    return out


def swing_points(candles, left=2, right=2):
    highs, lows = [], []
    for i in range(left, len(candles) - right):
        h, l = candles[i]["high"], candles[i]["low"]
        if all(h > candles[j]["high"] for j in range(i-left, i)) and all(h >= candles[j]["high"] for j in range(i+1, i+right+1)):
            highs.append({"index": i, "time": candles[i]["time"], "price": h})
        if all(l < candles[j]["low"] for j in range(i-left, i)) and all(l <= candles[j]["low"] for j in range(i+1, i+right+1)):
            lows.append({"index": i, "time": candles[i]["time"], "price": l})
    return highs, lows


def structure_state(candles):
    highs, lows = swing_points(candles)
    state = "range"
    if len(highs) >= 2 and len(lows) >= 2:
        if highs[-1]["price"] > highs[-2]["price"] and lows[-1]["price"] > lows[-2]["price"]:
            state = "bullish"
        elif highs[-1]["price"] < highs[-2]["price"] and lows[-1]["price"] < lows[-2]["price"]:
            state = "bearish"
    return {"state": state, "swingHighs": highs[-8:], "swingLows": lows[-8:]}


def prior_swing(points, index, lookback=45):
    eligible = [p for p in points if index - lookback <= p["index"] < index - 1]
    return eligible[-1] if eligible else None


def prior_range_mid(candles, index, lookback=40):
    window = candles[max(0, index - lookback):index]
    if not window:
        return None
    return (max(c["high"] for c in window) + min(c["low"] for c in window)) / 2.0


def fvg_present(candles, i, side):
    if i < 2:
        return False
    return candles[i]["low"] > candles[i-2]["high"] if side == "bullish" else candles[i]["high"] < candles[i-2]["low"]


def liquidity_sweep(candles, i, side):
    if i < 10:
        return False
    pre, older = candles[max(0, i-6):i], candles[max(0, i-18):max(0, i-6)]
    if len(older) < 4 or not pre:
        return False
    if side == "bullish":
        return min(c["low"] for c in pre) < min(c["low"] for c in older) and candles[i]["close"] > min(c["low"] for c in older)
    return max(c["high"] for c in pre) > max(c["high"] for c in older) and candles[i]["close"] < max(c["high"] for c in older)


def target_levels(entry, side, swing_highs, swing_lows, current):
    if side == "bullish":
        vals = sorted({round(p["price"], 6) for p in swing_highs if p["price"] > max(entry, current)})
    else:
        vals = sorted({round(p["price"], 6) for p in swing_lows if p["price"] < min(entry, current)}, reverse=True)
    return vals[:2]


def detect_order_blocks(candles):
    if len(candles) < 60:
        return []
    atrs = atr_series(candles)
    swing_highs, swing_lows = swing_points(candles)
    current = candles[-1]["close"]
    current_atr = atrs[-1] or max(current * 0.0025, 0.01)
    candidates = []
    for i in range(20, len(candles)):
        atr = atrs[i]
        if not atr or atr <= 0:
            continue
        c = candles[i]
        body, rng = abs(c["close"] - c["open"]), c["high"] - c["low"]
        if body < 0.62 * atr or rng < 0.85 * atr:
            continue
        for side in ("bullish", "bearish"):
            bullish = side == "bullish"
            if bullish and c["close"] <= c["open"]:
                continue
            if not bullish and c["close"] >= c["open"]:
                continue
            prior = prior_swing(swing_highs if bullish else swing_lows, i)
            if not prior:
                continue
            bos = c["close"] > prior["price"] + 0.04 * atr if bullish else c["close"] < prior["price"] - 0.04 * atr
            if not bos:
                continue
            block_index = None
            for j in range(i - 1, max(-1, i - 7), -1):
                bj = candles[j]
                if bullish and bj["close"] < bj["open"]:
                    block_index = j; break
                if not bullish and bj["close"] > bj["open"]:
                    block_index = j; break
            if block_index is None:
                continue
            b = candles[block_index]
            zone_low, zone_high = (b["low"], max(b["open"], b["close"])) if bullish else (min(b["open"], b["close"]), b["high"])
            if zone_high <= zone_low:
                continue
            after = candles[i+1:]
            invalidated = any(x["close"] < zone_low for x in after) if bullish else any(x["close"] > zone_high for x in after)
            if invalidated:
                continue
            touched = any(x["low"] <= zone_high and x["high"] >= zone_low for x in after)
            in_zone = candles[-1]["low"] <= zone_high and candles[-1]["high"] >= zone_low
            status = "in-zone" if in_zone else "mitigated" if touched else "untouched"
            fvg, sweep = fvg_present(candles, i, side), liquidity_sweep(candles, i, side)
            range_mid, zone_mid = prior_range_mid(candles, i), (zone_low + zone_high) / 2.0
            location_ok = range_mid is not None and (zone_mid < range_mid if bullish else zone_mid > range_mid)
            disp_atr = body / atr
            recency = max(0.0, 1.0 - (len(candles) - 1 - i) / 90.0)
            quality = 48 + min(16, disp_atr * 8) + (10 if fvg else 0) + (10 if sweep else 0) + (7 if location_ok else 0) + recency * 9 - (7 if status == "mitigated" else 0)
            quality = int(round(max(0, min(96, quality))))
            entry = zone_mid
            stop = zone_low - 0.16 * current_atr if bullish else zone_high + 0.16 * current_atr
            risk = abs(entry - stop)
            planning_targets = []
            for px in target_levels(entry, side, swing_highs, swing_lows, current):
                reward = px - entry if bullish else entry - px
                if reward > 0 and risk > 0:
                    planning_targets.append({"price": round(px, 3), "rMultiple": round(reward / risk, 2)})
            best_rr = max((x["rMultiple"] for x in planning_targets), default=None)
            setup_ok = quality >= 64 and best_rr is not None and best_rr >= 1.8
            candidates.append({
                "side": side, "createdAt": c["time"], "blockCandleAt": b["time"],
                "zoneLow": round(zone_low, 3), "zoneHigh": round(zone_high, 3), "zoneMid": round(zone_mid, 3),
                "status": status, "quality": quality, "bosLevel": round(prior["price"], 3),
                "displacementATR": round(disp_atr, 2), "fairValueGap": fvg, "liquiditySweep": sweep,
                "premiumDiscountAligned": location_ok,
                "distanceATR": round((current - zone_high) / current_atr, 2) if bullish else round((zone_low - current) / current_atr, 2),
                "planning": {"limitReference": round(entry, 3), "invalidationReference": round(stop, 3), "targets": planning_targets,
                             "bestRMultiple": best_rr, "passesRewardRiskGate": setup_ok},
            })
    candidates.sort(key=lambda x: (x["quality"], x["createdAt"] or ""), reverse=True)
    deduped = []
    for c in candidates:
        overlap = False
        for d in deduped:
            if c["side"] != d["side"]:
                continue
            union = max(c["zoneHigh"], d["zoneHigh"]) - min(c["zoneLow"], d["zoneLow"])
            intersection = min(c["zoneHigh"], d["zoneHigh"]) - max(c["zoneLow"], d["zoneLow"])
            if union > 0 and intersection / union > 0.55:
                overlap = True; break
        if not overlap:
            deduped.append(c)
        if len(deduped) >= 8:
            break
    return deduped


def synthetic_dxy(prices):
    try:
        e, j, g = prices["EUR_USD"], prices["USD_JPY"], prices["GBP_USD"]
        c, s, f = prices["USD_CAD"], prices["USD_SEK"], prices["USD_CHF"]
        if min(e, j, g, c, s, f) <= 0:
            return None
        return 50.14348112 * (e ** -0.576) * (j ** 0.136) * (g ** -0.119) * (c ** 0.091) * (s ** 0.042) * (f ** 0.036)
    except Exception:
        return None


def pct_change(a, b):
    return ((a - b) / b * 100.0) if a is not None and b not in (None, 0) else None


def build_technical(feed):
    candles4h, candles1d = feed.get("candles4h") or [], feed.get("candles1d") or []
    price = parse_num(feed.get("price"))
    if price is None and candles4h:
        price = candles4h[-1]["close"]
    atrs = atr_series(candles4h) if candles4h else []
    atr14 = atrs[-1] if atrs and atrs[-1] is not None else None
    h4_structure = structure_state(candles4h) if candles4h else {"state": "unavailable", "swingHighs": [], "swingLows": []}
    d1_structure = structure_state(candles1d) if len(candles1d) >= 20 else {"state": "unavailable", "swingHighs": [], "swingLows": []}
    order_blocks = detect_order_blocks(candles4h)
    return {
        "status": "live" if len(candles4h) >= 60 and price is not None else "partial", "source": feed.get("source"),
        "observedAt": feed.get("observedAt") or iso_z(now_utc()), "symbol": "XAUUSD", "executionTimeframe": "4H",
        "currentPrice": round(price, 3) if price is not None else None, "atr14": round(atr14, 3) if atr14 is not None else None,
        "structure4h": h4_structure, "structure1d": d1_structure, "orderBlocks": order_blocks,
        "preferredBullishOrderBlock": next((x for x in order_blocks if x["side"] == "bullish"), None),
        "preferredBearishOrderBlock": next((x for x in order_blocks if x["side"] == "bearish"), None),
        "candles4h": candles4h[-140:], "candles1d": candles1d[-80:],
        "method": "BOS + displacement + last opposing candle; FVG/liquidity/premium-discount confluence; invalidation by 4H close beyond distal edge",
    }


def update_market(live, feed, alpha=None):
    market = live.setdefault("market", {}) if isinstance(live.get("market"), dict) else {}
    live["market"] = market
    observed = (feed or {}).get("observedAt") or (alpha or {}).get("observedAt") or iso_z(now_utc())
    price = parse_num((feed or {}).get("price"))
    source = (feed or {}).get("source")
    if price is None and alpha:
        price, source = parse_num(alpha.get("price")), alpha.get("source")
    if price is not None:
        prev = parse_num((market.get("xau") or {}).get("price")); ch = pct_change(price, prev)
        market["xau"] = {"label": "Gold / XAUUSD", "symbol": "XAU_USD", "name": "Gold / XAUUSD", "price": round(price, 4),
                         "previous": prev, "changePct": round(ch, 4) if ch is not None else None, "deltaBps": None,
                         "date": str(observed)[:10], "time": str(observed)[11:19], "kind": "gold", "source": source or "free programmatic market feed",
                         "live": True, "observedAt": observed}
    dxy = synthetic_dxy((feed or {}).get("prices") or {})
    if dxy is not None:
        prev = parse_num((market.get("dxy") or {}).get("price")); ch = pct_change(dxy, prev)
        market["dxy"] = {"label": "Synthetic US Dollar Index", "symbol": "DXY-synthetic", "name": "Synthetic DXY from six FX pairs",
                         "price": round(dxy, 4), "previous": prev, "changePct": round(ch, 4) if ch is not None else None, "deltaBps": None,
                         "date": str(observed)[:10], "time": str(observed)[11:19], "kind": "index", "source": f"{(feed or {}).get('source')} · DXY formula",
                         "live": True, "observedAt": observed}


def main():
    if not LIVE.exists():
        raise SystemExit("live-data.json missing")
    live = json.loads(LIVE.read_text(encoding="utf-8"))
    errors, feed, source_status = [], None, "not-configured"
    try:
        feed = fetch_oanda()
        if feed: source_status = "oanda-live"
    except Exception as exc:
        errors.append(f"OANDA: {type(exc).__name__}: {exc}")
    if feed is None:
        try:
            feed = fetch_twelve_data()
            if feed: source_status = "twelve-data-fallback"
        except Exception as exc:
            errors.append(f"Twelve Data: {type(exc).__name__}: {exc}")
    alpha = None
    if feed is None or parse_num(feed.get("price")) is None:
        try:
            alpha = fetch_alpha_spot()
            if alpha and source_status == "not-configured": source_status = "alpha-vantage-spot-only"
        except Exception as exc:
            errors.append(f"Alpha Vantage: {type(exc).__name__}: {exc}")
    if feed and len(feed.get("candles4h") or []) >= 60:
        live["technical"] = build_technical(feed)
    else:
        prior = live.get("technical") if isinstance(live.get("technical"), dict) else {}
        chosen = feed or alpha or {}
        live["technical"] = {**prior, "status": "price-only" if (feed and parse_num(feed.get("price")) is not None) or alpha else "not-configured",
                             "source": chosen.get("source"), "observedAt": chosen.get("observedAt"), "executionTimeframe": "4H",
                             "reason": "A free programmatic 4H candle feed is required for automatic order-block analysis."}
    if feed or alpha:
        update_market(live, feed or {}, alpha)
    live.setdefault("sourceStatus", {})["xauProgrammatic"] = source_status
    live["sourceStatus"]["technical4h"] = live.get("technical", {}).get("status", "unavailable")
    live["marketDataPolicy"] = {"preferred": "OANDA v20 personal practice/live token",
                                "fallbacks": ["Twelve Data free/trial XAU/USD when available", "Alpha Vantage free spot (low frequency)", "existing Stooq/daily context"],
                                "secretsClientSide": False, "paidServicesEnabled": False}
    if errors:
        live.setdefault("errors", []).extend(errors[-4:])
    LIVE.write_text(json.dumps(live, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
