const GITHUB_SNAPSHOT="https://raw.githubusercontent.com/umarvandutch/Gold-Mine/main/live-data.json";
const LIVE_CACHE_KEY="https://gold-mine-cache.internal/live";
const BASELINE_CACHE_KEY="https://gold-mine-cache.internal/baseline";
const HEADLINE_CACHE_KEY="https://gold-mine-cache.internal/headlines";
const UA="GoldMineMacro/3.0 (+https://github.com/umarvandutch/Gold-Mine)";
const DAY=86400000;

function corsHeaders(){
  return {
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Methods":"GET,OPTIONS",
    "Access-Control-Allow-Headers":"Content-Type",
    "Content-Type":"application/json; charset=utf-8"
  };
}

function jsonResponse(body,status=200,extra={}){
  return new Response(JSON.stringify(body),{status,headers:{...corsHeaders(),...extra}});
}

async function fetchWithTimeout(url,options={},timeoutMs=8000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    return await fetch(url,{...options,signal:controller.signal,headers:{"User-Agent":UA,"Accept":"*/*",...(options.headers||{})}});
  }finally{clearTimeout(timer);}
}

async function fetchJson(url,options={}){
  const r=await fetchWithTimeout(url,options);
  if(!r.ok)throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

async function fetchText(url,options={}){
  const r=await fetchWithTimeout(url,options);
  if(!r.ok)throw new Error(`HTTP ${r.status} for ${url}`);
  return r.text();
}

function isoNoMs(d){return new Date(d).toISOString().replace(/\.\d{3}Z$/,"Z");}
function num(v){const n=Number(v);return Number.isFinite(n)?n:null;}

function categoryFor(name){
  const s=String(name||"").toLowerCase();
  if(/fomc|interest rate|fed funds|federal reserve|powell|beige book|jackson hole|fed chair|fed governor|fed president|fed official|fed policymaker|fed minutes|fed meeting|fed rate|fed's /.test(s))return"rates";
  if(/cpi|pce|ppi|inflation|price index|prices paid|prices received|personal consumption expenditures price/.test(s))return"inflation";
  if(/payroll|employment|unemployment|jobless|jolts|job openings|labor|labour|wage|earnings|employment cost/.test(s))return"labour";
  if(/gdp|growth rate|gross domestic product/.test(s))return"growth";
  if(/retail|consumer confidence|consumer sentiment|consumer expectations|personal spending|personal income|consumer spending/.test(s))return"consumer";
  if(/housing|home sales|building permits|mortgage|construction|housing starts/.test(s))return"housing";
  if(/pmi|ism|industrial production|factory|durable|capital goods|business|manufacturing|services|philadelphia fed|dallas fed|richmond fed|kansas city fed|empire state/.test(s))return"business";
  if(/trade|export|import|current account/.test(s))return"trade";
  if(/treasury|auction|budget|government/.test(s))return"government";
  return"other";
}

function releaseCadence(events,now=new Date()){
  let nearest=Infinity;
  for(const e of events||[]){
    const t=Date.parse(e.dateUtc||"");
    if(!Number.isFinite(t))continue;
    const important=String(e.volatility||"").toUpperCase()==="HIGH"||(e.category==="rates"&&!/LOW|NONE/.test(String(e.volatility||"").toUpperCase()));
    if(!important)continue;
    const delta=(t-now.getTime())/60000;
    if(delta>=-5&&delta<=2)return{mode:"release-burst",cacheSeconds:4,clientPollSeconds:5,nearestMinutes:Math.round(delta*10)/10};
    nearest=Math.min(nearest,Math.abs(delta));
  }
  if(nearest<=15)return{mode:"release-watch",cacheSeconds:8,clientPollSeconds:10,nearestMinutes:Math.round(nearest*10)/10};
  if(nearest<=60)return{mode:"pre-release",cacheSeconds:15,clientPollSeconds:20,nearestMinutes:Math.round(nearest*10)/10};
  if(nearest<=180)return{mode:"near-event",cacheSeconds:30,clientPollSeconds:30,nearestMinutes:Math.round(nearest*10)/10};
  return{mode:"normal",cacheSeconds:60,clientPollSeconds:60,nearestMinutes:null};
}

async function fetchCalendar(now){
  const start=new Date(now.getTime()-2*DAY),end=new Date(now.getTime()+8*DAY);
  const qs=new URLSearchParams();
  ["NONE","LOW","MEDIUM","HIGH"].forEach(v=>qs.append("volatilities",v));
  qs.append("countries","US");
  const url=`https://calendar-api.fxstreet.com/en/api/v1/eventDates/${isoNoMs(start)}/${isoNoMs(end)}?${qs}`;
  const raw=await fetchJson(url,{headers:{Accept:"application/json",Origin:"https://www.fxstreet.com",Referer:"https://www.fxstreet.com/"}});
  if(!Array.isArray(raw))throw new Error("FXStreet response was not an array");
  return raw.filter(e=>String(e.countryCode||"").toUpperCase()==="US").map(e=>{
    const name=e.name||"US economic event";
    return {id:String(e.id||e.eventId||`${name}-${e.dateUtc||""}`).slice(0,180),dateUtc:e.dateUtc||null,periodDateUtc:e.periodDateUtc||null,name,actual:e.actual??null,revised:e.revised??null,consensus:e.consensus??null,previous:e.previous??null,unit:e.unit??null,volatility:String(e.volatility||"NONE").toUpperCase(),isSpeech:Boolean(e.isSpeech),isTentative:Boolean(e.isTentative),category:categoryFor(name),source:"FXStreet public calendar"};
  }).sort((a,b)=>String(a.dateUtc||"").localeCompare(String(b.dateUtc||"")));
}

function decodeXml(s){return String(s||"").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/<[^>]+>/g,"").replace(/\s+/g," ").trim();}
function xmlTag(block,tag){const m=block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,`i`));return m?decodeXml(m[1]):"";}
function parseRss(xml,source,category,limit=12){
  const items=[];const blocks=String(xml||"").match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi)||[];
  for(const block of blocks.slice(0,limit)){
    const title=xmlTag(block,"title");if(!title)continue;
    const link=xmlTag(block,"link"),pub=xmlTag(block,"pubDate")||xmlTag(block,"date"),parsed=pub?Date.parse(pub):NaN;
    items.push({title,url:link,publishedUtc:Number.isNaN(parsed)?null:isoNoMs(new Date(parsed)),source,category:category==="auto"?categoryFor(title):category});
  }
  return items;
}
async function rssItems(url,source,category,limit=12){return parseRss(await fetchText(url),source,category,limit);}
function googleNewsUrl(query){return `https://news.google.com/rss/search?${new URLSearchParams({q:query,hl:"en-US",gl:"US",ceid:"US:en"})}`;}

