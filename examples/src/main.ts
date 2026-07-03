import { createApp } from 'vue';
import { EzoicPlugin } from '@ezoic/vue-sdk';
import App from './App.vue';

// Whether ads fill and whether rewarded ads work depends on (a) this page
// being served from a domain with live Ezoic demand, and (b) whether this
// build was configured with `VITE_REWARDED_LOADER_URL` — the publisher's
// Ezoic-hosted rewarded loader script, passed through as the plugin's
// `rewardedLoaderUrl` option. The URL is never hardcoded here; it is supplied
// at build time via the env var and is not committed to source.
const rewardedLoaderUrl = import.meta.env.VITE_REWARDED_LOADER_URL?.trim();

const app = createApp(App);
app.use(EzoicPlugin, {
  cmp: true,
  spa: true,
  ...(rewardedLoaderUrl ? { rewardedLoaderUrl } : {}),
});
app.mount('#app');
