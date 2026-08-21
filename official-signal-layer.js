(()=>{
  "use strict";

  const originalFetch=window.fetch.bind(window);
  const workerUrl=()=>String(window.GOLD_MINE_CONFIG?.liveWorkerUrl||"").trim();

  const HAWKISH=[
    /inflation remains elevated/i,
    /inflation.*stubborn/i,
    /upside risks? to inflation/i,
    /not appropriate to reduce/i,
    /not ready to (?:cut|reduce)/i,
    /no rush to (?:cut|reduce)/i,
    /higher for longer/i,
    /restrictive stance/i,
    /further tightening/i,
    /rate increase/i
  ];
  const DOVISH=[
    /inflation has eased/i,
    /inflation.*cool/i,
    /progress toward.*2 percent/i,
    /downside risks? to employment/i,
    /labor market.*cool/i,
    /labour market.*cool/i,
    /appropriate to (?:begin|start).*reduc/i,
    /rate cut/i,
    /rate reduction/i,
    /policy easing/i,
    /lower rates/i
  ];

  function countMatches(text,patterns){
    return patterns.reduce((n,re)=>n+(re.test(text)?1:0),0);
  }

  function fedToneTag(headline){
    if(String(headline?.source||"")!=="Federal Reserve"||!headline?.officialText)return"";
    const text=String(headline.officialText);
    const hawk=countMatches(text,HAWKISH);
    const dove=countMatches(text,DOVISH);
    if(hawk===dove)return"";
    if(hawk>dove)return" official text hawkish higher for longer inflation elevated";
    return" official text dovish rate cut easing inflation cool labor market cool";
  }

  function downgradeVolatility(value){
    const v=String(value||"NONE").toUpperCase();
    if(v==="HIGH")return"MEDIUM";
    if(v==="MEDIUM")return"LOW";
    return v;
  }

  function transform(payload){
    if(!payload||typeof payload!=="object")return payload;
    if(Array.isArray(payload.headlines)){
      payload.headlines=payload.headlines.map(h=>{
        const tag=fedToneTag(h);
        if(!tag)return h;
        return{...h,title:`${h.title}${tag}`};
      });
    }
    if(Array.isArray(payload.events)){
      payload.events=payload.events.map(e=>{
        const verification=e?.officialVerification;
        if(!verification)return e;
        if(verification.status==="mismatch"){
          return{...e,volatility:downgradeVolatility(e.volatility),source:`${e.source||"Economic calendar"} · official BLS mismatch: reduced model weight`};
        }
        if(verification.status==="matched"||verification.status==="official-filled"){
          return{...e,source:`${e.source||"Economic calendar"} · BLS official check ${verification.status==="matched"?"matched":"supplied actual"}`};
        }
        return e;
      });
    }
    return payload;
  }

  function isLiveDataRequest(input){
    const url=typeof input==="string"?input:String(input?.url||"");
    if(url.includes("raw.githubusercontent.com/umarvandutch/Gold-Mine/main/live-data.json"))return true;
    const worker=workerUrl();
    return !!worker&&url.startsWith(worker);
  }

  window.fetch=async function(input,init){
    const response=await originalFetch(input,init);
    if(!isLiveDataRequest(input)||!response.ok)return response;
    try{
      const payload=await response.clone().json();
      const transformed=transform(payload);
      const headers=new Headers(response.headers);
      headers.set("Content-Type","application/json; charset=utf-8");
      return new Response(JSON.stringify(transformed),{status:response.status,statusText:response.statusText,headers});
    }catch{
      return response;
    }
  };
})();
