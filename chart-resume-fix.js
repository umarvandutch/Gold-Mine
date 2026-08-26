(()=>{
  "use strict";

  let timer=null;
  let observer=null;

  const tradePlanActive=()=>document.getElementById("view-predictions")?.classList.contains("active");
  const chartHealthy=host=>!!host&&(!!host.querySelector(".gm-native-wrap")||!!host.querySelector("iframe"));

  function requestRepair(delay=0){
    clearTimeout(timer);
    timer=setTimeout(()=>{
      if(document.hidden||!tradePlanActive())return;
      const host=document.getElementById("gmv4Chart");
      if(!host||chartHealthy(host))return;
      host.dataset.nativeChart="";
      window.dispatchEvent(new Event("resize"));
    },delay);
  }

  function resumeSweep(){
    if(document.hidden)return;
    requestRepair(120);
    setTimeout(()=>requestRepair(0),650);
    setTimeout(()=>requestRepair(0),1500);
    setTimeout(()=>requestRepair(0),3000);
  }

  function watchTradePlan(){
    if(observer)return;
    observer=new MutationObserver(()=>{
      if(document.hidden||!tradePlanActive())return;
      const host=document.getElementById("gmv4Chart");
      if(host&&!chartHealthy(host))requestRepair(80);
    });
    observer.observe(document.body,{childList:true,subtree:true});
  }

  document.addEventListener("visibilitychange",()=>{if(!document.hidden)resumeSweep()});
  window.addEventListener("pageshow",resumeSweep);
  window.addEventListener("focus",()=>requestRepair(180));
  document.querySelector('.nav-item[data-view="predictions"]')?.addEventListener("click",()=>requestRepair(180));

  watchTradePlan();
  setTimeout(resumeSweep,250);
})();
