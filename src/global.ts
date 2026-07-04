/**
 * Minimal typing for the `window.ezstandalone` global the Ezoic ad bundle
 * exposes, plus the `Window` augmentation that makes it visible across the SDK.
 *
 * Only the surface this SDK actually uses is declared here. Later releases
 * extend {@link EzstandaloneGlobal} with the SPA, consent, and video methods
 * they wrap.
 */
import type {
  EzoicConfigOptions,
  RewardedContentLockerAction,
  RewardedContentLockerConfig,
  RewardedRequestAndShowConfig,
  RewardedRequestConfig,
  RewardedRequestResult,
  RewardedRequestWithOverlayConfig,
  RewardedShowConfig,
  RewardedShowResult,
  RewardedOverlayText,
  RewardedSiteWidePlacements,
  ShowAdsArg,
  VideoDefineEntry,
} from './types';

/** A function queued on `ezstandalone.cmd`. */
export type EzoicCmdFn = () => void;

/**
 * The `ezstandalone.cmd` command queue.
 *
 * Before the standalone bundle initializes, `cmd` is a plain array; afterwards
 * the bundle swaps in a wrapper object that runs queued functions immediately.
 * Both shapes expose `push(fn)`, which is the only operation this SDK relies on,
 * so the queue is typed to that common contract (a `EzoicCmdFn[]` satisfies it).
 */
export interface EzstandaloneCmdQueue {
  push(fn: EzoicCmdFn): void;
}

/**
 * Shape of `window.ezstandalone` this SDK relies on. Later releases extend it
 * with the SPA, consent, and video methods they wrap.
 *
 * Every method is optional: before the standalone bundle initializes, only the
 * `cmd` queue exists on the pre-load stub. The wrapped display methods only
 * appear once the bundle has replaced the stub with its real instance, so
 * callers must invoke them from inside a `cmd.push(...)` callback (which runs
 * post-init) and still guard with optional chaining in case an ad blocker
 * prevented the bundle from loading.
 */
