(()=>{
  "use strict";
  const SNAPSHOT="https://raw.githubusercontent.com/umarvandutch/Gold-Mine/main/live-data.json";
  let data=null,busy=false,timer=null;
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const ageMin=v=>{if(!v)return 99999;const n=new Date(v).getTime();return Number.isFinite(n)?Math.max(0,(Date.now()-n)/60000):99999};
  const fmt=v=>{if(!v)return"—";const d=new Date(v);return Number.isNaN(d.getTime())?"—":d.toLocaleString()};
  const signed=v=>`${Number(v||0)>=0?"+":""}${Number(v||0).toFixed(2)}`;
  const active=()=>document.getElementById("view-signals")?.classList.contains("active");

  function installUI(){
    if(!document.getElementById("view-signals")){
      const settings=document.getElementById("view-settings"),section=document.createElement("section");
      section.id="view-signals";section.className="view";section.setAttribute("aria-labelledby","signals-title");
      section.innerHTML='<div class="section-heading"><div><span class="eyebrow">STRICT 4H EXECUTION FILTER</span><h2 id="signals-title">Buy & sell limit signals</h2></div><button id="signalsRefresh" class="text-button">Check live now</button></div><div id="signalsPanel"></div>';
      settings?.parentElement?.insertBefore(section,settings);
    }
    if(!document.querySelector('.nav-item[data-view="signals"]')){
      const settingsBtn=document.querySelector('.nav-item[data-view="settings"]'),btn=document.createElement("button");
      btn.className="nav-item";btn.dataset.view="signals";btn.setAttribute("aria-label","Signals");
      btn.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17l5-5 4 3 7-8M17 7h3v3"/></svg><span>Signals</span>';
      settingsBtn?.parentElement?.insertBefore(btn,settingsBtn);btn.addEventListener("click",()=>show("signals"));
    }
    const nav=document.querySelector(".bottom-nav");if(nav)nav.style.gridTemplateColumns="repeat(5,1fr)";
    const rb=document.getElementById("signalsRefresh");if(rb&&!rb.dataset.bound){rb.dataset.bound="1";rb.addEventListener("click",()=>refresh(true));}
  }
  function show(name){
    document.querySelectorAll(".nav-item").forEach(x=>x.classList.toggle("active",x.dataset.view===name));
    document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id===`view-${name}`));
    window.scrollTo({top:0,behavior:"auto"});if(name==="signals")refresh(false);
  }
  function effectiveSignal(key,side){
    const isBuy=side==="buy",label=isBuy?"BUY":"SELL";
    const s=data?.signals?.[key];
    if(!s)return{side,status:"no-signal",action:`NO ${label} LIMIT SIGNAL`,confidenceScore:0,blockers:[`${label} signal engine has not produced a current snapshot yet.`]};
    const blockers=[...(s.blockers||[])],marketAge=ageMin(s.marketObservedAt||data?.technical?.observedAt),signalAge=ageMin(s.generatedAt||data?.signals?.generatedAt);
    if(marketAge>15)blockers.unshift(`Market data is ${Math.floor(marketAge)} minutes old — refresh required.`);
    if(signalAge>15)blockers.unshift(`Signal snapshot is ${Math.floor(signalAge)} minutes old — no pending order should be treated as current.`);
    if(s.validUntil&&Date.now()>new Date(s.validUntil).getTime())blockers.unshift("This signal has expired and must be recalculated.");
    const live=s.status==="candidate"&&blockers.length===0;
    return{...s,side,status:live?"candidate":"no-signal",action:live?`${label} LIMIT CANDIDATE`:`NO ${label} LIMIT SIGNAL`,confidenceScore:live?(s.confidenceScore??0):0,blockers};
  }
  function plan(s,side){
    if(s.status!=="candidate")return"";
    const isBuy=side==="buy";
    return`<div class="gms-plan ${isBuy?"buy":"sell"}"><span class="eyebrow">${isBuy?"BUY":"SELL"} LIMIT PLAN</span><h3>${s.entryZoneLow} – ${s.entryZoneHigh}</h3><div class="gms-levels"><div><span>${isBuy?"Buy":"Sell"} limit</span><strong>${s.limitPrice}</strong></div><div><span>SL reference</span><strong>${s.stopLossReference}</strong></div><div><span>TP1</span><strong>${s.tp1Reference}</strong><small>${s.rrTp1}R</small></div><div><span>TP2</span><strong>${s.tp2Reference}</strong><small>${s.rrTp2}R</small></div></div><p>Order-block quality ${s.orderBlockQuality}/100 · ${s.confluenceCount??"—"}/3 confluences. Levels are structure-derived planning references, not guaranteed fills or outcomes.</p></div>`;
  }
  function signalCard(s,side){
    const isBuy=side==="buy",ok=s.status==="candidate",layers=s.layers||{},word=isBuy?"buy":"sell";
    return`<section class="gms-signal ${isBuy?"buy":"sell"} ${ok?"go":"stop"}"><div class="gms-signalhead"><div><span class="eyebrow">${isBuy?"BUY-SIDE":"SELL-SIDE"} SETUP</span><h2>${esc(s.action)}</h2><p>${ok?`Every strict ${word}-limit gate currently passes. Refresh immediately before using the pending level.`:`Gold Mine is refusing to promote a ${word} limit because one or more freshness, macro or technical gates fail.`}</p></div><span class="gms-status ${ok?"live":"blocked"}">${ok?"QUALIFIED":"BLOCKED"}</span></div><div class="gms-grid"><div><span>XAUUSD</span><strong>${s.currentPrice??"—"}</strong></div><div><span>Model conviction</span><strong>${s.confidenceScore??0}/100</strong></div><div><span>Macro score</span><strong>${signed(s.macroScore)}</strong></div><div><span>Agreement</span><strong>${s.macroAgreementPct??0}%</strong></div></div>${plan(s,side)}<div class="gms-mini"><span>Fresh 48h <b>${signed(layers.fresh)}</b></span><span>7-day <b>${signed(layers.weekly)}</b></span><span>90-day CPI/Fed <b>${signed(layers.regime)}</b></span><span>USD/yields/XAU <b>${signed(layers.market)}</b></span></div>${s.blockers?.length?`<div class="gms-block"><strong>Why ${word} is blocked</strong><ul>${s.blockers.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div>`:""}</section>`;
  }
  function render(){
    installUI();const panel=document.getElementById("signalsPanel");if(!panel)return;
    const buy=effectiveSignal("buyLimit","buy"),sell=effectiveSignal("sellLimit","sell"),next=buy.nextEvent||sell.nextEvent;
    const observed=buy.marketObservedAt||sell.marketObservedAt||data?.technical?.observedAt,calculated=data?.signals?.generatedAt||buy.generatedAt||sell.generatedAt;
    panel.innerHTML=`<section class="gms-card gms-summary"><span class="eyebrow">CURRENT EXECUTION STATUS</span><h3>Gold Mine checks both directions</h3><p>Only a side with fresh OANDA data, matching macro direction, matching 4H structure, a high-quality untouched order block, acceptable event risk and realistic R:R can become a limit candidate. It is normal for both sides to be blocked.</p><div class="gms-summarygrid"><div><span>Buy</span><strong class="${buy.status==="candidate"?"buytxt":"muted"}">${buy.status==="candidate"?"CANDIDATE":"NO SIGNAL"}</strong></div><div><span>Sell</span><strong class="${sell.status==="candidate"?"selltxt":"muted"}">${sell.status==="candidate"?"CANDIDATE":"NO SIGNAL"}</strong></div></div></section>${signalCard(buy,"buy")}${signalCard(sell,"sell")}<section class="gms-card"><span class="eyebrow">FRESHNESS</span><h3>Are these signals current?</h3><div class="gms-fresh"><div><span>App checked</span><strong id="gmsChecked">${fmt(sessionStorage.getItem("goldmine-last-check-at"))}</strong></div><div><span>OANDA observed</span><strong>${fmt(observed)}</strong><small>${Math.floor(ageMin(observed))} min old</small></div><div><span>Signals calculated</span><strong>${fmt(calculated)}</strong><small>${Math.floor(ageMin(calculated))} min old</small></div></div></section><section class="gms-card"><span class="eyebrow">NEXT NEWS RISK</span><h3>${next?esc(next.name):"No upcoming medium/high-impact event loaded"}</h3><p>${next?`${fmt(next.dateUtc)} · about ${next.minutesAway} min away`:"Both signal directions still remain subject to freshness and technical invalidation gates."}</p></section><p class="gms-disclaimer">No buy or sell setup can be made “safe” or guaranteed profitable. Gold Mine only promotes a candidate when its strict data, macro, structure, order-block, event-risk and reward/risk rules pass. Refresh immediately before using any pending order.</p>`;
  }
  async function fetchData(){const r=await fetch(`${SNAPSHOT}?signals=${Date.now()}`,{cache:"no-store"});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json()}
  async function refresh(force){if(busy)return;busy=true;installUI();const b=document.getElementById("signalsRefresh");if(b){b.disabled=true;b.textContent="Checking…";}try{data=await fetchData();sessionStorage.setItem("goldmine-last-check-at",new Date().toISOString());render();const buy=effectiveSignal("buyLimit","buy"),sell=effectiveSignal("sellLimit","sell");if(b)b.textContent=(buy.status==="candidate"||sell.status==="candidate")?"Signal current ✓":"Checked ✓";window.dispatchEvent(new CustomEvent("goldmine-signals-updated",{detail:data}));}catch(e){console.warn("Signals refresh failed",e);if(b)b.textContent="Check failed";}finally{busy=false;if(b){b.disabled=false;setTimeout(()=>{if(!busy)b.textContent="Check live now";},1800)}}}
  function style(){if(document.getElementById("gms-style"))return;const s=document.createElement("style");s.id="gms-style";s.textContent=`.gms-card,.gms-signal{background:#fff;border:1px solid #e5e1d8;border-radius:18px;padding:15px;margin-bottom:12px}.gms-summary h3,.gms-signal h2{margin:5px 0}.gms-summary p,.gms-signal p,.gms-card p{font-size:11px;color:#666d76;line-height:1.45}.gms-signal{border-left:6px solid #c8c5bd}.gms-signal.buy.go{border-left-color:#247a52}.gms-signal.sell.go{border-left-color:#b43a3a}.gms-signalhead{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.gms-signal h2{font-size:25px}.gms-signal.buy.go h2,.buytxt{color:#247a52}.gms-signal.sell.go h2,.selltxt{color:#b43a3a}.gms-signal.stop h2{color:#6f747c}.gms-status{font-size:9px;font-weight:850;padding:5px 8px;border-radius:999px}.gms-status.live{background:#e8f5ee;color:#247a52}.gms-signal.sell .gms-status.live{background:#faeaea;color:#b43a3a}.gms-status.blocked{background:#f2f3f5;color:#747a82}.gms-grid,.gms-levels,.gms-fresh,.gms-summarygrid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px}.gms-summarygrid{grid-template-columns:1fr 1fr}.gms-grid>div,.gms-levels>div,.gms-fresh>div,.gms-summarygrid>div{background:#f7f6f2;border-radius:11px;padding:10px}.gms-grid span,.gms-levels span,.gms-fresh span,.gms-summarygrid span{display:block;font-size:9px;color:#777;text-transform:uppercase}.gms-grid strong,.gms-levels strong,.gms-fresh strong,.gms-summarygrid strong{display:block;margin-top:4px;font-size:13px}.gms-levels small,.gms-fresh small{display:block;font-size:9px;color:#777;margin-top:2px}.gms-plan{border-radius:13px;padding:12px;margin-top:12px;background:#fbfbf8}.gms-plan.buy{border-left:4px solid #247a52}.gms-plan.sell{border-left:4px solid #b43a3a}.gms-plan h3{font-size:21px;margin:5px 0}.gms-mini{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.gms-mini span{font-size:9px;background:#f4f3ef;border-radius:999px;padding:5px 7px;color:#70757d}.gms-mini b{color:#454b53}.gms-block{margin-top:11px;padding:10px 11px;background:#fff9f8;border:1px solid #efd4d1;border-radius:12px}.gms-block strong{font-size:11px}.gms-block li{font-size:10.5px;line-height:1.4;margin:5px 0;color:#684a48}.gms-disclaimer{font-size:9px;color:#7c828a;line-height:1.45;margin:8px 2px 0}.muted{color:#777}.bottom-nav .nav-item span{font-size:8px}@media(max-width:700px){.gms-grid,.gms-levels,.gms-fresh{grid-template-columns:1fr 1fr}.gms-signalhead{display:block}.gms-status{display:inline-block;margin-top:4px}}`;document.head.appendChild(s)}
  function boot(){style();installUI();document.addEventListener("visibilitychange",()=>{if(!document.hidden&&active())refresh(false)});window.addEventListener("goldmine-snapshot-updated",e=>{if(e.detail){data=e.detail;render()}});setTimeout(()=>refresh(false),250);clearInterval(timer);timer=setInterval(()=>{if(!document.hidden&&active())refresh(false)},15000)}
  boot();
})();
