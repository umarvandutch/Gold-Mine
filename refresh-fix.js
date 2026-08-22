(()=>{
  "use strict";

  const SNAPSHOT_URL="https://raw.githubusercontent.com/umarvandutch/Gold-Mine/main/live-data.json";
  const VIEW_KEY="goldmine-refresh-view";
  const STATUS_KEY="goldmine-refresh-status";

  function restoreGoldView(){
    if(sessionStorage.getItem(VIEW_KEY)!=="predictions")return;
    sessionStorage.removeItem(VIEW_KEY);
    const nav=document.querySelector('.nav-item[data-view="predictions"]');
    if(nav)nav.click();
  }

  function workerUrl(){
    return String(window.GOLD_MINE_CONFIG?.liveWorkerUrl||"").trim();
  }

  async function fetchLatest(forceSource=false){
    const worker=workerUrl();
    if(worker){
      const join=worker.includes("?")?"&":"?";
      try{
        const r=await fetch(`${worker}${join}${forceSource?"fresh=1&":""}t=${Date.now()}`,{cache:"no-store"});
        if(!r.ok)throw new Error(`HTTP ${r.status}`);
        const j=await r.json();
        if(!j||!Array.isArray(j.events))throw new Error("Invalid live worker data");
        return j;
      }catch(error){
        console.warn("Gold view live Worker unavailable; using GitHub snapshot",error);
      }
    }
    const response=await fetch(`${SNAPSHOT_URL}?manual=${Date.now()}`,{cache:"no-store"});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const latest=await response.json();
    if(!latest||!Array.isArray(latest.events))throw new Error("Invalid live data");
    return latest;
  }

  function installRefreshButton(){
    const oldButton=document.getElementById("recalcButton");
    if(!oldButton)return;

    const button=oldButton.cloneNode(true);
    oldButton.replaceWith(button);

    if(sessionStorage.getItem(STATUS_KEY)==="updated"){
      sessionStorage.removeItem(STATUS_KEY);
      button.textContent="Updated ✓";
      setTimeout(()=>{button.textContent="Refresh view";},1600);
    }

    let busy=false;
    button.addEventListener("click",async()=>{
      if(busy)return;
      busy=true;
      button.disabled=true;
      button.setAttribute("aria-busy","true");
      button.textContent=workerUrl()?"Querying live sources…":"Refreshing…";

      try{
        await fetchLatest(true);
        sessionStorage.setItem(VIEW_KEY,"predictions");
        sessionStorage.setItem(STATUS_KEY,"updated");
        button.textContent="Updating…";
        setTimeout(()=>window.location.reload(),150);
      }catch(error){
        console.warn("Gold view manual refresh failed",error);
        button.textContent="Refresh failed — retry";
        button.disabled=false;
        button.removeAttribute("aria-busy");
        busy=false;
        setTimeout(()=>{if(!busy)button.textContent="Refresh view";},2500);
      }
    });
  }

  function loadScript(src,marker){
    return new Promise(resolve=>{
      if(document.querySelector(`script[data-${marker}]`)){resolve();return;}
      const script=document.createElement("script");
      script.src=src;
      script.async=false;
      script.setAttribute(`data-${marker}`,"true");
      script.addEventListener("load",()=>resolve(),{once:true});
      script.addEventListener("error",()=>resolve(),{once:true});
      document.body.appendChild(script);
    });
  }

  async function boot(){
    restoreGoldView();
    await loadScript("./config.js","goldmine-config");
    await loadScript("./official-signal-layer.js","goldmine-official-signal-layer");
    installRefreshButton();
    await loadScript("./pull-refresh.js","goldmine-pull-refresh");
    await loadScript("./gold-direction-labels.js","goldmine-gold-direction-labels");
    await loadScript("./accuracy-engine.js","goldmine-accuracy-engine");
    await loadScript("./adaptive-refresh.js","goldmine-adaptive-refresh");
  }

  boot();
})();
