#!/usr/bin/env python3
import json, math, re
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIVE = ROOT / 'live-data.json'
WEIGHTS = {'rates':45,'inflation':30,'labour':24,'growth':18,'consumer':12,'business':10,'trade':8,'housing':7,'government':6,'other':5}
PROFILES = [
    (re.compile(r'core.*cpi|cpi.*core', re.I), .15, 1.22, False),
    (re.compile(r'\bcpi\b|consumer price index', re.I), .20, 1.18, False),
    (re.compile(r'core.*pce|pce.*core', re.I), .15, 1.18, False),
    (re.compile(r'\bpce\b.*price', re.I), .18, 1.14, False),
    (re.compile(r'\bppi\b|producer price', re.I), .25, 1.0, False),
    (re.compile(r'non.?farm payroll|payrolls', re.I), 75.0, 1.18, False),
    (re.compile(r'unemployment rate', re.I), .15, 1.14, True),
    (re.compile(r'average hourly earnings|wage growth', re.I), .18, 1.08, False),
    (re.compile(r'initial jobless claims', re.I), 15.0, .92, True),
    (re.compile(r'continuing jobless claims', re.I), 35.0, .74, True),
    (re.compile(r'\bgdp\b|gross domestic product', re.I), .5, 1.06, False),
    (re.compile(r'retail sales', re.I), .4, 1.02, False),
    (re.compile(r'\bism\b', re.I), 1.5, 1.06, False),
    (re.compile(r'\bpmi\b', re.I), 1.6, .94, False),
    (re.compile(r'interest rate decision|fed funds rate|fomc.*rate', re.I), .25, 1.35, False),
]

def now_utc(): return datetime.now(timezone.utc)
def iso(dt): return dt.astimezone(timezone.utc).isoformat().replace('+00:00','Z')
def parse_dt(v):
    if not v: return None
    try: return datetime.fromisoformat(str(v).replace('Z','+00:00')).astimezone(timezone.utc)
    except Exception: return None

def num(v):
    if v is None or v == '': return None
    try: return float(str(v).replace(',',''))
    except Exception: return None

def clamp(x,a,b): return max(a,min(b,x))

def category(x):
    c=x.get('category') if isinstance(x,dict) else None
    if c in WEIGHTS: return c
    s=str((x or {}).get('name') or (x or {}).get('title') or '').lower()
    if re.search(r'fomc|interest rate|fed funds|federal reserve|powell|fed minutes|fed meeting|fed rate|jackson hole',s): return 'rates'
    if re.search(r'cpi|pce|ppi|inflation|price index',s): return 'inflation'
    if re.search(r'payroll|employment|unemployment|jobless|jolts|job openings|wage|earnings',s): return 'labour'
    if re.search(r'gdp|gross domestic product',s): return 'growth'
    if re.search(r'retail|consumer confidence|consumer sentiment|personal spending|personal income',s): return 'consumer'
    if re.search(r'housing|home sales|building permits|mortgage|construction|housing starts',s): return 'housing'
    if re.search(r'pmi|ism|industrial production|factory|durable|manufacturing|services',s): return 'business'
    if re.search(r'trade|export|import|current account',s): return 'trade'
    if re.search(r'treasury|auction|budget|government',s): return 'government'
    return 'other'

def long_memory(text,cat):
    s=str(text or '')
    return bool(re.search(r'\bcpi\b|consumer price index',s,re.I) or cat=='rates' or re.search(r'\bfomc\b|federal reserve|interest rate|fed funds|rate decision|rate cut|rate hike|powell|fed minutes|hawkish|dovish|higher for longer',s,re.I))

def segment(age_h,long):
    if age_h <= 48: return 'fresh'
    if age_h <= 168: return 'weekly'
    if long and age_h <= 2160: return 'regime'
    return None

def decay(age_h,seg):
    if seg=='fresh': return .5**(age_h/24)
    if seg=='weekly': return .72*(.5**((age_h-48)/72))
    if seg=='regime': return .28*(.5**(((age_h-168)/24)/28))
    return 0

