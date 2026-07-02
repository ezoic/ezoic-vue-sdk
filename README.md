# @ezoic/vue-sdk

Official [Ezoic](https://www.ezoic.com/) ads SDK for Vue 3.

> **Status: 0.x, in active development.** This package is being built out
> incrementally. It currently ships script management (the `EzoicPlugin`), the
> `useEzoic()` composable, the `<EzoicAd>` display-placeholder component (numeric
> ids and zero-config semantic `location` names), and single-page-app routing
> (`useEzoicPageView()` plus the plugin's `spa`/`router` options), on top of the
> verified foundation (public script URLs, the placeholder DOM contract, and
> shared types). CMP/consent helpers, rewarded ads, and video are on the roadmap
> below.

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
  spa: false, // declare a single-page app at boot (see SPA routing below)
  router: undefined, // a Vue Router instance to auto-hook route changes
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
  /* raw ezstandalone access */
});

// Typed passthroughs to the ezstandalone display methods. Each is queued on
// the command queue, so it is safe to call before the bundle loads.
ezoic.showAds(101, { id: 102, required: true, sizes: ['728x90'] });
ezoic.displayMore(201); // request more placeholders (infinite scroll)
ezoic.destroyPlaceholders(101, 102);
ezoic.destroyAll();
ezoic.refreshAds(101);
ezoic.isEzoicUser(); // A/B group check (false until the bundle loads)
```

## Display ads

Render a placeholder with `<EzoicAd>`. It outputs a bare
`<div id="ezoic-pub-ad-placeholder-<id>">` and requests the ad through the ad
bundle:

```vue
<script setup lang="ts">
import { EzoicAd } from '@ezoic/vue-sdk';
</script>

<template>
  <EzoicAd :id="101" />
  <EzoicAd :id="102" required :sizes="['728x90', '970x250']" />
</template>
```

- **Batched requests.** Every `<EzoicAd>` that mounts in the same tick is
  coalesced into a single `showAds(...)` call carrying all their ids (the ad
  bundle adds its own debounce on top).
- **`id`** must be an integer 1–999. `required` and `sizes` map to the
  `ezstandalone.showAds` object form.
- **Automatic teardown.** Unmounting an `<EzoicAd>` calls
  `destroyPlaceholders(id)`.
- **Duplicate guard.** Mounting two ads with the same id logs a warning and
  only requests the id once.
- **Bare by design.** The placeholder div carries no styling — a `class` or
  `style` on `<EzoicAd>` is intentionally not forwarded to it (Ezoic controls
  sizing). Wrap `<EzoicAd>` in your own element to position it.
- **SSR-safe.** The div renders during server render; the ad request happens
  only on the client after mount.

## Zero-config placements (`location`)

Instead of generating a numeric id in your dashboard, you can place an ad by its
semantic location name. `<EzoicAd>` resolves the name to a reserved placeholder
id for you:

```vue
<script setup lang="ts">
import { EzoicAd } from '@ezoic/vue-sdk';
</script>

<template>
  <EzoicAd location="top_of_page" />
  <EzoicAd location="under_first_paragraph" />
  <EzoicAd location="mid_content" required />
</template>
```

- **`id` or `location`, never both.** Pass exactly one. Passing both, or
  neither, logs a warning and renders nothing.
- **How it resolves.** When the ad bundle has loaded, the SDK uses its
  `GetGeneratedIdAsync(location)` helper (which finds a free slot and can
  allocate a fresh id for a repeated location). Before the bundle is available,
  the SDK resolves the name against its own copy of Ezoic's reserved location
  map, so the placeholder still appears on first paint.
- **Repeated locations get distinct ids.** Two `<EzoicAd location="...">` with
  the same name resolve to different placeholder ids (the second falls to the
  next free in-content slot) rather than colliding.
- **Common names.** `top_of_page`, `under_page_title`, `bottom_of_page`,
  `under_first_paragraph`, `under_second_paragraph`, `mid_content`,
  `long_content`, the `sidebar*` family, and `incontent_5`…`incontent_88`.
  Aliases such as `incontent_0` (→ `under_second_paragraph`) and
  `sidebar_floating` (→ `sidebar_floating_1`) are accepted too. An unrecognized
  name still resolves to a generic in-content slot, with a warning.
- **Client-only.** Because the name resolves on the client, a `location`
  placeholder renders nothing during SSR and appears after mount. Use a numeric
  `id` if you need the div present in the server-rendered HTML.
- **`required` and `sizes`** work exactly as they do with a numeric `id`.

`required`/`sizes`, batching, teardown on unmount, and the bare-div rule all
apply to `location` placeholders just like numeric ones.

## Single-page apps (SPA routing)

In a single-page app the browser never does a full page load between routes, so
Ezoic needs to be told when a new "pageview" begins. The SDK declares SPA mode
(`setIsSinglePageApplication(true)`) at boot and requests the new route's ads on
each navigation. The ad bundle's built-in navigation monitor and its own
debounce coalesce this with the route change, so a navigation fires a single ad
request — the SDK never double-fires.

### Vue Router (recommended)

Pass your router to the plugin. It enables SPA mode and rescans the page for
placeholders after every navigation. Combined with `<EzoicAd>` — whose unmount
tears down the placeholders leaving the page — that is the whole integration:

```ts
import { createApp } from 'vue';
import { EzoicPlugin } from '@ezoic/vue-sdk';
import { router } from './router';
import App from './App.vue';

