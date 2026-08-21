(()=>{
  "use strict";

  const DATA_URL="https://raw.githubusercontent.com/umarvandutch/Gold-Mine/main/live-data.json";
  const THRESHOLD=72;
  const MAX_PULL=112;

  let tracking=false;
  let refreshing=false;
  let startY=0;
  let pull=0;

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
    return window.scrollY<=1 && document.documentElement.scrollTop<=1;
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
    label.textContent=pull>=THRESHOLD?"Release to refresh":"Pull to refresh";
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
    label.textContent="Refreshing alerts…";

    try{
      const response=await fetch(`${DATA_URL}?pull=${Date.now()}`,{cache:"no-store"});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const latest=await response.json();
      if(!latest||!Array.isArray(latest.events))throw new Error("Invalid live data");
      label.textContent="Updated ✓";
      setTimeout(()=>window.location.reload(),280);
    }catch(error){
      console.warn("Alerts pull-to-refresh failed",error);
      label.textContent="Couldn't refresh — try again";
      refreshing=false;
      reset(1800);
    }
  }

  document.addEventListener("touchstart",event=>{
    if(refreshing||!alertsActive()||!atTop()||event.touches.length!==1){
      tracking=false;
      return;
    }
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

  document.addEventListener("touchcancel",()=>{
    if(!refreshing)reset();
  },{passive:true});
})();
