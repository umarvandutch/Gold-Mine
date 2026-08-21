# Gold Mine

Gold Mine is a mobile-first US macroeconomic alert and XAUUSD intelligence app.

## Current architecture

Gold Mine is now **web-first** for reliability:

1. `index.html`, `styles.css`, `app.js` and the PWA files are the live application.
2. GitHub Pages deploys the PWA automatically from `main`.
3. `android-shell/` is a deliberately small native Android WebView wrapper that opens the live PWA.
4. Normal UI, methodology and analysis changes therefore update through the web without shipping another APK.

The earlier Expo/React Native source remains as legacy reference, but it is no longer the preferred Android runtime.

## Live URL

After GitHub Pages is enabled: `https://umarvandutch.github.io/Gold-Mine/`

## Data status

The current UI uses clearly-labelled **demo macro and market values**. Production data should flow through a secure backend: FXStreet calendar/webhooks plus XAUUSD, DXY, Treasury-yield and real-yield feeds. API credentials must remain on the backend.

## XAUUSD methodology

Base macro relevance: Fed/rates/guidance 45; inflation 24; labour 16; growth 10. The macro score is then checked against DXY, US 2Y, US 10Y and real-yield reactions. Conflicting evidence lowers conviction rather than forcing a call. “Evidence strength” is not a claimed win probability.

## Updates

The service worker is network-first for navigation and revalidates static files. The Android shell contains almost no business logic and loads the live app over HTTPS, with a local offline/retry screen if the first network load fails.
