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
  /**
   * **Escape hatch — usually omit this.** An explicit site-specific loader URL
   * for the Ezoic rewarded-ads script
   * (`{your-ad-host}/porpoiseant/ezadloadrewarded.js`). When set, the plugin
   * injects it (async, after the standalone bundle) as a `<script>` tag.
   *
   * On a normal Ezoic JS-integrated page leave this unset: `useEzoicRewarded()`
   * defaults to calling `ezstandalone.initRewardedAds(...)` so the Ezoic runtime
   * serves the host-correct rewarded loader itself. Supply a URL only for pages
   * that are not JS-integrated through this SDK; find the exact URL in your Ezoic
   * dashboard / integration docs.
   */
  rewardedLoaderUrl?: string;
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
  /**
   * Declare the site-wide rewarded ad formats via
   * `ezstandalone.initRewardedAds`. Enables the ambient formats that back the
   * rewarded experience (anchor, interstitial, video, side rails); pass a
   * {@link RewardedSiteWidePlacements} object to toggle individual formats
   * (each defaults to `true`). Queued on the command queue, so it is safe to
   * call before the bundle loads, and a no-op during SSR. This configures the
   * ambient placements only — request and show individual rewarded ads with
   * {@link useEzoicRewarded}.
   */
  initRewardedAds: (placements?: RewardedSiteWidePlacements) => void;
  /**
   * Register video placeholders without loading their ad code. Runs
   * `ezstandalone.defineVideo(...)`, which clears any prior registration and
   * records the given publisher div ids. Register-only: it does **not** request
   * ads, so pair it with a page display (a pageview `showAds()`) or use
   * {@link EzoicApi.displayMoreVideo} to both register and load incrementally.
   * `<EzoicVideo>` does not use this — it calls `displayMoreVideo` directly.
   * Queued on the command queue and a no-op during SSR.
   */
  defineVideo: (...entries: VideoDefineEntry[]) => void;
  /**
   * Register and load video ad code for the given publisher div ids. Runs
   * `ezstandalone.displayMoreVideo(...)`, which registers any not-yet-registered
   * ids and loads ad code for the newly registered ones in a single call — the
   * building block `<EzoicVideo>` uses on mount. Queued on the command queue and
   * a no-op during SSR.
   */
  displayMoreVideo: (...divIds: string[]) => void;
  /**
   * Tear down the given video placeholder div ids via
   * `ezstandalone.destroyVideoPlaceholders(...)`. The div must still be in the
   * DOM when this runs — the bundle only unregisters an id whose element still
   * exists — so call it before the element is removed. Queued on the command
   * queue and a no-op during SSR.
   */
  destroyVideoPlaceholders: (...divIds: string[]) => void;
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

/**
 * A video placeholder argument to `ezstandalone.defineVideo(...)`: either a
 * bare publisher-chosen div id string, or the object form `{ divID }`. Video
 * placeholders use a publisher-chosen div id rather than the numeric
 * `ezoic-pub-ad-placeholder-*` display-ad convention.
 */
export type VideoDefineEntry = string | { divID: string };

/**
 * Result delivered to the callback of `ezRewardedAds.request(...)`. Reports
 * whether a rewarded ad is available to show.
 */
export interface RewardedRequestResult {
  /** `true` when a rewarded ad is available and ready to be shown. */
  status: boolean;
  /** Human-readable status message (e.g. a fill/no-fill reason). */
  msg: string;
  /** Ad metadata present when an ad is available. */
  adInfo?: Record<string, unknown>;
}

/**
 * Result delivered to the callback of the show-style rewarded methods
 * (`show`, `requestAndShow`, `requestWithOverlay`). Reports whether the ad ran
 * and whether the reward was earned.
 */
export interface RewardedShowResult {
  /** `true` when the ad flow completed without a hard failure. */
  status: boolean;
  /** `true` when the visitor earned the reward (watched to completion). */
  reward: boolean;
  /** Human-readable outcome message. */
  msg: string;
  /** Ad metadata present when an ad ran. */
  adInfo?: Record<string, unknown>;
  /** Reward/user metadata present when a reward was granted. */
  userInfo?: Record<string, unknown>;
}

