(()=>{
"use strict";
function sync(){const d=window.GoldMineLiveSnapshot;if(d&&Array.isArray(d.events))window.dispatchEvent(new CustomEvent("goldmine-snapshot-updated",{detail:d}))}
function wire(){document.querySelectorAll(".chip").forEach(b=>{if(b.dataset.gmLiveSync)return;b.dataset.gmLiveSync="1";b.addEventListener("click",()=>setTimeout(sync,0))})}
wire();new MutationObserver(wire).observe(document.body,{childList:true,subtree:true});setTimeout(sync,900);setTimeout(sync,2500);window.addEventListener("pageshow",()=>setTimeout(sync,80));
})();
