/**
 * `useEzoicRewarded()` — a composable wrapper around `window.ezRewardedAds`,
 * the Ezoic rewarded-ads global. It exposes the rewarded methods as
 * promise-returning (or fire-and-forget) calls and tracks the rewarded flow's
 * lifecycle as a reactive `status`.
 *
 * It manages its own `ezRewardedAds` command-queue stub via
 * {@link ensureRewardedCmdQueue}, so it works with the rewarded runtime however
 * it is bootstrapped. It is SSR-safe — no browser global is touched during
 * setup; the default init scheduler, ready flip, and event listeners attach in
 * `onMounted` (client only); the event listeners detach in `onUnmounted`.
 *
 * **Default (runtime-served) mode.** On an Ezoic JS-integrated page — one this
 * SDK bootstraps via {@link EzoicPlugin} — no loader URL is needed. When neither
 * {@link UseEzoicRewardedOptions.loaderUrl} nor the plugin's `rewardedLoaderUrl`
 * is set, the composable schedules `ezstandalone.initRewardedAds(placements)`
 * once per page (through {@link useEzoic}'s `initRewardedAds`, so the ezstandalone
 * command-queue plumbing is not duplicated). The Ezoic runtime then serves the
 * host-correct rewarded loader in its own response and drains
 * `window.ezRewardedAds.cmd`.
 *
 * The init call is **deferred**, never fired synchronously at mount. The
 * runtime's `initRewardedAds` internally runs `showAds([12])`; issuing that
 * before the page's first real `showAds` has established the initial ad load
 * collides with the runtime's mid-initialization state machine and wedges the
 * whole page (no `sa.go` request, nothing renders). To avoid that,
 * {@link scheduleRewardedInit} waits until {@link hasInitialAdLoadStarted}
 * reports the initial load has started (so the internal `showAds([12])` routes
 * safely through `displayMore`) — polled every ~250 ms — before dispatching. If
 * a ~4 s grace window elapses first and the SDK has mounted NO display
 * placements, the page is rewarded-only, so `initRewardedAds` IS its ad bootstrap
 * and is fired at the deadline. When placements are mounted but the initial load
 * has not yet started, the deadline does not fire (that could preempt the pending
 * initial load); the poll simply continues until the load starts or the page
 * unloads. The scheduler is page-global and runs to completion once started — it
 * is not cancelled when the initiating component unmounts, because other rewarded
 * consumers may still exist.
 *
 * **Escape hatch.** Passing {@link UseEzoicRewardedOptions.loaderUrl} (or setting
 * the plugin's `rewardedLoaderUrl`) instead injects a site-specific
 * `{host}/porpoiseant/ezadloadrewarded.js` loader as a `<script>` tag. Use it
 * only for pages that are not Ezoic JS-integrated through this SDK; `placements`
 * is ignored in that mode. A rewarded loader already present in the page — SDK-
 * injected or hand-included in the host HTML — also suppresses the default init.
 *
 * **Mixed mode (rare).** If one composable passes `loaderUrl` and another uses
 * the default on the same page, both triggers are one-way and mount order
 * decides: whichever mounts first wins. A default-mode composable that mounts
 * before any loader is injected calls `initRewardedAds` (guarded to once per
 * page); a loader-URL composable that mounts first injects the loader, after
 * which later default-mode mounts detect it and skip init. Prefer not to mix.
 *
 * Every underlying rewarded method delivers its result through a callback.
 * `request` and `show` always fire that callback in every outcome. `requestAndShow`
 * and `requestWithOverlay` only fire it on every outcome when told to, so this
 * composable forces that option internally — the caller distinguishes outcomes
 * (reward granted, no-fill, user cancel, or closed-before-reward) via the
 * resolved result's `status` / `reward` / `msg` fields, not by whether the
 * promise settles. `contentLocker` settles via its `readyCallback`. In all
 * cases the promises here settle exactly when the ad flow resolves — no timer
 * is used. In default mode the loader arrives automatically after
 * `initRewardedAds`, so a pending promise means the ad flow is still running,
 * not a missing loader.
 */
