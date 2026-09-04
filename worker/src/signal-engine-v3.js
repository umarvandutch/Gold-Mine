const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null;};
const iso=v=>new Date(v).toISOString();
const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;

function emaSeries(values,period){
  if(!Array.isArray(values)||values.length<period)return [];
  const k=2/(period+1),out=new Array(values.length).fill(null);
  let seed=mean(values.slice(0,period));out[period-1]=seed;
  for(let i=period;i<values.length;i++){seed=values[i]*k+seed*(1-k);out[i]=seed;}
  return out;
}
function lastFinite(a){for(let i=a.length-1;i>=0;i--)if(Number.isFinite(a[i]))return a[i];return null;}
function rsi(values,period=14){
  if(values.length<=period)return null;let gain=0,loss=0;
  for(let i=1;i<=period;i++){const d=values[i]-values[i-1];if(d>=0)gain+=d;else loss-=d;}
  gain/=period;loss/=period;
  for(let i=period+1;i<values.length;i++){const d=values[i]-values[i-1],g=Math.max(d,0),l=Math.max(-d,0);gain=(gain*(period-1)+g)/period;loss=(loss*(period-1)+l)/period;}
  if(loss===0)return 100;const rs=gain/loss;return 100-(100/(1+rs));
}
function macd(values){
  const e12=emaSeries(values,12),e26=emaSeries(values,26),line=values.map((_,i)=>Number.isFinite(e12[i])&&Number.isFinite(e26[i])?e12[i]-e26[i]:null);
  const compact=line.filter(Number.isFinite),sigCompact=emaSeries(compact,9),sig=lastFinite(sigCompact),m=lastFinite(line);return{line:m,signal:sig,hist:Number.isFinite(m)&&Number.isFinite(sig)?m-sig:null};
}
function roc(values,bars=6){if(values.length<=bars)return null;const a=values[values.length-1],b=values[values.length-1-bars];return b?((a-b)/b)*100:null;}
function std(a){if(a.length<2)return null;const m=mean(a),v=mean(a.map(x=>(x-m)**2));return Math.sqrt(v);}
function realizedVol(values,bars=20){const r=[];for(let i=Math.max(1,values.length-bars);i<values.length;i++){if(values[i-1]>0&&values[i]>0)r.push(Math.log(values[i]/values[i-1]));}const s=std(r);return s===null?null:s*Math.sqrt(6)*100;}
function dmi(c,period=14){
  if(!Array.isArray(c)||c.length<period*2+2)return{adx:null,plusDI:null,minusDI:null};
  const tr=[],pdm=[],mdm=[];for(let i=1;i<c.length;i++){const up=c[i].high-c[i-1].high,down=c[i-1].low-c[i].low;tr.push(Math.max(c[i].high-c[i].low,Math.abs(c[i].high-c[i-1].close),Math.abs(c[i].low-c[i-1].close)));pdm.push(up>down&&up>0?up:0);mdm.push(down>up&&down>0?down:0);}
  let trs=tr.slice(0,period).reduce((a,b)=>a+b,0),ps=pdm.slice(0,period).reduce((a,b)=>a+b,0),ms=mdm.slice(0,period).reduce((a,b)=>a+b,0);const dx=[];let plus=null,minus=null;
  for(let i=period;i<tr.length;i++){if(i>period){trs=trs-trs/period+tr[i];ps=ps-ps/period+pdm[i];ms=ms-ms/period+mdm[i];}plus=trs?100*ps/trs:0;minus=trs?100*ms/trs:0;const den=plus+minus;dx.push(den?100*Math.abs(plus-minus)/den:0);}
  if(dx.length<period)return{adx:null,plusDI:plus,minusDI:minus};let adx=mean(dx.slice(0,period));for(let i=period;i<dx.length;i++)adx=(adx*(period-1)+dx[i])/period;return{adx,plusDI:plus,minusDI:minus};
}
function stateBias(v){const s=String(v||"").toLowerCase();return s==="bullish"?1:s==="bearish"?-1:0;}
function nextEventRisk(events,now){let next=null,recent=null;for(const e of events||[]){const t=Date.parse(e?.dateUtc||"");if(!Number.isFinite(t))continue;const vol=String(e?.volatility||"").toUpperCase();if(!["HIGH","MEDIUM"].includes(vol))continue;const d=(t-now)/60000;if(d>=0&&(!next||d<next.minutes))next={event:e,minutes:d,high:vol==="HIGH"};if(d<0&&d>=-15&&(!recent||d>recent.minutes))recent={event:e,minutes:d,high:vol==="HIGH"};}return{next,recent};}
function selectOrderBlock(t,side){
  const preferred=side==="buy"?t?.preferredBullishOrderBlock:t?.preferredBearishOrderBlock;if(preferred)return preferred;
  const want=side==="buy"?"bullish":"bearish";return (t?.orderBlocks||[]).filter(x=>x?.side===want&&num(x.quality)>=70&&num(x.touches)<=1).sort((a,b)=>(num(b.quality)||0)-(num(a.quality)||0))[0]||null;
}
function crossMarket(m){let weighted=0,weight=0;const add=(v,scale,w,invert=true)=>{const x=num(v);if(x===null)return;weighted+=(invert?-1:1)*clamp(x/scale,-1,1)*w;weight+=w;};add(m?.dxy?.changePct,.45,5,true);add(m?.real10y?.deltaBps,8,5,true);add(m?.us2y?.deltaBps,10,3,true);add(m?.us10y?.deltaBps,10,2,true);return{bias:weight?clamp(weighted/weight,-1,1):0,inputs:weight};}
function indicatorPack(data){
  const t=data?.technical||{},h4=Array.isArray(t.candles4h)?t.candles4h:[],d1=Array.isArray(t.candles1d)?t.candles1d:[],hc=h4.map(x=>num(x.close)).filter(Number.isFinite),dc=d1.map(x=>num(x.close)).filter(Number.isFinite),price=num(t.currentPrice??data?.market?.xau?.price),atr=num(t.atr14),e20=lastFinite(emaSeries(hc,20)),e50=lastFinite(emaSeries(hc,50)),e100=lastFinite(emaSeries(hc,100)),d20=lastFinite(emaSeries(dc,20)),d50=lastFinite(emaSeries(dc,50)),R=rsi(hc,14),M=macd(hc),D=dmi(h4,14),R6=roc(hc,6),R12=roc(hc,12),rv=realizedVol(hc,20);
  let trend=0,parts=0;const push=v=>{if(Number.isFinite(v)){trend+=clamp(v,-1,1);parts++;}};if(price&&atr){if(e20)push((price-e20)/(atr*1.5));if(e20&&e50)push((e20-e50)/(atr*1.8));if(e50&&e100)push((e50-e100)/(atr*2.2));}if(dc.length&&d20&&d50){const p=dc[dc.length-1],dailyAtr=Math.max(Math.abs(p)*.01,1);push((p-d20)/(dailyAtr*2));push((d20-d50)/(dailyAtr*2.5));}trend=parts?clamp(trend/parts,-1,1):0;
  const dmiBias=Number.isFinite(D.plusDI)&&Number.isFinite(D.minusDI)&&D.plusDI+D.minusDI?clamp((D.plusDI-D.minusDI)/(D.plusDI+D.minusDI),-1,1):0,adxStrength=Number.isFinite(D.adx)?clamp((D.adx-14)/22,0,1):0;
  const rsiBias=Number.isFinite(R)?clamp((R-50)/22,-1,1):0,macdBias=Number.isFinite(M.hist)&&atr?clamp(M.hist/(atr*.12),-1,1):0,rocBias=Number.isFinite(R6)?clamp(R6/1.4,-1,1):0,momentum=clamp(rsiBias*.35+macdBias*.4+rocBias*.25,-1,1),structure=clamp(stateBias(t.structure4h?.state)*.62+stateBias(t.structure1d?.state)*.38,-1,1),atrPct=price&&atr?atr/price*100:null;
  return{price,atr,atrPct,realizedVol20:rv,ema20:e20,ema50:e50,ema100:e100,dailyEma20:d20,dailyEma50:d50,rsi14:R,macdLine:M.line,macdSignal:M.signal,macdHistogram:M.hist,roc6:R6,roc12:R12,adx14:D.adx,plusDI:D.plusDI,minusDI:D.minusDI,trendBias:trend,dmiBias:dmiBias*adxStrength,momentumBias:momentum,structureBias:structure,h4State:t.structure4h?.state||"unavailable",d1State:t.structure1d?.state||"unavailable"};
}
function modelRegime(ind,risk){if(risk?.next&&risk.next.minutes<=30&&risk.next.high)return"event-risk";if(ind.atrPct!==null&&ind.atrPct>2.4)return"high-volatility";if(Number(ind.adx14)<17)return"range/weak-trend";if(ind.trendBias>.3)return"bullish-trend";if(ind.trendBias<-.3)return"bearish-trend";return"mixed";}
function baseMacro(data){const a=num(data?.signals?.buyLimit?.macroScore),b=num(data?.signals?.sellLimit?.macroScore);return a!==null?a:b!==null?b:0;}
function blockPlan(ob,side,ind){
  if(!ob)return{entry:null,stop:null,tp1:null,tp2:null,rr1:null,rr2:null,quality:0,distanceAtr:null,status:null};const entry=num(ob?.planning?.limitReference??ob.midpoint),stop=num(ob?.planning?.invalidationReference),tp1=num(ob?.planning?.tp1Reference),tp2=num(ob?.planning?.tp2Reference),rr1=num(ob?.planning?.rrTp1),rr2=num(ob?.planning?.rrTp2),quality=num(ob?.quality)||0;let distance=null;if(ind.price!==null&&entry!==null&&ind.atr){distance=side==="buy"?(ind.price-entry)/ind.atr:(entry-ind.price)/ind.atr;}return{entry,stop,tp1,tp2,rr1,rr2,quality,distanceAtr:distance,status:ob.status||null,zoneLow:num(ob.zoneLow),zoneHigh:num(ob.zoneHigh),touches:num(ob.touches)||0};
}
function sideSignal(side,data,now,ind,risk,cross,macro){
  const dir=side==="buy"?1:-1,t=data?.technical||{},ob=selectOrderBlock(t,side),plan=blockPlan(ob,side,ind),macroBias=clamp(macro/28,-1,1),components={trend:+(ind.trendBias*22).toFixed(2),dmi:+(ind.dmiBias*14).toFixed(2),momentum:+(ind.momentumBias*14).toFixed(2),structure:+(ind.structureBias*14).toFixed(2),macro:+(macroBias*20).toFixed(2),crossMarket:+(cross.bias*16).toFixed(2)},directionalScore=Object.values(components).reduce((a,b)=>a+b,0),sideScore=dir*directionalScore,aligned=Object.values(components).filter(v=>dir*v>=2).length,opposed=Object.values(components).filter(v=>dir*v<=-2).length,blockers=[];
  const observed=Date.parse(t?.observedAt||data?.market?.xau?.observedAt||""),age=Number.isFinite(observed)?(now-observed)/60000:9999;if(t?.status!=="live")blockers.push("Live OANDA technical data is unavailable.");if(age>10)blockers.push(`Market data is ${Math.floor(age)} minutes old.`);
  if(risk.next){const name=risk.next.event?.name||"US event",limit=risk.next.high?30:15;if(risk.next.minutes<=limit)blockers.push(`${name} is due in ${Math.max(0,Math.floor(risk.next.minutes))} minutes — event-risk gate is active.`);}if(risk.recent&&risk.recent.high&&Math.abs(risk.recent.minutes)<=10)blockers.push(`${risk.recent.event?.name||"High-impact data"} was just released — wait for the first reaction to settle.`);
  if(sideScore<36)blockers.push(`Ensemble directional score is only ${sideScore.toFixed(1)}/100; at least 36 is required.`);if(aligned<4)blockers.push(`Only ${aligned} of 6 model components align with ${side.toUpperCase()}.`);if(Number.isFinite(ind.adx14)&&ind.adx14<16&&Math.abs(ind.trendBias)<.45)blockers.push(`Trend strength is weak (ADX ${ind.adx14.toFixed(1)}).`);
  if(!ob)blockers.push(`No usable ${side==="buy"?"bullish":"bearish"} 4H liquidity/order-block zone is available.`);else{if(plan.quality<65)blockers.push(`Setup-zone quality is ${plan.quality}/100; at least 65 is required.`);if(plan.touches>1)blockers.push("The setup zone has been retested too many times.");if(plan.distanceAtr!==null){if(plan.distanceAtr<-.15)blockers.push("Price has already moved through the planned entry zone.");if(plan.distanceAtr>2)blockers.push(`Planned entry is ${plan.distanceAtr.toFixed(1)} ATR away from current price.`);}if(plan.entry===null||plan.stop===null||(side==="buy"?plan.stop>=plan.entry:plan.stop<=plan.entry))blockers.push("A valid structural stop reference is unavailable.");if(plan.tp1===null||plan.rr1===null||plan.rr1<1.8||plan.rr1>6)blockers.push("No nearby structural target provides a realistic 1.8R–6R reward/risk window.");}
  if(ind.atrPct!==null&&ind.atrPct>2.6)blockers.push(`4H volatility is unusually high (ATR ${ind.atrPct.toFixed(2)}% of price).`);
  const setupBase=clamp(plan.quality*.55+(plan.rr1?clamp(plan.rr1/3,0,1)*20:0)+(plan.distanceAtr!==null?clamp(1-Math.abs(plan.distanceAtr-.7)/2,0,1)*15:0)+(Number.isFinite(ind.adx14)?clamp((ind.adx14-14)/20,0,1)*10:0),0,100),quality=clamp(28+sideScore*.48+setupBase*.28+aligned*3-opposed*2,0,95),active=blockers.length===0;
  const driverEntries=Object.entries(components).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1])).slice(0,3).map(([k,v])=>({name:k,score:v,direction:v>0?"bullish":v<0?"bearish":"neutral"}));
  return{side,status:active?"candidate":"no-signal",action:active?(side==="buy"?"BUY LIMIT CANDIDATE":"SELL LIMIT CANDIDATE"):(side==="buy"?"NO BUY LIMIT SIGNAL":"NO SELL LIMIT SIGNAL"),generatedAt:iso(now),marketObservedAt:t?.observedAt||data?.market?.xau?.observedAt||null,validUntil:iso(now+10*60000),currentPrice:ind.price,entryZoneLow:plan.zoneLow??null,entryZoneHigh:plan.zoneHigh??null,limitPrice:plan.entry,stopLossReference:plan.stop,tp1Reference:plan.tp1,tp2Reference:plan.tp2,rrTp1:plan.rr1,rrTp2:plan.rr2,orderBlockQuality:plan.quality||null,confidenceScore:active?Math.round(quality):0,setupQualityScore:Math.round(quality),modelDirectionalScore:+directionalScore.toFixed(2),sideScore:+sideScore.toFixed(2),confluenceCount:aligned,oppositionCount:opposed,macroScore:+macro.toFixed(2),macroAgreementPct:num(data?.signals?.buyLimit?.macroAgreementPct)??null,modelComponents:components,topDrivers:driverEntries,regime:modelRegime(ind,risk),indicators:{rsi14:num(ind.rsi14),adx14:num(ind.adx14),plusDI:num(ind.plusDI),minusDI:num(ind.minusDI),macdHistogram:num(ind.macdHistogram),roc6:num(ind.roc6),atrPct:num(ind.atrPct),ema20:num(ind.ema20),ema50:num(ind.ema50),ema100:num(ind.ema100),trendBias:+ind.trendBias.toFixed(3),momentumBias:+ind.momentumBias.toFixed(3),structureBias:+ind.structureBias.toFixed(3)},nextEvent:risk.next?{name:risk.next.event?.name||"US event",dateUtc:risk.next.event?.dateUtc||null,minutesAway:Math.round(risk.next.minutes),volatility:risk.next.high?"HIGH":"MEDIUM"}:null,blockers,rulesVersion:`${side}-ensemble-v3`,notice:"Systematic planning signal only. Setup quality is not a probability of profit. Re-check immediately before any order."};
}
export function buildSignalsV3(data,now=Date.now()){
  const ind=indicatorPack(data),risk=nextEventRisk(data?.events||[],now),cross=crossMarket(data?.market||{}),macro=baseMacro(data),buy=sideSignal("buy",data,now,ind,risk,cross,macro),sell=sideSignal("sell",data,now,ind,risk,cross,macro);return{status:data?.technical?.status==="live"?"live":"limited",generatedAt:iso(now),modelVersion:"ensemble-v3.0",modelName:"Gold Mine Multi-Factor Ensemble",policy:"4H/D1 trend + DMI/ADX + RSI/MACD momentum + market structure + macro/news + DXY/yield confirmation + event-risk + ATR/R:R setup gating.",regime:modelRegime(ind,risk),dataQuality:{technical:data?.technical?.status||"unknown",marketInputs:cross.inputs,calendar:Array.isArray(data?.events)?data.events.length:0,headlines:Array.isArray(data?.headlines)?data.headlines.length:0},buyLimit:buy,sellLimit:sell};
}
