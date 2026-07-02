/**
 * `@ezoic/vue-sdk` — the official Ezoic ads SDK for Vue 3.
 *
 * This 0.x release ships the verified foundation the rest of the SDK builds on:
 * the public Ezoic script URLs, the placeholder DOM contract, and shared types.
 * Plugin installation, the `<EzoicAd>` component, SPA routing, CMP/consent
 * helpers, rewarded ads, and video land in later releases — see CHANGELOG.md.
 */
export {
  STANDALONE_SCRIPT_URL,
  CMP_SCRIPT_URLS,
  PLACEHOLDER_ID_PREFIX,
  MIN_PLACEHOLDER_ID,
  MAX_PLACEHOLDER_ID,
} from './constants';
export { isValidPlaceholderId, placeholderDomId } from './placeholder';
export type { ShowAdsPlaceholder, ShowAdsArg } from './types';