async function fetchHeadlinesRaw(){
  const feeds=[
    ["https://www.federalreserve.gov/feeds/press_monetary.xml","Federal Reserve","rates",12],
    ["https://www.federalreserve.gov/feeds/speeches_and_testimony.xml","Federal Reserve","rates",12],
    ["https://www.bls.gov/feed/bls_latest.rss","U.S. Bureau of Labor Statistics","auto",12],
    [googleNewsUrl('(\"Federal Reserve\" OR FOMC OR Powell OR \"US Treasury\") (rates OR inflation OR jobs OR debt OR deficit OR yields) when:2d'),"Google News aggregation","auto",12],
    [googleNewsUrl('(\"US inflation\" OR \"US jobs\" OR \"US GDP\" OR \"US retail sales\" OR \"US PMI\" OR \"US ISM\" OR \"US consumer confidence\" OR \"US housing market\" OR \"US home sales\") when:2d'),"Google News aggregation","auto",14],
    [googleNewsUrl('(\"White House\" OR Trump OR \"US Treasury\") (tariff OR sanctions OR trade OR oil OR debt OR deficit) when:2d'),"Google News aggregation","other",10],
    [googleNewsUrl('(gold OR XAUUSD OR \"US dollar\" OR DXY) (tariff OR war OR attack OR sanctions OR geopolitics OR recession OR crisis OR oil) when:2d'),"Google News aggregation","other",12]
  ];
  const settled=await Promise.allSettled(feeds.map(f=>rssItems(...f))),items=[],errors=[];
  settled.forEach((r,i)=>r.status==="fulfilled"?items.push(...r.value):errors.push(`Headline feed ${i+1}: ${String(r.reason?.message||r.reason)}`));
  const seen=new Set(),unique=[];
  for(const h of items){const key=h.title.toLowerCase().replace(/\W+/g,"").slice(0,140);if(!key||seen.has(key))continue;seen.add(key);unique.push(h);}
  unique.sort((a,b)=>String(b.publishedUtc||"").localeCompare(String(a.publishedUtc||"")));
  return{items:unique.slice(0,36),errors,queriedAt:isoNoMs(new Date())};
}