import { inject, onMounted, onUnmounted, readonly, ref } from 'vue';
import type { Ref } from 'vue';
import { hasMountedPlacements } from './adBatch';
import {
  ensureRewardedCmdQueue,
  injectRewardedLoader,
  isRewardedLoaderInjected,
} from './scripts';
import { ezoicInjectionKey } from './keys';
import type { EzoicCmdFn } from './global';
import type {
  EzoicApi,
  RewardedContentLockerAction,
  RewardedContentLockerConfig,
  RewardedFlowStatus,
  RewardedOverlayText,
  RewardedRequestAndShowConfig,
  RewardedRequestConfig,
  RewardedRequestResult,
  RewardedRequestWithOverlayConfig,
  RewardedShowConfig,
  RewardedShowResult,
  RewardedSiteWidePlacements,
} from './types';

/**
 * Message used when the rewarded loader is not present (no browser environment,
 * or the loader was never injected). Surfaced as a real, typed failure result
 * rather than a fabricated success.
 */
const REWARDED_UNAVAILABLE_MSG =
  'Ezoic rewarded ads are unavailable (no browser environment or loader not present).';

/** Options for {@link useEzoicRewarded}. */
export interface UseEzoicRewardedOptions {
  /**
   * **Escape hatch — usually omit this.** An explicit site-specific rewarded
   * loader URL (`{your-ad-host}/porpoiseant/ezadloadrewarded.js`) to inject as a
   * `<script>` tag on mount.
   *
   * Only supply this for pages that are **not** Ezoic JS-integrated through this
   * SDK. On a normal integrated page leave it unset: the default mode calls
   * `ezstandalone.initRewardedAds(...)` and the Ezoic runtime serves the
   * host-correct loader for you (see {@link useEzoicRewarded}), so a per-site
   * URL is neither needed nor correct. When either this or the plugin's
   * `rewardedLoaderUrl` is set, escape-hatch mode is active and
   * {@link placements} is ignored.
   */
  loaderUrl?: string;
  /**
   * Site-wide rewarded placement toggles forwarded to
   * `ezstandalone.initRewardedAds` in the default (runtime-served) mode. Omitted
   * keys fall back to the runtime default (all enabled). Ignored when a loader
   * URL escape hatch is active ({@link loaderUrl} or the plugin's
   * `rewardedLoaderUrl`).
   */
  placements?: RewardedSiteWidePlacements;
}

/**
 * Module-level guard so the default (runtime-served) mode calls
 * `initRewardedAds` at most once per page, even when several components each use
 * {@link useEzoicRewarded}. The first default-mode caller's {@link
 * UseEzoicRewardedOptions.placements} win.
 */
let rewardedInitialized = false;

/**
 * Interval, in milliseconds, between {@link scheduleRewardedInit} polls of
 * {@link hasInitialAdLoadStarted}.
 */
const REWARDED_INIT_POLL_INTERVAL_MS = 250;

/**
 * Grace window, in milliseconds, from scheduling before {@link
 * scheduleRewardedInit} fires `initRewardedAds` on a page that has mounted NO
 * display placements (a rewarded-only page).
 */
const REWARDED_INIT_GRACE_MS = 4000;

/**
 * Module-level guard so the deferred init is scheduled at most once per page,
 * even when several components use {@link useEzoicRewarded}. Distinct from
 * {@link rewardedInitialized}, which guards the single init dispatch: the
 * scheduler starts once, then dispatches once.
 */
let rewardedInitScheduled = false;

/** Handle for the enabled-poll interval; cleared once init is dispatched. */
let rewardedInitPollTimer: ReturnType<typeof setInterval> | undefined;

/** Handle for the grace-window timeout; cleared once init is dispatched. */
let rewardedInitGraceTimer: ReturnType<typeof setTimeout> | undefined;

/** Clears any pending {@link scheduleRewardedInit} timers. */
function clearRewardedInitTimers(): void {
  if (rewardedInitPollTimer !== undefined) {
    clearInterval(rewardedInitPollTimer);
    rewardedInitPollTimer = undefined;
  }
  if (rewardedInitGraceTimer !== undefined) {
    clearTimeout(rewardedInitGraceTimer);
    rewardedInitGraceTimer = undefined;
  }
}

