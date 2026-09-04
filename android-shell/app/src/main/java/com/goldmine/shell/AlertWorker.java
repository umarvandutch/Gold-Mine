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
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;

public class AlertWorker extends Worker {
  private static final String LIVE_URL="https://gold-mine-live.goldmineapp.workers.dev/live";
  private static final String EVENT_KEYS="scheduled-event-keys-v2";
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
  private JSONObject fetchJson(String u)throws Exception{HttpURLConnection c=(HttpURLConnection)new URL(u).openConnection();c.setConnectTimeout(10000);c.setReadTimeout(15000);c.setUseCaches(false);c.setRequestProperty("Accept","application/json");c.setRequestProperty("Cache-Control","no-cache");try(BufferedReader r=new BufferedReader(new InputStreamReader(c.getInputStream()))){StringBuilder s=new StringBuilder();String line;while((line=r.readLine())!=null)s.append(line);return new JSONObject(s.toString());}finally{c.disconnect();}}

  private static long ts(String s){
    if(s==null||s.trim().isEmpty())return 0;String x=s.trim();
    if(x.endsWith("Z"))x=x.substring(0,x.length()-1)+"+0000";else if(x.matches(".*[+-]\\d{2}:\\d{2}$"))x=x.substring(0,x.length()-3)+x.substring(x.length()-2);
    String[] patterns={"yyyy-MM-dd'T'HH:mm:ss.SSSZ","yyyy-MM-dd'T'HH:mm:ssZ","yyyy-MM-dd'T'HH:mmZ"};
    for(String pattern:patterns){try{SimpleDateFormat f=new SimpleDateFormat(pattern,Locale.US);f.setLenient(false);Date d=f.parse(x);if(d!=null)return d.getTime();}catch(Exception ignored){}}
    return 0;
  }
  private static String fmt(long ms,String zone,String pattern){SimpleDateFormat f=new SimpleDateFormat(pattern,Locale.UK);f.setTimeZone(TimeZone.getTimeZone(zone));return f.format(new Date(ms));}
  private static String dualTime(long ms){return "UK "+fmt(ms,"Europe/London","EEE d MMM, HH:mm z")+" · US "+fmt(ms,"America/New_York","EEE d MMM, h:mm a z");}

  private void scheduleUpcoming(JSONObject data,SharedPreferences p){
    JSONArray events=data.optJSONArray("events");if(events==null)return;long now=System.currentTimeMillis();Set<String> current=new HashSet<>();
    for(int i=0;i<events.length();i++){
      JSONObject e=events.optJSONObject(i);if(e==null)continue;String vol=e.optString("volatility","").toUpperCase(Locale.US);if(!"HIGH".equals(vol)&&!"MEDIUM".equals(vol))continue;long t=ts(e.optString("dateUtc",""));if(t<=now||t-now>72L*3600000L)continue;String key=e.optString("id",e.optString("name","event"))+"|15m",name=e.optString("name","US economic release");long when=t-15*60000L;
      if(when>now+5000){current.add(key);String title="HIGH".equals(vol)?"High-impact news in 15 minutes":"US data in 15 minutes";String body=name+" · "+dualTime(t)+". XAUUSD volatility can jump around the release; check the live model before trading.";BackgroundAlertManager.schedule(getApplicationContext(),when,key,title,body);}
      else if(t>now&&t-now<=15*60000L&&allowed()){
        String lateKey="late:"+key+":"+e.optString("dateUtc","");if(!p.getBoolean(lateKey,false)){p.edit().putBoolean(lateKey,true).apply();long mins=Math.max(1,(t-now+59999)/60000);NotificationReceiver.notify(getApplicationContext(),NotificationReceiver.CHANNEL_NEWS,"News in "+mins+" minute"+(mins==1?"":"s"),name+" · "+dualTime(t)+". Release-risk gate is active.",lateKey.hashCode());}
      }
    }
    Set<String> old=new HashSet<>(p.getStringSet(EVENT_KEYS,new HashSet<String>()));for(String key:old)if(!current.contains(key))BackgroundAlertManager.cancel(getApplicationContext(),key);p.edit().putStringSet(EVENT_KEYS,current).apply();
  }

  private void majorHeadline(JSONObject data,SharedPreferences p){
    if(!allowed())return;JSONArray h=data.optJSONArray("headlines");if(h==null)return;long now=System.currentTimeMillis();
    for(int i=0;i<Math.min(16,h.length());i++){JSONObject x=h.optJSONObject(i);if(x==null||!"high".equalsIgnoreCase(x.optString("impact")))continue;long published=ts(x.optString("publishedUtc","")),age=now-published;if(published<=0||age<0||age>30*60000L)continue;String key="headline:"+x.optString("url",x.optString("title"));if(p.getBoolean(key,false))continue;p.edit().putBoolean(key,true).apply();String body=x.optString("title","Important US macro headline")+" · "+dualTime(published)+". Open Gold Mine for the simple explanation and live signal check.";NotificationReceiver.notify(getApplicationContext(),NotificationReceiver.CHANNEL_NEWS,"Major XAUUSD macro alert",body,key.hashCode());break;}
  }

  private void tradeCandidate(JSONObject data,SharedPreferences p){
    if(!allowed())return;JSONObject signals=data.optJSONObject("signals");if(signals==null)return;JSONObject buy=signals.optJSONObject("buyLimit"),sell=signals.optJSONObject("sellLimit"),s=isCandidate(buy)?buy:isCandidate(sell)?sell:null;if(s==null)return;String side=s==buy?"BUY":"SELL",generated=s.optString("generatedAt",signals.optString("generatedAt",""));long generatedAt=ts(generated);if(generatedAt<=0||System.currentTimeMillis()-generatedAt>12*60000L)return;String key="trade:"+side+":"+s.optString("limitPrice")+":"+generated;if(p.getBoolean(key,false))return;p.edit().putBoolean(key,true).apply();int quality=s.has("setupQualityScore")?s.optInt("setupQualityScore",0):s.optInt("confidenceScore",0);String body=side+" limit setup candidate near "+s.optString("limitPrice","the current zone")+". Setup quality "+quality+"/100. Re-open Gold Mine and refresh before placing any order.";NotificationReceiver.notify(getApplicationContext(),NotificationReceiver.CHANNEL_TRADE,"Gold Mine trade setup candidate",body,key.hashCode());
  }
  private boolean isCandidate(JSONObject s){if(s==null||!"candidate".equalsIgnoreCase(s.optString("status")))return false;JSONArray blockers=s.optJSONArray("blockers");return blockers==null||blockers.length()==0;}
}
