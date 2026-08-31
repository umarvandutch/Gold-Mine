package com.goldmine.shell;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import java.util.concurrent.TimeUnit;

public final class BackgroundAlertManager {
  private BackgroundAlertManager(){}
  public static final String WORK_NAME="goldmine-live-alerts";
  public static final String IMMEDIATE_WORK_NAME="goldmine-live-alerts-now";

  private static Constraints networkConstraints(){
    return new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
  }

  public static void start(Context context){
    NotificationReceiver.ensureChannels(context);
    WorkManager wm=WorkManager.getInstance(context);
    PeriodicWorkRequest periodic=new PeriodicWorkRequest.Builder(AlertWorker.class,15,TimeUnit.MINUTES)
      .setConstraints(networkConstraints()).build();
    wm.enqueueUniquePeriodicWork(WORK_NAME,ExistingPeriodicWorkPolicy.UPDATE,periodic);
    runNow(context);
  }

  public static void runNow(Context context){
    OneTimeWorkRequest now=new OneTimeWorkRequest.Builder(AlertWorker.class)
      .setConstraints(networkConstraints()).build();
    WorkManager.getInstance(context).enqueueUniqueWork(IMMEDIATE_WORK_NAME,ExistingWorkPolicy.REPLACE,now);
  }

  public static boolean canScheduleExact(Context context){
    if(Build.VERSION.SDK_INT<31)return true;
    AlarmManager am=(AlarmManager)context.getSystemService(Context.ALARM_SERVICE);
    return am!=null&&am.canScheduleExactAlarms();
  }

  public static String schedule(Context context,long whenMs,String key,String title,String body){
    if(whenMs<=System.currentTimeMillis()+5000)return "too-soon";
    Intent i=new Intent(context,NotificationReceiver.class)
      .putExtra("title",title).putExtra("body",body).putExtra("channel",NotificationReceiver.CHANNEL_NEWS).putExtra("id",key.hashCode());
    PendingIntent pi=PendingIntent.getBroadcast(context,key.hashCode(),i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    AlarmManager am=(AlarmManager)context.getSystemService(Context.ALARM_SERVICE);
    if(am==null)return "unavailable";
    try{
      if(Build.VERSION.SDK_INT>=31){
        if(am.canScheduleExactAlarms()){
          am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,whenMs,pi);
          return "exact";
        }
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,whenMs,pi);
        return "inexact";
      }
      if(Build.VERSION.SDK_INT>=23){
        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,whenMs,pi);
        return "exact";
      }
      am.setExact(AlarmManager.RTC_WAKEUP,whenMs,pi);
      return "exact";
    }catch(SecurityException e){
      try{am.set(AlarmManager.RTC_WAKEUP,whenMs,pi);return "inexact";}catch(Exception ignored){return "failed";}
    }
  }
}
