# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- `<EzoicAd location="...">` placements now default `required: true` (sol only
  treats a zero-config 900-range id as zero-config when it is required). Opt a
  location out with `:required="false"`. Numeric `id` placements are unchanged —
  `required` still defaults to `false`.
- README ad-placement examples updated to the canonical `sizes` + `required`
  pairing: every `<EzoicAd>` example now passes explicit `sizes`, and the
  imperative `showAds`/`displayMore` examples use the object form.

### Added

- Dev-mode console warning when an `<EzoicAd>` placement is shown without
  `sizes`. Standalone placeholders have no dashboard sizing, so the warning
  points to the canonical fix (`:sizes="['728x90', '320x50']"`). It fires once
  per shown placement and folds away in a consumer's production build.
- Rewarded ads. New composable `useEzoicRewarded(options?)` wraps
  `window.ezRewardedAds`: `register()` (fire-and-forget pageview tracking) plus
  promise-returning `request`, `show`, `requestAndShow`, `requestWithOverlay`,
  and `contentLocker`. Each callback-style method resolves when the underlying
  ad flow settles (including no-fill and cancellation) with no timers; when
  rewarded ads are unavailable they resolve a typed failure (`status: false`)
  rather than rejecting. A reactive `status` (`idle` → `initiated` →
  `displayed` → `closed`) tracks the flow via the rewarded window events, and a
  reactive `ready` flips once the loader initializes; both are SSR-safe and the
  event listeners detach on unmount. The composable is decoupled from the
  plugin — it manages its own `ezRewardedAds` command-queue stub and can inject
  the loader itself via `useEzoicRewarded({ loaderUrl })`. `useEzoic()` gains an
  `initRewardedAds(placements?)` passthrough for the site-wide rewarded formats
  (anchor, interstitial, video, side rails). The `EzoicPlugin` gains a
  `rewardedLoaderUrl` option that injects the publisher-specific rewarded loader
  (`/porpoiseant/ezadloadrewarded.js`) async after the standalone bundle. New
  exports: `useEzoicRewarded`, the `UseEzoicRewardedOptions` and `EzoicRewarded`
  types, the `EzRewardedGlobal` window type, and the rewarded payload/config
  types (`RewardedRequestResult`, `RewardedShowResult`, `RewardedRequestConfig`,
  `RewardedShowConfig`, `RewardedRequestAndShowConfig`, `RewardedOverlayText`,
  `RewardedRequestWithOverlayConfig`, `RewardedContentLockerConfig`,
  `RewardedContentLockerCallToAction`, `RewardedContentLockerAction`,
  `RewardedSiteWidePlacements`, `RewardedFlowStatus`).
- CMP/consent and typed configuration. `useEzoic()` gains verified passthroughs
  for publisher configuration and ad formats: `config(options)` (a closed,
  typed `EzoicConfigOptions` set — the bundle rejects unknown keys),
  `setEzoicAnchorAd`, `setInterstitialAllowed` / `isInterstitialAllowed`,
  `setOutstreamAllowed` (resolves the effective allowed state) /
  `isOutstreamAllowed`, `hasAnchorAdBeenClosed`, and the consent setters
  `enableConsent`, `setDisablePersonalizedStatistics`,
  `setDisablePersonalizedAds`. `config` is write-only because the public
  `ezstandalone.config` wrapper returns nothing; the boolean queries return the
  bundle's live value once it has loaded and `false` before then. New composable
  `useEzoicConsent()` exposes reactive IAB TCF v2.2 consent state
  (`tcfLoaded`, `consentString`, `gdprApplies`, `eventStatus`) read from
  `window.__tcfapi`; it is SSR-safe and detaches its listener on unmount. New
  exports: `useEzoicConsent`, and the `EzoicConfigOptions`, `EzoicConsentState`,
  `TcfData`, and `TcfApi` types.
- Zero-config placements. `<EzoicAd>` now accepts a semantic `location` name
  (e.g. `location="under_first_paragraph"`) instead of a numeric `id`; the two
  props are mutually exclusive (passing both or neither warns and renders
  nothing). When the ad bundle is loaded the SDK resolves the name via
  `ezstandalone.GetGeneratedIdAsync(location)`; before then it resolves against
  its own copy of Ezoic's reserved location map so the placeholder still appears
  on first paint. Repeated locations resolve to distinct ids (the resolver skips
  ids already claimed by mounted ads), and resolution feeds the same
  same-tick batching and unmount teardown as numeric ids. Location placeholders
  resolve on the client, so they render nothing during SSR. New exports:
  `ID_TO_LOCATION`, `LOCATION_TO_ID`, `LOCATION_ALIASES`, `isKnownLocation`, and
  `resolvedPlaceholderDomId`; `EzstandaloneGlobal` gains `GetGeneratedIdAsync`.
