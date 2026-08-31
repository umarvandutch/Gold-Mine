package com.goldmine.shell;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
  private static final String HOME_URL="https://umarvandutch.github.io/Gold-Mine/";
  private static final String TRUSTED_HOST="umarvandutch.github.io";
  private static final int NOTIFICATION_REQUEST=1001;
  private WebView webView;

  public final class NativeBridge {
    @JavascriptInterface public String notificationStatus(){
      if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return "permission-required";
      return "ready";
    }
    @JavascriptInterface public String exactAlarmStatus(){
      return BackgroundAlertManager.canScheduleExact(getApplicationContext())?"ready":"permission-required";
    }
    @JavascriptInterface public String diagnostics(){
      boolean notifications=Build.VERSION.SDK_INT<33||checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED;
      boolean exact=BackgroundAlertManager.canScheduleExact(getApplicationContext());
      return "notifications="+(notifications?"ready":"blocked")+";exactAlarms="+(exact?"ready":"blocked")+";sdk="+Build.VERSION.SDK_INT;
    }
    @JavascriptInterface public String requestExactAlarmAccess(){
      if(Build.VERSION.SDK_INT<31)return "ready";
      if(BackgroundAlertManager.canScheduleExact(getApplicationContext()))return "ready";
      try{
        runOnUiThread(()->{
          Intent i=new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,Uri.parse("package:"+getPackageName()));
          startActivity(i);
        });
        return "opened-settings";
      }catch(Exception e){return "unavailable";}
    }
    @JavascriptInterface public String openNotificationSettings(){
      try{
        runOnUiThread(()->{
          Intent i=new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE,getPackageName());
          startActivity(i);
        });
        return "opened-settings";
      }catch(Exception e){return "unavailable";}
    }
    @JavascriptInterface public String runBackgroundCheckNow(){
      BackgroundAlertManager.runNow(getApplicationContext());
      return "queued";
    }
    @JavascriptInterface public String scheduleTestNotification(){
      if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED){
        runOnUiThread(()->requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},NOTIFICATION_REQUEST));
        return "permission-required";
      }
      if(Build.VERSION.SDK_INT>=31&&!BackgroundAlertManager.canScheduleExact(getApplicationContext()))return "exact-permission-required";
      String key="test:"+System.currentTimeMillis();
      return BackgroundAlertManager.schedule(getApplicationContext(),System.currentTimeMillis()+60000L,key,"Gold Mine test alert","Background alerts are working. You can receive Gold Mine notifications while the app is closed.");
    }
    @JavascriptInterface public String sendTestNotificationNow(){
      if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED){
        runOnUiThread(()->requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},NOTIFICATION_REQUEST));
        return "permission-required";
      }
      NotificationReceiver.notify(getApplicationContext(),NotificationReceiver.CHANNEL_NEWS,"Gold Mine test alert","Native notifications are enabled and working.",(int)(System.currentTimeMillis()&0x7fffffff));
      return "sent";
    }
  }

  @Override protected void onCreate(Bundle savedInstanceState){
    super.onCreate(savedInstanceState);
    BackgroundAlertManager.start(getApplicationContext());
    NotificationReceiver.ensureChannels(this);
    if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},NOTIFICATION_REQUEST);
    getWindow().setStatusBarColor(Color.rgb(248,247,243));getWindow().setNavigationBarColor(Color.WHITE);getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
    webView=new WebView(this);webView.setBackgroundColor(Color.rgb(248,247,243));setContentView(webView);WebSettings s=webView.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setDatabaseEnabled(true);s.setCacheMode(WebSettings.LOAD_DEFAULT);s.setAllowFileAccess(true);s.setAllowFileAccessFromFileURLs(false);s.setAllowUniversalAccessFromFileURLs(false);s.setAllowContentAccess(false);s.setBuiltInZoomControls(false);s.setDisplayZoomControls(false);s.setSupportZoom(false);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    webView.addJavascriptInterface(new NativeBridge(),"GoldMineNative");
    CookieManager.getInstance().setAcceptCookie(true);CookieManager.getInstance().setAcceptThirdPartyCookies(webView,false);webView.setWebViewClient(new WebViewClient(){@Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){Uri uri=request.getUrl();if("https".equalsIgnoreCase(uri.getScheme())&&TRUSTED_HOST.equalsIgnoreCase(uri.getHost()))return false;try{startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(Exception ignored){}return true;}@Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error){if(request.isForMainFrame())view.loadUrl("file:///android_asset/offline.html");}});if(savedInstanceState==null)webView.loadUrl(HOME_URL);else if(webView.restoreState(savedInstanceState)==null)webView.loadUrl(HOME_URL);
  }
  @Override protected void onSaveInstanceState(Bundle outState){if(webView!=null)webView.saveState(outState);super.onSaveInstanceState(outState);}
  @Override public void onBackPressed(){if(webView!=null&&webView.canGoBack())webView.goBack();else super.onBackPressed();}
}
