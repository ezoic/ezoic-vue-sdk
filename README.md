# @ezoic/vue-sdk

Official [Ezoic](https://www.ezoic.com/) ads SDK for Vue 3.

> **Status: 0.x, in active development.** This package is being built out
> incrementally. It currently ships script management (the `EzoicPlugin`) and
> the `useEzoic()` composable, on top of the verified foundation (public script
> URLs, the placeholder DOM contract, and shared types). The `<EzoicAd>`
> component, single-page-app routing, CMP/consent helpers, rewarded ads, and
> video are on the roadmap below.

## Install

```sh
npm install @ezoic/vue-sdk
```

`vue` `^3.4` is a peer dependency.

## Setup

Install the plugin once, when you create the app. It injects the Ezoic scripts
in the required order — the Gatekeeper CMP consent scripts first (with
`data-cfasync="false"`), then the ad command-queue stub, then the async
standalone ad bundle:

```ts
import { createApp } from 'vue';
import { EzoicPlugin } from '@ezoic/vue-sdk';
import App from './App.vue';

createApp(App).use(EzoicPlugin).mount('#app');
```

Injection is idempotent (scripts are never double-added, and any Ezoic scripts
already present in your HTML are left alone) and SSR-safe — during server render
no `window` or `document` is touched, so it works under Nuxt 3.

### Options

```ts
app.use(EzoicPlugin, {
  cmp: true, // inject the Gatekeeper CMP scripts (default true)
  analyticsScriptUrl: undefined, // optional analytics loader, injected last
});
```

Disable `cmp` only if you manage consent with your own CMP.

### `useEzoic()`

From any component, `useEzoic()` returns the runtime API:

```ts
import { useEzoic } from '@ezoic/vue-sdk';

const ezoic = useEzoic();

// Reactive: true once the ad bundle has initialized on the client.
ezoic.ready;

// Queue work on the ezstandalone command queue (runs after init, or
// immediately if init already completed). No-op during SSR.
ezoic.push(() => {
  // e.g. ezstandalone.showAds(...) once display support lands
});
```

## Foundation exports

The SDK also exposes the low-level building blocks:

```ts
import {
  STANDALONE_SCRIPT_URL, // https://www.ezojs.com/ezoic/sa.min.js
  CMP_SCRIPT_URLS, // Gatekeeper consent scripts, in load order
  PLACEHOLDER_ID_PREFIX, // 'ezoic-pub-ad-placeholder-'
  isValidPlaceholderId, // integer 1–999 check
  placeholderDomId, // e.g. placeholderDomId(101)
  type ShowAdsPlaceholder,
} from '@ezoic/vue-sdk';

placeholderDomId(101); // 'ezoic-pub-ad-placeholder-101'
```

Placeholder divs follow Ezoic's DOM contract and carry **no styling** on the
placeholder element itself:

```html
<div id="ezoic-pub-ad-placeholder-101"></div>
```

## Roadmap

1. Package skeleton ✅
2. Plugin + script management (`app.use(EzoicPlugin, options)`) ✅
3. Display ads (`<EzoicAd :id="101" />`)
4. SPA routing (vue-router integration, Nuxt recipe)
5. Zero-config placements (`<EzoicAd location="under_first_paragraph" />`)
6. CMP/consent + typed `config()`
7. Rewarded ads (`useEzoicRewarded()`)
8. Video (`<EzoicVideo>`, `<HumixVideo>`)
9. Docs + demo app

See [CHANGELOG.md](./CHANGELOG.md) for released changes.

## Development

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

Requires Node 20+ (Node 22 recommended; see `.nvmrc`).

## Reference

Ezoic ads integration docs: https://docs.ezoic.com/docs/ezoicads/integration/

## License

[MIT](./LICENSE)