export interface EzstandaloneGlobal {
  cmd?: EzstandaloneCmdQueue;
  /** Request ads for the given placeholders (or scan the page when none). */
  showAds?: (...placeholders: ShowAdsArg[]) => void;
  /** Request ads for additional placeholders after the initial load. */
  displayMore?: (...placeholders: ShowAdsArg[]) => void;
  /** Tear down the given placeholder ids. */
  destroyPlaceholders?: (...ids: number[]) => void;
  /** Tear down every selected placeholder plus anchor/rails/floating. */
  destroyAll?: () => void;
  /** Re-request bids for the given (already-defined) placeholder ids. */
  refreshAds?: (...ids: number[]) => void;
  /** Report whether the visitor is in the Ezoic ads A/B group. */
  isEzoicUser?: (
    percentage?: number,
    callback?: (isUser: boolean) => void,
  ) => boolean;
  /**
   * Declare the page a single-page application. In SPA mode a later `showAds()`
   * with no arguments is routed to a full pageview refresh rather than an
   * incremental add, so each client-side route change is treated as a new
   * pageview. Set once at app boot.
   */
  setIsSinglePageApplication?: (spa: boolean) => void;
  /**
   * Resolve a semantic location name (e.g. `"under_first_paragraph"`) to a free
   * placeholder id in Ezoic's reserved range, allocating a new id when every
   * known slot is taken. Only present once the ad bundle has loaded; before then
   * the SDK resolves location names against its own static map instead.
   *
   * The result is a placeholder id (usually 900–999, but the bundle may allocate
   * an id above 999 when all reserved slots are in use). It can arrive as a
   * number or a numeric string, so callers should coerce with `Number(...)`.
   */
  GetGeneratedIdAsync?: (locationName: string) => Promise<number | string>;
  /**
   * Apply publisher configuration. Only the keys in {@link EzoicConfigOptions}
   * are accepted; the bundle logs an error and ignores unknown keys.
   *
   * The public `ezstandalone.config` wrapper does not return a value even though
   * the bundle's internal `config` getter does, so this is typed as a write-only
   * setter — a getter call would always resolve to `undefined`.
   */
  config?: (options?: EzoicConfigOptions) => void;
  /** Enable or disable the Ezoic anchor (sticky) ad. */
  setEzoicAnchorAd?: (enabled: boolean) => void;
  /** Report whether the visitor has dismissed the anchor ad (cookie-backed). */
  hasAnchorAdBeenClosed?: () => boolean;
  /** Allow or block the interstitial ad format. */
  setInterstitialAllowed?: (
    allowed: boolean,
    options?: Record<string, unknown>,
  ) => void;
  /** Report whether the interstitial format is currently allowed. */
  isInterstitialAllowed?: () => boolean;
  /**
   * Allow or block the floating outstream video format. Resolves to the
   * effective allowed state.
   */
  setOutstreamAllowed?: (
    allowed: boolean,
    options?: Record<string, unknown>,
  ) => Promise<boolean>;
  /** Report whether the floating outstream format is currently allowed. */
  isOutstreamAllowed?: () => boolean;
  /** Signal that the publisher is managing consent for this pageview. */
  enableConsent?: () => void;
  /** Opt the visitor out of personalized statistics. */
  setDisablePersonalizedStatistics?: (disable: boolean) => void;
  /** Opt the visitor out of personalized ads. */
  setDisablePersonalizedAds?: (disable: boolean) => void;
  /**
   * Declare the site-wide rewarded ad formats. Turns on the ambient formats
   * (anchor, interstitial, video, side rails) that back the rewarded
   * experience; each defaults to `true` when the placements object is omitted.
   */
  initRewardedAds?: (siteWidePlacements?: RewardedSiteWidePlacements) => void;
  /**
   * Register video placeholders by publisher div id without loading ad code.
   * Clears any prior registration, then records the given ids. Register-only —
   * it does not load; pair it with a page display or use
   * {@link EzstandaloneGlobal.displayMoreVideo} to load.
   */
  defineVideo?: (...entries: VideoDefineEntry[]) => void;
  /**
   * Register and load video ad code for the given publisher div ids. Registers
   * any not-yet-registered ids and loads ad code for the newly registered ones
   * in one call.
   */
  displayMoreVideo?: (...divIds: string[]) => void;
  /**
   * Tear down the given video placeholder div ids. Only unregisters an id whose
   * element still exists in the DOM, so callers must invoke it while the div is
   * still present.
   */
  destroyVideoPlaceholders?: (...divIds: string[]) => void;
}

/**
 * A single entry pushed onto {@link OpenVideoPlayersQueue} to mount an Open
 * Video inline embed. The embed script reads `target` (the container element to
 * render the player into) and `videoID`; `float` and `autoplay` are optional
 * behavior flags it honors when present.
 */
export interface OpenVideoPlayerEntry {
  /** Container element the embed renders the player into. */
  target: Element;
  /** Publisher video id to play. */
  videoID: string;
  /** Enable the floating player behavior. Omit to use the embed default. */
  float?: boolean;
  /** Autoplay the video. Omit to use the embed default. */
  autoplay?: boolean;
}

/**
 * The `window.openVideoPlayers` queue.
 *
 * Before the Open Video embed script loads, `openVideoPlayers` is a plain array
 * and `push(entry)` just appends. After it loads the script replaces the value
 * with a live handler object whose `push(entry)` mounts a player immediately.
 * Both shapes expose `push(entry)`, the only operation this SDK relies on, so
 * the queue is typed to that common contract (an `OpenVideoPlayerEntry[]`
 * satisfies it) — mirroring {@link EzstandaloneCmdQueue}.
 */
export interface OpenVideoPlayersQueue {
  push(entry: OpenVideoPlayerEntry): void;
}

/**
 * The subset of the IAB TCF v2.2 `TCData` object this SDK reads. Delivered to
 * the `__tcfapi('addEventListener', 2, cb)` callback. Only the fields the
 * consent composable surfaces are declared; the full object carries per-purpose
 * and per-vendor consent maps.
 */
