(()=>{
"use strict";
let busy=false;
function repair(){
 if(busy)return;busy=true;
 try{
   const root=document.getElementById("tradeDecisionV4"),host=document.getElementById("gmv4Chart");
   if(root){root.querySelectorAll("strong,small,span,p,li").forEach(el=>{if(/\bNaN\b/.test(el.textContent||""))el.textContent=(el.textContent||"").replace(/\bNaN\b/g,"—")});}
   if(host){
     const legacy=host.querySelector("iframe,.tradingview-widget-container,script[src*='tradingview']");
     const native=host.querySelector(".gm-native-wrap");
     if(legacy&&!native){host.dataset.nativeChart="";host.innerHTML="";}
   }
 }finally{busy=false}
}
const o=new MutationObserver(()=>setTimeout(repair,0));
o.observe(document.body,{childList:true,subtree:true});
window.addEventListener("goldmine-snapshot-updated",()=>setTimeout(repair,20));
document.addEventListener("visibilitychange",()=>{if(!document.hidden)setTimeout(repair,20)});
setTimeout(repair,300);
})();