def profile(name,cons):
    for rg,scale,mult,inverse in PROFILES:
        if rg.search(name): return scale,mult,inverse
    c=abs(cons or 0)
    return max(c*.05, .15 if c<2 else 1), 1.0, bool(re.search(r'unemployment|jobless|trade deficit|layoffs',name,re.I))

def source_factor(e):
    st=(e.get('officialVerification') or {}).get('status')
    if st=='mismatch': return .42
    if st in ('matched','official-filled'): return 1.12
    if e.get('primarySource'): return 1.08
    return 1.0

def event_evidence(e, now):
    if not e.get('dateUtc') or str(e.get('volatility','')).upper() not in ('MEDIUM','HIGH') or e.get('isSpeech'): return None
    a,c=num(e.get('actual')),num(e.get('consensus'))
    if a is None or c is None: return None
    d=parse_dt(e.get('dateUtc'))
    if not d or d>now: return None
    age=max(0,(now-d).total_seconds()/3600)
    cat=category(e); name=str(e.get('name') or 'US release')
    seg=segment(age,long_memory(name,cat))
    if not seg: return None
    scale,mult,inverse=profile(name,c)
    z=(a-c)/scale
    if inverse: z*=-1
    usd=math.tanh(z*.78)
    prev,rev=num(e.get('previous')),num(e.get('revised'))
    if prev is not None and rev is not None and rev!=prev:
        rz=(rev-prev)/scale
        if inverse: rz*=-1
        usd=(usd+.28*math.tanh(rz*.72))/1.28
    vol=1.0 if str(e.get('volatility')).upper()=='HIGH' else .62
    score=-usd*WEIGHTS[cat]*vol*mult*decay(age,seg)*source_factor(e)
    if abs(score)<.12: return None
    return {'segment':seg,'category':cat,'score':score,'name':name}

def headline_impact(h):
    imp=str(h.get('impact') or '').lower()
    if imp: return imp
    s=f"{h.get('title','')} {h.get('officialText','')}"
    if long_memory(s,h.get('category')): return 'high'
    return 'medium' if re.search(r'non.?farm|payroll|unemployment|average hourly earnings|\bpce\b|\bppi\b|\bgdp\b|retail sales|\bism\b|\bpmi\b|jobless claims|jolts|tariff|sanction|war|attack|geopolit|recession|financial stress|banking stress',s,re.I) else 'low'

def headline_dir(h):
    s=f"{h.get('title','')} {h.get('officialText','')}".lower()
    if re.search(r'higher for longer|hawkish|rate hike|rates?.*higher|no rush.*cut|delay.*rate cut|not ready.*cut|inflation.*stubborn|inflation.*elevated|inflation.*hot|inflation.*accelerat',s): return -1,1.15
    if re.search(r'dovish|rate cut|cut rates|easing|lower rates|disinflation|inflation.*cool|inflation.*ease|inflation.*slower',s): return 1,1.10
    if re.search(r'payroll|jobs|employment',s) and re.search(r'weak|slow|fall|miss|cool|declin',s): return 1,.78
    if re.search(r'payroll|jobs|employment',s) and re.search(r'strong|surge|beat|accelerat|robust',s): return -1,.78
    if re.search(r'war|attack|missile|military escalation|geopolit|sanctions escalation|crisis',s): return 1,.72
    if re.search(r'recession|hard landing|financial stress|banking stress',s): return 1,.62
    return None

def headline_evidence(h, now):
    if not h.get('title') or headline_impact(h)=='low': return None
    dd=headline_dir(h)
    if not dd: return None
    d=parse_dt(h.get('publishedUtc'))
    if not d or d>now: return None
    age=max(0,(now-d).total_seconds()/3600)
    cat=category(h); text=f"{h.get('title','')} {h.get('officialText','')}"
    seg=segment(age,long_memory(text,cat))
    if not seg: return None
    official=bool(h.get('primarySource') or re.search(r'Federal Reserve|Bureau of Labor Statistics|BLS|BEA|Census|Department of Labor|Treasury|EIA',str(h.get('source') or ''),re.I))
    quality=1 if official else .46
    imp=1 if headline_impact(h)=='high' else .68
    score=dd[0]*min(13,WEIGHTS[cat]*.34)*dd[1]*quality*imp*decay(age,seg)
    if abs(score)<.08: return None
    return {'segment':seg,'category':cat,'score':score,'name':h.get('title')}

