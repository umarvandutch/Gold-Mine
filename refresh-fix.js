(()=>{
  "use strict";

  const SNAPSHOT_URL="https://raw.githubusercontent.com/umarvandutch/Gold-Mine/main/live-data.json";
  const VIEW_KEY="goldmine-refresh-view";
  const STATUS_KEY="goldmine-refresh-status";
  const CHECK_KEY="goldmine-last-check-at";
  const SNAPSHOT_KEY="goldmine-last-snapshot-at";

  function restoreGoldView(){
    if(sessionStorage.getItem(VIEW_KEY)!=="predictions")return;
    sessionStorage.removeItem(VIEW_KEY);
    const nav=document.querySelector('.nav-item[data-view="predictions"]');
    if(nav)nav.click();
  }

  function workerUrl(){return String(window.GOLD_MINE_CONFIG?.liveWorkerUrl||"").trim();}
  async function fetchLatest(forceSource=false){
    const worker=workerUrl();
    if(worker){
      const join=worker.includes("?")?"&":"?";
      try{
        const r=await fetch(`${worker}${join}${forceSource?"fresh=1&":""}t=${Date.now()}`,{cache:"no-store"});
        if(!r.ok)throw new Error(`HTTP ${r.status}`);
        const j=await r.json();if(!j||!Array.isArray(j.events))throw new Error("Invalid live worker data");return j;
      }catch(error){console.warn("Gold view live Worker unavailable; using GitHub backup",error);}
    }
    const response=await fetch(`${SNAPSHOT_URL}?backupOnly=1&manual=${Date.now()}`,{cache:"no-store"});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const latest=await response.json();if(!latest||!Array.isArray(latest.events))throw new Error("Invalid backup data");return latest;
  }

  function installRefreshButton(){
    const oldButton=document.getElementById("recalcButton");if(!oldButton)return;
    const button=oldButton.cloneNode(true);oldButton.replaceWith(button);
    const priorState=sessionStorage.getItem(STATUS_KEY);
    if(priorState){sessionStorage.removeItem(STATUS_KEY);button.textContent=priorState==="updated"?"New data ✓":"Checked ✓";setTimeout(()=>{button.textContent="Check latest";},1800);}
    let busy=false;
    button.addEventListener("click",async()=>{
      if(busy)return;busy=true;button.disabled=true;button.setAttribute("aria-busy","true");button.textContent=workerUrl()?"Checking live sources…":"Checking latest…";
      try{
        const before=sessionStorage.getItem(SNAPSHOT_KEY)||"",latest=await fetchLatest(true),snapshot=String(latest?.sourceQueriedAt||latest?.generatedAt||""),checkedAt=new Date().toISOString();
        sessionStorage.setItem(CHECK_KEY,checkedAt);if(snapshot)sessionStorage.setItem(SNAPSHOT_KEY,snapshot);
        const changed=!!snapshot&&!!before&&snapshot!==before;sessionStorage.setItem(VIEW_KEY,"predictions");sessionStorage.setItem(STATUS_KEY,changed?"updated":"checked");button.textContent=changed?"New data found…":"Checked — same snapshot";setTimeout(()=>window.location.reload(),260);
      }catch(error){console.warn("Gold view manual refresh failed",error);button.textContent="Check failed — retry";button.disabled=false;button.removeAttribute("aria-busy");busy=false;setTimeout(()=>{if(!busy)button.textContent="Check latest";},2500);}
    });
  }

  function loadScript(src,marker){return new Promise(resolve=>{if(document.querySelector(`script[data-${marker}]`)){resolve();return;}const script=document.createElement("script");script.src=src;script.async=false;script.setAttribute(`data-${marker}`,"true");script.addEventListener("load",()=>resolve(),{once:true});script.addEventListener("error",()=>resolve(),{once:true});document.body.appendChild(script);});}

  async function boot(){
    restoreGoldView();
    if(!window.GOLD_MINE_CONFIG)await loadScript("./config.js","goldmine-config");
    await loadScript("./official-signal-layer.js","goldmine-official-signal-layer");
    installRefreshButton();
    await loadScript("./pull-refresh.js","goldmine-pull-refresh");
    await loadScript("./gold-direction-labels.js","goldmine-gold-direction-labels");
    await loadScript("./accuracy-engine.js","goldmine-accuracy-engine");
    await loadScript("./adaptive-refresh.js","goldmine-adaptive-refresh");
    await loadScript("./decision-engine-v4.js","goldmine-decision-engine-v4");
    await loadScript("./app-fixes-v1.js","goldmine-app-fixes-v1");
    await loadScript("./trade-plan-fixes.js","goldmine-trade-plan-fixes");
    await loadScript("./chart-resume-fix.js","goldmine-chart-resume-fix");
    await loadScript("./live-refresh-v2.js","goldmine-live-refresh-v2");
    await loadScript("./signals-engine-v2.js","goldmine-signals-engine-v2");
  }
  boot();
})();