createApp(App).use(router).use(EzoicPlugin, { router }).mount('#app');
```

Then place `<EzoicAd>` components in your route views as usual. Navigating away
unmounts them (destroying those placeholders); the plugin's post-navigation
rescan requests whatever the new route rendered.

### Router-agnostic core: `useEzoicPageView()`

For a custom router, a non-Vue-Router setup, or explicit per-route control, call
`useEzoicPageView()` with a value that changes on every route change:

```ts
import { useRoute } from 'vue-router';
import { useEzoicPageView } from '@ezoic/vue-sdk';

const route = useRoute();

// Scan mode: on each route change, re-request the ads the new route rendered.
// Pair with <EzoicAd> (its unmount destroys the departing placeholders).
useEzoicPageView(() => route.fullPath);
```

If you render the placeholder `<div>`s yourself instead of using `<EzoicAd>`,
pass the ids present on each route (**managed mode**). On every change the
previous route's ids are destroyed and the current route's ids are requested:

```ts
import { computed } from 'vue';

const ids = computed(() => (route.name === 'article' ? [101, 102] : [201]));
useEzoicPageView(() => route.fullPath, { ids });
```

`useEzoicPageView()` declares SPA mode itself, so you do not also need the
plugin's `spa`/`router` options when you use it. It is SSR-safe (it touches no
`window`, and the watcher never runs during server render) and does not fire on
the initial render — the first pageview is handled by your components mounting
normally.

### Nuxt 3

Register the plugin in a client plugin and drive pageviews from the Nuxt route:

```ts
// plugins/ezoic.client.ts
import { EzoicPlugin } from '@ezoic/vue-sdk';

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(EzoicPlugin, { spa: true });
});
```

```vue
<!-- app.vue (or a layout) -->
<script setup lang="ts">
import { useRoute } from 'vue-router';
import { useEzoicPageView } from '@ezoic/vue-sdk';

const route = useRoute();
useEzoicPageView(() => route.fullPath);
</script>
```

The `.client.ts` suffix keeps script injection out of the server bundle; the
plugin and composable are SSR-safe regardless.

### Infinite scroll and dynamic content

To add ads to content appended within the _same_ pageview (infinite scroll, a
"load more" button, a modal), request just the new ids — do not re-scan or start
a new pageview. Mounting more `<EzoicAd>` components does this automatically; to
do it imperatively, use `displayMore` (or `showAds` with the new ids) from
`useEzoic()`:

```ts
const ezoic = useEzoic();
// After appending divs for placeholders 210 and 211:
ezoic.displayMore(210, 211);
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
  ID_TO_LOCATION, // reserved id → location-name map
  LOCATION_TO_ID, // location name → id (aliases included)
  isKnownLocation, // is a name a documented location/alias?
  type ShowAdsPlaceholder,
} from '@ezoic/vue-sdk';

placeholderDomId(101); // 'ezoic-pub-ad-placeholder-101'
isKnownLocation('under_first_paragraph'); // true
```

Placeholder divs follow Ezoic's DOM contract and carry **no styling** on the
placeholder element itself:

```html
<div id="ezoic-pub-ad-placeholder-101"></div>
```

## Roadmap

1. Package skeleton ✅
2. Plugin + script management (`app.use(EzoicPlugin, options)`) ✅
3. Display ads (`<EzoicAd :id="101" />`) ✅
4. SPA routing (vue-router integration, Nuxt recipe) ✅
5. Zero-config placements (`<EzoicAd location="under_first_paragraph" />`) ✅
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
