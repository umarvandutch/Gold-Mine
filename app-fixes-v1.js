(()=>{
  "use strict";

  const DATA_URL="https://raw.githubusercontent.com/umarvandutch/Gold-Mine/main/live-data.json";
  let latest=null;
  let fetchInFlight=null;
  let resizeTimer=null;
  let observerBusy=false;

  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  async function getData(force=false){
    if(latest&&!force)return latest;
    if(fetchInFlight)return fetchInFlight;
    fetchInFlight=(async()=>{
      const worker=String(window.GOLD_MINE_CONFIG?.liveWorkerUrl||"").trim();
      if(worker){
        try{
          const r=await fetch(`${worker}${worker.includes("?")?"&":"?"}t=${Date.now()}`,{cache:"no-store"});
          if(r.ok){const j=await r.json();if(Array.isArray(j?.technical?.candles4h)){latest=j;return j;}}
        }catch{}
      }
      const r=await fetch(`${DATA_URL}?chart=${Date.now()}`,{cache:"no-store"});
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
      const j=await r.json();
      latest=j;
      return j;
    })().finally(()=>{fetchInFlight=null});
    return fetchInFlight;
  }

  function pathLine(points){return points.map((p,i)=>`${i?"L":"M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ")}

  function renderNativeChart(host,data){
    if(!host||host.dataset.nativeChart==="ready")return;
    const all=Array.isArray(data?.technical?.candles4h)?data.technical.candles4h:[];
    const candles=all.slice(-72).map(c=>({time:c.time,open:num(c.open),high:num(c.high),low:num(c.low),close:num(c.close)})).filter(c=>[c.open,c.high,c.low,c.close].every(Number.isFinite));
    if(candles.length<12){
      host.dataset.nativeChart="ready";
      host.innerHTML='<div class="gm-native-empty"><strong>4H chart data is temporarily unavailable.</strong><span>The trade plan still uses the latest valid macro and technical snapshot.</span></div>';
      return;
    }

    const W=920,H=430,padL=16,padR=66,padT=20,padB=30,plotW=W-padL-padR,plotH=H-padT-padB;
    let lo=Math.min(...candles.map(c=>c.low)),hi=Math.max(...candles.map(c=>c.high));
    const span=Math.max(.01,hi-lo);lo-=span*.06;hi+=span*.06;
    const y=v=>padT+(hi-v)/(hi-lo)*plotH;
    const step=plotW/candles.length;
    const x=i=>padL+step*(i+.5);
    const body=Math.max(2,Math.min(8,step*.55));
    const last=candles[candles.length-1];
    const current=num(data?.technical?.currentPrice)??num(data?.market?.xau?.price)??last.close;

    let grid="";
    for(let i=0;i<=5;i++){
      const value=hi-(hi-lo)*(i/5),yy=y(value);
      grid+=`<line x1="${padL}" x2="${W-padR}" y1="${yy}" y2="${yy}" class="gm-native-grid"/><text x="${W-padR+8}" y="${yy+4}" class="gm-native-axis">${value.toFixed(0)}</text>`;
    }

    let marks="";
    candles.forEach((c,i)=>{
      const xx=x(i),up=c.close>=c.open,top=Math.min(y(c.open),y(c.close)),h=Math.max(1.5,Math.abs(y(c.close)-y(c.open)));
      marks+=`<line x1="${xx}" x2="${xx}" y1="${y(c.high)}" y2="${y(c.low)}" class="gm-native-wick ${up?"up":"down"}"/><rect x="${xx-body/2}" y="${top}" width="${body}" height="${h}" rx="1" class="gm-native-body ${up?"up":"down"}"/>`;
    });

    const t=data?.technical||{}, zones=[];
    const addZone=(ob,cls,label)=>{if(!ob)return;const zl=num(ob.zoneLow),zh=num(ob.zoneHigh);if(zl===null||zh===null)return;const top=y(Math.max(zl,zh)),bottom=y(Math.min(zl,zh));if(bottom<padT||top>H-padB)return;zones.push(`<rect x="${padL}" y="${Math.max(padT,top)}" width="${plotW}" height="${Math.max(2,Math.min(H-padB,bottom)-Math.max(padT,top))}" class="gm-native-zone ${cls}"/><text x="${padL+8}" y="${Math.max(padT+13,top+13)}" class="gm-native-zone-label ${cls}">${esc(label)} ${Math.min(zl,zh).toFixed(2)}–${Math.max(zl,zh).toFixed(2)}</text>`)};
    addZone(t.preferredBullishOrderBlock,"bull","Bullish OB");
    addZone(t.preferredBearishOrderBlock,"bear","Bearish OB");

    const cy=y(current);
    const start=candles[0],end=last;
    const dateFmt=v=>{const d=new Date(v);return Number.isNaN(d.getTime())?"":d.toLocaleDateString(undefined,{day:"numeric",month:"short"})};
    const points=candles.map((c,i)=>[x(i),y(c.close)]);

    host.dataset.nativeChart="ready";
    host.innerHTML=`<div class="gm-native-wrap">
      <div class="gm-native-top"><div><strong>${current.toFixed(2)}</strong><span>Latest XAUUSD 4H data</span></div><div><span>${dateFmt(start.time)} → ${dateFmt(end.time)}</span><small>${candles.length} candles</small></div></div>
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="XAUUSD four hour candlestick chart">
        ${grid}${zones.join("")}
        <path d="${pathLine(points)}" class="gm-native-close-line"/>
        ${marks}
        <line x1="${padL}" x2="${W-padR}" y1="${cy}" y2="${cy}" class="gm-native-current"/>
        <text x="${W-padR+7}" y="${cy+4}" class="gm-native-current-label">${current.toFixed(2)}</text>
      </svg>
      <div class="gm-native-foot"><span>Native in-app chart · no third-party embed required</span><span>4H OHLC from the technical feed</span></div>
    </div>`;
  }

  function showAge(root,data){
    if(!root)return;
    let el=document.getElementById("gmDataAgeWarning");
    const stamp=data?.sourceQueriedAt||data?.generatedAt;
    const ms=stamp?Date.now()-new Date(stamp).getTime():NaN;
    const mins=Number.isFinite(ms)?Math.max(0,Math.floor(ms/60000)):null;
    if(!el){
      el=document.createElement("div");el.id="gmDataAgeWarning";el.className="gm-data-age";
      root.insertBefore(el,root.firstChild);
    }
    if(mins===null){el.className="gm-data-age stale";el.innerHTML='<strong>Data timestamp unavailable</strong><span>Use extra caution until the next valid snapshot is loaded.</span>';return;}
    if(mins>30){el.className="gm-data-age stale";el.innerHTML=`<strong>Data snapshot is ${mins} minutes old</strong><span>The app is still checking for newer data. Do not treat stale inputs as a live execution trigger.</span>`;}
    else{el.className="gm-data-age fresh";el.innerHTML=`<strong>Data snapshot checked ${mins<1?"just now":`${mins} min ago`}</strong><span>Free feeds can still lag the underlying market.</span>`;}
  }

  async function repair(){
    if(observerBusy)return;
    const root=document.getElementById("tradeDecisionV4");
    const host=document.getElementById("gmv4Chart");
    if(!root&&!host)return;
    observerBusy=true;
    try{
      const data=await getData();
      if(root)showAge(root,data);
      if(host&&host.dataset.nativeChart!=="ready")renderNativeChart(host,data);
      const nav=document.querySelector('.nav-item[data-view="predictions"]');
      if(nav){nav.setAttribute("aria-label","Trade plan");const span=nav.querySelector("span");if(span)span.textContent="Trade plan";}
    }catch(error){
      if(host&&host.dataset.nativeChart!=="ready")host.innerHTML='<div class="gm-native-empty"><strong>Unable to load 4H chart data.</strong><span>Check your connection and tap Check latest.</span></div>';
    }finally{observerBusy=false;}
  }

  function injectStyle(){
    if(document.getElementById("gm-app-fixes-style"))return;
    const s=document.createElement("style");s.id="gm-app-fixes-style";s.textContent=`
      .gm-native-wrap{height:100%;display:flex;flex-direction:column;background:#f8f7f3}.gm-native-top,.gm-native-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px}.gm-native-top strong{font-size:20px}.gm-native-top span,.gm-native-top small,.gm-native-foot{font-size:10px;color:#70757d}.gm-native-top>div:last-child{text-align:right;display:flex;flex-direction:column}.gm-native-wrap svg{width:100%;height:100%;min-height:290px}.gm-native-grid{stroke:#dedbd2;stroke-width:1}.gm-native-axis,.gm-native-current-label,.gm-native-zone-label{font-size:11px;fill:#757a82;font-family:system-ui,sans-serif}.gm-native-wick{stroke-width:1.4}.gm-native-wick.up,.gm-native-body.up{stroke:#2d7452;fill:#2d7452}.gm-native-wick.down,.gm-native-body.down{stroke:#a34d46;fill:#a34d46}.gm-native-close-line{fill:none;stroke:#9b8349;stroke-width:1.1;opacity:.35}.gm-native-current{stroke:#8e763a;stroke-width:1.2;stroke-dasharray:5 4}.gm-native-current-label{fill:#725b25;font-weight:700}.gm-native-zone{opacity:.11}.gm-native-zone.bull{fill:#2d7452}.gm-native-zone.bear{fill:#a34d46}.gm-native-zone-label{font-weight:700}.gm-native-zone-label.bull{fill:#2d7452}.gm-native-zone-label.bear{fill:#a34d46}.gm-native-foot{border-top:1px solid #e5e1d7}.gm-native-empty{height:100%;min-height:300px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;text-align:center;padding:20px;color:#737981}.gm-native-empty strong{color:#444b54}.gm-data-age{border-radius:14px;padding:10px 12px;display:flex;flex-direction:column;gap:3px;font-size:11px}.gm-data-age.fresh{background:#edf5ef;border:1px solid #d2e6d7;color:#315d43}.gm-data-age.stale{background:#fff5e7;border:1px solid #ead5ad;color:#755822}.gm-data-age span{font-size:10px;line-height:1.35}@media(max-width:700px){.gm-native-wrap svg{min-height:300px}.gm-native-foot{flex-direction:column;align-items:flex-start;gap:2px}}
    `;document.head.appendChild(s);
  }

  function boot(){
    injectStyle();
    const observer=new MutationObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(repair,20)});
    observer.observe(document.body,{childList:true,subtree:true});
    window.addEventListener("resize",()=>{const h=document.getElementById("gmv4Chart");if(h)h.dataset.nativeChart="";clearTimeout(resizeTimer);resizeTimer=setTimeout(repair,120)});
    document.addEventListener("visibilitychange",()=>{if(!document.hidden){latest=null;setTimeout(repair,100)}});
    document.querySelector('.nav-item[data-view="predictions"]')?.addEventListener("click",()=>setTimeout(repair,40));
    setTimeout(repair,100);
  }

  boot();
})();
