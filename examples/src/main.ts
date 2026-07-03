import { createApp } from 'vue';
import { EzoicPlugin } from '@ezoic/vue-sdk';
import App from './App.vue';

// Publishers add `rewardedLoaderUrl` (their Ezoic-hosted rewarded loader) and a
// real Open Video id for production. This demo runs on localhost with neither,
// so ads do not fill and rewarded requests stay pending (nothing drains the
// rewarded queue) — that is expected here; the demo proves wiring and structure,
// not fills.
const app = createApp(App);
app.use(EzoicPlugin, { cmp: true, spa: true });
app.mount('#app');
