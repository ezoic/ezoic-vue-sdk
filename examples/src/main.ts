import { createApp } from 'vue';
import { EzoicPlugin } from '@ezoic/vue-sdk';
import App from './App.vue';

// Rewarded ads need no loader URL here: the SDK bootstraps the Ezoic header
// scripts, so `useEzoicRewarded()` (in App.vue) calls `initRewardedAds(...)` and
// the Ezoic runtime serves the host-correct rewarded loader itself. Whether ads
// fill still depends on this page being served from a domain with live Ezoic
// demand.
const app = createApp(App);
app.use(EzoicPlugin, {
  cmp: true,
  spa: true,
});
app.mount('#app');
