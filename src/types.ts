import type { Ref } from 'vue';

/** Options for `app.use(EzoicPlugin, options)`. */
export interface EzoicPluginOptions {
  /**
   * Inject the Ezoic Gatekeeper CMP consent scripts before the ad bundle.
   * Defaults to `true`. Disable only when you provide your own consent
   * management platform — the ad bundle still expects consent to be handled.
   */
  cmp?: boolean;
  /**
   * Optional analytics loader URL, injected after the standalone bundle. Most
   * integrations do not need this.
   */
  analyticsScriptUrl?: string;
}

/**
 * The runtime API the Ezoic plugin provides and {@link useEzoic} returns.
 * Later releases extend this with `showAds`/`destroyPlaceholders` passthroughs.
 */
export interface EzoicApi {
  /**
   * Reactive readiness flag. Becomes `true` once the standalone bundle has
   * initialized on the client and drained its command queue. Always `false`
   * during server-side rendering, and remains `false` if the bundle is blocked
   * (e.g. by an ad blocker) or fails to load.
   */
  ready: Readonly<Ref<boolean>>;
  /**
   * Queue a callback on `ezstandalone.cmd`. It runs after the bundle
   * initializes, or immediately if the bundle has already initialized. No-op
   * during server-side rendering.
   */
  push: (fn: () => void) => void;
}

/**
 * Object form of a placeholder accepted by `ezstandalone.showAds(...)`.
 *
 * `id` is required; `required` defaults to `false`; each entry in `sizes` must
 * be a `"<width>x<height>"` string (e.g. `"728x90"`) — ezstandalone skips
 * entries that do not match and warns.
 */
export interface ShowAdsPlaceholder {
  /** Numeric placeholder id (1–999). */
  id: number;
  /** Whether the placeholder must be filled. Defaults to `false`. */
  required?: boolean;
  /** Explicit ad sizes as `"<width>x<height>"` strings. */
  sizes?: string[];
}

/**
 * A placeholder argument to `showAds`: either a bare numeric id or the full
 * {@link ShowAdsPlaceholder} object form.
 */
export type ShowAdsArg = number | ShowAdsPlaceholder;