def layer(items, cap):
    by={}
    for x in items: by.setdefault(x['category'],[]).append(x)
    cat_scores=[]
    for g in by.values():
        pos=sum(x['score'] for x in g if x['score']>0); neg=sum(abs(x['score']) for x in g if x['score']<0)
        total=pos+neg; net=pos-neg; agr=abs(net)/total if total else 0
        cat_scores.append(clamp(net*(.52+.48*agr),-cap*.58,cap*.58))
    return clamp(sum(cat_scores),-cap,cap)

def market_score(data):
    m=data.get('market') or {}; score=0.0; used=0
    def add(v,scale,weight,invert=True):
        nonlocal score,used
        x=num(v)
        if x is None: return
        used+=1; score += (-1 if invert else 1)*clamp(x/scale,-1,1)*weight
    add((m.get('dxy') or {}).get('changePct'),.55,7,True)
    add((m.get('real10y') or {}).get('deltaBps'),9,6,True)
    add((m.get('us2y') or {}).get('deltaBps'),11,4,True)
    add((m.get('us10y') or {}).get('deltaBps'),11,3,True)
    add((m.get('xau') or {}).get('changePct'),.7,5,False)
    return clamp(score,-18,18),used

def nearest_next_event(data,now):
    rows=[]
    for e in data.get('events') or []:
        if str(e.get('volatility','')).upper() not in ('MEDIUM','HIGH'): continue
        d=parse_dt(e.get('dateUtc'))
        if d and d>now: rows.append((d,e))
    return min(rows,key=lambda x:x[0]) if rows else None

def macro_context(data, now):
    evidence=[]
    for e in data.get('events') or []:
        x=event_evidence(e,now)
        if x: evidence.append(x)
    for h in data.get('headlines') or []:
        x=headline_evidence(h,now)
        if x: evidence.append(x)
    fresh=layer([x for x in evidence if x['segment']=='fresh'],42)
    weekly=layer([x for x in evidence if x['segment']=='weekly'],24)
    regime=layer([x for x in evidence if x['segment']=='regime'],18)
    market,market_used=market_score(data)
    vals=(fresh,weekly,regime,market)
    macro=sum(vals)
    bullish_layers=sum(1 for v in vals if v>3)
    bearish_layers=sum(1 for v in vals if v<-3)
    total_abs=sum(abs(v) for v in vals)
    agreement=abs(macro)/total_abs if total_abs else 0
    return {'fresh':fresh,'weekly':weekly,'regime':regime,'market':market,'macro':macro,'bullishLayers':bullish_layers,'bearishLayers':bearish_layers,'agreement':agreement,'marketInputs':market_used}

def structural_targets(t, side, entry, stop):
    if entry is None or stop is None: return []
    if side=='buy':
        risk=entry-stop
        if risk<=0: return []
        rows=[]
        for s in (t.get('structure4h') or {}).get('swingHighs') or []:
            p=num(s.get('price')) or num(s.get('value')) or num(s.get('high'))
            if p is not None and p>entry:
                rr=(p-entry)/risk
                if 1.8<=rr<=6.0: rows.append((p,rr))
        return sorted(set(rows),key=lambda x:x[0])[:2]
    risk=stop-entry
    if risk<=0: return []
    rows=[]
    for s in (t.get('structure4h') or {}).get('swingLows') or []:
        p=num(s.get('price')) or num(s.get('value')) or num(s.get('low'))
        if p is not None and p<entry:
            rr=(entry-p)/risk
            if 1.8<=rr<=6.0: rows.append((p,rr))
    return sorted(set(rows),key=lambda x:x[0],reverse=True)[:2]