/**
 * Test-only: reset the module-level once-per-page guards and cancel any pending
 * scheduler timers so each test starts from a clean per-page state. Not part of
 * the public package surface (not re-exported from `index.ts`).
 */
export function resetRewardedInitializationForTests(): void {
  rewardedInitialized = false;
  rewardedInitScheduled = false;
  clearRewardedInitTimers();
}

/**
 * Regex matching the sol standalone initial ad request path. That request is
 * issued to `//g.ezoic.net/sa.go` (via XHR) and is visible as a resource-timing
 * entry; this matches `/sa.go` immediately followed by a query string or the end
 * of the entry name.
 */
const SA_GO_REQUEST_RE = /\/sa\.go(?:\?|$)/;

/**
 * Reports whether the page's initial ad load has started — the safe point to
 * dispatch the runtime's `initRewardedAds`, whose internal `showAds([12])` then
 * routes through `displayMore` instead of colliding with a mid-initialization
 * state machine.
 *
 * `window.ezstandalone.enabled` alone is NOT a reliable signal: the public
 * `ezstandalone` wrapper object initializes `enabled: false` and only flips it
 * when a publisher calls the public `enable()`, while the internal standalone
 * instance the display logic uses tracks its own flag that is never mirrored back
 * to the wrapper in the normal `showAds` flow. So a fully successful initial load
 * commonly leaves the public `enabled` at `false`. This predicate is therefore
 * true when ANY of these hold:
 *
 * 1. `window.ezstandalone.enabled === true` — correct when a publisher opts into
 *    the public `enable()` flow.
 * 2. A resource-timing entry matches {@link SA_GO_REQUEST_RE} — the direct signal
 *    that the initial `/sa.go` ad request was issued.
 * 3. A GPT container is rendered INSIDE an Ezoic placeholder (the
 *    `[id^="ezoic-pub-ad-placeholder-"] [id^="div-gpt-ad"]` selector) — this
 *    appears only once the Ezoic ad response is rendering. It is scoped to the
 *    placeholder on purpose: a bare `div-gpt-ad*` match would also fire on plain
 *    publisher-hardcoded GPT slots present in the HTML before the load,
 *    re-introducing the mount-time collision on mixed Ezoic + plain-GPT pages.
 *
 * SSR-safe: returns `false` when `window`, `performance`, or `document` is
 * unavailable.
 */
function hasInitialAdLoadStarted(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.ezstandalone?.enabled === true) return true;
  if (
    typeof performance !== 'undefined' &&
    typeof performance.getEntriesByType === 'function'
  ) {
    for (const entry of performance.getEntriesByType('resource')) {
      if (SA_GO_REQUEST_RE.test(entry.name)) return true;
    }
  }
  if (
    typeof document !== 'undefined' &&
    document.querySelector(
      '[id^="ezoic-pub-ad-placeholder-"] [id^="div-gpt-ad"]',
    ) !== null
  ) {
    return true;
  }
  return false;
}

/**
 * Defers the default (runtime-served) `initRewardedAds` call so it never preempts
 * the page's initial ad load, then dispatches it exactly once.
 *
 * See the module doc for why immediate dispatch wedges the page. This scheduler
 * fires `dispatchInit` when the first of these holds:
 *
 * 1. {@link hasInitialAdLoadStarted} reports the initial load has started, so the
 *    runtime's internal `showAds([12])` routes safely through `displayMore`.
 *    Polled every {@link REWARDED_INIT_POLL_INTERVAL_MS} ms.
 * 2. The {@link REWARDED_INIT_GRACE_MS} grace window elapses with NO display
 *    placement mounted ({@link hasMountedPlacements} is `false`) — a
 *    rewarded-only page where `initRewardedAds` is the ad bootstrap.
 *
 * If the grace window elapses while placements ARE mounted but the initial load
 * has not started, init is not fired at the deadline (that could collide with the
 * pending initial load); the poll keeps running until the load starts or the page
 * unloads — one cheap check per interval, and never giving up avoids a silent
 * failure. Page-global and once-per-page; runs to completion regardless of
 * component unmount. SSR-safe: a no-op with no `window`.
 *
 * @param dispatchInit dispatches the actual `initRewardedAds` call with the first
 *   default-mode caller's placements. Invoked at most once.
 */
