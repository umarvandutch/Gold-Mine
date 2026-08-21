package com.goldmine.shell;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
  private static final String HOME_URL="https://umarvandutch.github.io/Gold-Mine/";
  private static final String TRUSTED_HOST="umarvandutch.github.io";
  private WebView webView;
  @Override protected void onCreate(Bundle savedInstanceState){super.onCreate(savedInstanceState);getWindow().setStatusBarColor(Color.rgb(248,247,243));getWindow().setNavigationBarColor(Color.WHITE);getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);webView=new WebView(this);webView.setBackgroundColor(Color.rgb(248,247,243));setContentView(webView);WebSettings s=webView.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setDatabaseEnabled(true);s.setCacheMode(WebSettings.LOAD_DEFAULT);s.setAllowFileAccess(false);s.setAllowContentAccess(false);s.setBuiltInZoomControls(false);s.setDisplayZoomControls(false);s.setSupportZoom(false);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);CookieManager.getInstance().setAcceptCookie(true);CookieManager.getInstance().setAcceptThirdPartyCookies(webView,false);webView.setWebViewClient(new WebViewClient(){@Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){Uri uri=request.getUrl();if("https".equalsIgnoreCase(uri.getScheme())&&TRUSTED_HOST.equalsIgnoreCase(uri.getHost()))return false;try{startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(Exception ignored){}return true;}@Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error){if(request.isForMainFrame())view.loadUrl("file:///android_asset/offline.html");}});if(savedInstanceState==null)webView.loadUrl(HOME_URL);else webView.restoreState(savedInstanceState);}
  @Override protected void onSaveInstanceState(Bundle outState){webView.saveState(outState);super.onSaveInstanceState(outState);}
  @Override public void onBackPressed(){if(webView!=null&&webView.canGoBack())webView.goBack();else super.onBackPressed();}
}