async function fetchHeadlinesCached(cache){
  const key=new Request(HEADLINE_CACHE_KEY);const hit=await cache.match(key);
  if(hit){try{return await hit.json();}catch{}}
  const value=await fetchHeadlinesRaw();
  await cache.put(key,jsonResponse(value,200,{"Cache-Control":"public, max-age=60"}));
  return value;
}

async function baselineSnapshot(cache){
  const key=new Request(BASELINE_CACHE_KEY);const hit=await cache.match(key);
  if(hit){try{return await hit.json();}catch{}}
  try{
    const value=await fetchJson(`${GITHUB_SNAPSHOT}?worker=${Date.now()}`,{headers:{"Cache-Control":"no-cache"}});
    const baseline=value&&typeof value==="object"?value:{};
    await cache.put(key,jsonResponse(baseline,200,{"Cache-Control":"public, max-age=60"}));
    return baseline;
  }catch{return{};}
}

function mergeEventMetadata(events,baseline){
  const map=new Map((baseline?.events||[]).map(e=>[`${e.id}|${e.dateUtc}`,e]));
  return (events||[]).map(e=>{const old=map.get(`${e.id}|${e.dateUtc}`);if(!old)return e;const keep={};for(const k of ["officialVerification","actualSource"]){if(old[k]!==undefined)keep[k]=old[k];}return{...e,...keep};});
}
function headlineKey(h){return String(h?.url||h?.title||"").trim().toLowerCase();}
function mergeHeadlineMetadata(headlines,baseline){
  const map=new Map((baseline?.headlines||[]).map(h=>[headlineKey(h),h]));
  return (headlines||[]).map(h=>{const old=map.get(headlineKey(h));if(!old)return h;const keep={};for(const k of ["primarySource","officialText","officialTextSource","officialDocumentUrl"]){if(old[k]!==undefined)keep[k]=old[k];}return{...h,...keep};});
}

function midPrice(p){
  const bid=num(p?.closeoutBid??p?.bids?.[0]?.price),ask=num(p?.closeoutAsk??p?.asks?.[0]?.price);
  return bid!==null&&ask!==null?(bid+ask)/2:null;
}
function pctChange(current,previous){return current!==null&&previous?((current-previous)/previous)*100:null;}
function dxyFrom(prices){
  const e=prices.EUR_USD,j=prices.USD_JPY,g=prices.GBP_USD,c=prices.USD_CAD,s=prices.USD_SEK,f=prices.USD_CHF;
  if([e,j,g,c,s,f].some(v=>!Number.isFinite(v)||v<=0))return null;
  return 50.14348112*Math.pow(e,-0.576)*Math.pow(j,0.136)*Math.pow(g,-0.119)*Math.pow(c,0.091)*Math.pow(s,0.042)*Math.pow(f,0.036);
}