function scheduleRewardedInit(dispatchInit: () => void): void {
  if (typeof window === 'undefined') return;
  if (rewardedInitScheduled) return;
  rewardedInitScheduled = true;

  const fire = (): void => {
    if (rewardedInitialized) return;
    rewardedInitialized = true;
    clearRewardedInitTimers();
    dispatchInit();
  };

  // Fast path: the initial load has already started.
  if (hasInitialAdLoadStarted()) {
    fire();
    return;
  }

  rewardedInitPollTimer = setInterval(() => {
    if (hasInitialAdLoadStarted()) fire();
  }, REWARDED_INIT_POLL_INTERVAL_MS);

  rewardedInitGraceTimer = setTimeout(() => {
    rewardedInitGraceTimer = undefined;
    if (rewardedInitialized) return;
    // Rewarded-only page: init is the page's ad bootstrap, so fire it. Otherwise
    // the ad-load poll above owns the eventual dispatch.
    if (!hasMountedPlacements()) fire();
  }, REWARDED_INIT_GRACE_MS);
}

/**
 * The reactive rewarded API returned by {@link useEzoicRewarded}.
 *
 * The callback-style methods return a Promise that resolves with the underlying
 * result object. When rewarded ads are unavailable they resolve a typed failure
 * (`status: false`) rather than rejecting.
 */
export interface EzoicRewarded {
  /**
   * `true` once the rewarded command queue has run this composable's ready
   * callback (i.e. the loader has initialized). Always `false` during SSR and
   * until the loader loads.
   */
  ready: Readonly<Ref<boolean>>;
  /**
   * The rewarded flow lifecycle status, driven by the window events the
   * rewarded script dispatches: `idle` → `initiated` → `displayed` → `closed`.
   */
  status: Readonly<Ref<RewardedFlowStatus>>;
  /** Register a rewarded pageview for tracking (idempotent per pageview). */
  register: () => void;
  /**
   * Request a rewarded ad. Resolves with availability
   * ({@link RewardedRequestResult}).
   */
  request: (config?: RewardedRequestConfig) => Promise<RewardedRequestResult>;
  /**
   * Show a previously requested rewarded ad. Resolves with the reward outcome
   * ({@link RewardedShowResult}).
   */
  show: (config?: RewardedShowConfig) => Promise<RewardedShowResult>;
  /**
   * Request and immediately show a rewarded ad. Resolves with the reward
   * outcome ({@link RewardedShowResult}).
   */
  requestAndShow: (
    config?: RewardedRequestAndShowConfig,
  ) => Promise<RewardedShowResult>;
  /**
   * Prompt the visitor with an overlay, then request and show a rewarded ad.
   * Resolves with the reward outcome ({@link RewardedShowResult}).
   */
  requestWithOverlay: (
    text?: RewardedOverlayText,
    config?: RewardedRequestWithOverlayConfig,
  ) => Promise<RewardedShowResult>;
  /**
   * Gate content behind a rewarded ad. `action` is a URL to redirect to, or a
   * function to run, after the reward is earned. Resolves with the request
   * result once the ad is ready (also invoking any `readyCallback` in `config`).
   */
  contentLocker: (
    action: RewardedContentLockerAction,
    config?: RewardedContentLockerConfig,
  ) => Promise<RewardedRequestResult>;
}

/**
 * Queue a callback on `ezRewardedAds.cmd`. Ensures the queue exists first.
 * Returns `false` (queuing nothing) during SSR or when no queue is available,
 * so callers can resolve a typed failure instead of hanging.
 */
function pushRewarded(fn: EzoicCmdFn): boolean {
  if (typeof window === 'undefined') return false;
  ensureRewardedCmdQueue();
  const q = window.ezRewardedAds?.cmd;
  if (!q) return false;
  q.push(fn);
  return true;
}

/**
 * Shared plumbing for the callback-style rewarded methods. Queues `invoke` on
 * the rewarded command queue; `invoke` should call the underlying method with a
 * callback that resolves the promise and return `true`, or return `false` when
 * the underlying method is not present. If queuing fails or `invoke` reports the
 * method missing, the promise resolves `failure` instead.
 */