/** Config for `ezRewardedAds.request(...)`. All fields optional. */
export interface RewardedRequestConfig {
  /** Minimum CPM floor for the rewarded request; `null` clears any floor. */
  minCPM?: number | null;
  /** Reward type label passed through to reporting. */
  rewardType?: string;
  /** Reward amount passed through to reporting. */
  rewardAmount?: number;
}

/** Config for `ezRewardedAds.show(...)`. All fields optional. */
export interface RewardedShowConfig {
  /** Reward name label attributed to this show. */
  rewardName?: string;
  /** Arbitrary user metadata echoed back in the result's `userInfo`. */
  userInfo?: Record<string, unknown>;
}

/**
 * Config for `ezRewardedAds.requestAndShow(...)`. All fields optional.
 *
 * The SDK always sets `alwaysCallback` internally so the returned promise
 * settles in every outcome (reward granted, no-fill, user cancel, or
 * closed-before-reward); it is not a caller-settable option.
 */
export interface RewardedRequestAndShowConfig {
  /** Reward name label attributed to this flow. */
  rewardName?: string;
  /** Grant the reward even when no ad fills. */
  rewardOnNoFill?: boolean;
  /** Show the loading overlay while the ad is fetched. */
  loadingOverlay?: boolean;
  /** Minimum CPM floor for the request; `null` clears any floor. */
  minCPM?: number | null;
  /** Reward type label passed through to reporting. */
  rewardType?: string;
  /** Reward amount passed through to reporting. */
  rewardAmount?: number;
}

/** Localized text for the `ezRewardedAds.requestWithOverlay(...)` prompt. */
export interface RewardedOverlayText {
  /** Overlay header line. */
  header?: string;
  /** Overlay body lines. */
  body?: string[];
  /** Accept button label. */
  accept?: string;
  /** Cancel button label. */
  cancel?: string;
}

/**
 * Config for `ezRewardedAds.requestWithOverlay(...)`. Extends
 * {@link RewardedRequestAndShowConfig} with the overlay-specific options.
 */
export interface RewardedRequestWithOverlayConfig extends RewardedRequestAndShowConfig {
  /** Lock page scroll while the overlay is open. */
  lockScroll?: boolean;
  /** Skip the confirmation prompt and go straight to the ad. */
  dontAsk?: boolean;
}

/**
 * Call-to-action customization for the `ezRewardedAds.contentLocker(...)`
 * gating UI.
 */
export interface RewardedContentLockerCallToAction {
  /** Disable the call-to-action UI. */
  disabled?: boolean;
  /** Call-to-action header text. */
  header?: string;
  /** Call-to-action body text. */
  body?: string;
  /** Call-to-action button label. */
  button?: string;
}

/** Config for `ezRewardedAds.contentLocker(...)`. All fields optional. */
export interface RewardedContentLockerConfig {
  /** Show the loading overlay while the ad is fetched. Defaults to `true`. */
  loadingOverlay?: boolean;
  /**
   * Invoked with the request result once the rewarded ad is ready. Defaults to
   * `null`.
   */
  readyCallback?: (result: RewardedRequestResult) => void;
  /** Reward name label attributed to this flow. */
  rewardName?: string;
  /** Minimum CPM floor for the request; `null` clears any floor. */
  minCPM?: number | null;
  /** Call-to-action UI customization. */
  callToAction?: RewardedContentLockerCallToAction;
}

/**
 * Site-wide rewarded ad format toggles for
 * `ezstandalone.initRewardedAds(...)`. Each format defaults to `true`.
 */
export interface RewardedSiteWidePlacements {
  /** Enable the anchor (sticky) format. */
  anchor?: boolean;
  /** Enable the interstitial format. */
  interstitial?: boolean;
  /** Enable the video format. */
  video?: boolean;
  /** Enable the side rails format. */
  sideRails?: boolean;
}

/**
 * The `action` argument to `ezRewardedAds.contentLocker(...)`: a URL string to
 * redirect to after the reward is earned, or a function to run after the
 * reward is earned.
 */
export type RewardedContentLockerAction = string | (() => void);

/**
 * The rewarded-flow lifecycle status surfaced by {@link useEzoicRewarded}.
 * Tracks the window events the rewarded script dispatches: `idle` before any
 * activity, then `initiated` → `displayed` → `closed`.
 */
export type RewardedFlowStatus = 'idle' | 'initiated' | 'displayed' | 'closed';
