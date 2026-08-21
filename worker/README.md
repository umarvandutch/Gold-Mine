# Gold Mine free live Worker

This Cloudflare Worker is an optional free acceleration layer for Gold Mine. The PWA continues to work without it.

## What it does

- Directly re-queries the FXStreet public US economic calendar.
- Directly re-queries Federal Reserve and BLS RSS feeds plus broader US macro/gold-sensitive RSS searches.
- Keeps the existing GitHub `live-data.json` as a fallback and for market fields that are not safely available from the Worker.
- Caches normal requests for only 20 seconds.
- `GET /live?fresh=1` bypasses the short Worker cache and performs a new source query, which is intended for manual pull-to-refresh.
- A one-minute Cron Trigger warms the free cache when Cloudflare scheduling is enabled.

## Safety / cost

No paid data service is required. Do not add paid APIs or billing-dependent services without explicit approval from the repository owner.

The Worker is deliberately public-data only and contains no API keys or secrets.

## Deploy later

Once Cloudflare is connected, deploy the `worker/` directory with Wrangler. After deployment, set `liveWorkerUrl` in `/config.js` to the Worker `/live` URL. Until then, leave it blank and Gold Mine automatically uses the existing GitHub snapshot.
