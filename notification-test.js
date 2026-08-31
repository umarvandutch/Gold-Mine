(()=>{
"use strict";
function native(){return window.GoldMineNative&&typeof window.GoldMineNative.scheduleTestNotification==="function"?window.GoldMineNative:null}
function install(){
 const settings=document.querySelector('#view-settings .settings-card');if(!settings||document.getElementById('gmNotificationTest'))return;
 const card=document.createElement('div');card.id='gmNotificationTest';card.className='method-card';
 card.innerHTML='<span class="eyebrow">ANDROID ALERT TEST</span><h3>Notification diagnostics</h3><p id="gmNotifyTestText">Checking Android notification setup…</p><div id="gmNotifyDiag" class="fine-print" style="margin:8px 0 12px"></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button id="gmNotifyNow" class="text-button" type="button">Send test now</button><button id="gmNotifyLater" class="text-button" type="button">Test with app closed</button><button id="gmExactAlarm" class="text-button" type="button">Enable exact alerts</button><button id="gmNotifySettings" class="text-button" type="button">Notification settings</button><button id="gmLiveCheck" class="text-button" type="button">Run live alert check</button></div><p class="fine-print">For reliable 10/30-minute economic-news alerts on Android 12+, Gold Mine should have both notification permission and Alarms & reminders access. The delayed test uses the same alarm path as pre-news alerts.</p>';
 settings.parentElement?.insertBefore(card,settings.nextSibling);
 const text=document.getElementById('gmNotifyTestText'),diag=document.getElementById('gmNotifyDiag'),now=document.getElementById('gmNotifyNow'),later=document.getElementById('gmNotifyLater'),exact=document.getElementById('gmExactAlarm'),notifySettings=document.getElementById('gmNotifySettings'),liveCheck=document.getElementById('gmLiveCheck');
 const n=native();if(!n){text.textContent='Notification testing is available in the Android APK. The browser/PWA cannot call the native alert tester.';[now,later,exact,notifySettings,liveCheck].forEach(b=>b.disabled=true);return}
 function refresh(){
   try{
     const ns=n.notificationStatus(),as=typeof n.exactAlarmStatus==='function'?n.exactAlarmStatus():'unknown',d=typeof n.diagnostics==='function'?n.diagnostics():'';
     diag.textContent=`Notifications: ${ns==='ready'?'READY':'BLOCKED'} · Exact alarms: ${as==='ready'?'READY':'BLOCKED'}${d?` · ${d}`:''}`;
     if(ns!=='ready')text.textContent='Android notification permission is blocked. Open Notification settings and allow Gold Mine notifications.';
     else if(as!=='ready')text.textContent='Notifications are allowed, but exact alarms are blocked. Enable exact alerts for reliable pre-news timing.';
     else text.textContent='Notification permissions look ready. Run both tests below.';
   }catch{diag.textContent='Could not read native notification diagnostics.'}
 }
 now.addEventListener('click',()=>{try{const r=n.sendTestNotificationNow();text.textContent=r==='sent'?'Immediate test sent. You should see it in the notification shade now.':'Notification permission is blocked — allow it, then retry.';setTimeout(refresh,1800)}catch{ text.textContent='Could not trigger the immediate native notification.'}});
 later.addEventListener('click',()=>{try{const r=n.scheduleTestNotification();if(r==='exact'){text.textContent='Exact background test scheduled for 1 minute from now. Close Gold Mine normally and lock the phone if you want.';later.textContent='Scheduled ✓';setTimeout(()=>{later.textContent='Test with app closed';refresh()},65000)}else if(r==='exact-permission-required'){text.textContent='Exact alarm access is required for a meaningful closed-app timing test. Tap Enable exact alerts first.';}else{text.textContent=`Background test could not be scheduled reliably (${r}).`;}}catch{ text.textContent='Could not schedule the background test notification.'}});
 exact.addEventListener('click',()=>{try{const r=n.requestExactAlarmAccess();text.textContent=r==='ready'?'Exact alerts are already enabled.':'Android opened Alarms & reminders. Enable Gold Mine, then return here.';setTimeout(refresh,1500)}catch{ text.textContent='Could not open exact alarm settings.'}});
 notifySettings.addEventListener('click',()=>{try{n.openNotificationSettings();text.textContent='Android notification settings opened. Make sure Gold Mine notifications and both alert categories are enabled.';}catch{ text.textContent='Could not open notification settings.'}});
 liveCheck.addEventListener('click',()=>{try{const r=n.runBackgroundCheckNow();text.textContent=r==='queued'?'Live alert evaluation queued now. This checks upcoming news, major macro alerts and strict trade candidates.':'Could not queue the live alert check.';}catch{ text.textContent='Could not queue the live alert check.'}});
 window.addEventListener('focus',()=>setTimeout(refresh,300));refresh();
}
const o=new MutationObserver(()=>install());o.observe(document.body,{childList:true,subtree:true});install();
})();
