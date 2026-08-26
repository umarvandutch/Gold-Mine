(()=>{
  "use strict";

  function installTraderColours(){
    if(document.getElementById("goldmine-trader-news-colours"))return;
    const style=document.createElement("style");
    style.id="goldmine-trader-news-colours";
    style.textContent=`
      /* Trader convention: gold up/good = green; gold down/bad = red. */
      .direction-tag.usd-down{background:var(--green-soft)!important;color:var(--green)!important}
      .direction-tag.usd-up{background:var(--red-soft)!important;color:var(--red)!important}
      .news-signal.bullish{background:var(--green-soft)!important;color:var(--green)!important}
      .news-signal.bearish{background:var(--red-soft)!important;color:var(--red)!important}
      .gold-good-news{color:var(--green)!important}
      .gold-bad-news{color:var(--red)!important}
    `;
    document.head.appendChild(style);
  }

  function relabel(){
    installTraderColours();

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
      el.classList.toggle("gold-good-news",/GOOD NEWS/.test(el.textContent));
      el.classList.toggle("gold-bad-news",/BAD NEWS/.test(el.textContent));
    });
  }

  relabel();
  new MutationObserver(relabel).observe(document.body,{childList:true,subtree:true});
})();