async function fetchOandaMarket(env,previousMarket={}){
  if(!env?.OANDA_API_TOKEN||!env?.OANDA_ACCOUNT_ID)return{market:{},status:"not-configured"};
  const host=String(env.OANDA_ENV||"practice").toLowerCase()==="live"?"https://api-fxtrade.oanda.com":"https://api-fxpractice.oanda.com";
  const instruments=["XAU_USD","EUR_USD","USD_JPY","GBP_USD","USD_CAD","USD_SEK","USD_CHF"];
  const url=`${host}/v3/accounts/${encodeURIComponent(env.OANDA_ACCOUNT_ID)}/pricing?instruments=${instruments.join("%2C")}`;
  const doc=await fetchJson(url,{headers:{Authorization:`Bearer ${env.OANDA_API_TOKEN}`,Accept:"application/json"}},6000);
  const prices={};for(const p of doc?.prices||[]){const m=midPrice(p);if(m!==null)prices[p.instrument]=m;}
  const observedAt=isoNoMs(new Date());const market={};
  if(Number.isFinite(prices.XAU_USD)){
    const previous=num(previousMarket?.xau?.price),changePct=pctChange(prices.XAU_USD,previous);
    market.xau={label:"Gold / XAUUSD",symbol:"XAU_USD",name:"Gold / XAUUSD",price:Number(prices.XAU_USD.toFixed(4)),previous,changePct:changePct===null?null:Number(changePct.toFixed(4)),deltaBps:null,date:observedAt.slice(0,10),time:observedAt.slice(11,19),kind:"gold",source:"OANDA v20 account pricing",live:true,observedAt,comparisonLabel:previous?"since prior Worker sample":"live price"};
  }
  const dxy=dxyFrom(prices);
  if(Number.isFinite(dxy)){
    const previous=num(previousMarket?.dxy?.price),changePct=pctChange(dxy,previous);
    market.dxy={label:"Synthetic US Dollar Index",symbol:"DXY-synthetic",name:"Synthetic DXY from 6 FX pairs",price:Number(dxy.toFixed(4)),previous,changePct:changePct===null?null:Number(changePct.toFixed(4)),deltaBps:null,date:observedAt.slice(0,10),time:observedAt.slice(11,19),kind:"index",source:"OANDA v20 FX pricing · DXY formula",live:true,observedAt,comparisonLabel:previous?"since prior Worker sample":"live synthetic index"};
  }
  return{market,status:Object.keys(market).length?"live":"connected-no-supported-quotes"};
}

async function cachedLivePayload(cache){const hit=await cache.match(new Request(LIVE_CACHE_KEY));if(!hit)return null;try{return await hit.json();}catch{return null;}}