def signal_for(data, now, side='buy', macro_ctx=None):
    if side not in ('buy','sell'): raise ValueError('side must be buy or sell')
    ctx=macro_ctx or macro_context(data,now)
    fresh,weekly,regime,market=ctx['fresh'],ctx['weekly'],ctx['regime'],ctx['market']
    macro=ctx['macro']; bullish_layers=ctx['bullishLayers']; bearish_layers=ctx['bearishLayers']
    agreement=ctx['agreement']; market_used=ctx['marketInputs']
    is_buy=side=='buy'; direction_word='bullish' if is_buy else 'bearish'; opposite_word='bearish' if is_buy else 'bullish'
    candidate_action='BUY LIMIT CANDIDATE' if is_buy else 'SELL LIMIT CANDIDATE'; no_action='NO BUY LIMIT SIGNAL' if is_buy else 'NO SELL LIMIT SIGNAL'

    t=data.get('technical') or {}; blockers=[]; reasons=[]
    observed=parse_dt(t.get('observedAt')); market_age_min=(now-observed).total_seconds()/60 if observed else 9999
    if t.get('status')!='live': blockers.append('OANDA 4H technical feed is not live.')
    if market_age_min>15: blockers.append(f'OANDA market snapshot is {int(market_age_min)} minutes old.')
    h4=((t.get('structure4h') or {}).get('state') or 'unavailable').lower(); d1=((t.get('structure1d') or {}).get('state') or 'unavailable').lower()
    if h4!=direction_word: blockers.append(f'4H structure is {h4}, not {direction_word}.')
    if d1==opposite_word: blockers.append(f'Daily structure is {opposite_word}.')

    directional_macro=macro if is_buy else -macro; aligned_layers=bullish_layers if is_buy else bearish_layers; opposing_layers=bearish_layers if is_buy else bullish_layers
    if directional_macro<10: blockers.append(f'Macro gold score is not {direction_word} enough ({macro:+.1f}).')
    if aligned_layers<2: blockers.append(f'Fewer than two independent macro layers are {direction_word}.')
    if opposing_layers>0 and agreement<.65: blockers.append(f'A meaningful macro layer still conflicts with the {direction_word} case.')
    if agreement<.52: blockers.append(f'Macro agreement is too low ({agreement*100:.0f}%).')

    nxt=nearest_next_event(data,now); next_minutes=None
    if nxt:
        next_minutes=(nxt[0]-now).total_seconds()/60
        if next_minutes<=90: blockers.append(f'{nxt[1].get("name","US event")} is due in {max(0,int(next_minutes))} minutes.')

    px=num(t.get('currentPrice')) or num(((data.get('market') or {}).get('xau') or {}).get('price')); atr=num(t.get('atr14'))
    ob=t.get('preferredBullishOrderBlock') if is_buy else t.get('preferredBearishOrderBlock')
    if not ob: blockers.append(f'No preferred {direction_word} 4H order block is available.')
    zone_low=zone_high=entry=stop=target1=target2=rr1=rr2=None; quality=0; conf=0; confluence=0
    if ob:
        zone_low=num(ob.get('zoneLow')); zone_high=num(ob.get('zoneHigh')); quality=int(num(ob.get('quality')) or 0)
        if zone_low is not None and zone_high is not None: entry=num((ob.get('planning') or {}).get('limitReference')) or (zone_low+zone_high)/2
        stop=num((ob.get('planning') or {}).get('invalidationReference')); status=str(ob.get('status') or '').lower()
        if status not in ('untouched','fresh'): blockers.append(f'Order block is {status or "not fresh"}, not untouched.')
        if quality<75: blockers.append(f'Order-block quality is only {quality}/100 (75 required).')
        confluence=sum(bool(ob.get(k)) for k in ('fairValueGap','liquiditySweep','premiumDiscountAligned'))
        if confluence<2: blockers.append('Order block has fewer than two technical confluences (FVG / sweep / premium-discount).')
        if px is None: blockers.append('Current XAUUSD price is unavailable.')
        elif is_buy and zone_high is not None and px<=zone_high: blockers.append('Price is already at/through the buy zone; no fresh pending buy limit is promoted.')
        elif not is_buy and zone_low is not None and px>=zone_low: blockers.append('Price is already at/through the sell zone; no fresh pending sell limit is promoted.')
        if px is not None and entry is not None and atr:
            dist=((px-entry) if is_buy else (entry-px))/atr
            if dist>2.0: blockers.append(f'{"Buy" if is_buy else "Sell"} zone is {dist:.1f} ATR {"below" if is_buy else "above"} current price; too far away for an up-to-date pending signal.')
        if stop is None or entry is None or (is_buy and stop>=entry) or ((not is_buy) and stop<=entry): blockers.append('A valid structural stop reference is unavailable.')
        else:
            targets=structural_targets(t,side,entry,stop)
            if targets: target1,rr1=targets[0]; target2,rr2=(targets[1] if len(targets)>1 else targets[0])
            else: blockers.append('No nearby 4H structural target offers a realistic 1.8R–6R reward/risk window.')
        conf=clamp(45 + directional_macro*.9 + (quality-75)*.7 + min(12,aligned_layers*4) + max(0,(agreement-.5)*25),0,95)
        reasons=[f'Macro score {macro:+.1f} with {aligned_layers} {direction_word} layers',f'4H structure {h4}; daily structure {d1}',f'{direction_word.title()} order block quality {quality}/100']

    active=not blockers and all(v is not None for v in (entry,stop,target1,rr1))
    if not active: conf=0
    return {'side':side,'status':'candidate' if active else 'no-signal','action':candidate_action if active else no_action,'generatedAt':iso(now),'marketObservedAt':t.get('observedAt'),'validUntil':iso(now+timedelta(minutes=15)),'currentPrice':round(px,3) if px is not None else None,'entryZoneLow':round(zone_low,3) if zone_low is not None else None,'entryZoneHigh':round(zone_high,3) if zone_high is not None else None,'limitPrice':round(entry,3) if entry is not None else None,'stopLossReference':round(stop,3) if stop is not None else None,'tp1Reference':round(target1,3) if target1 is not None else None,'tp2Reference':round(target2,3) if target2 is not None else None,'rrTp1':round(rr1,2) if rr1 is not None else None,'rrTp2':round(rr2,2) if rr2 is not None else None,'orderBlockQuality':quality or None,'confluenceCount':confluence,'confidenceScore':round(conf),'macroScore':round(macro,2),'macroAgreementPct':round(agreement*100),'layers':{'fresh':round(fresh,2),'weekly':round(weekly,2),'regime':round(regime,2),'market':round(market,2),'bullishCount':bullish_layers,'bearishCount':bearish_layers,'marketInputs':market_used},'nextEvent':({'name':nxt[1].get('name'),'dateUtc':iso(nxt[0]),'minutesAway':round(next_minutes)} if nxt else None),'reasons':reasons,'blockers':blockers,'rulesVersion':f'{side}-limit-v2' if is_buy else 'sell-limit-v1','notice':'Planning signal only. It does not guarantee a safe or profitable trade; refresh immediately before using a pending order.'}

def main():
    data=json.loads(LIVE.read_text()); now=now_utc(); ctx=macro_context(data,now)
    buy=signal_for(data,now,'buy',ctx); sell=signal_for(data,now,'sell',ctx)
    data['signals']={'status':'live' if (data.get('technical') or {}).get('status')=='live' else 'limited','generatedAt':iso(now),'buyLimit':buy,'sellLimit':sell,'policy':'Strict 4H limit gating: fresh data + aligned macro agreement + matching 4H structure + untouched high-quality order block + event-risk and realistic R:R gates.'}
    LIVE.write_text(json.dumps(data,indent=2)+"\n")
    print(f"Buy: {buy['action']} | blockers {len(buy['blockers'])} | Sell: {sell['action']} | blockers {len(sell['blockers'])} | macro {ctx['macro']:+.1f}")

if __name__=='__main__': main()
