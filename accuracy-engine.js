(()=>{
  "use strict";

  const VERSION="accuracy-v2.0";
  const SNAPSHOT_URL="https://raw.githubusercontent.com/umarvandutch/Gold-Mine/main/live-data.json";
  const HISTORY_URL="https://raw.githubusercontent.com/umarvandutch/Gold-Mine/main/data/signal-history.json";
  const BASE_WEIGHT={rates:45,inflation:28,labour:22,growth:18,consumer:12,business:10,trade:9,housing:8,government:7,other:5};
  const VOL_MULT={HIGH:1,MEDIUM:.62,LOW:.34,NONE:.22};
  const HORIZONS=[
    {id:"now",label:"0–15 min",eventHalfLife:20,eventMax:180,newsHalfLife:35,newsMax:180,triggerMax:75},
    {id:"short",label:"15–60 min",eventHalfLife:75,eventMax:480,newsHalfLife:120,newsMax:480,triggerMax:210},
    {id:"medium",label:"1–4 hours",eventHalfLife:240,eventMax:1440,newsHalfLife:360,newsMax:1440,triggerMax:540}
  ];

  const PROFILES=[
    {re:/core.*cpi|cpi.*core/i,family:"Core CPI",scale:.15,mult:1.18},
    {re:/\bcpi\b/i,family:"CPI",scale:.20,mult:1.12},
    {re:/core.*pce|pce.*core/i,family:"Core PCE",scale:.15,mult:1.20},
    {re:/\bpce\b.*price|personal consumption expenditures.*price/i,family:"PCE inflation",scale:.18,mult:1.16},
    {re:/\bppi\b|producer price/i,family:"PPI",scale:.25,mult:1.00},
    {re:/non.?farm payroll|nonfarm payroll|payrolls/i,family:"Payrolls",scale:75,mult:1.18},
    {re:/unemployment rate/i,family:"Unemployment",scale:.15,mult:1.12,inverse:true},
    {re:/average hourly earnings|wage growth|earnings.*(mom|yoy)/i,family:"Wages",scale:.18,mult:1.08},
    {re:/initial jobless claims/i,family:"Jobless claims",scale:15,mult:.92,inverse:true},
    {re:/continuing jobless claims/i,family:"Continuing claims",scale:35,mult:.72,inverse:true},
    {re:/jolts|job openings/i,family:"JOLTS",relative:.05,mult:.92},
    {re:/\bgdp\b|gross domestic product/i,family:"GDP",scale:.50,mult:1.06},
    {re:/retail sales/i,family:"Retail sales",scale:.40,mult:1.02},
    {re:/\bism\b.*(manufacturing|services)|ism manufacturing|ism services/i,family:"ISM",scale:1.5,mult:1.06},
    {re:/s&p global.*pmi|\bpmi\b/i,family:"PMI",scale:1.6,mult:.94},
    {re:/consumer confidence|consumer sentiment/i,family:"Consumer confidence",scale:4.5,mult:.88},
    {re:/durable goods/i,family:"Durable goods",relative:.06,mult:.84},
    {re:/industrial production/i,family:"Industrial production",scale:.45,mult:.82},
    {re:/housing starts|building permits|home sales/i,family:"Housing",relative:.045,mult:.72},
    {re:/trade deficit|trade balance/i,family:"Trade",relative:.08,mult:.68,inverse:true},
    {re:/fomc.*rate|interest rate decision|fed funds rate/i,family:"Fed rate decision",scale:.25,mult:1.30}
  ];

  const AMBIGUOUS=/speech|speaks|auction|inventory|inventories|stocks change|storage change|rig count|net positions|cftc|budget balance|mortgage rate|oil stocks|gasoline stocks|distillate stocks|heating oil|natural gas storage/i;
  const OFFICIAL_SOURCE=/Federal Reserve|Bureau of Labor Statistics|BLS|BEA|Census|Department of Labor|Treasury|EIA/i;

  let lastData=null;
  let lastHistory=null;
  let rendering=false;

  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  const num=v=>{if(v===null||v===undefined||v==="")return null;const n=Number(String(v).replace(/,/g,""));return Number.isFinite(n)?n:null;};
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const ageMinutes=iso=>Math.max(0,(Date.now()-new Date(iso).getTime())/60000);
  const decay=(age,half,max)=>age>max?0:Math.pow(.5,age/half);

  function profileFor(e){
    const name=String(e?.name||"");
    return PROFILES.find(p=>p.re.test(name))||{family:e?.category||"Other",relative:.04,mult:1};
  }

  function scaleFor(profile,consensus){
    if(Number.isFinite(profile.scale))return profile.scale;
    const c=Math.abs(consensus||0);
    return Math.max(c*(profile.relative||.04),c<2?.12:1);
  }

  function categoryFor(e){
    if(e?.category&&BASE_WEIGHT[e.category]!==undefined)return e.category;
    const s=String(e?.name||"").toLowerCase();
    if(/fomc|interest rate|fed funds|federal reserve|powell|beige book|jackson hole|fed chair|fed governor|fed president|fed minutes|fed meeting|fed rate/.test(s))return"rates";
    if(/cpi|pce|ppi|inflation|price index|prices paid|prices received/.test(s))return"inflation";
    if(/payroll|employment|unemployment|jobless|jolts|job openings|labor|labour|wage|earnings/.test(s))return"labour";
    if(/gdp|gross domestic product/.test(s))return"growth";
    if(/retail|consumer confidence|consumer sentiment|personal spending|personal income/.test(s))return"consumer";
    if(/housing|home sales|building permits|mortgage|construction|housing starts/.test(s))return"housing";
    if(/pmi|ism|industrial production|factory|durable|manufacturing|services|philadelphia fed|dallas fed|richmond fed|empire state/.test(s))return"business";
    if(/trade|export|import|current account/.test(s))return"trade";
    if(/treasury|auction|budget|government/.test(s))return"government";
    return"other";
  }

  function calibrationFor(family){
    const entries=Array.isArray(lastHistory?.events)?lastHistory.events:[];
    const completed=entries.filter(x=>x.family===family&&x.outcomes?.m60&&Number.isFinite(x.outcomes.m60.changePct)&&/bullish|bearish/.test(x.model?.bias||""));
    if(completed.length<30)return{factor:1,n:completed.length,rate:null};
    const correct=completed.filter(x=>x.model.bias==="bullish"?x.outcomes.m60.changePct>0:x.outcomes.m60.changePct<0).length;
    const rate=correct/completed.length;
    return{factor:clamp(.8+(rate-.5)*1.5,.78,1.22),n:completed.length,rate};
  }

  function eventEvidence(e,h){
    if(!e?.dateUtc||AMBIGUOUS.test(String(e.name||""))||e.isSpeech)return null;
    const age=ageMinutes(e.dateUtc);
    const timeWeight=decay(age,h.eventHalfLife,h.eventMax);
    if(!timeWeight)return null;

    const actual=num(e.actual),consensus=num(e.consensus),previous=num(e.previous),revised=num(e.revised);
    const p=profileFor(e);
    let usd=0;
    let pieces=0;
    let surpriseZ=null;
    let revisionZ=null;

    if(actual!==null&&consensus!==null){
      const scale=scaleFor(p,consensus);
      surpriseZ=(actual-consensus)/scale;
      if(p.inverse)surpriseZ*=-1;
      usd+=Math.tanh(surpriseZ*.78);
      pieces+=1;
    }

    if(revised!==null&&previous!==null&&revised!==previous){
      const scale=scaleFor(p,previous);
      revisionZ=(revised-previous)/scale;
      if(p.inverse)revisionZ*=-1;
      usd+=.28*Math.tanh(revisionZ*.72);
      pieces+=.28;
    }

    if(!pieces)return null;
    usd/=pieces;
    const gold=-usd;
    const cat=categoryFor(e);
    const vol=VOL_MULT[String(e.volatility||"NONE").toUpperCase()]||.22;
    const cal=calibrationFor(p.family);
    const importance=(BASE_WEIGHT[cat]||5)*vol*(p.mult||1)*cal.factor;
    const score=gold*importance*timeWeight;
    if(Math.abs(score)<.08)return null;

    const parts=[];
    if(surpriseZ!==null)parts.push(`${Math.abs(surpriseZ).toFixed(1)}× normalised surprise`);
    if(revisionZ!==null)parts.push(`revision ${revisionZ>0?"strengthened":"weakened"} the prior reading`);
    return{
      type:"event",score,age,at:e.dateUtc,family:p.family,name:e.name,
      detail:parts.join(" · "),
      calibration:cal,
      revised:revisionZ!==null,
      source:e.source||"Economic calendar"
    };
  }

  function clusterEvents(events,h){
    const map=new Map();
    for(const e of events||[]){
      const ev=eventEvidence(e,h);
      if(!ev)continue;
      const key=new Date(ev.at).toISOString().slice(0,16);
      if(!map.has(key))map.set(key,[]);
      map.get(key).push(ev);
    }
    const out=[];
    for(const [key,group] of map){
      const rawAbs=group.reduce((s,x)=>s+Math.abs(x.score),0);
      const rawNet=group.reduce((s,x)=>s+x.score,0);
      const maxAbs=Math.max(...group.map(x=>Math.abs(x.score)));
      const cap=maxAbs*(1+Math.min(.65,.24*Math.log2(group.length+1)));
      const capFactor=rawAbs>cap?cap/rawAbs:1;
      const agreement=rawAbs?Math.abs(rawNet)/rawAbs:0;
      const conflictPenalty=.55+.45*agreement;
      const score=rawNet*capFactor*conflictPenalty;
      const sorted=[...group].sort((a,b)=>Math.abs(b.score)-Math.abs(a.score));
      out.push({
        type:"cluster",score,age:Math.min(...group.map(x=>x.age)),at:sorted[0].at,
        name:group.length>1?`${group.length} releases at the same time`:sorted[0].name,
        detail:group.length>1?`${sorted.slice(0,3).map(x=>x.name).join(" · ")}${agreement<.45?" · conflicting signals reduced the weight":""}`:sorted[0].detail,
        children:group,
        revised:group.some(x=>x.revised),
        source:"Economic releases"
      });
    }
    return out;
  }

  function headlineEvidence(hd,h){
    if(!hd?.title)return null;
    const age=hd.publishedUtc?ageMinutes(hd.publishedUtc):99999;
    const timeWeight=decay(age,h.newsHalfLife,h.newsMax);
    if(!timeWeight)return null;
    const s=String(hd.title).toLowerCase();
    let direction=0;
    let reason="";
    let magnitude=1;

    if(/higher for longer|hawkish|rate hike|rates?.*higher|no rush.*cut|delay.*rate cut|not ready.*cut|inflation.*stubborn|inflation.*elevated/.test(s)){
      direction=-1;reason="Hawkish/rates-up implication";magnitude=1.15;
    }else if(/dovish|rate cut|cut rates|easing|lower rates|disinflation|inflation.*cool|inflation.*ease/.test(s)){
      direction=1;reason="Dovish/rates-down implication";magnitude=1.08;
    }else if(/payroll|jobs|employment/.test(s)&&/(weak|slow|fall|miss|cool)/.test(s)){
      direction=1;reason="Labour weakness can reduce rate pressure";magnitude=.72;
    }else if(/payroll|jobs|employment/.test(s)&&/(strong|surge|beat|accelerat)/.test(s)){
      direction=-1;reason="Labour strength can support USD/yields";magnitude=.72;
    }else if(/war|attack|missile|military escalation|geopolit|sanctions escalation|crisis/.test(s)){
      direction=1;reason="Risk-off safe-haven demand";magnitude=.66;
    }else if(/recession|hard landing|financial stress|banking stress/.test(s)){
      direction=1;reason="Risk-off/growth stress can support gold";magnitude=.58;
    }else{
      return null;
    }

    const official=OFFICIAL_SOURCE.test(String(hd.source||""));
    const quality=official?1:.46;
    const cat=hd.category&&BASE_WEIGHT[hd.category]!==undefined?hd.category:"other";
    const base=Math.min(12,(BASE_WEIGHT[cat]||5)*.34);
    return{
      type:"headline",score:direction*base*magnitude*quality*timeWeight,age,at:hd.publishedUtc,
      name:hd.title,detail:`${reason} · ${official?"primary/official source":"aggregated headline; lower weight"}`,
      source:hd.source||"Headline feed"
    };
  }

  function marketEvidence(data,h){
    const m=data?.market||{};
    const out=[];
    const add=(key,name,raw,scale,weight,detail)=>{
      if(!Number.isFinite(raw))return;
      const score=clamp(-raw/scale,-1,1)*weight;
      if(Math.abs(score)>.05)out.push({type:"market",score,age:0,name,detail,source:m[key]?.source||"Market context"});
    };
    if(m.dxy&&Number.isFinite(m.dxy.changePct))add("dxy","US Dollar Index",m.dxy.changePct,.45,8,`${m.dxy.changePct>0?"USD stronger":"USD weaker"} vs previous close`);
    if(m.us2y&&Number.isFinite(m.us2y.deltaBps))add("us2y","US 2Y yield",m.us2y.deltaBps,10,4.5,`${m.us2y.deltaBps>0?"yields higher":"yields lower"} vs prior Treasury day · daily context`);
    if(m.us10y&&Number.isFinite(m.us10y.deltaBps))add("us10y","US 10Y yield",m.us10y.deltaBps,9,3.5,`${m.us10y.deltaBps>0?"yields higher":"yields lower"} vs prior Treasury day · daily context`);
    if(m.real10y&&Number.isFinite(m.real10y.deltaBps))add("real10y","US 10Y real yield",m.real10y.deltaBps,8,5.5,`${m.real10y.deltaBps>0?"real yields higher":"real yields lower"} vs prior Treasury day · daily context`);
    return out;
  }

  function classifyEvidence(list,h,data){
    const pos=list.filter(x=>x.score>0).reduce((s,x)=>s+x.score,0);
    const neg=list.filter(x=>x.score<0).reduce((s,x)=>s+Math.abs(x.score),0);
    const total=pos+neg;
    const net=pos-neg;
    const agreement=total?Math.abs(net)/total:0;
    const top=[...list].sort((a,b)=>Math.abs(b.score)-Math.abs(a.score));
    const freshTrigger=top.some(x=>x.type!=="market"&&Number.isFinite(x.age)&&x.age<=h.triggerMax&&Math.abs(x.score)>=1.25);
    const enough=total>=3.5&&Math.abs(net)>=1.8&&agreement>=.18&&freshTrigger;
    let bias="wait";
    if(enough)bias=net>0?"bullish":"bearish";
    const strength=clamp(Math.round((1-Math.exp(-total/16))*agreement*100),0,100);

    const xau=data?.market?.xau;
    let confirmation="Gold price confirmation unavailable from the current free quote source.";
    if(xau&&Number.isFinite(xau.changePct)){
      if(bias==="bullish")confirmation=xau.changePct>0?"Gold price is confirming the bullish evidence.":"Gold price is not confirming the bullish evidence yet.";
      else if(bias==="bearish")confirmation=xau.changePct<0?"Gold price is confirming the bearish evidence.":"Gold price is not confirming the bearish evidence yet.";
      else confirmation=`Gold is ${xau.changePct>0?"up":"down"} vs its comparison point, but the macro evidence is still mixed.`;
    }

    return{bias,pos,neg,total,net,agreement,strength,top,confirmation,freshTrigger};
  }

  function compute(data,h){
    const events=clusterEvents(data?.events||[],h);
    const headlines=(data?.headlines||[]).map(x=>headlineEvidence(x,h)).filter(Boolean);
    const market=marketEvidence(data,h);
    return classifyEvidence([...events,...headlines,...market],h,data);
  }

  function biasText(b){
    if(b==="bullish")return{headline:"GOOD NEWS · BULLISH BIAS",short:"Gold ↑",cls:"good"};
    if(b==="bearish")return{headline:"BAD NEWS · BEARISH BIAS",short:"Gold ↓",cls:"bad"};
    return{headline:"WAIT / MIXED",short:"Mixed",cls:"wait"};
  }

  function driverText(x){
    const good=x.score>0;
    return `<div class="accuracy-driver"><span class="accuracy-dot ${good?"good":"bad"}"></span><div><strong>${esc(x.name)}</strong><small>${good?"Supports higher gold":"Supports lower gold"} · ${esc(x.detail||"")}</small></div><b>${good?"+":"−"}${Math.abs(x.score).toFixed(1)}</b></div>`;
  }

  function invalidationText(result){
    if(result.bias==="bullish")return"This bullish view weakens if the USD and real/short-term yields rise, or if a newer high-impact US release is clearly stronger/hawkish.";
    if(result.bias==="bearish")return"This bearish view weakens if the USD and real/short-term yields fall, or if a newer high-impact US release is clearly weaker/dovish or safe-haven demand escalates.";
    return"There is not enough agreement to force a direction. Wait for a fresh high-impact release, clearer Fed guidance, or market confirmation.";
  }

  function historySummary(){
    const rows=Array.isArray(lastHistory?.events)?lastHistory.events:[];
    const completed=rows.filter(x=>x.outcomes?.m60&&Number.isFinite(x.outcomes.m60.changePct)&&/bullish|bearish/.test(x.model?.bias||""));
    if(completed.length<20)return`Backtest calibration is collecting observations (${completed.length}/20 minimum before showing a hit-rate). No model weight is boosted from tiny samples.`;
    const correct=completed.filter(x=>x.model.bias==="bullish"?x.outcomes.m60.changePct>0:x.outcomes.m60.changePct<0).length;
    const pct=Math.round(correct/completed.length*100);
    return`Historical 60-minute directional check: ${pct}% across ${completed.length} logged observations. This is retrospective calibration data, not a promised win probability.`;
  }

  function render(data){
    const panel=document.getElementById("predictionPanel");
    if(!panel||rendering)return;
    rendering=true;
    try{
      const results=HORIZONS.map(h=>({h,result:compute(data,h)}));
      const medium=results[2].result;
      const bt=biasText(medium.bias);
      const sourceAge=data?.sourceQueriedAt||data?.generatedAt;
      const sourceFresh=sourceAge?Math.max(0,Math.floor(ageMinutes(sourceAge))):null;
      const cards=results.map(({h,result})=>{
        const b=biasText(result.bias);
        const drivers=result.top.filter(x=>Math.abs(x.score)>=.25).slice(0,4);
        return `<section class="accuracy-horizon ${b.cls}">
          <div class="accuracy-horizon-top"><div><span class="eyebrow">${esc(h.label)}</span><h3>${b.headline}</h3></div><strong>${b.short}</strong></div>
          <div class="accuracy-meter"><span style="width:${result.strength}%"></span></div>
          <p><b>Evidence strength ${result.strength}/100</b> · agreement ${Math.round(result.agreement*100)}%. This is evidence agreement, not trade win probability.</p>
          ${drivers.length?`<div class="accuracy-drivers">${drivers.map(driverText).join("")}</div>`:'<div class="accuracy-empty">No sufficiently fresh, measurable evidence for this horizon.</div>'}
          <p class="accuracy-confirm">${esc(result.confirmation)}</p>
          <p class="accuracy-invalidate"><b>What would change this:</b> ${esc(invalidationText(result))}</p>
        </section>`;
      }).join("");

      panel.innerHTML=`<div class="accuracy-shell">
        <div class="accuracy-hero ${bt.cls}">
          <span class="eyebrow">ACCURACY MODEL V2 · FREE DATA</span>
          <h3>${bt.headline}</h3>
          <p>Gold ↑ is treated as good news. Gold ↓ is treated as bad news. The model normalises each release by indicator type, includes revisions, caps simultaneous releases to avoid double-counting, penalises contradictions, and separates three time horizons.</p>
          <div class="accuracy-meta"><span>${sourceFresh===null?"Source freshness unavailable":`Underlying source snapshot ${sourceFresh<1?"just refreshed":`${sourceFresh} min old`}`}</span><span>${VERSION}</span></div>
        </div>
        ${cards}
        <section class="accuracy-method"><span class="eyebrow">CALIBRATION & SAFETY</span><h3>Built to become evidence-driven</h3><p>${esc(historySummary())}</p><p>Revisions are included at reduced weight. Correlated releases published at the same minute are grouped and capped. Official Fed/BLS-style headlines receive more trust than aggregated headlines. Daily Treasury yields are deliberately down-weighted because they are context, not intraday ticks.</p></section>
      </div>`;
    }finally{
      rendering=false;
    }
  }

  async function fetchLive(){
    const worker=String(window.GOLD_MINE_CONFIG?.liveWorkerUrl||"").trim();
    if(worker){
      try{
        const join=worker.includes("?")?"&":"?";
        const r=await fetch(`${worker}${join}t=${Date.now()}`,{cache:"no-store"});
        if(r.ok){const j=await r.json();if(Array.isArray(j?.events))return j;}
      }catch(error){console.debug("Accuracy worker fetch unavailable",error);}
    }
    const r=await fetch(`${SNAPSHOT_URL}?accuracy=${Date.now()}`,{cache:"no-store"});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    const j=await r.json();
    if(!Array.isArray(j?.events))throw new Error("Invalid accuracy data");
    return j;
  }

  async function fetchHistory(){
    try{
      const r=await fetch(`${HISTORY_URL}?t=${Date.now()}`,{cache:"no-store"});
      if(!r.ok)return null;
      const j=await r.json();
      return j&&Array.isArray(j.events)?j:null;
    }catch{return null;}
  }

  function patchFreeDataCopy(){
    document.querySelectorAll(".method-card p,.settings-row span").forEach(el=>{
      if(el.textContent.includes("roughly every 10 minutes"))el.textContent=el.textContent.replace("roughly every 10 minutes","roughly every 5 minutes (GitHub may occasionally delay scheduled runs)");
    });
  }

  function injectStyle(){
    if(document.getElementById("accuracy-v2-style"))return;
    const style=document.createElement("style");
    style.id="accuracy-v2-style";
    style.textContent=`
      .accuracy-shell{display:grid;gap:14px}.accuracy-hero,.accuracy-horizon,.accuracy-method{background:#fff;border:1px solid #e7e3d9;border-radius:18px;padding:16px;box-shadow:0 5px 20px rgba(31,36,45,.05)}
      .accuracy-hero.good,.accuracy-horizon.good{border-left:4px solid #2d7a52}.accuracy-hero.bad,.accuracy-horizon.bad{border-left:4px solid #a54b45}.accuracy-hero.wait,.accuracy-horizon.wait{border-left:4px solid #9a7a35}
      .accuracy-hero h3,.accuracy-horizon h3,.accuracy-method h3{margin:5px 0 8px}.accuracy-hero p,.accuracy-horizon p,.accuracy-method p{margin:6px 0;color:#5f6670;line-height:1.45}.accuracy-meta{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:10px;font-size:11px;color:#777}
      .accuracy-horizon-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.accuracy-horizon-top>strong{font-size:16px;white-space:nowrap}.accuracy-horizon.good .accuracy-horizon-top>strong{color:#2d7a52}.accuracy-horizon.bad .accuracy-horizon-top>strong{color:#a54b45}.accuracy-horizon.wait .accuracy-horizon-top>strong{color:#8d6f2c}
      .accuracy-meter{height:7px;border-radius:999px;background:#eeeae1;overflow:hidden;margin:10px 0 7px}.accuracy-meter span{display:block;height:100%;background:currentColor;border-radius:999px}.accuracy-horizon.good .accuracy-meter{color:#2d7a52}.accuracy-horizon.bad .accuracy-meter{color:#a54b45}.accuracy-horizon.wait .accuracy-meter{color:#9a7a35}
      .accuracy-drivers{display:grid;gap:8px;margin:12px 0}.accuracy-driver{display:grid;grid-template-columns:9px 1fr auto;gap:9px;align-items:center;padding:9px 10px;background:#faf9f6;border-radius:12px}.accuracy-driver strong{display:block;font-size:12px}.accuracy-driver small{display:block;color:#737983;margin-top:2px;line-height:1.35}.accuracy-driver>b{font-size:11px;color:#5f6670}.accuracy-dot{width:8px;height:8px;border-radius:50%}.accuracy-dot.good{background:#2d7a52}.accuracy-dot.bad{background:#a54b45}
      .accuracy-confirm{padding-top:4px}.accuracy-invalidate{border-top:1px solid #eeeae1;padding-top:9px!important;margin-top:10px!important}.accuracy-empty{padding:10px;border-radius:12px;background:#faf9f6;color:#767b83;font-size:12px;margin:10px 0}
    `;
    document.head.appendChild(style);
  }

  async function refresh(){
    try{
      const [d,h]=await Promise.all([fetchLive(),lastHistory?Promise.resolve(lastHistory):fetchHistory()]);
      lastData=d;lastHistory=h;
      render(d);
      patchFreeDataCopy();
    }catch(error){
      console.warn("Accuracy model v2 could not refresh",error);
    }
  }

  function boot(){
    injectStyle();
    patchFreeDataCopy();
    const nav=document.querySelector('.nav-item[data-view="predictions"]');
    if(nav)nav.addEventListener("click",()=>setTimeout(refresh,80));
    const button=document.getElementById("recalcButton");
    if(button)button.addEventListener("click",()=>setTimeout(refresh,500));
    new MutationObserver(()=>{
      if(document.getElementById("view-predictions")?.classList.contains("active")&&lastData)setTimeout(()=>render(lastData),0);
      patchFreeDataCopy();
    }).observe(document.body,{childList:true,subtree:true});
    refresh();
    setInterval(()=>{
      if(!document.hidden&&document.getElementById("view-predictions")?.classList.contains("active"))refresh();
    },30000);
  }

  boot();
})();