- Single-page-app routing. `useEzoicPageView(routeKey, options?)` turns each
  change of a reactive route key into an Ezoic pageview: scan mode (no `ids`)
  re-requests the new route's ads via `showAds()` and pairs with `<EzoicAd>`;
  managed mode (`ids` provided) destroys the previous route's ids and requests
  the current route's ids. It declares SPA mode itself, watches with
  `flush: 'post'` (the new route's DOM is in place before ads are requested),
  does not fire on the initial render, and is SSR-safe. The `EzoicPlugin`
  gains a `spa` option (declare a single-page app at boot) and a `router`
  option (a Vue Router instance — enables SPA mode and rescans after every
  navigation, coalesced with the ad bundle's built-in navigation monitor so a
  route change fires one ad request). `useEzoic()` adds a
  `setIsSinglePageApplication` passthrough. New exports: `useEzoicPageView`,
  and the `EzoicRouter` and `EzoicPageViewOptions` types.
- `<EzoicAd>` display-placeholder component: renders a bare
  `<div id="ezoic-pub-ad-placeholder-<id>">` (no styling; `inheritAttrs: false`
  so a `class`/`style` never lands on the placeholder) and drives its lifecycle
  through the ad bundle. Every `<EzoicAd>` mounting in the same tick is batched
  into a single `showAds(...)` call; unmount calls `destroyPlaceholders(id)`;
  mounting a duplicate id warns and requests it only once. Props: `id`
  (integer 1–999), `required`, and `sizes`. SSR-safe (the div renders on the
  server; the ad request runs only on the client).
- `useEzoic()` now exposes typed passthroughs to the ezstandalone display
  methods: `showAds`, `displayMore`, `destroyPlaceholders`, `destroyAll`,
  `refreshAds`, and `isEzoicUser`. Each queues its call on the command queue and
  is a no-op during SSR.
- `EzoicPlugin` (`app.use(EzoicPlugin, options)`): injects the Ezoic scripts in
  the required order — Gatekeeper CMP consent scripts (with
  `data-cfasync="false"` set before `src`), then the cmd-queue stub, then the
  async standalone bundle, then an optional analytics loader. Injection is
  idempotent (never double-injects, tolerates scripts already in the host HTML)
  and SSR-safe (no `window`/`document` during server render; Nuxt 3 compatible).
  Options: `cmp` (default `true`) and `analyticsScriptUrl`.
- `useEzoic()` composable exposing the `EzoicApi`: a reactive `ready` flag and a
  `push(fn)` helper that queues work on the ezstandalone command queue (no-op
  during SSR).
- `ezoicInjectionKey` and the `EzoicPluginOptions`, `EzoicApi`,
  `EzstandaloneGlobal`, and `EzoicCmdFn` types.
- CI workflow now declares a least-privilege `permissions: contents: read`.
- Package skeleton: TypeScript, dual ESM/CJS build via Vite library mode,
  `vue` `^3.4` peer dependency, type declarations emitted with
  `vite-plugin-dts`.
- Test harness: Vitest + `@vue/test-utils` + jsdom, with a mount smoke test.
- ESLint flat config (`@eslint/js` + `typescript-eslint`) and Prettier.
- GitHub Actions CI running lint, typecheck, test, build, and
  `npm pack --dry-run` on a Node 20 and 22 matrix.
- Verified foundation exports:
  - Script URLs `STANDALONE_SCRIPT_URL` and `CMP_SCRIPT_URLS` (Gatekeeper
    consent scripts, in required load order).
  - Placeholder DOM contract: `PLACEHOLDER_ID_PREFIX`, `MIN_PLACEHOLDER_ID`,
    `MAX_PLACEHOLDER_ID`, `isValidPlaceholderId`, and `placeholderDomId`.
  - Shared types `ShowAdsPlaceholder` and `ShowAdsArg`.

[Unreleased]: https://github.com/ezoic/ezoic-vue-sdk/commits/master
