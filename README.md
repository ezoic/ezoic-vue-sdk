# @ezoic/vue-sdk

Official [Ezoic](https://www.ezoic.com/) ads SDK for Vue 3.

> **Status: 0.x, in active development.** This package is being built out
> incrementally. It currently ships script management (the `EzoicPlugin`), the
> `useEzoic()` composable, the `<EzoicAd>` display-placeholder component (numeric
> ids and zero-config semantic `location` names), single-page-app routing
> (`useEzoicPageView()` plus the plugin's `spa`/`router` options), CMP/consent
> helpers (`useEzoicConsent()` plus `config()` and the format toggles), and
> rewarded ads (`useEzoicRewarded()` plus `initRewardedAds()` and the plugin's
> `rewardedLoaderUrl` option), and video (`<EzoicVideo>` for ad-bundle video
> placeholders and `<EzoicVideoEmbed>` for Open Video inline embeds), on top of
> the verified foundation (public script URLs, the placeholder DOM contract, and
> shared types).

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
ezoic.showAds(
  { id: 101, required: true, sizes: ['728x90', '320x50'] },
  { id: 102, required: true, sizes: ['300x250'] },
);
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
  <EzoicAd :id="910" />
  <EzoicAd :id="911" :sizes="['728x90', '970x250']" />
</template>
```

- **`sizes` is optional for numeric ids.** A numeric `id` is a dashboard
  placeholder whose sizing can be set in your Ezoic dashboard. Pass `sizes`
  only when you want to force specific sizes; the SDK does not warn when a
  numeric `id` is shown without `sizes`.
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
  <EzoicAd location="top_of_page" :sizes="['728x90', '320x50']" />
  <EzoicAd location="under_first_paragraph" :sizes="['300x250']" />
  <EzoicAd location="mid_content" :sizes="['300x250']" />
</template>
```

- **`id` or `location`, never both.** Pass exactly one. Passing both, or
  neither, logs a warning and renders nothing.
- **`location` placements default `required: true`.** That is what marks them
  zero-config server-side (the Ezoic ad server only treats a 900-range id as zero-config when it
  is required). Opt out with `:required="false"`. Numeric `id` placements keep
  `required` defaulting to `false`.
- **`location` placements must pass `sizes`.** Unlike a numeric dashboard `id`,
  a zero-config 900-range placeholder has no dashboard sizing, so the `sizes`
  you pass are what create the ad's placements; the SDK warns loudly in dev
  when `sizes` is omitted.
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
- **`sizes`** uses the same `"<width>x<height>"` shape as a numeric `id`, but
  here it is required rather than optional (there is no dashboard sizing to fall
  back on). `required` differs only in its default (see above).

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
ezoic.displayMore(
  { id: 210, required: true, sizes: ['300x250'] },
  { id: 211, required: true, sizes: ['300x250'] },
);
```

## Consent and configuration

### Configuration (`config`)

`useEzoic().config(options)` forwards publisher configuration to the ad bundle.
Only the documented keys are accepted — the bundle logs an error and ignores
anything else, so the options are a closed, typed set:

```ts
const ezoic = useEzoic();

ezoic.config({
  anchorAdPosition: 'bottom', // anchor ad position (default 'bottom')
  anchorAdExpansion: true, // opt in to anchor expansion
  disableVideo: false,
  disableInterstitial: false,
  disableLeftSideRail: false,
  disableRightSideRail: false,
  disableSidebarFloating: false,
  reservePlaceholderSpace: true, // reserve space to reduce layout shift (CLS)
  limitCookies: false,
  vignetteDesktop: false,
  vignetteMobile: false,
  vignetteTablet: false,
});
```

`config` is **write-only**: the underlying `ezstandalone.config` wrapper returns
nothing, so there is no getter form. Read the effective format state through the
specific queries below.

### Format toggles

```ts
const ezoic = useEzoic();

ezoic.setEzoicAnchorAd(true); // enable the anchor (sticky) ad
ezoic.setInterstitialAllowed(false); // block the interstitial format
await ezoic.setOutstreamAllowed(true); // → effective allowed state (Promise<boolean>)

// Synchronous queries. These return the bundle's live value once it has loaded,
// and `false` before then — query them after `ezoic.ready` is true.
ezoic.hasAnchorAdBeenClosed();
ezoic.isInterstitialAllowed();
ezoic.isOutstreamAllowed();
```

### Consent

The plugin injects the Ezoic Gatekeeper CMP scripts before the ad bundle by
default (see [Setup](#setup)). These passthroughs let you signal consent
preferences to the bundle:

```ts
const ezoic = useEzoic();

ezoic.enableConsent(); // publisher is managing consent this pageview
ezoic.setDisablePersonalizedStatistics(true);
ezoic.setDisablePersonalizedAds(true);
```

### Reading TCF consent state (`useEzoicConsent`)

`useEzoicConsent()` is a reactive view of the IAB TCF v2.2 consent state
published by the active CMP through `window.__tcfapi`. It works with the Ezoic
Gatekeeper CMP or any TCF CMP on the page, is SSR-safe, and cleans up its
listener on unmount:

```vue
<script setup lang="ts">
import { useEzoicConsent } from '@ezoic/vue-sdk';

const { tcfLoaded, consentString, gdprApplies, eventStatus } =
  useEzoicConsent();
// tcfLoaded    → true once a final TC string is ready (tcloaded/useractioncomplete)
// consentString→ the IAB TC string, or null until the CMP provides one
// gdprApplies  → boolean | undefined (undefined until the CMP decides)
// eventStatus  → latest TCF eventStatus, or null
</script>

<template>
  <p v-if="tcfLoaded">Consent captured (GDPR applies: {{ gdprApplies }}).</p>
  <p v-else>Waiting for the consent manager…</p>
</template>
```

## Rewarded ads

Rewarded ads let a visitor opt in to watch an ad in exchange for a reward (unlock
content, in-game currency, etc.). They use a separate, publisher-specific loader
script, so enable them by passing its URL to the plugin:

```ts
import { createApp } from 'vue';
import { EzoicPlugin } from '@ezoic/vue-sdk';
import App from './App.vue';

createApp(App)
  .use(EzoicPlugin, {
    // Your publisher-specific rewarded loader. Find the exact host in your
    // Ezoic dashboard / integration docs — it is served from your Ezoic ad
    // host (e.g. https://go.ezodn.com/...), not a fixed URL.
    rewardedLoaderUrl:
      'https://YOUR-EZOIC-LOADER-HOST/porpoiseant/ezadloadrewarded.js',
  })
  .mount('#app');
```

The loader is injected async, after the standalone bundle, and only when the
option is set. Injection is idempotent and SSR-safe.

### `useEzoicRewarded()`

The composable wraps `window.ezRewardedAds`. Each callback-style method returns
a Promise that settles when the ad flow resolves (including no-fill and
cancellation — no timers are involved), and a reactive `status` tracks the
lifecycle (`idle` → `initiated` → `displayed` → `closed`):

```vue
<script setup lang="ts">
import { useEzoicRewarded } from '@ezoic/vue-sdk';

const { requestAndShow, status, ready } = useEzoicRewarded();

async function unlock() {
  const r = await requestAndShow({ rewardName: 'premium_article' });
  if (r.reward) {
    // grant the reward — the visitor watched the ad
  }
}
</script>

<template>
  <button :disabled="!ready" @click="unlock">Watch an ad to unlock</button>
  <p>Rewarded status: {{ status }}</p>
</template>
```

If you inject the loader yourself instead of via the plugin, pass its URL to the
composable: `useEzoicRewarded({ loaderUrl: '…/porpoiseant/ezadloadrewarded.js' })`.
Either way the composable shares the same `ezRewardedAds` global.

The full method set: `register()` (fire-and-forget pageview tracking),
`request(config?)`, `show(config?)`, `requestAndShow(config?)`,
`requestWithOverlay(text?, config?)`, and `contentLocker(action, config?)`. When
rewarded ads are unavailable (no browser, or the loader is not present) the
promises resolve a typed failure (`status: false`) rather than rejecting.

### Content locker

`contentLocker` gates content behind a rewarded ad. `action` is either a URL to
redirect to, or a function to run, once the reward is earned; the returned
Promise resolves with the request result when the ad is ready:

```ts
const { contentLocker } = useEzoicRewarded();

// Run a callback after the reward is earned:
await contentLocker(() => revealArticle(), { rewardName: 'premium_article' });

// …or redirect to a URL after the reward is earned:
await contentLocker('https://example.com/premium');
```

### Site-wide setup: `initRewardedAds()`

The ambient rewarded formats (anchor, interstitial, video, side rails) are
declared once via `initRewardedAds()`, which lives on `useEzoic()` (it is an
`ezstandalone` method, not part of `useEzoicRewarded`). Each format defaults to
`true`:

```ts
const ezoic = useEzoic();
ezoic.initRewardedAds(); // enable all four
ezoic.initRewardedAds({ video: false }); // enable all except video
```

## Video

The SDK ships two independent video paths.

### Ezoic video placeholders (`<EzoicVideo>`)

`<EzoicVideo>` renders an Ezoic video-ad placeholder driven by the ad bundle. It
requires the plugin (see [Setup](#setup)) and uses a **publisher-chosen** div id
(not the numeric `ezoic-pub-ad-placeholder-<n>` display convention). On mount it
loads the video ad code; on unmount it tears the placeholder down.

```vue
<script setup lang="ts">
import { EzoicVideo } from '@ezoic/vue-sdk';
</script>

<template>
  <!-- Publisher-chosen div id. Wrap it to size/position the placeholder. -->
  <div class="video-slot">
    <EzoicVideo :div-id="'my-video-slot'" />
  </div>
</template>
```

- **`div-id`** is required and is your own string id. It is rendered verbatim as
  the placeholder div's `id`.
- **One call loads it.** On mount the SDK calls `displayMoreVideo(divId)`, which
  both registers the id and loads its ad code in a single call.
- **Automatic teardown.** Unmounting calls `destroyVideoPlaceholders(divId)`
  while the div is still in the DOM, so the id is released cleanly and can be
  reused on a remount.
- **Duplicate guard.** Mounting two `<EzoicVideo>` with the same `div-id` logs a
  warning and loads the video only once.
- **Bare by design.** Like `<EzoicAd>`, the placeholder div carries no styling
  (`class`/`style` on `<EzoicVideo>` is not forwarded). Wrap it to position it.
- **SSR-safe.** The div renders during server render; the load runs only on the
  client after mount.

For advanced register-now / load-on-pageview flows, `useEzoic()` also exposes
`defineVideo(...)` (register-only — it does not load), `displayMoreVideo(...)`,
and `destroyVideoPlaceholders(...)` directly.

### Open Video embeds (`<EzoicVideoEmbed>`)

`<EzoicVideoEmbed>` renders an Open Video inline embed. It is **self-contained**
— it does not require the plugin and injects the Open Video script itself — so
you can drop it in anywhere:

```vue
<script setup lang="ts">
import { EzoicVideoEmbed } from '@ezoic/vue-sdk';
</script>

<template>
  <EzoicVideoEmbed video-id="abc123" :float="true" :autoplay="false" />
</template>
```

- **`video-id`** is required — the publisher video id to play.
- **`float`** and **`autoplay`** are the supported options (there is no `loop`).
  Each is optional and passed through to the embed only when you set it;
  otherwise the embed's own default applies.
- **Publisher container.** The rendered container is yours to size and position,
  so a `class`/`style` on `<EzoicVideoEmbed>` _is_ applied to it.
- **Self-injecting.** On mount it injects `https://open.video/video.js` (once,
  async, idempotent) and queues the embed; you do not need the plugin.
- **SSR-safe.** The container div renders during server render; the script
  injection and embed request run only on the client after mount.

## Foundation exports

The SDK also exposes the low-level building blocks:

```ts
import {
  STANDALONE_SCRIPT_URL, // https://www.ezojs.com/ezoic/sa.min.js
  CMP_SCRIPT_URLS, // Gatekeeper consent scripts, in load order
  PLACEHOLDER_ID_PREFIX, // 'ezoic-pub-ad-placeholder-'
  isValidPlaceholderId, // integer 1–999 check
  placeholderDomId, // e.g. placeholderDomId(910)
  ID_TO_LOCATION, // reserved id → location-name map
  LOCATION_TO_ID, // location name → id (aliases included)
  isKnownLocation, // is a name a documented location/alias?
  type ShowAdsPlaceholder,
} from '@ezoic/vue-sdk';

placeholderDomId(910); // 'ezoic-pub-ad-placeholder-910'
isKnownLocation('under_first_paragraph'); // true
```

Placeholder divs follow Ezoic's DOM contract and carry **no styling** on the
placeholder element itself:

```html
<div id="ezoic-pub-ad-placeholder-910"></div>
```

## Migration from raw Ezoic snippets

If you currently paste Ezoic's raw script snippets into your HTML or Vue app,
the SDK replaces the manual script tags and `ezstandalone.cmd.push` calls with
a plugin and a component.

### Before (raw snippets)

```html
<script
  data-cfasync="false"
  src="https://cmp.gatekeeperconsent.com/min.js"
></script>
<script
  data-cfasync="false"
  src="https://the.gatekeeperconsent.com/cmp.min.js"
></script>
<script>
  window.ezstandalone = window.ezstandalone || {};
  ezstandalone.cmd = ezstandalone.cmd || [];
</script>
<script async src="https://www.ezojs.com/ezoic/sa.min.js"></script>

<div id="ezoic-pub-ad-placeholder-910"></div>

<script>
  ezstandalone.cmd.push(function () {
    ezstandalone.showAds(910);
  });
</script>
```

### After (SDK)

```ts
// main.ts — app.use(EzoicPlugin) injects the CMP scripts, the command-queue
// stub, and the async ad bundle, in the correct order, automatically.
import { createApp } from 'vue';
import { EzoicPlugin } from '@ezoic/vue-sdk';
import App from './App.vue';

createApp(App).use(EzoicPlugin).mount('#app');
```

```vue
<script setup lang="ts">
import { EzoicAd } from '@ezoic/vue-sdk';
</script>

<template>
  <EzoicAd :id="910" :sizes="['728x90']" />
</template>
```

### Mapping

| Raw snippet                                                | SDK equivalent                                        |
| ---------------------------------------------------------- | ----------------------------------------------------- |
| CMP `<script>` tags + command-queue stub + `sa.min.js` tag | `app.use(EzoicPlugin)`                                |
| `ezstandalone.showAds(id)`                                 | Mount `<EzoicAd :id>` (or `useEzoic().showAds(...)`)  |
| `ezstandalone.destroyPlaceholders(id)`                     | Automatic — runs when `<EzoicAd>` unmounts            |
| `ezstandalone.setIsSinglePageApplication(true)`            | Plugin option `spa: true`                             |
| Manual per-route destroy + `showAds` calls                 | `useEzoicPageView()`, or the plugin's `router` option |
| `ezstandalone.cmd.push(fn)`                                | `useEzoic().push(fn)`                                 |

## Examples

A runnable Vite + Vue 3 demo lives in [`examples/`](./examples). It exercises
every SDK feature on one page — display ads and zero-config `location`
placements, numeric-id placements, dynamic incremental `showAds`, simulated SPA
navigation via `useEzoicPageView()`, consent/config, rewarded ads, and video —
with an on-page event log.

The demo resolves `@ezoic/vue-sdk` to the built `dist/` via an alias, so build
the SDK first, then run the demo:

```sh
npm ci && npm run build           # from the repo root — builds dist/
cd examples && npm install && npm run dev
```

On localhost ads do not fill (no Ezoic demand for localhost); the demo proves
wiring and structure. See [`examples/README.md`](./examples/README.md).

## Roadmap

1. Package skeleton ✅
2. Plugin + script management (`app.use(EzoicPlugin, options)`) ✅
3. Display ads (`<EzoicAd :id="910" />`) ✅
4. SPA routing (vue-router integration, Nuxt recipe) ✅
5. Zero-config placements (`<EzoicAd location="under_first_paragraph" />`) ✅
6. CMP/consent + typed `config()` ✅
7. Rewarded ads (`useEzoicRewarded()`) ✅
8. Video (`<EzoicVideo>`, `<EzoicVideoEmbed>`) ✅
9. Docs + demo app ✅ (see [`examples/`](./examples))

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
