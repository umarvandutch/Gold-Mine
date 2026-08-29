package com.goldmine.shell;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.time.Instant;

public class AlertWorker extends Worker {
  private static final String LIVE_URL="https://gold-mine-live.goldmineapp.workers.dev/live";
  public AlertWorker(@NonNull Context appContext,@NonNull WorkerParameters params){super(appContext,params);}

  @NonNull @Override public Result doWork(){
    try{
      JSONObject data=fetchJson(LIVE_URL+"?background=1&t="+System.currentTimeMillis());
      SharedPreferences p=getApplicationContext().getSharedPreferences("goldmine-alerts",Context.MODE_PRIVATE);
      scheduleUpcoming(data,p);
      majorHeadline(data,p);
      tradeCandidate(data,p);
      return Result.success();
    }catch(Exception e){return Result.retry();}
  }

  private boolean allowed(){return Build.VERSION.SDK_INT<33||getApplicationContext().checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED;}
  private JSONObject fetchJson(String u)throws Exception{HttpURLConnection c=(HttpURLConnection)new URL(u).openConnection();c.setConnectTimeout(10000);c.setReadTimeout(15000);c.setRequestProperty("Accept","application/json");try(BufferedReader r=new BufferedReader(new InputStreamReader(c.getInputStream()))){StringBuilder s=new StringBuilder();String line;while((line=r.readLine())!=null)s.append(line);return new JSONObject(s.toString());}finally{c.disconnect();}}
  private static long ts(String s){try{return Instant.parse(s).toEpochMilli();}catch(Exception e){return 0;}}

  private void scheduleUpcoming(JSONObject data,SharedPreferences p){
    JSONArray events=data.optJSONArray("events");if(events==null)return;long now=System.currentTimeMillis();
    for(int i=0;i<events.length();i++){JSONObject e=events.optJSONObject(i);if(e==null)continue;String vol=e.optString("volatility","").toUpperCase(),name=e.optString("name","US economic release");long t=ts(e.optString("dateUtc",""));if(t<=now||t-now>48L*3600000L)continue;boolean high="HIGH".equals(vol),critical=name.toLowerCase().matches(".*(fomc|rate decision|powell|cpi|non.?farm|payroll).*" );
      if(high||critical){scheduleEvent(e,t-30*60000L,"30m",30);scheduleEvent(e,t-10*60000L,"10m",10);}else if("MEDIUM".equals(vol))scheduleEvent(e,t-10*60000L,"10m",10);
    }
  }
  private void scheduleEvent(JSONObject e,long when,String suffix,int mins){String id=e.optString("id",e.optString("name","event"))+"|"+e.optString("dateUtc","")+"|"+suffix;String title=(mins==10?"News in 10 minutes":"High-impact news in 30 minutes");String body=e.optString("name","US economic release")+" is due soon. XAUUSD volatility may increase — avoid entering blindly before the release.";BackgroundAlertManager.schedule(getApplicationContext(),when,id,title,body);}

  private void majorHeadline(JSONObject data,SharedPreferences p){if(!allowed())return;JSONArray h=data.optJSONArray("headlines");if(h==null)return;long now=System.currentTimeMillis();for(int i=0;i<Math.min(12,h.length());i++){JSONObject x=h.optJSONObject(i);if(x==null||!"high".equalsIgnoreCase(x.optString("impact")))continue;long age=now-ts(x.optString("publishedUtc",""));if(age<0||age>25*60000L)continue;String key="headline:"+x.optString("url",x.optString("title"));if(p.getBoolean(key,false))continue;p.edit().putBoolean(key,true).apply();NotificationReceiver.notify(getApplicationContext(),NotificationReceiver.CHANNEL_NEWS,"Major XAUUSD macro alert",x.optString("title","Important US macro headline"),key.hashCode());break;}}

  private void tradeCandidate(JSONObject data,SharedPreferences p){if(!allowed())return;JSONObject signals=data.optJSONObject("signals");if(signals==null)return;JSONObject buy=signals.optJSONObject("buyLimit"),sell=signals.optJSONObject("sellLimit");JSONObject s=isCandidate(buy)?buy:isCandidate(sell)?sell:null;if(s==null)return;String side=s==buy?"BUY":"SELL",generated=s.optString("generatedAt",signals.optString("generatedAt",""));if(System.currentTimeMillis()-ts(generated)>10*60000L)return;String key="trade:"+side+":"+s.optString("limitPrice")+":"+generated;if(p.getBoolean(key,false))return;p.edit().putBoolean(key,true).apply();String body=side+" limit setup candidate detected near "+s.optString("limitPrice","the current zone")+". Conviction "+s.optInt("confidenceScore",0)+"/100. Re-open Gold Mine and re-check before placing any order.";NotificationReceiver.notify(getApplicationContext(),NotificationReceiver.CHANNEL_TRADE,"Gold Mine trade setup candidate",body,key.hashCode());}
  private boolean isCandidate(JSONObject s){if(s==null||!"candidate".equalsIgnoreCase(s.optString("status")))return false;JSONArray blockers=s.optJSONArray("blockers");return blockers==null||blockers.length()==0;}
}
