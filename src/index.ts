/**
 * `@ezoic/vue-sdk` — the official Ezoic ads SDK for Vue 3.
 *
 * This 0.x release ships the verified foundation the rest of the SDK builds on:
 * the public Ezoic script URLs, the placeholder DOM contract, shared types, the
 * `EzoicPlugin` (script management), the `useEzoic()` composable, the
 * `<EzoicAd>` display-placeholder component (numeric ids and zero-config
 * semantic `location` names), and single-page-app routing (`useEzoicPageView()`
 * plus the plugin's `spa`/`router` options). CMP/consent helpers, rewarded ads,
 * and video land in later releases — see CHANGELOG.md.
 */
export {
  STANDALONE_SCRIPT_URL,
  CMP_SCRIPT_URLS,
  PLACEHOLDER_ID_PREFIX,
  MIN_PLACEHOLDER_ID,
  MAX_PLACEHOLDER_ID,
} from './constants';
export {
  isValidPlaceholderId,
  placeholderDomId,
  resolvedPlaceholderDomId,
} from './placeholder';
export {
  ID_TO_LOCATION,
  LOCATION_TO_ID,
  LOCATION_ALIASES,
  isKnownLocation,
} from './locations';
export { EzoicPlugin } from './plugin';
export { EzoicAd } from './EzoicAd';
export { useEzoic } from './useEzoic';
export { useEzoicPageView } from './pageView';
export { ezoicInjectionKey } from './keys';
export type {
  ShowAdsPlaceholder,
  ShowAdsArg,
  EzoicPluginOptions,
  EzoicApi,
  EzoicRouter,
} from './types';
export type { EzoicPageViewOptions } from './pageView';
export type {
  EzstandaloneGlobal,
  EzstandaloneCmdQueue,
  EzoicCmdFn,
} from './global';
