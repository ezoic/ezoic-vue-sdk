import type { Ref } from 'vue';

/**
 * The subset of a router this SDK needs: an `afterEach` navigation hook that
 * fires after every confirmed navigation. Vue Router's `Router` satisfies this
 * structurally, so you can pass your router instance directly
 * (`app.use(EzoicPlugin, { router })`).
 */
export interface EzoicRouter {
  afterEach(
    guard: (to: unknown, from: unknown, failure?: unknown) => unknown,
  ): unknown;
}

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
  /**
   * Declare the app a single-page application at boot (calls
   * `setIsSinglePageApplication(true)`), so a later `showAds()` on a route
   * change becomes a new pageview rather than an incremental add. Implied when
   * {@link EzoicPluginOptions.router} is set. Defaults to `false`.
   */
  spa?: boolean;
  /**
   * A Vue Router instance (or anything with a compatible `afterEach`). When
   * provided, the plugin enables SPA mode and rescans the page for placeholders
   * after every navigation — pair it with `<EzoicAd>`, whose unmount tears down
   * departing placeholders. The built-in navigation monitor and ezstandalone's
   * own debounce coalesce these into a single ad request per route change.
   */
  router?: EzoicRouter;
}

/**
 * The runtime API the Ezoic plugin provides and {@link useEzoic} returns.
 *
 * Alongside `ready` and the low-level `push` helper it exposes typed
 * passthroughs to the `ezstandalone` display methods. Each passthrough queues
 * its call on the command queue (via {@link push}), so it is safe to call
 * before the bundle has loaded and is a no-op during server-side rendering.
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
  /**
   * Request ads for the given placeholders. With no arguments, ezstandalone
   * scans the page for every placeholder div. `<EzoicAd>` batches its own
   * mounts into a single `showAds` call; use this for imperative control.
   */
  showAds: (...placeholders: ShowAdsArg[]) => void;
  /**
   * Request ads for additional placeholders after the initial load — the
   * building block for infinite scroll and other dynamic content.
   */
  displayMore: (...placeholders: ShowAdsArg[]) => void;
  /** Tear down the given placeholder ids (e.g. before removing their divs). */
  destroyPlaceholders: (...ids: number[]) => void;
  /**
   * Tear down every selected placeholder plus the anchor ad, side rails, and
   * floating outstream player.
   */
  destroyAll: () => void;
  /** Re-request bids for the given (already-defined) placeholder ids. */
  refreshAds: (...ids: number[]) => void;
  /**
   * Report whether the visitor is in the Ezoic ads A/B group. Returns the
   * bundle's answer synchronously when it has already loaded; otherwise returns
   * `false` immediately and, if a `callback` is supplied, invokes it with the
   * real value once the bundle initializes. Always `false` during SSR.
   */
  isEzoicUser: (
    percentage?: number,
    callback?: (isUser: boolean) => void,
  ) => boolean;
  /**
   * Declare the page a single-page application, so subsequent `showAds()` calls
   * with no arguments are routed to a full pageview refresh. Queued on the
   * command queue and a no-op during SSR. The plugin sets this at boot via its
   * `spa`/`router` options, and {@link useEzoicPageView} sets it automatically;
   * call it directly only for a fully custom routing integration.
   */
  setIsSinglePageApplication: (spa: boolean) => void;
  /**
   * Apply Ezoic configuration. Accepts only the keys in
   * {@link EzoicConfigOptions}; the bundle ignores unknown keys. Queued on the
   * command queue and a no-op during SSR.
   *
   * Write-only: the underlying `ezstandalone.config` wrapper returns nothing, so
   * there is no getter form. Read effective settings through the specific
   * format queries (`isInterstitialAllowed`, `isOutstreamAllowed`) instead.
   */
  config: (options: EzoicConfigOptions) => void;
  /**
   * Enable or disable the Ezoic anchor (sticky) ad. Queued on the command queue
   * and a no-op during SSR.
   */
  setEzoicAnchorAd: (enabled: boolean) => void;
  /**
   * Report whether the visitor has already dismissed the anchor ad. Returns the
   * bundle's cookie-backed answer once it has loaded; before then (and during
   * SSR, or when the bundle is blocked) returns `false`. Query it after
   * {@link EzoicApi.ready} flips true for an accurate reading.
   */
  hasAnchorAdBeenClosed: () => boolean;
  /**
   * Allow or block the interstitial ad format. Queued on the command queue and a
   * no-op during SSR.
   */
  setInterstitialAllowed: (
    allowed: boolean,
    options?: Record<string, unknown>,
  ) => void;
  /**
   * Report whether the interstitial format is currently allowed. Returns the
   * bundle's live value once it has loaded; before then (and during SSR, or when
   * the bundle is blocked) returns `false`. Query it after {@link EzoicApi.ready}
   * flips true for an accurate reading.
   */
  isInterstitialAllowed: () => boolean;
  /**
   * Allow or block the floating outstream video format. Resolves to the
   * effective allowed state once the bundle has loaded; if the bundle has not
   * loaded yet the request is queued and the promise resolves `false` (during
   * SSR it resolves `false` without queuing).
   */
  setOutstreamAllowed: (
    allowed: boolean,
    options?: Record<string, unknown>,
  ) => Promise<boolean>;
  /**
   * Report whether the floating outstream format is currently allowed. Returns
   * the bundle's live value once it has loaded; before then (and during SSR, or
   * when the bundle is blocked) returns `false`. Query it after
   * {@link EzoicApi.ready} flips true for an accurate reading.
   */
  isOutstreamAllowed: () => boolean;
  /**
   * Signal that consent is being managed for this pageview (sets the bundle's
   * `manageConsent` flag). Queued on the command queue and a no-op during SSR.
   */
  enableConsent: () => void;
  /**
   * Opt the visitor out of personalized statistics. Queued on the command queue
   * and a no-op during SSR.
   */
  setDisablePersonalizedStatistics: (disable: boolean) => void;
  /**
   * Opt the visitor out of personalized ads. Queued on the command queue and a
   * no-op during SSR.
   */
  setDisablePersonalizedAds: (disable: boolean) => void;
}

/**
 * The closed set of configuration keys `ezstandalone.config(...)` accepts. The
 * bundle logs an error and ignores any key outside this set, so the type is a
 * fixed interface rather than an open record.
 *
 * All keys are optional; only the ones you pass are applied. Values and effects
 * are verified against the Ezoic standalone bundle.
 */
export interface EzoicConfigOptions {
  /** Anchor ad position. Defaults to `"bottom"`. */
  anchorAdPosition?: string;
  /** Opt in to anchor ad expansion. */
  anchorAdExpansion?: boolean;
  /** Disable video ads. */
  disableVideo?: boolean;
  /** Disable the interstitial format. */
  disableInterstitial?: boolean;
  /** Disable the left side rail. */
  disableLeftSideRail?: boolean;
  /** Disable the right side rail. */
  disableRightSideRail?: boolean;
  /** Disable the floating sidebar. */
  disableSidebarFloating?: boolean;
  /** Reserve placeholder space up front to reduce layout shift (CLS). */
  reservePlaceholderSpace?: boolean;
  /** Limit cookie usage (server-side effect). */
  limitCookies?: boolean;
  /** Enable the desktop vignette format. */
  vignetteDesktop?: boolean;
  /** Enable the mobile vignette format. */
  vignetteMobile?: boolean;
  /** Enable the tablet vignette format. */
  vignetteTablet?: boolean;
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
