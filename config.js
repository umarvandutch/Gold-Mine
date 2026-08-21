// Gold Mine runtime configuration.
// The app remains fully functional with an empty liveWorkerUrl and falls back
// to the free GitHub live-data snapshot. Once the Cloudflare Worker is deployed,
// set this to its /live endpoint, for example:
// https://gold-mine-live.<account>.workers.dev/live
window.GOLD_MINE_CONFIG={
  liveWorkerUrl:""
};
