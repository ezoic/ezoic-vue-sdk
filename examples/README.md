# @ezoic/vue-sdk — examples demo

A Vite + Vue 3 app that exercises every feature of `@ezoic/vue-sdk` in one page:

- **Display ads** — zero-config `location` placements (`top_of_page`,
  `under_first_paragraph`, `mid_content`) with explicit `sizes`.
- **Numeric-id placement** — `<EzoicAd :id="910" :sizes="['300x250']" :required="true" />`.
- **Dynamic content** — a button that mounts more sizes-only
  `<EzoicAd :sizes="['300x250', '336x280']" :required="true" />` units. Each
  takes the next free in-content slot (915 and up) and joins the SDK's
  incremental `showAds`/`displayMore` batch.
- **Simulated SPA navigation** — `useEzoicPageView()` in scan mode, driven by a
  virtual page counter that unmounts and remounts placeholders.
- **Consent + configuration** — `config()`, anchor/interstitial/outstream
  toggles, `enableConsent()`, and a live `useEzoicConsent()` readout.
- **Rewarded ads** — `useEzoicRewarded()` request/show and content locker.
- **Video** — `<EzoicVideo>` (ad-bundle placeholder) and `<EzoicVideoEmbed>`
  (Open Video inline embed).

An on-page event log records every action and reactive state change.

## Run it

The demo resolves `@ezoic/vue-sdk` to the built `../dist` via a Vite/tsconfig
alias, so build the SDK first, then start the demo:

```sh
# 1. From the repo root — build dist/ that the demo aliases:
npm ci && npm run build

# 2. In this folder — install and run:
cd examples
npm install
npm run dev        # or: npm run build   (vue-tsc typecheck + vite build)
```

Requires Node 22 (see `.nvmrc` at the repo root).

## Single-file build

`npm run build` produces a single self-contained `dist/index.html` with all
JS and CSS inlined (via `vite-plugin-singlefile`) and no external assets beyond
the Ezoic/CMP scripts the SDK injects at runtime. That one file is portable and
can be served as a standalone demo page. Rebuild it whenever the SDK's core
script/display/SPA logic changes so the demo stays in sync.

## Note on localhost

On localhost, ads will **not** fill — there is no Ezoic demand for localhost.
The demo proves wiring and structure, not fills. It uses the real Open Video id
`zn0TPhaPiju`; publishers should replace it with their own video id.

On an Ezoic-enabled domain, the demo's `EzoicPlugin` loads the standalone ad
bundle and `useEzoicRewarded()` schedules rewarded initialization. The Ezoic
runtime serves the rewarded loader; no `rewardedLoaderUrl` is needed for this
setup. That option is an escape hatch only for pages that do not load the
standalone ad bundle through the SDK (see the root README).
