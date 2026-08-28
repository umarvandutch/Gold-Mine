(()=>{
  "use strict";

  const GITHUB_LIVE="https://raw.githubusercontent.com/umarvandutch/Gold-Mine/main/live-data.json";
  const originalFetch=window.fetch.bind(window);

  function workerUrl(){
    return String(window.GOLD_MINE_CONFIG?.liveWorkerUrl||"").trim();
  }

  function asUrl(input){
    try{return new URL(typeof input==="string"?input:String(input?.url||""),location.href);}catch{return null;}
  }

  function shouldUseGithub(url){
    if(!url)return true;
    return url.searchParams.has("official")||url.searchParams.has("worker")||url.searchParams.has("backupOnly");
  }

  window.fetch=function(input,init){
    const url=asUrl(input),worker=workerUrl();
    if(worker&&url&&url.href.startsWith(GITHUB_LIVE)&&!shouldUseGithub(url)){
      const target=new URL(worker);
      target.searchParams.set("t",String(Date.now()));
      return originalFetch(target.toString(),{...(init||{}),cache:"no-store"});
    }
    return originalFetch(input,init);
  };
})();
