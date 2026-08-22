(()=>{
  "use strict";

  const DATA_URL="https://raw.githubusercontent.com/umarvandutch/Gold-Mine/main/live-data.json";
  const TV_SCRIPT="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
  let liveData=null;
  let modelObserver=null;
  let chartTimer=null;
  let rendering=false;

  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null;};
  const active=()=>document.getElementById("view-predictions")?.classList.contains("active");

  function parseBias(card){
    if(!card)return{bias:"wait",strength:0,agreement:0,drivers:[]};
    const bias=card.classList.contains("good")?"bullish":card.classList.contains("bad")?"bearish":"wait";
    const text=card.textContent||"";
    const strength=Number((text.match(/Evidence strength\s+(\d+)/i)||[])[1]||0);
    const agreement=Number((text.match(/agreement\s+(\d+)%/i)||[])[1]||0);
    const drivers=[...card.querySelectorAll(".accuracy-driver")].slice(0,4).map(row=>({
      name:row.querySelector("strong")?.textContent?.trim()||"Evidence",
      detail:row.querySelector("small")?.textContent?.trim()||"",
      score:row.querySelector("b")?.textContent?.trim()||""
    }));
    return{bias,strength,agreement,drivers};
  }

  function meta(bias){
    if(bias==="bullish")return{label:"BULLISH 15M BIAS",action:"LOOK FOR LONG CONFIRMATION",cls:"long",arrow:"↑"};
    if(bias==="bearish")return{label:"BEARISH 15M BIAS",action:"LOOK FOR SHORT CONFIRMATION",cls:"short",arrow:"↓"};
    return{label:"NO CLEAR 15M BIAS",action:"WAIT — NO TRADE SETUP",cls:"wait",arrow:"•"};
  }

  function nextRisk(){
    const now=Date.now();
    const event=(liveData?.events||[]).filter(e=>{
      const t=new Date(e.dateUtc||0).getTime();
      return t>now&&(String(e.volatility||"").toUpperCase()==="HIGH"||e.category==="rates");
    }).sort((a,b)=>new Date(a.dateUtc)-new Date(b.dateUtc))[0];
    if(!event)return"No high-impact US event currently loaded ahead.";
    const mins=Math.max(0,Math.round((new Date(event.dateUtc).getTime()-now)/60000));
    return mins<=20?`HIGH EVENT RISK · ${event.name} in ${mins} min`:`Next major event · ${event.name} in ${mins} min`;
  }

  function marketRows(bias){
    const m=liveData?.market||{},rows=[];
    const add=(label,value,note)=>rows.push(`<div class="stable-market-row"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></div>`);
    if(m.xau&&num(m.xau.price)!==null)add("XAUUSD",String(m.xau.price),"Free internal snapshot");
    else add("XAUUSD","Use chart","Internal free XAU quote unavailable");
    if(m.dxy&&num(m.dxy.changePct)!==null){const v=num(m.dxy.changePct);add("DXY",`${v>0?"+":""}${v.toFixed(2)}%`,bias==="bullish"?(v<0?"Supports bias":"Against bias"):bias==="bearish"?(v>0?"Supports bias":"Against bias"):"Context");}
    for(const [key,label] of [["us2y","US 2Y"],["us10y","US 10Y"],["real10y","Real 10Y"]]){const v=num(m[key]?.deltaBps);if(v!==null)add(label,`${v>0?"+":""}${v.toFixed(1)} bps`,`Daily Treasury context`);}
    return rows.join("");
  }

  function driverRows(drivers){
    if(!drivers.length)return'<div class="stable-empty">No single fresh driver is dominant right now.</div>';
    return drivers.map(d=>`<div class="stable-driver"><div><strong>${esc(d.name)}</strong><small>${esc(d.detail)}</small></div><b>${esc(d.score)}</b></div>`).join("");
  }

  function renderStable(){
    if(rendering)return;
    const model=document.getElementById("predictionPanel"),host=document.getElementById("stableTradePlan");
    const shell=model?.querySelector(".accuracy-shell");
    if(!model||!host||!shell)return;
    const cards=[...shell.querySelectorAll(".accuracy-horizon")];
    if(cards.length<3)return;
    rendering=true;
    try{
      const now=parseBias(cards[0]),hour=parseBias(cards[1]),session=parseBias(cards[2]);
      const m=meta(now.bias),h=meta(hour.bias),s=meta(session.bias);
      host.innerHTML=`
        <section class="stable-trade-hero ${m.cls}">
          <div><span class="eyebrow">15M TRADE BIAS · MACRO + NEWS</span><h3>${m.action} ${m.arrow}</h3><p>${m.label}. Use this only as the directional filter; your 15m order-block and structure confirmation remains the entry trigger.</p></div>
          <div class="stable-strength"><strong>${now.strength}</strong><span>evidence</span></div>
        </section>
        <section class="stable-gate"><strong>ENTRY GATE</strong><span>${now.bias==="wait"?"No directional entry yet":"Wait for your 15m order block + displacement/structure confirmation before entering"}</span><small>${esc(nextRisk())}</small></section>
        <section class="stable-market"><span class="eyebrow">MARKET CONTEXT</span>${marketRows(now.bias)}</section>
        <section class="stable-drivers"><span class="eyebrow">WHY THIS BIAS</span>${driverRows(now.drivers)}</section>
        <section class="stable-follow"><span class="eyebrow">NEWS FOLLOW-THROUGH · NOT CHART TIMEFRAMES</span><div><span>Next hour</span><strong class="${h.cls}">${h.label}</strong><small>${hour.strength}/100 evidence</small></div><div><span>1–4 hour session context</span><strong class="${s.cls}">${s.label}</strong><small>${session.strength}/100 evidence</small></div></section>`;
    }finally{rendering=false;}
  }

  function makeStableModel(){
    const old=document.getElementById("predictionPanel");
    if(!old||old.dataset.stableModel==="1")return old;
    const replacement=old.cloneNode(true);
    replacement.dataset.stableModel="1";
    replacement.hidden=true;
    replacement.setAttribute("aria-hidden","true");
    old.replaceWith(replacement);
    return replacement;
  }

  function buildVisibleShell(){
    const model=document.getElementById("predictionPanel");
    if(!model)return;
    if(!document.getElementById("stableTradePlan")){
      const stable=document.createElement("div");
      stable.id="stableTradePlan";
      stable.className="stable-trade-plan";
      stable.innerHTML='<div class="stable-loading">Building stable Trade Plan…</div>';
      model.parentElement?.insertBefore(stable,model);
    }
    const oldChart=document.getElementById("xau15mChartCard");
    if(oldChart)oldChart.remove();
    if(!document.getElementById("stableXauChartCard")){
      const chart=document.createElement("section");
      chart.id="stableXauChartCard";
      chart.className="stable-chart-card";
      chart.innerHTML='<div class="stable-chart-head"><div><span class="eyebrow">15M EXECUTION CHART</span><h3>XAUUSD · 15 minute</h3></div><span>15M</span></div><p>Use the chart for order blocks, liquidity, displacement and structure confirmation.</p><div id="stableXauChart" class="stable-chart-host"><div class="stable-chart-loading">Open Trade Plan to load the chart…</div></div><small>TradingView / OANDA chart. Outside market hours it shows the latest available market price.</small>';
      model.parentElement?.insertBefore(chart,model);
    }
  }

  function chartFallback(message){
    const host=document.getElementById("stableXauChart");if(!host)return;
    host.dataset.state="failed";
    host.innerHTML=`<div class="stable-chart-fallback"><strong>${esc(message)}</strong><span>The Trade Plan still works. Retry the chart or use your broker chart.</span><button type="button" id="stableChartRetry">Retry chart</button></div>`;
    document.getElementById("stableChartRetry")?.addEventListener("click",()=>loadChart(true));
  }

  function loadChart(force=false){
    const host=document.getElementById("stableXauChart");
    if(!host||!active())return;
    if(!force&&["loading","ready"].includes(host.dataset.state))return;
    if(host.getBoundingClientRect().width<180){setTimeout(()=>loadChart(force),200);return;}
    host.dataset.state="loading";
    host.innerHTML='<div class="tradingview-widget-container" style="height:100%;width:100%"><div class="tradingview-widget-container__widget" style="height:calc(100% - 24px);width:100%"></div><div class="tradingview-widget-copyright"><a href="https://www.tradingview.com/symbols/XAUUSD/" target="_blank" rel="noopener nofollow">XAUUSD chart</a><span> by TradingView</span></div></div>';
    const container=host.querySelector(".tradingview-widget-container");
    const script=document.createElement("script");
    script.type="text/javascript";script.src=TV_SCRIPT;script.async=true;
    script.innerHTML=JSON.stringify({autosize:true,symbol:"OANDA:XAUUSD",interval:"15",timezone:"exchange",theme:"light",style:"1",withdateranges:true,hide_side_toolbar:false,hide_top_toolbar:false,allow_symbol_change:false,save_image:false,locale:"en",calendar:false,support_host:"https://www.tradingview.com"});
    script.addEventListener("error",()=>chartFallback("TradingView could not be reached from this WebView."),{once:true});
    container.appendChild(script);
    clearInterval(chartTimer);let checks=0;
    chartTimer=setInterval(()=>{if(host.querySelector("iframe")){host.dataset.state="ready";clearInterval(chartTimer);return;}if(++checks>=40){clearInterval(chartTimer);chartFallback("The TradingView chart timed out while loading.");}},250);
  }

  async function refreshData(){
    try{const r=await fetch(`${DATA_URL}?stable=${Date.now()}`,{cache:"no-store"});if(!r.ok)return;const j=await r.json();if(Array.isArray(j?.events)){liveData=j;renderStable();}}catch(error){console.debug("Stable Trade Plan data check unavailable",error);}
  }

  function injectStyle(){
    if(document.getElementById("stable-trade-style"))return;
    const style=document.createElement("style");style.id="stable-trade-style";style.textContent=`
      #predictionPanel[data-stable-model="1"]{display:none!important}.stable-trade-plan{display:grid;gap:12px}.stable-loading,.stable-trade-hero,.stable-gate,.stable-market,.stable-drivers,.stable-follow,.stable-chart-card{background:#fff;border:1px solid #e5e1d7;border-radius:18px;box-shadow:0 5px 20px rgba(31,36,45,.05)}.stable-loading{padding:18px;text-align:center;color:#777}.stable-trade-hero{padding:16px;display:grid;grid-template-columns:1fr auto;gap:12px}.stable-trade-hero.long{border-left:5px solid #2d7a52}.stable-trade-hero.short{border-left:5px solid #a54b45}.stable-trade-hero.wait{border-left:5px solid #9a7a35}.stable-trade-hero h3{margin:4px 0 7px;font-size:24px}.stable-trade-hero.long h3,.stable-follow .long{color:#2d7a52}.stable-trade-hero.short h3,.stable-follow .short{color:#a54b45}.stable-trade-hero.wait h3,.stable-follow .wait{color:#8a6b28}.stable-trade-hero p{margin:0;color:#626973;line-height:1.45}.stable-strength{width:72px;height:72px;border-radius:50%;background:#f5f3ed;border:1px solid #e4dfd3;display:flex;flex-direction:column;align-items:center;justify-content:center}.stable-strength strong{font-size:22px}.stable-strength span{font-size:9px;text-transform:uppercase;color:#777}.stable-gate,.stable-market,.stable-drivers,.stable-follow{padding:14px}.stable-gate{display:grid;gap:5px;background:#f7f4eb}.stable-gate strong{font-size:11px;letter-spacing:.08em}.stable-gate span{font-size:13px;font-weight:750}.stable-gate small{color:#777}.stable-market-row,.stable-driver,.stable-follow>div{display:grid;grid-template-columns:1fr auto auto;gap:9px;align-items:center;padding:9px 10px;background:#faf9f6;border-radius:11px;margin-top:7px}.stable-market-row span,.stable-driver strong,.stable-follow>div>span{font-size:12px;font-weight:750}.stable-market-row strong,.stable-driver>b,.stable-follow strong{font-size:11px}.stable-market-row small,.stable-driver small,.stable-follow small{font-size:10px;color:#777}.stable-driver{grid-template-columns:1fr auto}.stable-driver small{display:block;margin-top:3px;line-height:1.35}.stable-empty{padding:10px;background:#faf9f6;border-radius:10px;color:#777;font-size:11px;margin-top:7px}.stable-chart-card{padding:14px;margin:12px 0}.stable-chart-head{display:flex;justify-content:space-between;gap:10px}.stable-chart-head h3{margin:4px 0}.stable-chart-head>span{font-size:10px;font-weight:800;background:#eee9dd;border-radius:999px;padding:5px 8px;height:max-content}.stable-chart-card>p,.stable-chart-card>small{color:#777;font-size:11px}.stable-chart-host{height:430px;border-radius:14px;overflow:hidden;background:#f5f3ed;margin:10px 0;min-width:0}.stable-chart-loading,.stable-chart-fallback{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;text-align:center;padding:20px;color:#777}.stable-chart-fallback button{border:1px solid #d7d1c5;background:#fff;border-radius:10px;padding:8px 12px}.tradingview-widget-copyright{height:24px;display:flex;justify-content:center;align-items:center;gap:3px;font-size:10px;color:#777}.tradingview-widget-copyright a{color:#666;text-decoration:none}@media(max-width:600px){.stable-trade-hero{grid-template-columns:1fr auto}.stable-chart-host{height:380px}.stable-market-row,.stable-follow>div{grid-template-columns:1fr auto}.stable-market-row small,.stable-follow small{grid-column:1/-1}}
    `;document.head.appendChild(style);
  }

  function boot(){
    injectStyle();
    const model=makeStableModel();
    buildVisibleShell();
    if(model){modelObserver=new MutationObserver(()=>setTimeout(renderStable,0));modelObserver.observe(model,{childList:true,subtree:true});}
    renderStable();
    refreshData();
    const nav=document.querySelector('.nav-item[data-view="predictions"]');
    nav?.addEventListener("click",()=>setTimeout(()=>{renderStable();loadChart(false);},180));
    document.addEventListener("visibilitychange",()=>{if(!document.hidden&&active())setTimeout(()=>loadChart(false),250);});
    setInterval(refreshData,60000);
    setTimeout(()=>loadChart(false),500);
  }

  boot();
})();
