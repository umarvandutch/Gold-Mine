(()=>{
  "use strict";

  const DATA_URL="https://raw.githubusercontent.com/umarvandutch/Gold-Mine/main/live-data.json";
  const VIEW_KEY="goldmine-refresh-view";
  const STATUS_KEY="goldmine-refresh-status";

  function restoreGoldView(){
    if(sessionStorage.getItem(VIEW_KEY)!=="predictions")return;
    sessionStorage.removeItem(VIEW_KEY);
    const nav=document.querySelector('.nav-item[data-view="predictions"]');
    if(nav)nav.click();
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
      button.textContent="Refreshing…";

      try{
        const response=await fetch(`${DATA_URL}?manual=${Date.now()}`,{cache:"no-store"});
        if(!response.ok)throw new Error(`HTTP ${response.status}`);
        const latest=await response.json();
        if(!latest||!Array.isArray(latest.events))throw new Error("Invalid live data");

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

  function loadAlertsPullRefresh(){
    if(document.querySelector('script[data-goldmine-pull-refresh]'))return;
    const script=document.createElement("script");
    script.src="./pull-refresh.js";
    script.async=false;
    script.dataset.goldminePullRefresh="true";
    document.body.appendChild(script);
  }

  restoreGoldView();
  installRefreshButton();
  loadAlertsPullRefresh();
})();
