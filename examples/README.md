# @ezoic/vue-sdk — examples demo

A Vite + Vue 3 app that exercises every feature of `@ezoic/vue-sdk` in one page:

- **Display ads** — zero-config `location` placements (`top_of_page`,
  `under_first_paragraph`, `mid_content`) with explicit `sizes`.
- **Numeric-id placement** — `<EzoicAd :id="910">` with `sizes` + `required`.
- **Dynamic content** — a button that mounts more `<EzoicAd>`s, joining the
  SDK's incremental `showAds`/`displayMore` batch.
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

On localhost, ads will **not** fill — there is no Ezoic demand for localhost,
and this demo ships no rewarded loader or real Open Video id. With no loader,
nothing drains the rewarded command queue, so `rewarded.ready` stays false and
the request/content-locker promises stay pending. That is expected: the demo
proves wiring and structure, not fills. Publishers deploy on their
Ezoic-enabled domain and set `rewardedLoaderUrl` plus a real Open Video id.