export interface TcfData {
  /** Base64url-encoded TC string. */
  tcString?: string;
  /** Whether GDPR applies to this user; `undefined` until the CMP decides. */
  gdprApplies?: boolean;
  /** `tcloaded`, `cmpuishown`, or `useractioncomplete`. */
  eventStatus?: string;
  /** `loaded` once the CMP is ready. */
  cmpStatus?: string;
  /** Id used to detach this listener via `removeEventListener`. */
  listenerId?: number;
}

/**
 * The IAB TCF v2.2 `__tcfapi` function. Only the `addEventListener` /
 * `removeEventListener` commands this SDK uses are typed.
 */
export interface TcfApi {
  (
    command: 'addEventListener',
    version: 2,
    callback: (data: TcfData, success: boolean) => void,
  ): void;
  (
    command: 'removeEventListener',
    version: 2,
    callback: (success: boolean) => void,
    listenerId: number,
  ): void;
}

/**
 * Shape of `window.ezRewardedAds` — the Ezoic rewarded-ads global. It follows
 * the same lifecycle as `ezstandalone`: before the rewarded loader script
 * initializes, only the `cmd` queue exists on the pre-load stub; the real
 * methods appear once the loader replaces the stub with its instance. Callers
 * therefore push work onto `cmd` (which runs post-init, or immediately once
 * initialized) and still guard each method with optional chaining in case an
 * ad blocker prevented the loader from running.
 *
 * Every method delivers its outcome through a callback — none return a usable
 * value.
 */
export interface EzRewardedGlobal {
  /** `true` once the rewarded loader has initialized. */
  ready?: boolean;
  /**
   * The rewarded command queue. A plain array before init; an immediate-execute
   * wrapper afterwards. `push(fn)` is the only operation this SDK relies on.
   */
  cmd?: EzstandaloneCmdQueue;
  /** Register a rewarded pageview for tracking (idempotent per pageview). */
  register?: () => void;
  /** Request a rewarded ad; the callback reports availability. */
  request?: (
    callback: (data: RewardedRequestResult) => void,
    config?: RewardedRequestConfig,
  ) => void;
  /** Show a previously requested rewarded ad; the callback reports the reward. */
  show?: (
    callback: (data: RewardedShowResult) => void,
    config?: RewardedShowConfig,
  ) => void;
  /** Request and immediately show a rewarded ad in one call. */
  requestAndShow?: (
    callback: (data: RewardedShowResult) => void,
    config?: RewardedRequestAndShowConfig,
  ) => void;
  /** Prompt the visitor with an overlay, then request and show a rewarded ad. */
  requestWithOverlay?: (
    callback: (data: RewardedShowResult) => void,
    text?: RewardedOverlayText,
    config?: RewardedRequestWithOverlayConfig,
  ) => void;
  /**
   * Gate content behind a rewarded ad. `action` is a URL to redirect to, or a
   * function to run, after the reward is earned.
   */
  contentLocker?: (
    action: RewardedContentLockerAction,
    config?: RewardedContentLockerConfig,
  ) => void;
}

declare global {
  interface Window {
    ezstandalone?: EzstandaloneGlobal;
    /** IAB TCF v2.2 CMP API, present once a TCF CMP (e.g. Ezoic Gatekeeper) loads. */
    __tcfapi?: TcfApi;
    /** Ezoic rewarded-ads global, present once the rewarded loader initializes. */
    ezRewardedAds?: EzRewardedGlobal;
    /**
     * Canonical Open Video queue, seeded by this SDK and consumed by the Open
     * Video embed script (`window.humixPlayers` is a legacy alias the embed
     * creator still honors — this SDK pushes to the canonical
     * `openVideoPlayers`).
     */
    openVideoPlayers?: OpenVideoPlayersQueue;
    /**
     * Namespace object Ezoic's compiled ad-loader scripts read/write on. Its
     * internal shape is owned by those scripts, not this SDK, so it is typed
     * loosely here.
     */
    __ez?: Record<string, unknown>;
  }
}