function settleRewarded<T>(
  invoke: (resolve: (data: T) => void) => boolean,
  failure: T,
): Promise<T> {
  return new Promise<T>((resolve) => {
    const queued = pushRewarded(() => {
      if (!invoke(resolve)) resolve(failure);
    });
    if (!queued) resolve(failure);
  });
}

/**
 * Wrap `window.ezRewardedAds` as a reactive composable. Call from a component
 * `setup()`.
 *
 * On an Ezoic JS-integrated page it needs no configuration: the default mode
 * schedules `ezstandalone.initRewardedAds(options.placements)` once per page —
 * deferred until the initial ad load has started (or a grace window elapses on a
 * rewarded-only page) — so the Ezoic runtime serves the rewarded loader without
 * wedging the initial load. Pass `loaderUrl` only as an escape hatch for
 * non-integrated pages (see the module doc for the deferral, SSR, availability,
 * and "no timer" semantics).
 *
 * @param options optional {@link UseEzoicRewardedOptions}; pass `placements` to
 *   scope the site-wide rewarded formats in default mode, or `loaderUrl` to
 *   inject an explicit loader instead (escape hatch).
 */
export function useEzoicRewarded(
  options: UseEzoicRewardedOptions = {},
): EzoicRewarded {
  const ready = ref(false);
  const status = ref<RewardedFlowStatus>('idle');

  // Capture the plugin API during setup (inject must run synchronously here).
  // Default mode reuses its `initRewardedAds` — the same ezstandalone
  // command-queue plumbing as api.ts — rather than re-implementing it. Absent
  // when the plugin is not installed (escape-hatch-only, decoupled usage).
  const ezoic = inject<EzoicApi | null>(ezoicInjectionKey, null);

  let disposed = false;
  let onInitiated: (() => void) | undefined;
  let onDisplayed: (() => void) | undefined;
  let onClosed: (() => void) | undefined;

  const register = (): void => {
    pushRewarded(() => window.ezRewardedAds?.register?.());
  };

  const request = (
    config?: RewardedRequestConfig,
  ): Promise<RewardedRequestResult> =>
    settleRewarded<RewardedRequestResult>(
      (resolve) => {
        const rewarded = window.ezRewardedAds;
        if (typeof rewarded?.request !== 'function') return false;
        rewarded.request((data) => resolve(data), config);
        return true;
      },
      { status: false, msg: REWARDED_UNAVAILABLE_MSG },
    );

  const show = (config?: RewardedShowConfig): Promise<RewardedShowResult> =>
    settleRewarded<RewardedShowResult>(
      (resolve) => {
        const rewarded = window.ezRewardedAds;
        if (typeof rewarded?.show !== 'function') return false;
        rewarded.show((data) => resolve(data), config);
        return true;
      },
      { status: false, reward: false, msg: REWARDED_UNAVAILABLE_MSG },
    );

  const requestAndShow = (
    config?: RewardedRequestAndShowConfig,
  ): Promise<RewardedShowResult> =>
    settleRewarded<RewardedShowResult>(
      (resolve) => {
        const rewarded = window.ezRewardedAds;
        if (typeof rewarded?.requestAndShow !== 'function') return false;
        // Force alwaysCallback: the native method only invokes its callback on
        // non-granted outcomes (no-fill, cancel, closed-before-reward) when this
        // is true; without it the promise would hang on those common outcomes.
        // Not a public config field (see RewardedRequestAndShowConfig), so it's
        // added here via an explicitly-typed local rather than a caller option.
        const forcedConfig: RewardedRequestAndShowConfig & {
          alwaysCallback: true;
        } = { ...config, alwaysCallback: true };
        rewarded.requestAndShow((data) => resolve(data), forcedConfig);
        return true;
      },
      { status: false, reward: false, msg: REWARDED_UNAVAILABLE_MSG },
    );

  const requestWithOverlay = (
    text?: RewardedOverlayText,
    config?: RewardedRequestWithOverlayConfig,
  ): Promise<RewardedShowResult> =>
    settleRewarded<RewardedShowResult>(
      (resolve) => {
        const rewarded = window.ezRewardedAds;
        if (typeof rewarded?.requestWithOverlay !== 'function') return false;
        // Same alwaysCallback override as requestAndShow — see that comment.
        const forcedConfig: RewardedRequestWithOverlayConfig & {
          alwaysCallback: true;
        } = { ...config, alwaysCallback: true };
        rewarded.requestWithOverlay(
          (data) => resolve(data),
          text,
          forcedConfig,
        );
        return true;
      },
      { status: false, reward: false, msg: REWARDED_UNAVAILABLE_MSG },
    );

  const contentLocker = (
    action: RewardedContentLockerAction,
    config?: RewardedContentLockerConfig,
  ): Promise<RewardedRequestResult> =>
    new Promise<RewardedRequestResult>((resolve) => {
      let settled = false;
      const settle = (result: RewardedRequestResult): void => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      // Bridge the content-locker's readyCallback to the promise: resolve first
      // (guarded), then invoke the caller's own readyCallback. User callback
      // errors are intentionally not swallowed.
      const userReady = config?.readyCallback;
      const mergedConfig: RewardedContentLockerConfig = {
        ...config,
        readyCallback: (result) => {
          settle(result);
          userReady?.(result);
        },
      };
      const queued = pushRewarded(() => {
        const rewarded = window.ezRewardedAds;
        if (typeof rewarded?.contentLocker !== 'function') {
          settle({ status: false, msg: REWARDED_UNAVAILABLE_MSG });
          return;
        }
        rewarded.contentLocker(action, mergedConfig);
      });
      if (!queued) settle({ status: false, msg: REWARDED_UNAVAILABLE_MSG });
    });

  onMounted(() => {
    if (typeof window === 'undefined') return;

    if (options.loaderUrl) {
      // Escape hatch (composable-level): inject the explicit loader script.
      // Idempotent — safe if the plugin already injected the same loader.
      injectRewardedLoader(options.loaderUrl);
    } else if (!isRewardedLoaderInjected()) {
      // Default (runtime-served) mode: neither this composable nor the plugin
      // configured a loader URL. Ask the Ezoic runtime to serve the host-correct
      // rewarded loader by calling initRewardedAds once per page — but DEFERRED
      // via the page-global scheduler so it never preempts the initial ad load
      // (see the module doc). Reuses useEzoic()'s initRewardedAds so the
      // ezstandalone command-queue logic is not duplicated. The first
      // default-mode caller's placements win (scheduleRewardedInit is a no-op
      // once already scheduled).
      if (ezoic) {
        const { placements } = options;
        scheduleRewardedInit(() => ezoic.initRewardedAds(placements));
      }
    }
    // Otherwise the plugin's rewardedLoaderUrl already injected the loader
    // (plugin-level escape hatch); nothing to do and `placements` is ignored.

    // Flip ready once the rewarded queue drains this callback — works whether
    // the loader has already initialized (runs immediately) or not (runs at
    // init), mirroring the plugin's ready flip.
    pushRewarded(() => {
      if (!disposed) ready.value = true;
    });

    onInitiated = (): void => {
      if (!disposed) status.value = 'initiated';
    };
    onDisplayed = (): void => {
      if (!disposed) status.value = 'displayed';
    };
    onClosed = (): void => {
      if (!disposed) status.value = 'closed';
    };
    window.addEventListener('ezRewardedInitiated', onInitiated);
    window.addEventListener('ezRewardedDisplayed', onDisplayed);
    window.addEventListener('ezRewardedClosed', onClosed);
  });

  onUnmounted(() => {
    disposed = true;
    if (typeof window === 'undefined') return;
    if (onInitiated)
      window.removeEventListener('ezRewardedInitiated', onInitiated);
    if (onDisplayed)
      window.removeEventListener('ezRewardedDisplayed', onDisplayed);
    if (onClosed) window.removeEventListener('ezRewardedClosed', onClosed);
  });

  return {
    ready: readonly(ready) as Readonly<Ref<boolean>>,
    status: readonly(status) as Readonly<Ref<RewardedFlowStatus>>,
    register,
    request,
    show,
    requestAndShow,
    requestWithOverlay,
    contentLocker,
  };
}
