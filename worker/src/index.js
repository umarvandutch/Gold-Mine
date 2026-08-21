const GITHUB_SNAPSHOT="https://raw.githubusercontent.com/umarvandutch/Gold-Mine/main/live-data.json";
const CACHE_KEY="https://gold-mine-cache.internal/live";
const CACHE_SECONDS=20;
const UA="GoldMineMacro/2.0 (+https://github.com/umarvandutch/Gold-Mine)";

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
  }finally{
    clearTimeout(timer);
  }
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

function isoNoMs(d){
  return new Date(d).toISOString().replace(/\.\d{3}Z$/,"Z");
}

async function fetchCalendar(now){
  const start=new Date(now.getTime()-2*86400000);
  const end=new Date(now.getTime()+8*86400000);
  const qs=new URLSearchParams();
  ["NONE","LOW","MEDIUM","HIGH"].forEach(v=>qs.append("volatilities",v));
  qs.append("countries","US");
  const url=`https://calendar-api.fxstreet.com/en/api/v1/eventDates/${isoNoMs(start)}/${isoNoMs(end)}?${qs}`;
  const raw=await fetchJson(url,{headers:{Accept:"application/json",Origin:"https://www.fxstreet.com",Referer:"https://www.fxstreet.com/"}});
  if(!Array.isArray(raw))throw new Error("FXStreet response was not an array");
  return raw.filter(e=>String(e.countryCode||"").toUpperCase()==="US").map(e=>{
    const name=e.name||"US economic event";
    return {
      id:String(e.id||e.eventId||`${name}-${e.dateUtc||""}`).slice(0,180),
      dateUtc:e.dateUtc||null,
      periodDateUtc:e.periodDateUtc||null,
      name,
      actual:e.actual??null,
      revised:e.revised??null,
      consensus:e.consensus??null,
      previous:e.previous??null,
      unit:e.unit??null,
      volatility:String(e.volatility||"NONE").toUpperCase(),
      isSpeech:Boolean(e.isSpeech),
      isTentative:Boolean(e.isTentative),
      category:categoryFor(name),
      source:"FXStreet public calendar"
    };
  }).sort((a,b)=>String(a.dateUtc||"").localeCompare(String(b.dateUtc||"")));
}

function decodeXml(s){
  return String(s||"")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1")
    .replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">")
    .replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'")
    .replace(/<[^>]+>/g,"")
    .replace(/\s+/g," ").trim();
}

function xmlTag(block,tag){
  const m=block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,`i`));
  return m?decodeXml(m[1]):"";
}

function parseRss(xml,source,category,limit=12){
  const items=[];
  const blocks=String(xml||"").match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi)||[];
  for(const block of blocks.slice(0,limit)){
    const title=xmlTag(block,"title");
    if(!title)continue;
    const link=xmlTag(block,"link");
    const pub=xmlTag(block,"pubDate")||xmlTag(block,"date");
    const parsed=pub?Date.parse(pub):NaN;
    items.push({
      title,
      url:link,
      publishedUtc:Number.isNaN(parsed)?null:isoNoMs(new Date(parsed)),
      source,
      category:category==="auto"?categoryFor(title):category
    });
  }
  return items;
}

async function rssItems(url,source,category,limit=12){
  const xml=await fetchText(url);
  return parseRss(xml,source,category,limit);
}

function googleNewsUrl(query){
  const p=new URLSearchParams({q:query,hl:"en-US",gl:"US",ceid:"US:en"});
  return `https://news.google.com/rss/search?${p}`;
}

async function fetchHeadlines(){
  const feeds=[
    ["https://www.federalreserve.gov/feeds/press_monetary.xml","Federal Reserve","rates",12],
    ["https://www.federalreserve.gov/feeds/speeches_and_testimony.xml","Federal Reserve","rates",12],
    ["https://www.bls.gov/feed/bls_latest.rss","U.S. Bureau of Labor Statistics","auto",12],
    [googleNewsUrl('(\"Federal Reserve\" OR FOMC OR Powell OR \"US Treasury\") (rates OR inflation OR jobs OR debt OR deficit OR yields) when:2d'),"Google News aggregation","auto",12],
    [googleNewsUrl('(\"US inflation\" OR \"US jobs\" OR \"US GDP\" OR \"US retail sales\" OR \"US PMI\" OR \"US ISM\" OR \"US consumer confidence\" OR \"US housing market\" OR \"US home sales\") when:2d'),"Google News aggregation","auto",14],
    [googleNewsUrl('(\"White House\" OR Trump OR \"US Treasury\") (tariff OR sanctions OR trade OR oil OR debt OR deficit) when:2d'),"Google News aggregation","other",10],
    [googleNewsUrl('(gold OR XAUUSD OR \"US dollar\" OR DXY) (tariff OR war OR attack OR sanctions OR geopolitics OR recession OR crisis OR oil) when:2d'),"Google News aggregation","other",12]
  ];
  const settled=await Promise.allSettled(feeds.map(f=>rssItems(...f)));
  const items=[];
  const errors=[];
  settled.forEach((r,i)=>{
    if(r.status==="fulfilled")items.push(...r.value);
    else errors.push(`Headline feed ${i+1}: ${String(r.reason?.message||r.reason)}`);
  });
  const seen=new Set();
  const unique=[];
  for(const h of items){
    const key=h.title.toLowerCase().replace(/\W+/g,"").slice(0,140);
    if(!key||seen.has(key))continue;
    seen.add(key);
    unique.push(h);
  }
  unique.sort((a,b)=>String(b.publishedUtc||"").localeCompare(String(a.publishedUtc||"")));
  return {items:unique.slice(0,36),errors};
}

