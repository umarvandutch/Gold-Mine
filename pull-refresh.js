(()=>{
  "use strict";

  const GITHUB="https://raw.githubusercontent.com/umarvandutch/Gold-Mine/main/live-data.json";
  const THRESHOLD=72,MAX_PULL=112;
  let tracking=false,refreshing=false,startY=0,pull=0,lastMacroKey=null;
  const worker=()=>String(window.GOLD_MINE_CONFIG?.liveWorkerUrl||"").trim();

  const indicator=document.createElement("div");
  indicator.id="pullRefreshIndicator";indicator.setAttribute("role","status");indicator.setAttribute("aria-live","polite");
  indicator.innerHTML='<span class="pull-refresh-spinner" aria-hidden="true">↻</span><strong>Pull to refresh</strong>';
  document.body.appendChild(indicator);
  const label=indicator.querySelector("strong"),spinner=indicator.querySelector(".pull-refresh-spinner");
  const style=document.createElement("style");style.textContent=`#pullRefreshIndicator{position:fixed;z-index:35;left:50%;top:max(68px,calc(env(safe-area-inset-top,0px) + 54px));transform:translate(-50%,-58px);display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:999px;background:rgba(255,255,255,.97);border:1px solid #e5e7eb;box-shadow:0 6px 18px rgba(24,31,45,.10);color:#59616d;font-size:11px;opacity:0;pointer-events:none;transition:transform .16s ease,opacity .16s ease}.visible#pullRefreshIndicator{opacity:1}#pullRefreshIndicator.refreshing{color:#86651d}#pullRefreshIndicator .pull-refresh-spinner{display:inline-grid;place-items:center;width:18px;height:18px;border-radius:50%;font-size:16px;line-height:1;transform:rotate(var(--pull-rotation,0deg))}#pullRefreshIndicator.refreshing .pull-refresh-spinner{animation:goldmine-spin .75s linear infinite}@keyframes goldmine-spin{to{transform:rotate(360deg)}}`;document.head.appendChild(style);

  const alertsActive=()=>!!document.getElementById("view-alerts")?.classList.contains("active");
  const atTop=()=>window.scrollY<=1&&document.documentElement.scrollTop<=1;
  function macroKey(p){return JSON.stringify([(p.events||[]).map(e=>[e.id,e.dateUtc,e.actual,e.revised,e.consensus,e.previous]),(p.headlines||[]).map(h=>[h.title,h.url,h.publishedUtc])]);}
  async function fetchJson(url){const r=await fetch(url,{cache:"no-store"});if(!r.ok)throw new Error(`HTTP ${r.status}`);const j=await r.json();if(!Array.isArray(j.events))throw new Error("Invalid live data");return j;}
  async function latest(force=false){const w=worker();if(w){try{return await fetchJson(`${w}${w.includes("?")?"&":"?"}${force?"fresh=1&":""}pull=${Date.now()}`)}catch(e){console.warn("Pull refresh Worker unavailable; using backup",e)}}return fetchJson(`${GITHUB}?backupOnly=1&pull=${Date.now()}`)}
  function setPull(px){pull=Math.max(0,Math.min(MAX_PULL,px));if(!pull){indicator.classList.remove("visible");indicator.style.transform="translate(-50%,-58px)";spinner.style.setProperty("--pull-rotation","0deg");return}indicator.classList.add("visible");indicator.style.transform=`translate(-50%,${-58+Math.min(42,pull*.42)}px)`;spinner.style.setProperty("--pull-rotation",`${Math.round(Math.min(180,pull/THRESHOLD*180))}deg`);label.textContent=pull>=THRESHOLD?(worker()?"Release to refresh ALL live":"Release to check backup"):"Pull to refresh"}
  function reset(delay=0){setTimeout(()=>{tracking=false;pull=0;refreshing=false;indicator.classList.remove("refreshing","visible");indicator.style.transform="translate(-50%,-58px)";spinner.style.removeProperty("--pull-rotation");label.textContent="Pull to refresh"},delay)}
  async function refresh(){if(refreshing)return;refreshing=true;indicator.classList.add("visible","refreshing");indicator.style.transform="translate(-50%,-10px)";label.textContent=worker()?"Refreshing OANDA + news + calendar…":"Checking backup…";try{const p=await latest(true),live=p?.collectorMode==="cloudflare-true-live"||p?.sourceStatus?.worker==="true-live";window.dispatchEvent(new CustomEvent("goldmine-snapshot-updated",{detail:p}));lastMacroKey=macroKey(p);if(live){label.textContent="All live sources refreshed ✓";sessionStorage.setItem("goldmine-resume-view","alerts");setTimeout(()=>location.reload(),420);return}label.textContent="Live Worker unavailable · backup loaded";reset(1800)}catch(e){console.warn("Alerts pull refresh failed",e);label.textContent="Couldn't refresh — try again";reset(1800)}}
  async function background(){if(document.hidden||!worker())return;try{const p=await latest(false),k=macroKey(p);if(lastMacroKey===null){lastMacroKey=k;return}if(k!==lastMacroKey){lastMacroKey=k;window.dispatchEvent(new CustomEvent("goldmine-snapshot-updated",{detail:p}));if(alertsActive())location.reload()}}catch(e){console.debug("Alerts live background check unavailable",e)}}

  document.addEventListener("touchstart",e=>{if(refreshing||!alertsActive()||!atTop()||e.touches.length!==1){tracking=false;return}startY=e.touches[0].clientY;pull=0;tracking=true},{passive:true});
  document.addEventListener("touchmove",e=>{if(!tracking||refreshing||e.touches.length!==1)return;const d=e.touches[0].clientY-startY;if(d<=0){setPull(0);return}if(!atTop()){tracking=false;setPull(0);return}e.preventDefault();setPull(d*.55)},{passive:false});
  document.addEventListener("touchend",()=>{if(!tracking||refreshing)return;const go=pull>=THRESHOLD;tracking=false;go?refresh():reset()},{passive:true});
  document.addEventListener("touchcancel",()=>{if(!refreshing)reset()},{passive:true});
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)background()});
  setTimeout(background,1200);setInterval(background,30000);
})();
