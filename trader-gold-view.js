(()=>{
  "use strict";

  const SNAPSHOT_URL="https://raw.githubusercontent.com/umarvandutch/Gold-Mine/main/live-data.json";
  const CHECK_KEY="goldmine-last-check-at";
  const SNAPSHOT_KEY="goldmine-last-snapshot-at";
  const TV_SCRIPT="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";

  let latestData=null;
  let lastCheckedAt=sessionStorage.getItem(CHECK_KEY)||null;
  let transforming=false;
  let pollTimer=null;

  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null;};

  function workerUrl(){
    return String(window.GOLD_MINE_CONFIG?.liveWorkerUrl||"").trim();
  }

  function parseTime(value){
    if(!value)return null;
    const t=new Date(value).getTime();
    return Number.isFinite(t)?t:null;
  }

  function relative(value){
    const t=parseTime(value);
    if(t===null)return"unknown";
    const ms=Date.now()-t;
    if(ms<0)return"just now";
    const sec=Math.floor(ms/1000);
    if(sec<10)return"just now";
    if(sec<60)return`${sec}s ago`;
    const min=Math.floor(sec/60);
    if(min<60)return`${min} min ago`;
    const hr=Math.floor(min/60);
    if(hr<24)return`${hr} hr${hr===1?"":"s"} ago`;
    const day=Math.floor(hr/24);
    return`${day} day${day===1?"":"s"} ago`;
  }

  function localStamp(value){
    const t=parseTime(value);
    if(t===null)return"—";
    return new Intl.DateTimeFormat(undefined,{day:"numeric",month:"short",hour:"numeric",minute:"2-digit"}).format(new Date(t));
  }

  async function fetchLatest(){
    const worker=workerUrl();
    if(worker){
      const join=worker.includes("?")?"&":"?";
      try{
        const r=await fetch(`${worker}${join}t=${Date.now()}`,{cache:"no-store"});
        if(r.ok){
          const j=await r.json();
          if(Array.isArray(j?.events))return j;
        }
      }catch(error){
        console.debug("Trader view Worker unavailable",error);
      }
    }
    const r=await fetch(`${SNAPSHOT_URL}?trade=${Date.now()}`,{cache:"no-store"});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    const j=await r.json();
    if(!Array.isArray(j?.events))throw new Error("Invalid live data");
    return j;
  }

  function rememberCheck(data){
    lastCheckedAt=new Date().toISOString();
    sessionStorage.setItem(CHECK_KEY,lastCheckedAt);
    const snapshot=data?.sourceQueriedAt||data?.generatedAt;
    if(snapshot)sessionStorage.setItem(SNAPSHOT_KEY,snapshot);
  }

  function ensureStatusRows(){
    const lastRefresh=document.getElementById("lastRefresh");
    if(!lastRefresh)return;
    const parent=lastRefresh.closest(".build-info");
    if(parent){
      const label=parent.querySelector("span");
      if(label)label.textContent="Latest data snapshot";
    }
    if(document.getElementById("lastAppCheck"))return;
    const row=document.createElement("div");
    row.className="build-info";
    row.innerHTML='<span>Last app check</span><strong id="lastAppCheck">—</strong>';
    parent?.parentElement?.insertBefore(row,parent);
  }

  function updateFreshnessUi(){
    ensureStatusRows();
    const data=latestData;
    const checked=lastCheckedAt||sessionStorage.getItem(CHECK_KEY);
    const snapshot=data?.sourceQueriedAt||data?.generatedAt||sessionStorage.getItem(SNAPSHOT_KEY);
    const lastApp=document.getElementById("lastAppCheck");
    if(lastApp)lastApp.textContent=checked?`${localStamp(checked)} (${relative(checked)})`:"—";
    const lastRefresh=document.getElementById("lastRefresh");
    if(lastRefresh&&snapshot)lastRefresh.textContent=`${localStamp(snapshot)} (${relative(snapshot)})`;

    const title=document.getElementById("dataStatusTitle");
    const text=document.getElementById("dataStatusText");
    const live=!!data&&data.calendarStatus==="live";
    if(title&&live)title.textContent="Live US data connected";
    if(text&&data){
      const counts=data.counts||{};
      const events=counts.events??(data.events||[]).length;
      const headlines=counts.headlines??(data.headlines||[]).length;
      text.textContent=`${events} US events + ${headlines} macro headlines · app checked ${checked?relative(checked):"not yet"} · latest data snapshot ${snapshot?relative(snapshot):"unknown"}.`;
      text.title="The app-check clock changes whenever Gold Mine checks for new data. The snapshot clock changes only when the collected data itself changes.";
    }
  }

  function renameGoldView(){
    const nav=document.querySelector('.nav-item[data-view="predictions"] span');
    if(nav)nav.textContent="Trade plan";
    const title=document.getElementById("prediction-title");
    if(title)title.textContent="15m gold trade plan";
    const section=title?.closest(".section-heading");
    const eyebrow=section?.querySelector(".eyebrow");
    if(eyebrow)eyebrow.textContent="XAUUSD · NEWS + 15M EXECUTION";
    const button=document.getElementById("recalcButton");
    if(button&&!button.disabled&&/Refresh view|Check latest|Updated|Checked|New data/.test(button.textContent))button.textContent="Check latest";
  }

  function ensureChartCard(){
    const panel=document.getElementById("predictionPanel");
    if(!panel||document.getElementById("xau15mChartCard"))return;
    const card=document.createElement("section");
    card.id="xau15mChartCard";
    card.className="trade-chart-card";
    card.innerHTML=`
      <div class="trade-card-head">
        <div><span class="eyebrow">YOUR EXECUTION CHART</span><h3>XAUUSD · 15 minute</h3></div>
        <span class="trade-chart-badge">15M</span>
      </div>
      <p class="trade-help">Use this chart to mark your order blocks, liquidity and structure. Gold Mine supplies the macro/news bias; the chart supplies the entry confirmation.</p>
      <div id="xauTradingView" class="trade-tv-wrap"><div class="trade-tv-loading">Loading XAUUSD chart…</div></div>
      <p class="trade-chart-note">TradingView/OANDA market chart. Outside market hours it may show the latest available market price rather than an actively changing quote.</p>`;
    panel.parentElement?.insertBefore(card,panel);
    initTradingView();
  }

  function initTradingView(){
    const host=document.getElementById("xauTradingView");
    if(!host||host.dataset.loaded)return;
    host.dataset.loaded="1";
    host.innerHTML='<div class="tradingview-widget-container" style="height:100%;width:100%"><div class="tradingview-widget-container__widget" style="height:calc(100% - 0px);width:100%"></div></div>';
    const container=host.querySelector(".tradingview-widget-container");
    const script=document.createElement("script");
    script.type="text/javascript";
    script.src=TV_SCRIPT;
    script.async=true;
    script.textContent=JSON.stringify({
      autosize:true,
      symbol:"OANDA:XAUUSD",
      interval:"15",
      timezone:"Etc/UTC",
      theme:"light",
      style:"1",
      locale:"en",
      allow_symbol_change:false,
      calendar:false,
      support_host:"https://www.tradingview.com"
    });
    script.addEventListener("error",()=>{
      host.innerHTML='<div class="trade-tv-fallback"><strong>Chart could not load.</strong><span>Use your broker 15m XAUUSD chart for the execution step.</span></div>';
    },{once:true});
    container.appendChild(script);
  }

  function readBias(card){
    if(!card)return{bias:"wait",strength:0,agreement:0,drivers:[],confirmation:""};
    const bias=card.classList.contains("good")?"bullish":card.classList.contains("bad")?"bearish":"wait";
    const txt=card.textContent||"";
    const strength=Number((txt.match(/Evidence strength\s+(\d+)/i)||[])[1]||0);
    const agreement=Number((txt.match(/agreement\s+(\d+)%/i)||[])[1]||0);
    const drivers=[...card.querySelectorAll(".accuracy-driver")].map(el=>({
      name:el.querySelector("strong")?.textContent?.trim()||"Evidence",
      detail:el.querySelector("small")?.textContent?.trim()||"",
      score:el.querySelector("b")?.textContent?.trim()||""
    })).slice(0,4);
    const confirmation=card.querySelector(".accuracy-confirm")?.textContent?.trim()||"";
    return{bias,strength,agreement,drivers,confirmation};
  }

  function biasMeta(bias){
    if(bias==="bullish")return{action:"LOOK FOR LONGS",short:"LONG BIAS",cls:"long",arrow:"↑",plain:"Macro/news evidence currently favours higher gold."};
    if(bias==="bearish")return{action:"LOOK FOR SHORTS",short:"SHORT BIAS",cls:"short",arrow:"↓",plain:"Macro/news evidence currently favours lower gold."};
    return{action:"NO TRADE YET",short:"WAIT",cls:"wait",arrow:"•",plain:"Macro/news evidence is not clear enough to favour a direction."};
  }

  function strengthLabel(n){
    if(n>=70)return"Strong";
    if(n>=45)return"Moderate";
    if(n>=25)return"Light";
    return"Weak";
  }

  function nextHighImpact(){
    const now=Date.now();
    const events=(latestData?.events||[]).filter(e=>{
      const t=parseTime(e.dateUtc);
      if(t===null||t<=now)return false;
      const vol=String(e.volatility||"").toUpperCase();
      return vol==="HIGH"||String(e.category||"")==="rates";
    }).sort((a,b)=>parseTime(a.dateUtc)-parseTime(b.dateUtc));
    const e=events[0];
    if(!e)return null;
    const mins=Math.max(0,Math.round((parseTime(e.dateUtc)-now)/60000));
    return{...e,mins};
  }

  function eventRiskHtml(){
    const e=nextHighImpact();
    if(!e)return'<span class="trade-ok">No high-impact US event currently loaded ahead</span>';
    if(e.mins<=20)return`<span class="trade-danger">Major event in ${e.mins} min · ${esc(e.name)} — avoid entering just before it</span>`;
    if(e.mins<=60)return`<span class="trade-warn">Major event in ${e.mins} min · ${esc(e.name)} — account for release risk</span>`;
    return`<span class="trade-ok">Next major US event: ${esc(e.name)} · ${e.mins} min away</span>`;
  }

  function xauPriceHtml(){
    const x=latestData?.market?.xau;
    if(x&&num(x.price)!==null){
      const move=num(x.changePct);
      return`<div class="trade-stat"><span>Gold snapshot</span><strong>${esc(x.price)}</strong><small>${move===null?"Free quote snapshot":`${move>0?"+":""}${move.toFixed(2)}% vs comparison point`}</small></div>`;
    }
    return'<div class="trade-stat"><span>Gold snapshot</span><strong>Chart above</strong><small>Internal free XAU quote unavailable — use the TradingView/broker chart price for execution.</small></div>';
  }

  function marketContextHtml(bias){
    const m=latestData?.market||{};
    const rows=[];
    if(m.dxy&&num(m.dxy.changePct)!==null){
      const v=num(m.dxy.changePct);
      const supportive=bias==="bullish"?v<0:bias==="bearish"?v>0:null;
      rows.push(`<div class="trade-context-row"><span>DXY</span><strong>${v>0?"+":""}${v.toFixed(2)}%</strong><small>${supportive===null?"Context":supportive?"Confirms bias":"Against bias"}</small></div>`);
    }
    for(const [key,label] of [["us2y","US 2Y"],["us10y","US 10Y"],["real10y","Real 10Y"]]){
      const q=m[key],v=num(q?.deltaBps);
      if(v===null)continue;
      const supportive=bias==="bullish"?v<0:bias==="bearish"?v>0:null;
      rows.push(`<div class="trade-context-row"><span>${label}</span><strong>${v>0?"+":""}${v.toFixed(1)} bps</strong><small>${supportive===null?"Daily context":supportive?"Supports bias · daily":"Headwind · daily"}</small></div>`);
    }
    return rows.length?rows.join(""):'<div class="trade-empty">USD/yield confirmation is unavailable from the current free intraday sources. Do not treat that as confirmation.</div>';
  }

  function executionSteps(bias){
    if(bias==="bullish")return[
      "Keep a long-only preference while the macro bias remains valid — do not buy solely because the app says bullish.",
      "On the 15m chart, mark the nearest clean bullish order block / demand zone that preceded meaningful upside displacement.",
      "Wait for price to return into or react from that area. Do not chase price if it is already extended away from the zone.",
      "Require technical confirmation: rejection or displacement plus a structure reclaim/break in the long direction.",
      "Stand down if a fresh US release turns clearly hawkish/strong, or USD/yields start moving materially against the long thesis."
    ];
    if(bias==="bearish")return[
      "Keep a short-only preference while the macro bias remains valid — do not sell solely because the app says bearish.",
      "On the 15m chart, mark the nearest clean bearish order block / supply zone that preceded meaningful downside displacement.",
      "Wait for price to return into or reject that area. Do not chase price after an already-extended drop.",
      "Require technical confirmation: rejection or displacement plus a structure break/reclaim in the short direction.",
      "Stand down if a fresh US release turns clearly dovish/weak, safe-haven demand strengthens, or USD/yields move materially against the short thesis."
    ];
    return[
      "Do not force a directional trade while the macro evidence is mixed.",
      "Mark both bullish and bearish 15m order blocks and wait for price to show which side is actually being respected.",
      "A clean structure break/displacement can create the technical setup, but wait for the news/macro layer to stop strongly contradicting it.",
      "Recheck after the next high-impact US release or a meaningful USD/yield move."
    ];
  }

  function driversHtml(drivers){
    if(!drivers.length)return'<div class="trade-empty">No single fresh driver is strong enough to deserve emphasis right now.</div>';
    return drivers.map(d=>`<div class="trade-driver"><div><strong>${esc(d.name)}</strong><span>${esc(d.detail)}</span></div><b>${esc(d.score)}</b></div>`).join("");
  }

  function compactHorizon(title,subtitle,result){
    const b=biasMeta(result.bias);
    return`<div class="trade-horizon ${b.cls}"><div><span>${esc(title)}</span><small>${esc(subtitle)}</small></div><strong>${b.short}</strong><em>${result.strength}/100</em></div>`;
  }

  function transformAccuracyPanel(){
    if(transforming)return;
    const panel=document.getElementById("predictionPanel");
    const shell=panel?.querySelector(".accuracy-shell");
    if(!panel||!shell)return;
    transforming=true;
    try{
      const cards=[...shell.querySelectorAll(".accuracy-horizon")];
      if(!cards.length)return;
      const immediate=readBias(cards[0]);
      const nextHour=readBias(cards[1]);
      const session=readBias(cards[2]);
      const b=biasMeta(immediate.bias);
      const methodText=shell.querySelector(".accuracy-method p")?.textContent?.trim()||"";
      const steps=executionSteps(immediate.bias);

      panel.innerHTML=`<div class="trade-plan-shell">
        <section class="trade-hero ${b.cls}">
          <div class="trade-hero-top"><div><span class="eyebrow">15M TRADE BIAS · MACRO + NEWS</span><h3>${b.action} <span>${b.arrow}</span></h3></div><div class="trade-strength"><strong>${immediate.strength}</strong><span>evidence<br>strength</span></div></div>
          <p><b>${b.plain}</b> This is the directional filter for your next 15m setup — <u>not an automatic entry</u>.</p>
          <div class="trade-readiness">${immediate.bias==="wait"?"WAIT FOR A CLEARER MACRO + CHART SETUP":"WAIT FOR 15M ORDER-BLOCK + STRUCTURE CONFIRMATION"}</div>
          <div class="trade-risk-line">${eventRiskHtml()}</div>
        </section>

        <section class="trade-summary-grid">
          ${xauPriceHtml()}
          <div class="trade-stat"><span>Macro bias</span><strong>${b.short}</strong><small>${strengthLabel(immediate.strength)} evidence · ${immediate.agreement}% agreement</small></div>
          <div class="trade-stat"><span>Entry status</span><strong>${immediate.bias==="wait"?"NO TRADE":"NOT TRIGGERED"}</strong><small>Gold Mine has no automatic order-block trigger yet.</small></div>
        </section>

        <section class="trade-card">
          <div class="trade-card-head"><div><span class="eyebrow">YOUR 15M EXECUTION CHECKLIST</span><h3>What needs to happen before a trade</h3></div><span class="trade-manual-badge">CHART CONFIRMATION</span></div>
          <ol class="trade-steps">${steps.map((s,i)=>`<li><b>${i+1}</b><span>${esc(s)}</span></li>`).join("")}</ol>
          <p class="trade-stop-note"><b>Stops/targets:</b> use your chart structure and risk rules. Gold Mine will not invent a stop, target or entry price from macro news alone.</p>
        </section>

        <section class="trade-card">
          <span class="eyebrow">WHY THE BIAS EXISTS</span><h3>Strongest evidence right now</h3>
          <div class="trade-drivers">${driversHtml(immediate.drivers)}</div>
        </section>

        <section class="trade-card">
          <span class="eyebrow">MARKET CONFIRMATION</span><h3>Is the wider market helping or fighting the setup?</h3>
          <div class="trade-context">${marketContextHtml(immediate.bias)}</div>
          <p class="trade-help">Daily Treasury moves are background context, not a 15m entry trigger. Your broker/TradingView XAUUSD chart remains the execution reference.</p>
        </section>

        <section class="trade-card trade-horizon-card">
          <span class="eyebrow">AFTER THE ENTRY WINDOW</span><h3>How long can the news bias matter?</h3>
          <p class="trade-help">These are <b>news-effect windows</b>, not chart candle timeframes. Your chart stays on 15m.</p>
          ${compactHorizon("Next hour","Can the immediate news reaction keep following through?",nextHour)}
          ${compactHorizon("Session context","Does the broader 1–4 hour macro backdrop still lean the same way?",session)}
        </section>

        <details class="trade-details"><summary>Model / calibration details</summary><p>${esc(methodText)}</p><p>Evidence strength measures agreement between available inputs. It is not a win rate or guarantee of profit.</p></details>
      </div>`;
    }finally{
      transforming=false;
    }
  }

  function injectStyle(){
    if(document.getElementById("trader-gold-view-style"))return;
    const style=document.createElement("style");
    style.id="trader-gold-view-style";
    style.textContent=`
      #view-predictions .section-heading{align-items:flex-start}.trade-chart-card,.trade-card,.trade-hero,.trade-stat,.trade-details{background:#fff;border:1px solid #e5e1d7;border-radius:18px;box-shadow:0 5px 20px rgba(31,36,45,.05)}
      .trade-chart-card{padding:14px;margin-bottom:14px}.trade-card{padding:15px}.trade-plan-shell{display:grid;gap:13px}.trade-hero{padding:16px}.trade-hero.long{border-left:5px solid #2d7a52}.trade-hero.short{border-left:5px solid #a54b45}.trade-hero.wait{border-left:5px solid #9a7a35}
      .trade-hero-top,.trade-card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.trade-hero h3,.trade-card h3,.trade-chart-card h3{margin:4px 0 7px}.trade-hero h3{font-size:25px;letter-spacing:-.02em}.trade-hero.long h3{color:#246b48}.trade-hero.short h3{color:#98433e}.trade-hero.wait h3{color:#806426}.trade-hero p,.trade-card p,.trade-chart-card p{color:#616872;line-height:1.45;margin:6px 0}
      .trade-strength{min-width:78px;height:78px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#f5f3ed;border:1px solid #e4dfd3}.trade-strength strong{font-size:23px;line-height:1}.trade-strength span{font-size:9px;text-transform:uppercase;letter-spacing:.07em;text-align:center;margin-top:4px;color:#767b83}
      .trade-readiness{margin-top:12px;padding:10px 12px;border-radius:12px;background:#f4f1e8;font-size:12px;font-weight:800;letter-spacing:.02em}.trade-risk-line{margin-top:9px;font-size:11px}.trade-ok{color:#2d7a52}.trade-warn{color:#8a6b28}.trade-danger{color:#a54b45;font-weight:700}
      .trade-summary-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.trade-stat{padding:12px;min-width:0}.trade-stat span{display:block;font-size:10px;color:#777;text-transform:uppercase;letter-spacing:.07em}.trade-stat strong{display:block;font-size:16px;margin:5px 0;word-break:break-word}.trade-stat small{display:block;color:#777;line-height:1.35}
      .trade-steps{list-style:none;padding:0;margin:12px 0;display:grid;gap:9px}.trade-steps li{display:grid;grid-template-columns:28px 1fr;gap:9px;align-items:start;padding:10px;background:#faf9f6;border-radius:12px}.trade-steps li>b{width:25px;height:25px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#eee9dd;font-size:11px}.trade-steps li>span{font-size:12px;line-height:1.45;color:#555d67}.trade-stop-note{border-top:1px solid #ece8df;padding-top:10px!important;margin-top:10px!important}
      .trade-drivers{display:grid;gap:8px;margin-top:10px}.trade-driver{display:grid;grid-template-columns:1fr auto;gap:10px;padding:10px;background:#faf9f6;border-radius:12px}.trade-driver strong{display:block;font-size:12px}.trade-driver span{display:block;font-size:11px;color:#737983;margin-top:3px;line-height:1.35}.trade-driver>b{font-size:11px;color:#666}.trade-empty{padding:11px;background:#faf9f6;border-radius:12px;color:#747a83;font-size:12px;line-height:1.4}
      .trade-context{display:grid;gap:7px;margin-top:10px}.trade-context-row{display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:center;padding:9px 10px;background:#faf9f6;border-radius:11px}.trade-context-row span{font-size:12px;font-weight:700}.trade-context-row strong{font-size:12px}.trade-context-row small{font-size:10px;color:#767b83}
      .trade-horizon-card{display:grid;gap:8px}.trade-horizon{display:grid;grid-template-columns:1fr auto auto;gap:9px;align-items:center;padding:10px;border-radius:12px;background:#faf9f6}.trade-horizon>div span{display:block;font-size:12px;font-weight:800}.trade-horizon>div small{display:block;color:#767b83;margin-top:2px}.trade-horizon>strong{font-size:11px}.trade-horizon>em{font-size:10px;font-style:normal;color:#777}.trade-horizon.long>strong{color:#2d7a52}.trade-horizon.short>strong{color:#a54b45}.trade-horizon.wait>strong{color:#8a6b28}
      .trade-chart-badge,.trade-manual-badge{padding:5px 8px;border-radius:999px;background:#eee9dd;font-size:10px;font-weight:800;white-space:nowrap}.trade-tv-wrap{height:390px;margin-top:12px;border-radius:14px;overflow:hidden;background:#f5f3ed}.trade-tv-loading,.trade-tv-fallback{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:#777;font-size:12px;padding:20px;text-align:center}.trade-chart-note,.trade-help{font-size:11px!important;color:#777!important}.trade-details{padding:12px 14px}.trade-details summary{font-size:12px;font-weight:800;cursor:pointer}.trade-details p{font-size:11px;color:#727780;line-height:1.45}
      @media(max-width:600px){.trade-summary-grid{grid-template-columns:1fr}.trade-tv-wrap{height:360px}.trade-hero h3{font-size:23px}.trade-context-row{grid-template-columns:1fr auto}.trade-context-row small{grid-column:1/-1}.trade-horizon{grid-template-columns:1fr auto}.trade-horizon>em{grid-column:2;justify-self:end}}
    `;
    document.head.appendChild(style);
  }

  async function poll(){
    try{
      const d=await fetchLatest();
      latestData=d;
      rememberCheck(d);
      updateFreshnessUi();
      transformAccuracyPanel();
    }catch(error){
      console.debug("Trader freshness check unavailable",error);
      updateFreshnessUi();
    }finally{
      clearTimeout(pollTimer);
      pollTimer=setTimeout(poll,60000);
    }
  }

  function boot(){
    injectStyle();
    renameGoldView();
    ensureChartCard();
    ensureStatusRows();

    const storedCheck=sessionStorage.getItem(CHECK_KEY);
    if(storedCheck)lastCheckedAt=storedCheck;

    const panel=document.getElementById("predictionPanel");
    if(panel)new MutationObserver(()=>setTimeout(transformAccuracyPanel,0)).observe(panel,{childList:true,subtree:true});

    const nav=document.querySelector('.nav-item[data-view="predictions"]');
    nav?.addEventListener("click",()=>{
      setTimeout(()=>{renameGoldView();ensureChartCard();transformAccuracyPanel();},120);
    });

    document.addEventListener("visibilitychange",()=>{
      if(!document.hidden){clearTimeout(pollTimer);setTimeout(poll,300);}
    });

    setInterval(()=>{renameGoldView();updateFreshnessUi();},5000);
    setTimeout(poll,100);
    setTimeout(transformAccuracyPanel,500);
  }

  boot();
})();