async function baselineSnapshot(){
  try{
    const baseline=await fetchJson(`${GITHUB_SNAPSHOT}?worker=${Date.now()}`,{headers:{Cache-Control:"no-cache"}});
    return baseline&&typeof baseline==="object"?baseline:{};
  }catch{
    return {};
  }
}

async function buildLiveData(){
  const now=new Date();
  const baselinePromise=baselineSnapshot();
  const calendarPromise=fetchCalendar(now);
  const headlinesPromise=fetchHeadlines();
  const [baseline,calendarResult,headlineResult]=await Promise.all([
    baselinePromise,
    calendarPromise.then(value=>({ok:true,value})).catch(error=>({ok:false,error})),
    headlinesPromise.then(value=>({ok:true,value})).catch(error=>({ok:false,error}))
  ]);

  const errors=[];
  let events=Array.isArray(baseline.events)?baseline.events:[];
  let headlines=Array.isArray(baseline.headlines)?baseline.headlines:[];
  let calendarStatus=baseline.calendarStatus||"fallback";
  let headlineStatus=headlines.length?"snapshot":"unavailable";
  let directSuccess=false;

  if(calendarResult.ok&&calendarResult.value.length){
    events=calendarResult.value;
    calendarStatus="live";
    directSuccess=true;
  }else if(!calendarResult.ok){
    errors.push(`FXStreet calendar: ${String(calendarResult.error?.message||calendarResult.error)}`);
  }

  if(headlineResult.ok){
    if(headlineResult.value.items.length){
      headlines=headlineResult.value.items;
      headlineStatus="live";
      directSuccess=true;
    }
    errors.push(...headlineResult.value.errors);
  }else{
    errors.push(`Headlines: ${String(headlineResult.error?.message||headlineResult.error)}`);
  }

  const market=baseline.market&&typeof baseline.market==="object"?baseline.market:{};
  const marketCount=Object.values(market).filter(Boolean).length;
  const generatedAt=directSuccess?isoNoMs(now):(baseline.generatedAt||isoNoMs(now));

  return {
    ...baseline,
    generatedAt,
    sourceQueriedAt:isoNoMs(now),
    collectorMode:"cloudflare-on-demand",
    calendarStatus,
    counts:{events:events.length,headlines:headlines.length,marketFeeds:marketCount},
    sourceStatus:{
      ...(baseline.sourceStatus||{}),
      calendar:calendarStatus==="live"?"live":"snapshot-fallback",
      headlines:headlineStatus,
      market:marketCount?"github-snapshot":"unavailable"
    },
    events,
    headlines,
    market,
    errors:[...(Array.isArray(baseline.errors)?baseline.errors:[]),...errors].slice(0,12),
    isFallback:!directSuccess
  };
}

async function liveResponse(request,ctx){
  const url=new URL(request.url);
  const force=url.searchParams.get("fresh")==="1";
  const cache=caches.default;
  const key=new Request(CACHE_KEY,{method:"GET"});

  if(!force){
    const cached=await cache.match(key);
    if(cached)return cached;
  }

  const payload=await buildLiveData();
  const response=jsonResponse(payload,200,{"Cache-Control":`public, max-age=${CACHE_SECONDS}`});
  ctx.waitUntil(cache.put(key,response.clone()));
  return response;
}

export default {
  async fetch(request,env,ctx){
    if(request.method==="OPTIONS")return new Response(null,{status:204,headers:corsHeaders()});
    if(request.method!=="GET")return jsonResponse({error:"Method not allowed"},405);
    const url=new URL(request.url);
    if(url.pathname==="/health")return jsonResponse({ok:true,service:"gold-mine-live",time:isoNoMs(new Date())});
    if(url.pathname!=="/"&&url.pathname!=="/live")return jsonResponse({error:"Not found"},404);
    try{
      return await liveResponse(request,ctx);
    }catch(error){
      return jsonResponse({error:"Live refresh failed",detail:String(error?.message||error)},502,{"Cache-Control":"no-store"});
    }
  },

  async scheduled(event,env,ctx){
    ctx.waitUntil((async()=>{
      try{
        const payload=await buildLiveData();
        const response=jsonResponse(payload,200,{"Cache-Control":`public, max-age=${CACHE_SECONDS}`});
        await caches.default.put(new Request(CACHE_KEY,{method:"GET"}),response);
      }catch(error){
        console.error("Scheduled Gold Mine refresh failed",error);
      }
    })());
  }
};
