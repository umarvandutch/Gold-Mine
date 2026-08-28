(()=>{
  "use strict";

  const GITHUB_LIVE="https://raw.githubusercontent.com/umarvandutch/Gold-Mine/main/live-data.json";
  const originalFetch=window.fetch.bind(window);

  function workerUrl(){return String(window.GOLD_MINE_CONFIG?.liveWorkerUrl||"").trim();}
  function asUrl(input){try{return new URL(typeof input==="string"?input:String(input?.url||""),location.href)}catch{return null}}
  function isLegacyBaseRead(url){
    if(!url||!url.href.startsWith(GITHUB_LIVE)||!url.searchParams.has("t"))return false;
    return Array.from(url.searchParams.keys()).every(k=>k==="t");
  }

  window.fetch=function(input,init){
    const url=asUrl(input),worker=workerUrl();
    if(worker&&isLegacyBaseRead(url)){
      const target=new URL(worker);
      target.searchParams.set("t",String(Date.now()));
      return originalFetch(target.toString(),{...(init||{}),cache:"no-store"});
    }
    return originalFetch(input,init);
  };
})();
