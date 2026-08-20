# Gold Mine

A light-theme Expo / React Native mobile app for US macro-economic alerts and evidence-based XAUUSD analysis.

## What is included

- US-only economic release feed
- Actual / consensus / previous figures
- Plain-English explanation of what happened, what it means for the economy and likely USD implications
- FOMC / interest-rate decisions explicitly ranked as the highest-priority macro events
- XAUUSD evidence model using transparent weights rather than opaque or random signals
- DXY, US 10Y and real-yield confirmation factors in the model
- Calendar, release detail, prediction and settings tabs
- Safe demo fallback while a live backend is not configured
- Expo/EAS configuration for iOS and Android

## Important modelling principle

The prediction tab is a **rough, evidence-based decision-support guide**. The number shown is *evidence strength*, not a claimed trade win probability. Mixed evidence returns a neutral/mixed signal instead of forcing a long or short call.

Interest-rate decisions, FOMC statement tone, dot plots and major Fed guidance receive the highest macro weight because they can directly reprice Treasury yields, real yields and the USD — all major XAUUSD drivers.

## Run on a phone

This project intentionally uses Expo SDK 54 so it can be tested easily with Expo Go on a physical device during the current SDK transition.

```bash
npm install
npx expo start
```

Scan the QR code with Expo Go.

## Live FXStreet integration

The app currently starts in demo mode. Set:

```bash
EXPO_PUBLIC_MACRO_API_BASE=https://your-secure-backend.example.com
```

The mobile app expects a backend endpoint such as:

```text
GET /releases?country=US
```

Do **not** place an FXStreet OAuth client secret in the mobile app or in any `EXPO_PUBLIC_*` variable. The FXStreet API authentication and webhook handling should live on a server/serverless backend. The backend should normalise FXStreet occurrences into the `MacroRelease` shape used by `src/data/releases.ts`.

## Next production steps

1. Deploy a small secure backend for FXStreet OAuth + webhook ingestion.
2. Add a real-time market feed for XAUUSD, DXY, US 10Y and 10Y TIPS/real yields.
3. Replace demo market-reaction values in `src/lib/prediction.ts` with live observations.
4. Add Expo push notifications for new US releases.
5. Back-test the deterministic weighting model on historical releases and store measured hit rates separately from live evidence strength.

## Build an Android APK

After configuring EAS:

```bash
npx eas build --platform android --profile preview
```

## Disclaimer

For research and decision support only. This app does not guarantee market direction or investment returns and is not financial advice.