async function buildLiveData(env,cache,previousPayload=null){
  const now=new Date();
  const baselinePromise=baselineSnapshot(cache),calendarPromise=fetchCalendar(now),headlinesPromise=fetchHeadlinesCached(cache);
  const [baseline,calendarResult,headlineResult]=await Promise.all([
    baselinePromise,
    calendarPromise.then(value=>({ok:true,value})).catch(error=>({ok:false,error})),
    headlinesPromise.then(value=>({ok:true,value})).catch(error=>({ok:false,error}))
  ]);
  const errors=[];let events=Array.isArray(baseline.events)?baseline.events:[],headlines=Array.isArray(baseline.headlines)?baseline.headlines:[];
  let calendarStatus=baseline.calendarStatus||"fallback",headlineStatus=headlines.length?"snapshot":"unavailable",directSuccess=false;
  if(calendarResult.ok&&calendarResult.value.length){events=mergeEventMetadata(calendarResult.value,baseline);calendarStatus="live";directSuccess=true;}else if(!calendarResult.ok)errors.push(`FXStreet calendar: ${String(calendarResult.error?.message||calendarResult.error)}`);
  if(headlineResult.ok&&headlineResult.value.items.length){headlines=mergeHeadlineMetadata(headlineResult.value.items,baseline);headlineStatus="live-cached-60s";directSuccess=true;errors.push(...(headlineResult.value.errors||[]));}
  else if(!headlineResult.ok)errors.push(`Headlines: ${String(headlineResult.error?.message||headlineResult.error)}`);

  let market=baseline.market&&typeof baseline.market==="object"?{...baseline.market}:{};let oandaStatus="not-configured";
  try{
    const oanda=await fetchOandaMarket(env,previousPayload?.market||{});oandaStatus=oanda.status;market={...market,...oanda.market};if(Object.keys(oanda.market).length)directSuccess=true;
  }catch(error){oandaStatus="error";errors.push(`OANDA pricing: ${String(error?.message||error)}`);}

  const cadence=releaseCadence(events,now),marketCount=Object.values(market).filter(Boolean).length;
  return {...baseline,generatedAt:directSuccess?isoNoMs(now):(baseline.generatedAt||isoNoMs(now)),sourceQueriedAt:isoNoMs(now),collectorMode:"cloudflare-adaptive-realtime",calendarStatus,counts:{events:events.length,headlines:headlines.length,marketFeeds:marketCount},sourceStatus:{...(baseline.sourceStatus||{}),calendar:calendarStatus==="live"?"live":"snapshot-fallback",headlines:headlineStatus,market:Object.keys(market).length?"live-or-fallback":"unavailable",oanda:oandaStatus,worker:"live"},worker:{mode:cadence.mode,cacheSeconds:cadence.cacheSeconds,recommendedClientPollSeconds:cadence.clientPollSeconds,nearestImportantEventMinutes:cadence.nearestMinutes,oanda:oandaStatus},events,headlines,market,errors:[...(Array.isArray(baseline.errors)?baseline.errors:[]),...errors].slice(0,14),isFallback:!directSuccess};
}

async function liveResponse(request,env,ctx){
  const url=new URL(request.url),force=url.searchParams.get("fresh")==="1",cache=caches.default,key=new Request(LIVE_CACHE_KEY);
  const cached=await cachedLivePayload(cache);
  if(!force&&cached){
    const queried=Date.parse(cached.sourceQueriedAt||cached.generatedAt||"");
    const ttl=Number(cached?.worker?.cacheSeconds)||60;
    if(Number.isFinite(queried)&&Date.now()-queried<ttl*1000)return jsonResponse(cached,200,{"Cache-Control":"no-store","X-Gold-Mine-Cache":"hit"});
  }
  const payload=await buildLiveData(env,cache,cached);
  const response=jsonResponse(payload,200,{"Cache-Control":"no-store","X-Gold-Mine-Cache":"miss"});
  ctx.waitUntil(cache.put(key,jsonResponse(payload,200,{"Cache-Control":"public, max-age=120"})));
  return response;
}

export default {
  async fetch(request,env,ctx){
    if(request.method==="OPTIONS")return new Response(null,{status:204,headers:corsHeaders()});
    if(request.method!=="GET")return jsonResponse({error:"Method not allowed"},405);
    const url=new URL(request.url);
    if(url.pathname==="/health")return jsonResponse({ok:true,service:"gold-mine-live",mode:"adaptive-realtime",oandaConfigured:Boolean(env?.OANDA_API_TOKEN&&env?.OANDA_ACCOUNT_ID),time:isoNoMs(new Date())});
    if(url.pathname!=="/"&&url.pathname!=="/live")return jsonResponse({error:"Not found"},404);
    try{return await liveResponse(request,env,ctx);}catch(error){return jsonResponse({error:"Live refresh failed",detail:String(error?.message||error)},502,{"Cache-Control":"no-store"});}
  },
  async scheduled(event,env,ctx){
    ctx.waitUntil((async()=>{try{const cache=caches.default,previous=await cachedLivePayload(cache),payload=await buildLiveData(env,cache,previous);await cache.put(new Request(LIVE_CACHE_KEY),jsonResponse(payload,200,{"Cache-Control":"public, max-age=120"}));}catch(error){console.error("Scheduled Gold Mine refresh failed",error);}})());
  }
};
