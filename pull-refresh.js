(()=>{
  "use strict";

  const SNAPSHOT_URL="https://raw.githubusercontent.com/umarvandutch/Gold-Mine/main/live-data.json";
  const WORKER_URL=String(window.GOLD_MINE_CONFIG?.liveWorkerUrl||"").trim();
  const WORKFLOW_URL="https://api.github.com/repos/umarvandutch/Gold-Mine/actions/workflows/refresh-live-data.yml/runs?per_page=1";
  const THRESHOLD=72;
  const MAX_PULL=112;
  const AUTO_SYNC_MS=30000;
  const WORKFLOW_STATUS_MS=240000;

  let tracking=false;
  let refreshing=false;
  let startY=0;
  let pull=0;
  let currentMaterialKey=null;
  let lastSourceQueryAt=null;
  let lastCollectorRunAt=null;
  let lastAppCheckAt=null;
  let lastWorkflowStatusCheck=0;

  const indicator=document.createElement("div");
  indicator.id="pullRefreshIndicator";
  indicator.setAttribute("role","status");
  indicator.setAttribute("aria-live","polite");
  indicator.innerHTML='<span class="pull-refresh-spinner" aria-hidden="true">↻</span><strong>Pull to refresh</strong>';
  document.body.appendChild(indicator);

  const label=indicator.querySelector("strong");
  const spinner=indicator.querySelector(".pull-refresh-spinner");

  const style=document.createElement("style");
  style.textContent=`
    #pullRefreshIndicator{position:fixed;z-index:35;left:50%;top:max(68px,calc(env(safe-area-inset-top,0px) + 54px));transform:translate(-50%,-58px);display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:999px;background:rgba(255,255,255,.97);border:1px solid #e5e7eb;box-shadow:0 6px 18px rgba(24,31,45,.10);color:#59616d;font-size:11px;opacity:0;pointer-events:none;transition:transform .16s ease,opacity .16s ease;will-change:transform,opacity}
    #pullRefreshIndicator.visible{opacity:1}
    #pullRefreshIndicator.refreshing{color:#86651d}
    #pullRefreshIndicator .pull-refresh-spinner{display:inline-grid;place-items:center;width:18px;height:18px;border-radius:50%;font-size:16px;line-height:1;transform:rotate(var(--pull-rotation,0deg))}
    #pullRefreshIndicator.refreshing .pull-refresh-spinner{animation:goldmine-spin .75s linear infinite}
    @keyframes goldmine-spin{to{transform:rotate(360deg)}}
  `;
  document.head.appendChild(style);

  function alertsActive(){
    const alerts=document.getElementById("view-alerts");
    return !!alerts?.classList.contains("active");
  }

  function atTop(){
    return window.scrollY<=1&&document.documentElement.scrollTop<=1;
  }

  function relative(iso){
    if(!iso)return"unknown";
    const ms=Math.max(0,Date.now()-new Date(iso).getTime());
    const m=Math.floor(ms/60000);
    if(m<1)return"just now";
    if(m<60)return`${m} min${m===1?"":"s"} ago`;
    const h=Math.floor(m/60);
    if(h<24)return`${h} hr${h===1?"":"s"} ago`;
    const d=Math.floor(h/24);
    return`${d} day${d===1?"":"s"} ago`;
  }

  function materialKey(payload){
    const events=(payload.events||[]).map(e=>[e.id,e.dateUtc,e.actual,e.revised,e.consensus,e.previous]);
    const headlines=(payload.headlines||[]).map(h=>[h.title,h.url,h.publishedUtc]);
    const market=payload.market||{};
    const marketBits=Object.keys(market).sort().map(k=>{
      const v=market[k]||{};
      return[k,v.price,v.previous,v.changePct,v.deltaBps,v.date,v.time];
    });
    return JSON.stringify([events,headlines,marketBits]);
  }

  function updateFreshnessText(){
    const el=document.getElementById("dataStatusText");
    if(!el)return;
    const appText=lastAppCheckAt?`App checked ${relative(lastAppCheckAt)}`:"App checking now";
    if(WORKER_URL){
      const sourceText=lastSourceQueryAt?`source feeds queried ${relative(lastSourceQueryAt)}`:"source query starting";
      const backupText=lastCollectorRunAt?`GitHub backup ran ${relative(lastCollectorRunAt)}`:"GitHub backup runs about every 5 min";
      el.textContent=`${appText} · ${sourceText} · ${backupText}.`;
      return;
    }
    const collectorText=lastCollectorRunAt?`collector last ran ${relative(lastCollectorRunAt)}`:"collector scheduled about every 5 min";
    el.textContent=`${appText} · ${collectorText} · using the newest published snapshot.`;
  }

  async function fetchCollectorStatus(force=false){
    if(!force&&Date.now()-lastWorkflowStatusCheck<WORKFLOW_STATUS_MS)return;
    lastWorkflowStatusCheck=Date.now();
    try{
      const r=await fetch(`${WORKFLOW_URL}&t=${Date.now()}`,{cache:"no-store",headers:{Accept:"application/vnd.github+json"}});
      if(!r.ok)return;
      const j=await r.json();
      const run=Array.isArray(j.workflow_runs)?j.workflow_runs[0]:null;
      if(run){
        lastCollectorRunAt=run.updated_at||run.run_started_at||run.created_at||null;
        updateFreshnessText();
      }
    }catch(error){
      console.debug("Collector status unavailable",error);
    }
  }

  async function fetchJsonNoCache(url){
    const r=await fetch(url,{cache:"no-store"});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    const latest=await r.json();
    if(!latest||!Array.isArray(latest.events))throw new Error("Invalid live data");
    return latest;
  }

  async function fetchLatestSnapshot(forceSource=false){
    let latest;
    if(WORKER_URL){
      const join=WORKER_URL.includes("?")?"&":"?";
      const workerRequest=`${WORKER_URL}${join}${forceSource?"fresh=1&":""}t=${Date.now()}`;
      try{
        latest=await fetchJsonNoCache(workerRequest);
      }catch(error){
        console.warn("Live Worker unavailable, falling back to GitHub snapshot",error);
        latest=await fetchJsonNoCache(`${SNAPSHOT_URL}?fallback=${Date.now()}`);
      }
    }else{
      latest=await fetchJsonNoCache(`${SNAPSHOT_URL}?sync=${Date.now()}`);
    }
    lastAppCheckAt=new Date().toISOString();
    lastSourceQueryAt=latest.sourceQueriedAt||latest.generatedAt||lastSourceQueryAt;
    return latest;
  }

  async function backgroundSync(){
    if(document.hidden)return;
    try{
      const latest=await fetchLatestSnapshot(false);
      const incomingKey=materialKey(latest);
      if(currentMaterialKey===null){
        currentMaterialKey=incomingKey;
        updateFreshnessText();
        fetchCollectorStatus(false);
        return;
      }
      if(incomingKey!==currentMaterialKey){
        currentMaterialKey=incomingKey;
        updateFreshnessText();
        if(alertsActive())window.location.reload();
      }else{
        updateFreshnessText();
      }
      fetchCollectorStatus(false);
    }catch(error){
      console.debug("Background feed sync unavailable",error);
    }
  }

  function setPull(px){
    pull=Math.max(0,Math.min(MAX_PULL,px));
    if(pull<=0){
      indicator.classList.remove("visible");
      indicator.style.transform="translate(-50%,-58px)";
      spinner.style.setProperty("--pull-rotation","0deg");
      return;
    }
    indicator.classList.add("visible");
    const shown=Math.min(42,pull*.42);
    indicator.style.transform=`translate(-50%,${-58+shown}px)`;
    spinner.style.setProperty("--pull-rotation",`${Math.round(Math.min(180,pull/THRESHOLD*180))}deg`);
    label.textContent=pull>=THRESHOLD?(WORKER_URL?"Release to query live sources":"Release to check live feed"):"Pull to refresh";
  }

  function reset(delay=0){
    setTimeout(()=>{
      tracking=false;
      pull=0;
      indicator.classList.remove("refreshing","visible");
      indicator.style.transform="translate(-50%,-58px)";
      spinner.style.removeProperty("--pull-rotation");
      label.textContent="Pull to refresh";
    },delay);
  }

  async function refresh(){
    if(refreshing)return;
    refreshing=true;
    indicator.classList.add("visible","refreshing");
    indicator.style.transform="translate(-50%,-10px)";
    label.textContent=WORKER_URL?"Querying source feeds…":"Checking latest feed…";

    try{
      const before=currentMaterialKey;
      const latest=await fetchLatestSnapshot(true);
      const incomingKey=materialKey(latest);
      currentMaterialKey=incomingKey;
      await fetchCollectorStatus(true);
      updateFreshnessText();

      if(before!==null&&incomingKey!==before){
        label.textContent=WORKER_URL?"New source data ✓":"New snapshot ✓";
        setTimeout(()=>window.location.reload(),350);
        return;
      }

      label.textContent=WORKER_URL?"Sources queried ✓ · no new items":"Feed checked ✓ · no newer snapshot";
      refreshing=false;
      reset(1600);
    }catch(error){
      console.warn("Alerts pull-to-refresh failed",error);
      label.textContent="Couldn't refresh — try again";
      refreshing=false;
      reset(1800);
    }
  }

  document.addEventListener("touchstart",event=>{
    if(refreshing||!alertsActive()||!atTop()||event.touches.length!==1){tracking=false;return;}
    startY=event.touches[0].clientY;
    pull=0;
    tracking=true;
  },{passive:true});

  document.addEventListener("touchmove",event=>{
    if(!tracking||refreshing||event.touches.length!==1)return;
    const delta=event.touches[0].clientY-startY;
    if(delta<=0){setPull(0);return;}
    if(!atTop()){tracking=false;setPull(0);return;}
    event.preventDefault();
    setPull(delta*.55);
  },{passive:false});

  document.addEventListener("touchend",()=>{
    if(!tracking||refreshing)return;
    const shouldRefresh=pull>=THRESHOLD;
    tracking=false;
    if(shouldRefresh)refresh();
    else reset();
  },{passive:true});

  document.addEventListener("touchcancel",()=>{if(!refreshing)reset();},{passive:true});
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)backgroundSync();});

  backgroundSync();
  setInterval(backgroundSync,AUTO_SYNC_MS);
  setInterval(updateFreshnessText,15000);
})();
