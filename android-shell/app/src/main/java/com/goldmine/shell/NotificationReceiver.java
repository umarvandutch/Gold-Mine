package com.goldmine.shell;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.NotificationCompat;

public class NotificationReceiver extends BroadcastReceiver {
  public static final String CHANNEL_NEWS="goldmine_news";
  public static final String CHANNEL_TRADE="goldmine_trade";

  public static void ensureChannels(Context context){
    if(Build.VERSION.SDK_INT<Build.VERSION_CODES.O)return;
    NotificationManager nm=context.getSystemService(NotificationManager.class);
    NotificationChannel news=new NotificationChannel(CHANNEL_NEWS,"Important market news",NotificationManager.IMPORTANCE_HIGH);
    news.setDescription("High-impact US news and major macro alerts for XAUUSD.");
    NotificationChannel trade=new NotificationChannel(CHANNEL_TRADE,"Trade setup alerts",NotificationManager.IMPORTANCE_HIGH);
    trade.setDescription("Fresh Gold Mine setup candidates and trade-ready condition alerts.");
    nm.createNotificationChannel(news);nm.createNotificationChannel(trade);
  }

  public static void notify(Context context,String channel,String title,String body,int id){
    if(Build.VERSION.SDK_INT>=33&&context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return;
    ensureChannels(context);
    Intent open=new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
    PendingIntent pi=PendingIntent.getActivity(context,id,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    NotificationCompat.Builder b=new NotificationCompat.Builder(context,channel)
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .setContentTitle(title).setContentText(body).setStyle(new NotificationCompat.BigTextStyle().bigText(body))
      .setPriority(NotificationCompat.PRIORITY_HIGH).setCategory(NotificationCompat.CATEGORY_ALARM)
      .setAutoCancel(true).setContentIntent(pi);
    context.getSystemService(NotificationManager.class).notify(id,b.build());
  }

  @Override public void onReceive(Context context,Intent intent){
    String title=intent.getStringExtra("title"),body=intent.getStringExtra("body"),channel=intent.getStringExtra("channel");
    int id=intent.getIntExtra("id",(int)(System.currentTimeMillis()&0x7fffffff));
    notify(context,channel==null?CHANNEL_NEWS:channel,title==null?"Gold Mine alert":title,body==null?"Important XAUUSD update":body,id);
  }
}
