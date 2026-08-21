(()=>{
  "use strict";

  function relabel(){
    document.querySelectorAll(".direction-tag").forEach(el=>{
      const t=el.textContent.trim();
      if(t==="Gold ↑")el.textContent="Gold ↑ · Good news";
      else if(t==="Gold ↓")el.textContent="Gold ↓ · Bad news";
      else if(t==="Mixed")el.textContent="Mixed / wait";
    });

    document.querySelectorAll(".news-signal").forEach(el=>{
      const t=el.textContent.trim();
      if(t==="Gold-supportive context")el.textContent="Good news for gold";
      else if(t==="Gold-negative context")el.textContent="Bad news for gold";
    });

    document.querySelectorAll("#predictionPanel *").forEach(el=>{
      if(el.children.length)return;
      const t=el.textContent.trim();
      if(t==="BULLISH BIAS")el.textContent="GOOD NEWS · BULLISH BIAS";
      else if(t==="BEARISH BIAS")el.textContent="BAD NEWS · BEARISH BIAS";
    });
  }

  relabel();
  new MutationObserver(relabel).observe(document.body,{childList:true,subtree:true});
})();
