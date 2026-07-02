# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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
