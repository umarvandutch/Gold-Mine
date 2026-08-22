(()=>{
  "use strict";

  const DATA_URL="https://raw.githubusercontent.com/umarvandutch/Gold-Mine/main/live-data.json";
  const TV_SCRIPT="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
  const CHECK_KEY="goldmine-last-check-at";
  const SNAPSHOT_KEY="goldmine-last-snapshot-at";
  const BASE_WEIGHT={rates:45,inflation:28,labour:22,growth:18,consumer:12,business:10,trade:9,housing:8,government:7,other:5};
  const SCALE_RULES=[
    [/core.*cpi|cpi.*core/i,.15,1.18,false],[/\bcpi\b|consumer price index/i,.20,1.15,false],
    [/non.?farm payroll|payrolls/i,75,1.15,false],[/unemployment rate/i,.15,1.10,true],
    [/average hourly earnings/i,.18,1.05,false],[/initial jobless claims/i,15,.90,true],
    [/continuing jobless claims/i,35,.72,true],[/\bgdp\b/i,.50,1.02,false],
    [/retail sales/i,.40,1.00,false],[/\bism\b|\bpmi\b/i,1.5,.95,false],
    [/interest rate decision|fed funds rate|fomc.*rate/i,.25,1.30,false]
  ];

  let data=null;
  let pollTimer=null;
  let chartTimeout=null;
  let chartState="idle";

  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  const num=v=>{if(v===null||v===undefined||v==="")return null;const n=Number(String(v).replace(/,/g,""));return Number.isFinite(n)?n:null;};
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const active=()=>document.getElementById("view-predictions")?.classList.contains("active");

  function parseTime(value){const t=new Date(value||0).getTime();return Number.isFinite(t)?t:null;}
  function ageHours(value){const t=parseTime(value);return t===null?99999:Math.max(0,(Date.now()-t)/36e5);}
  function ageText(hours){if(hours<1)return`${Math.max(1,Math.round(hours*60))}m ago`;if(hours<24)return`${Math.round(hours)}h ago`;return`${Math.round(hours/24)}d ago`;}
  function categoryFor(e){
    if(e?.category&&BASE_WEIGHT[e.category]!==undefined)return e.category;
    const s=String(e?.name||e?.title||"").toLowerCase();
    if(/fomc|interest rate|fed funds|federal reserve|powell|fed minutes|fed meeting|fed rate|jackson hole/.test(s))return"rates";
    if(/cpi|pce|ppi|inflation|price index/.test(s))return"inflation";
    if(/payroll|employment|unemployment|jobless|jolts|job openings|wage|earnings/.test(s))return"labour";
    if(/gdp|gross domestic product/.test(s))return"growth";
    if(/retail|consumer confidence|consumer sentiment|personal spending|personal income/.test(s))return"consumer";
    if(/housing|home sales|building permits|mortgage|construction|housing starts/.test(s))return"housing";
    if(/pmi|ism|industrial production|factory|durable|manufacturing|services/.test(s))return"business";
    if(/trade|export|import|current account/.test(s))return"trade";
    if(/treasury|auction|budget|government/.test(s))return"government";
    return"other";
  }
  function isCpi(text){return/\bcpi\b|consumer price index/i.test(String(text||""));}
  function isRates(text,category){return category==="rates"||/\bfomc\b|federal reserve|interest rate|fed funds|rate decision|rate cut|rate hike|powell|fed minutes|hawkish|dovish|higher for longer/i.test(String(text||""));}
  function longMemory(text,category){return isCpi(text)||isRates(text,category);}
  function allowedImpact(v){return["MEDIUM","HIGH"].includes(String(v||"").toUpperCase());}

  function timeWeight(hours,isLong){
    const max=isLong?90*24:7*24;
    if(hours>max)return 0;
    if(!isLong)return Math.pow(.5,hours/28);
    if(hours<=7*24)return Math.pow(.5,hours/72);
    const oldDays=(hours-7*24)/24;
    return .30*Math.pow(.5,oldDays/30);
  }

  function scaleRule(name,consensus){
    for(const [re,scale,mult,inverse] of SCALE_RULES){if(re.test(name||""))return{scale,mult,inverse};}
    const c=Math.abs(consensus||0);
    return{scale:Math.max(c*.05,c<2?.15:1),mult:1,inverse:/unemployment|jobless|trade deficit|layoffs/i.test(name||"")};
  }

  function eventEvidence(e){
    if(!e?.dateUtc||!allowedImpact(e.volatility)||e.isSpeech)return null;
    const a=num(e.actual),c=num(e.consensus);
    if(a===null||c===null)return null;
    const cat=categoryFor(e),name=String(e.name||"US release"),hours=ageHours(e.dateUtc),isLong=longMemory(name,cat),tw=timeWeight(hours,isLong);
    if(!tw)return null;
    const rule=scaleRule(name,c);
    let z=(a-c)/rule.scale;
    if(rule.inverse)z*=-1;
    let usd=Math.tanh(z*.78);
    const prev=num(e.previous),rev=num(e.revised);
    if(prev!==null&&rev!==null&&rev!==prev){
      let rz=(rev-prev)/rule.scale;
      if(rule.inverse)rz*=-1;
      usd=(usd+.25*Math.tanh(rz*.7))/1.25;
    }
    const gold=-usd;
    const vol=String(e.volatility).toUpperCase()==="HIGH"?1:.64;
    const score=gold*(BASE_WEIGHT[cat]||5)*vol*rule.mult*tw;
    if(Math.abs(score)<.12)return null;
    return{type:"release",score,name,age:hours,long:isLong,detail:`Actual ${a} vs ${c} consensus · ${String(e.volatility).toUpperCase()} impact`,source:e.source||"US calendar"};
  }

  function headlineImpact(h){
    if(h?.impact)return String(h.impact).toLowerCase();
    const s=`${h?.title||""} ${h?.officialText||""}`.toLowerCase();
    if(isCpi(s)||isRates(s,h?.category))return"high";
    if(/non.?farm|payroll|unemployment|average hourly earnings|\bpce\b|\bppi\b|\bgdp\b|retail sales|\bism\b|\bpmi\b|jobless claims|jolts|tariff|sanction|war|attack|geopolit|recession|financial stress|banking stress/.test(s))return"medium";
    return"low";
  }

  function headlineEvidence(h){
    if(!h?.title||headlineImpact(h)==="low")return null;
    const cat=categoryFor(h),text=`${h.title} ${h.officialText||""}`.toLowerCase(),hours=ageHours(h.publishedUtc),isLong=longMemory(text,cat),tw=timeWeight(hours,isLong);
    if(!tw)return null;
    let direction=0,reason="",magnitude=1;
    if(/higher for longer|hawkish|rate hike|rates?.*higher|no rush.*cut|delay.*rate cut|not ready.*cut|inflation.*stubborn|inflation.*elevated|inflation.*hot/.test(text)){direction=-1;reason="Hawkish / rates-up pressure";magnitude=1.15;}
    else if(/dovish|rate cut|cut rates|easing|lower rates|disinflation|inflation.*cool|inflation.*ease/.test(text)){direction=1;reason="Dovish / rates-down support";magnitude=1.08;}
    else if(/payroll|jobs|employment/.test(text)&&/(weak|slow|fall|miss|cool)/.test(text)){direction=1;reason="Labour weakness supports easier-rate expectations";magnitude=.78;}
    else if(/payroll|jobs|employment/.test(text)&&/(strong|surge|beat|accelerat)/.test(text)){direction=-1;reason="Labour strength supports USD / yields";magnitude=.78;}
    else if(/war|attack|missile|geopolit|sanctions escalation|crisis/.test(text)){direction=1;reason="Safe-haven demand";magnitude=.70;}
    else if(/recession|hard landing|financial stress|banking stress/.test(text)){direction=1;reason="Risk-off / growth stress";magnitude=.62;}
    else return null;
    const official=/Federal Reserve|Bureau of Labor Statistics|BLS|BEA|Census|Department of Labor|Treasury|EIA/i.test(String(h.source||""));
    const quality=official?1:.55;
    const impact=headlineImpact(h)==="high"?1:.68;
    const base=Math.min(13,(BASE_WEIGHT[cat]||5)*.36);
    const score=direction*base*magnitude*quality*impact*tw;
    if(Math.abs(score)<.08)return null;
    return{type:"news",score,name:h.title,age:hours,long:isLong,detail:`${reason} · ${headlineImpact(h).toUpperCase()} impact${official?" · official source":""}`,source:h.source||"News"};
  }

  function marketEvidence(){
    const m=data?.market||{},out=[];
    const add=(name,value,scale,weight,detail)=>{if(!Number.isFinite(value))return;const score=clamp(-value/scale,-1,1)*weight;if(Math.abs(score)>.05)out.push({type:"market",score,name,age:0,long:false,detail,source:"Market context"});};
    if(m.dxy&&Number.isFinite(m.dxy.changePct))add("DXY",m.dxy.changePct,.45,7,`${m.dxy.changePct>0?"USD stronger":"USD weaker"} vs previous close`);
    if(m.us2y&&Number.isFinite(m.us2y.deltaBps))add("US 2Y yield",m.us2y.deltaBps,10,3.2,`${m.us2y.deltaBps>0?"Higher":"Lower"} vs prior Treasury day · daily context`);
    if(m.us10y&&Number.isFinite(m.us10y.deltaBps))add("US 10Y yield",m.us10y.deltaBps,10,2.3,`${m.us10y.deltaBps>0?"Higher":"Lower"} vs prior Treasury day · daily context`);
    if(m.real10y&&Number.isFinite(m.real10y.deltaBps))add("US real 10Y yield",m.real10y.deltaBps,9,3.7,`${m.real10y.deltaBps>0?"Higher":"Lower"} vs prior Treasury day · daily context`);
    return out;
  }

  function compute4h(){
    const releases=(data?.events||[]).map(eventEvidence).filter(Boolean);
    const news=(data?.headlines||[]).map(headlineEvidence).filter(Boolean);
    const market=marketEvidence();
    const all=[...releases,...news,...market].sort((a,b)=>Math.abs(b.score)-Math.abs(a.score));
    const pos=all.filter(x=>x.score>0).reduce((s,x)=>s+x.score,0);
    const neg=all.filter(x=>x.score<0).reduce((s,x)=>s+Math.abs(x.score),0);
    const total=pos+neg,net=pos-neg,agreement=total?Math.abs(net)/total:0;
    let bias="wait";
    if(total>=4&&Math.abs(net)>=1.8&&agreement>=.16)bias=net>0?"bullish":"bearish";
    const strength=clamp(Math.round((1-Math.exp(-total/18))*agreement*100),0,100);
    return{bias,strength,agreement:Math.round(agreement*100),net,total,drivers:all.slice(0,6),releaseCount:releases.length,newsCount:news.length};
  }

  function biasMeta(bias){
    if(bias==="bullish")return{cls:"long",headline:"LOOK FOR 4H LONG SETUPS",short:"LONG BIAS",arrow:"↑",plain:"The macro/news backdrop currently favours higher gold."};
    if(bias==="bearish")return{cls:"short",headline:"LOOK FOR 4H SHORT SETUPS",short:"SHORT BIAS",arrow:"↓",plain:"The macro/news backdrop currently favours lower gold."};
    return{cls:"wait",headline:"NO 4H TRADE YET",short:"WAIT",arrow:"•",plain:"The evidence is not aligned enough to favour a 4H direction."};
  }

  function nextHighImpact(){
    const now=Date.now();
    return (data?.events||[]).filter(e=>allowedImpact(e.volatility)&&parseTime(e.dateUtc)>now).sort((a,b)=>parseTime(a.dateUtc)-parseTime(b.dateUtc))[0]||null;
  }

  function ensureDom(){
    const panel=document.getElementById("predictionPanel");
    if(!panel)return null;
    panel.style.display="none";
    document.getElementById("xau15mChartCard")?.remove();
    document.getElementById("tradePlanStableView")?.remove();
    document.getElementById("tradePlan4hLegacy")?.remove();
    let root=document.getElementById("tradePlan4hView");
    if(root)return root;
    root=document.createElement("div");
    root.id="tradePlan4hView";
    root.className="gm4-root";
    root.innerHTML=`
      <section class="gm4-chart-card">
        <div class="gm4-head"><div><span class="eyebrow">4H EXECUTION CHART</span><h3>XAUUSD · 4 hour</h3></div><span class="gm4-pill">4H</span></div>
        <p>Use the 4H chart for your order blocks, liquidity, displacement and structure. The model supplies direction; price action still has to trigger the trade.</p>
        <div id="gm4Chart" class="gm4-chart"><div class="gm4-chart-message">Open Trade Plan to load the 4H XAUUSD chart.</div></div>
        <small>TradingView / OANDA chart. Gold Mine cannot read the cross-origin chart price programmatically, so it does not invent price confirmation when the internal free XAU feed is unavailable.</small>
      </section>
      <div id="gm4PlanContent"></div>`;
    panel.parentElement?.insertBefore(root,panel);
    return root;
  }

  function initChart(force=false){
    if(!active())return;
    const host=document.getElementById("gm4Chart");
    if(!host||host.clientWidth<120)return;
    if(chartState==="loaded"&&!force)return;
    if(chartState==="loading"&&!force)return;
    clearTimeout(chartTimeout);
    chartState="loading";
    host.innerHTML='<div class="tradingview-widget-container" style="height:100%;width:100%"><div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div></div>';
    const container=host.querySelector(".tradingview-widget-container");
    const script=document.createElement("script");
    script.src=TV_SCRIPT;
    script.async=true;
    script.type="text/javascript";
    script.textContent=JSON.stringify({autosize:true,symbol:"OANDA:XAUUSD",interval:"240",timezone:"Etc/UTC",theme:"light",style:"1",locale:"en",allow_symbol_change:false,hide_top_toolbar:false,hide_side_toolbar:false,withdateranges:true,calendar:false,support_host:"https://www.tradingview.com"});
    script.addEventListener("error",()=>chartFail("TradingView did not load in this WebView."),{once:true});
    container.appendChild(script);
    const started=Date.now();
    const watch=()=>{
      if(host.querySelector("iframe")){chartState="loaded";clearTimeout(chartTimeout);return;}
      if(Date.now()-started<12000&&chartState==="loading")setTimeout(watch,300);
    };
    watch();
    chartTimeout=setTimeout(()=>{if(chartState==="loading")chartFail("The 4H chart timed out.");},12500);
  }

  function chartFail(message){
    chartState="failed";
    const host=document.getElementById("gm4Chart");
    if(!host)return;
    host.innerHTML=`<div class="gm4-chart-message"><strong>${esc(message)}</strong><span>You can still use your broker's XAUUSD 4H chart.</span><button id="gm4Retry" type="button">Retry chart</button></div>`;
    document.getElementById("gm4Retry")?.addEventListener("click",()=>{chartState="idle";initChart(true);},{once:true});
  }

  function marketRows(bias){
    const m=data?.market||{},rows=[];
    const push=(label,value,unit,supportive,note)=>rows.push(`<div class="gm4-market"><span>${label}</span><strong>${value}</strong><small>${supportive===null?note:supportive?"Supports 4H bias":"Against 4H bias"}${note?` · ${note}`:""}</small></div>`);
    if(m.dxy&&Number.isFinite(m.dxy.changePct)){const v=m.dxy.changePct;push("DXY",`${v>0?"+":""}${v.toFixed(2)}%`,"",bias==="bullish"?v<0:bias==="bearish"?v>0:null,"vs previous close");}
    for(const [key,label] of [["us2y","US 2Y"],["us10y","US 10Y"],["real10y","Real 10Y"]]){const q=m[key];if(!q||!Number.isFinite(q.deltaBps))continue;const v=q.deltaBps;push(label,`${v>0?"+":""}${v.toFixed(1)} bps`,"",bias==="bullish"?v<0:bias==="bearish"?v>0:null,"daily context");}
    return rows.length?rows.join(""):'<div class="gm4-empty">No reliable free USD/yield confirmation is available right now. That is not treated as confirmation.</div>';
  }

  function driverRows(drivers){
    if(!drivers.length)return'<div class="gm4-empty">No medium/high-impact evidence is strong enough to drive a 4H bias right now.</div>';
    return drivers.map(d=>`<div class="gm4-driver"><div><strong>${esc(d.name)}</strong><span>${d.score>0?"Supports higher gold":"Supports lower gold"} · ${esc(d.detail)}</span><small>${ageText(d.age)}${d.long?" · CPI/rates long-memory factor":""}</small></div><b>${d.score>0?"+":"−"}${Math.abs(d.score).toFixed(1)}</b></div>`).join("");
  }

  function executionSteps(bias){
    if(bias==="bullish")return[
      "Keep a long preference while the 4H macro bias remains bullish; do not enter just because the model says long.",
      "Mark the clean 4H bullish order block / demand area that caused meaningful upside displacement.",
      "Wait for price to trade back into or clearly react from that area rather than chasing an extended move.",
      "Require 4H price-action confirmation: rejection/displacement and a structure reclaim or break supporting the long thesis.",
      "Do not take the setup if fresh US data or USD/yields materially invalidate the bullish macro thesis."
    ];
    if(bias==="bearish")return[
      "Keep a short preference while the 4H macro bias remains bearish; do not enter just because the model says short.",
      "Mark the clean 4H bearish order block / supply area that caused meaningful downside displacement.",
      "Wait for price to retrace into or reject that area rather than selling after an extended fall.",
      "Require 4H price-action confirmation: rejection/displacement and a structure break supporting the short thesis.",
      "Do not take the setup if fresh US data, safe-haven demand or USD/yields materially invalidate the bearish macro thesis."
    ];
    return[
      "Do not force a directional 4H trade while macro/news evidence is mixed.",
      "Mark both bullish and bearish 4H order blocks and wait for price to show which side is respected.",
      "Wait for a clearer medium/high-impact macro catalyst and matching 4H structure before choosing direction."
    ];
  }

  function render(){
    ensureDom();
    if(!data)return;
    const result=compute4h(),b=biasMeta(result.bias),next=nextHighImpact(),content=document.getElementById("gm4PlanContent");
    if(!content)return;
    const nextText=next?`${esc(next.name)} · ${ageText(-((parseTime(next.dateUtc)-Date.now())/36e5)).replace(" ago","")}`:"No upcoming medium/high-impact event loaded";
    const steps=executionSteps(result.bias);
    content.innerHTML=`<div class="gm4-plan">
      <section class="gm4-hero ${b.cls}">
        <div class="gm4-hero-top"><div><span class="eyebrow">4H TRADE BIAS · MEDIUM/HIGH IMPACT ONLY</span><h3>${b.headline} ${b.arrow}</h3></div><div class="gm4-strength"><strong>${result.strength}</strong><span>evidence<br>strength</span></div></div>
        <p><b>${b.plain}</b> This is a 4H directional filter, not an automatic buy/sell order.</p>
        <div class="gm4-trigger">${result.bias==="wait"?"WAIT FOR CLEARER 4H MACRO + STRUCTURE":"ENTRY NOT TRIGGERED — WAIT FOR 4H ORDER-BLOCK + STRUCTURE CONFIRMATION"}</div>
        <div class="gm4-policy">Ordinary macro/news: max 7 days · CPI + Fed/interest-rate evidence: max 90 days with strong time decay · low-impact releases/news excluded.</div>
      </section>

      <section class="gm4-stats">
        <div><span>4H direction</span><strong>${b.short}</strong><small>${result.agreement}% evidence agreement</small></div>
        <div><span>Evidence used</span><strong>${result.releaseCount} releases</strong><small>${result.newsCount} directional news items</small></div>
        <div><span>Next event risk</span><strong>${next?esc(next.name):"None loaded"}</strong><small>${next?new Date(next.dateUtc).toLocaleString():"Medium/high impact only"}</small></div>
      </section>

      <section class="gm4-card"><span class="eyebrow">4H EXECUTION CHECKLIST</span><h3>What must happen before a trade</h3><ol class="gm4-steps">${steps.map((s,i)=>`<li><b>${i+1}</b><span>${esc(s)}</span></li>`).join("")}</ol><p class="gm4-note"><b>Stops/targets:</b> derive them from your chart structure and risk plan. Gold Mine does not invent an entry, stop or target from news alone.</p></section>

      <section class="gm4-card"><span class="eyebrow">WHY THE 4H BIAS EXISTS</span><h3>Strongest evidence still in force</h3><div class="gm4-drivers">${driverRows(result.drivers)}</div></section>

      <section class="gm4-card"><span class="eyebrow">MARKET CONFIRMATION</span><h3>Is USD / yield context helping?</h3><div class="gm4-markets">${marketRows(result.bias)}</div><p class="gm4-note">Treasury observations are daily context, not a 4H trigger. Use the live XAUUSD chart above for actual execution price and structure.</p></section>

      <details class="gm4-details"><summary>How the history rule works</summary><p>Normal medium/high-impact releases and directional macro news can influence the model for up to 7 days, with newer evidence weighted much more heavily. CPI and Federal Reserve / interest-rate evidence can remain a background factor for up to 90 days because they help define the inflation/rate regime, but evidence older than 7 days is sharply down-weighted so a three-month-old release cannot dominate a current 4H setup.</p></details>
    </div>`;
  }

  function ensureFreshnessRows(){
    const last=document.getElementById("lastRefresh");
    if(!last)return;
    const row=last.closest(".build-info");
    row?.querySelector("span")&&(row.querySelector("span").textContent="Latest data snapshot");
    if(!document.getElementById("lastAppCheck")&&row?.parentElement){const x=document.createElement("div");x.className="build-info";x.innerHTML='<span>Last app check</span><strong id="lastAppCheck">—</strong>';row.parentElement.insertBefore(x,row);}
  }

  function updateFreshness(){
    ensureFreshnessRows();
    const checked=sessionStorage.getItem(CHECK_KEY),snapshot=data?.sourceQueriedAt||data?.generatedAt||sessionStorage.getItem(SNAPSHOT_KEY);
    const format=v=>{if(!v)return"—";const d=new Date(v),mins=Math.max(0,Math.floor((Date.now()-d.getTime())/60000));return`${d.toLocaleString()} (${mins<1?"just now":`${mins} min ago`})`;};
    const c=document.getElementById("lastAppCheck");if(c)c.textContent=format(checked);
    const s=document.getElementById("lastRefresh");if(s)s.textContent=format(snapshot);
  }

  function rename(){
    const nav=document.querySelector('.nav-item[data-view="predictions"] span');if(nav)nav.textContent="Trade plan";
    const title=document.getElementById("prediction-title");if(title)title.textContent="4H gold trade plan";
    const eyebrow=title?.closest(".section-heading")?.querySelector(".eyebrow");if(eyebrow)eyebrow.textContent="XAUUSD · 4H EXECUTION";
    const button=document.getElementById("recalcButton");if(button&&!button.disabled&&/Refresh view|Check latest|Updated|Checked|New data/.test(button.textContent))button.textContent="Check latest";
  }

  async function fetchData(){
    const worker=String(window.GOLD_MINE_CONFIG?.liveWorkerUrl||"").trim();
    if(worker){try{const join=worker.includes("?")?"&":"?";const r=await fetch(`${worker}${join}t=${Date.now()}`,{cache:"no-store"});if(r.ok){const j=await r.json();if(Array.isArray(j?.events))return j;}}catch{}}
    const r=await fetch(`${DATA_URL}?fourhour=${Date.now()}`,{cache:"no-store"});if(!r.ok)throw new Error(`HTTP ${r.status}`);const j=await r.json();if(!Array.isArray(j?.events))throw new Error("Invalid live data");return j;
  }

  async function poll(){
    try{
      data=await fetchData();
      const checked=new Date().toISOString();sessionStorage.setItem(CHECK_KEY,checked);
      const snapshot=data?.sourceQueriedAt||data?.generatedAt;if(snapshot)sessionStorage.setItem(SNAPSHOT_KEY,snapshot);
      rename();updateFreshness();render();if(active())setTimeout(()=>initChart(),80);
    }catch(error){console.debug("4H trade plan refresh unavailable",error);}
    finally{clearTimeout(pollTimer);pollTimer=setTimeout(poll,60000);}
  }

  function injectStyle(){
    if(document.getElementById("gm4-style"))return;
    const style=document.createElement("style");style.id="gm4-style";style.textContent=`
      .gm4-root{display:grid;gap:13px}.gm4-chart-card,.gm4-card,.gm4-hero,.gm4-stats>div,.gm4-details{background:#fff;border:1px solid #e5e1d7;border-radius:18px;box-shadow:0 5px 20px rgba(31,36,45,.05)}.gm4-chart-card,.gm4-card,.gm4-hero{padding:15px}.gm4-head,.gm4-hero-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.gm4-head h3,.gm4-card h3,.gm4-hero h3{margin:4px 0 7px}.gm4-chart-card p,.gm4-card p,.gm4-hero p{color:#616872;line-height:1.45}.gm4-pill{padding:5px 8px;border-radius:999px;background:#eee9dd;font-size:10px;font-weight:800}.gm4-chart{height:430px;margin:12px 0 7px;border-radius:14px;overflow:hidden;background:#f5f3ed}.gm4-chart-message{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;text-align:center;padding:20px;color:#6d737c}.gm4-chart-message button{border:0;border-radius:10px;padding:9px 12px;font-weight:700}.gm4-chart-card>small{display:block;color:#777;line-height:1.4}.gm4-plan{display:grid;gap:13px}.gm4-hero.long{border-left:5px solid #2d7a52}.gm4-hero.short{border-left:5px solid #a54b45}.gm4-hero.wait{border-left:5px solid #9a7a35}.gm4-hero h3{font-size:24px}.gm4-hero.long h3{color:#246b48}.gm4-hero.short h3{color:#98433e}.gm4-hero.wait h3{color:#806426}.gm4-strength{min-width:78px;height:78px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#f5f3ed;border:1px solid #e4dfd3}.gm4-strength strong{font-size:23px;line-height:1}.gm4-strength span{font-size:9px;text-transform:uppercase;letter-spacing:.07em;text-align:center;margin-top:4px;color:#767b83}.gm4-trigger{margin-top:12px;padding:10px 12px;border-radius:12px;background:#f4f1e8;font-size:12px;font-weight:800}.gm4-policy{margin-top:8px;font-size:11px;color:#6d737c;line-height:1.4}.gm4-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.gm4-stats>div{padding:11px}.gm4-stats span{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:#777}.gm4-stats strong{display:block;margin:5px 0;font-size:14px}.gm4-stats small{display:block;color:#777;line-height:1.35}.gm4-steps{list-style:none;padding:0;margin:12px 0;display:grid;gap:8px}.gm4-steps li{display:grid;grid-template-columns:27px 1fr;gap:9px;padding:10px;background:#faf9f6;border-radius:12px}.gm4-steps li>b{width:25px;height:25px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#eee9dd;font-size:11px}.gm4-steps li span{font-size:12px;line-height:1.45;color:#555d67}.gm4-note{border-top:1px solid #ece8df;padding-top:9px!important;font-size:11px}.gm4-drivers,.gm4-markets{display:grid;gap:8px;margin-top:10px}.gm4-driver{display:grid;grid-template-columns:1fr auto;gap:10px;padding:10px;background:#faf9f6;border-radius:12px}.gm4-driver strong{display:block;font-size:12px}.gm4-driver span,.gm4-driver small{display:block;color:#737983;margin-top:3px;line-height:1.35;font-size:10px}.gm4-driver b{font-size:11px;color:#666}.gm4-market{display:grid;grid-template-columns:1fr auto;gap:8px;padding:9px 10px;background:#faf9f6;border-radius:11px}.gm4-market span,.gm4-market strong{font-size:12px}.gm4-market small{grid-column:1/-1;color:#767b83;font-size:10px}.gm4-empty{padding:11px;background:#faf9f6;border-radius:12px;color:#747a83;font-size:12px}.gm4-details{padding:12px 14px}.gm4-details summary{font-size:12px;font-weight:800}.gm4-details p{font-size:11px;color:#727780;line-height:1.45}@media(max-width:600px){.gm4-chart{height:390px}.gm4-stats{grid-template-columns:1fr}.gm4-hero h3{font-size:22px}}
    `;document.head.appendChild(style);
  }

  function boot(){
    injectStyle();rename();ensureDom();ensureFreshnessRows();
    const nav=document.querySelector('.nav-item[data-view="predictions"]');nav?.addEventListener("click",()=>setTimeout(()=>{rename();render();initChart();},140));
    document.addEventListener("visibilitychange",()=>{if(!document.hidden){clearTimeout(pollTimer);setTimeout(poll,250);}});
    setTimeout(poll,80);
  }

  boot();
})();
