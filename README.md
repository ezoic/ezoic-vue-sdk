# @ezoic/vue-sdk

Official [Ezoic](https://www.ezoic.com/) ads SDK for Vue 3.

> **Status: 0.x, in active development.** This package is being built out
> incrementally. The current release ships the verified foundation (public
> script URLs, the placeholder DOM contract, and shared types). Plugin
> installation, the `<EzoicAd>` component, single-page-app routing,
> CMP/consent helpers, rewarded ads, and video are on the roadmap below.

## Install

```sh
npm install @ezoic/vue-sdk
```

`vue` `^3.4` is a peer dependency.

## What's in this release

The SDK exposes the building blocks the rest of the integration relies on:

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
2. Plugin + script management (`app.use(EzoicPlugin, options)`)
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
