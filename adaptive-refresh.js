(()=>{
  "use strict";

  const worker=()=>String(window.GOLD_MINE_CONFIG?.liveWorkerUrl||"").trim();
  let timer=null;
  let lastMacroKey=null;
  let lastPollSeconds=30;
  let busy=false;

  function activeView(id){return document.getElementById(id)?.classList.contains("active");}
  function keyFor(payload){
    const events=(payload.events||[]).map(e=>[e.id,e.dateUtc,e.actual,e.revised,e.consensus,e.previous]);
    const headlines=(payload.headlines||[]).map(h=>[h.title,h.url,h.publishedUtc]);
    return JSON.stringify([events,headlines]);
  }
  function recommended(payload){
    const n=Number(payload?.worker?.recommendedClientPollSeconds);
    if(Number.isFinite(n))return Math.max(5,Math.min(60,n));
    return 30;
  }
  function schedule(seconds=lastPollSeconds){
    clearTimeout(timer);
    lastPollSeconds=seconds;
    timer=setTimeout(tick,seconds*1000);
  }
  function nudgePrediction(){
    const nav=document.querySelector('.nav-item[data-view="predictions"]');
    if(nav&&activeView("view-predictions"))nav.click();
  }
  async function tick(){
    if(document.hidden||busy||!worker()){schedule(30);return;}
    busy=true;
    try{
      const join=worker().includes("?")?"&":"?";
      const r=await fetch(`${worker()}${join}t=${Date.now()}`,{cache:"no-store"});
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
      const payload=await r.json();
      if(!Array.isArray(payload?.events))throw new Error("Invalid Worker payload");
      const macroKey=keyFor(payload);
      const changed=lastMacroKey!==null&&macroKey!==lastMacroKey;
      lastMacroKey=macroKey;
      lastPollSeconds=recommended(payload);

      if(activeView("view-predictions"))nudgePrediction();
      else if(changed&&activeView("view-alerts"))setTimeout(()=>window.location.reload(),120);

      const status=document.getElementById("dataStatusText");
      if(status&&payload?.worker?.mode){
        const mode=String(payload.worker.mode).replace(/-/g," ");
        status.dataset.realtimeMode=mode;
      }
    }catch(error){
      console.debug("Adaptive Worker poll unavailable",error);
      lastPollSeconds=Math.min(60,Math.max(30,lastPollSeconds*2));
    }finally{
      busy=false;
      schedule(lastPollSeconds);
    }
  }

  document.addEventListener("visibilitychange",()=>{if(!document.hidden){clearTimeout(timer);schedule(1);}});
  schedule(2);
})();
