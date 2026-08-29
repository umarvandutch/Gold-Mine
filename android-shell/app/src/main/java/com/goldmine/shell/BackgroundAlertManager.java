package com.goldmine.shell;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import java.util.concurrent.TimeUnit;

public final class BackgroundAlertManager {
  private BackgroundAlertManager(){}
  public static final String WORK_NAME="goldmine-live-alerts";

  public static void start(Context context){
    NotificationReceiver.ensureChannels(context);
    Constraints constraints=new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
    PeriodicWorkRequest request=new PeriodicWorkRequest.Builder(AlertWorker.class,15,TimeUnit.MINUTES)
      .setConstraints(constraints).build();
    WorkManager.getInstance(context).enqueueUniquePeriodicWork(WORK_NAME,ExistingPeriodicWorkPolicy.UPDATE,request);
  }

  public static void schedule(Context context,long whenMs,String key,String title,String body){
    if(whenMs<=System.currentTimeMillis()+5000)return;
    Intent i=new Intent(context,NotificationReceiver.class)
      .putExtra("title",title).putExtra("body",body).putExtra("channel",NotificationReceiver.CHANNEL_NEWS).putExtra("id",key.hashCode());
    PendingIntent pi=PendingIntent.getBroadcast(context,key.hashCode(),i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    AlarmManager am=(AlarmManager)context.getSystemService(Context.ALARM_SERVICE);
    try{
      if(android.os.Build.VERSION.SDK_INT>=31&&am.canScheduleExactAlarms())am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,whenMs,pi);
      else if(android.os.Build.VERSION.SDK_INT>=23)am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,whenMs,pi);
      else am.set(AlarmManager.RTC_WAKEUP,whenMs,pi);
    }catch(SecurityException e){am.set(AlarmManager.RTC_WAKEUP,whenMs,pi);}
  }
}
