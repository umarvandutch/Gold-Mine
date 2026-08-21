# Gold Mine live data

The live PWA uses a free, best-effort data pipeline:

- FXStreet public web calendar feed for all US economic calendar events and Actual / Consensus / Previous values.
- Federal Reserve and BLS official RSS feeds plus broader Google News RSS macro searches for context.
- Stooq free quote snapshots for gold, DXY and Treasury-yield proxies when available.
- GitHub Actions refreshes `live-data.json` roughly every 10 minutes and commits only when material data changes.
- The PWA fetches `live-data.json` directly from the repository so data updates do not require a new APK or Pages deployment.

Free sources may be delayed, incomplete or change without notice. The app labels this clearly and falls back safely instead of presenting sample numbers as live.
