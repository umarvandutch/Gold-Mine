import base from "./index.js";
import {buildSignalsV3} from "./signal-engine-v3.js";

function shouldEnhance(request,response){
  if(request.method!=="GET"||!response?.ok)return false;
  try{const u=new URL(request.url);return u.pathname==="/"||u.pathname==="/live";}catch{return false;}
}

async function enhancedResponse(request,response){
  if(!shouldEnhance(request,response))return response;
  try{
    const data=await response.clone().json();
    if(!data||!Array.isArray(data.events))return response;
    data.signals=buildSignalsV3(data,Date.now());
    data.signalEngine={version:"ensemble-v3.0",generatedAt:data.signals.generatedAt,source:"Gold Mine Worker"};
    const headers=new Headers(response.headers);headers.set("Content-Type","application/json; charset=utf-8");headers.set("Cache-Control","no-store");headers.set("X-Gold-Mine-Signals","ensemble-v3.0");
    return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers});
  }catch(error){console.error("Signal v3 enhancement failed",error);return response;}
}

export default {
  async fetch(request,env,ctx){return enhancedResponse(request,await base.fetch(request,env,ctx));},
  async scheduled(event,env,ctx){return base.scheduled(event,env,ctx);}
};
