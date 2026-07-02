/**
 * `useEzoicRewarded()` — a composable wrapper around `window.ezRewardedAds`,
 * the Ezoic rewarded-ads global. It exposes the rewarded methods as
 * promise-returning (or fire-and-forget) calls and tracks the rewarded flow's
 * lifecycle as a reactive `status`.
 *
 * Like {@link useEzoicConsent}, it is decoupled from {@link EzoicPlugin}: it
 * manages its own `ezRewardedAds` command-queue stub via
 * {@link ensureRewardedCmdQueue}, so it works whether the rewarded loader was
 * injected by the plugin (`rewardedLoaderUrl` option) or by passing
 * {@link UseEzoicRewardedOptions.loaderUrl} here. It is SSR-safe — no browser
 * global is touched during setup; the loader injection, ready flip, and event
 * listeners attach in `onMounted` (client only) and detach in `onUnmounted`.
 *
 * Every underlying rewarded method delivers its result through a callback.
 * `request` and `show` always fire that callback in every outcome. `requestAndShow`
 * and `requestWithOverlay` only fire it on every outcome when told to, so this
 * composable forces that option internally — the caller distinguishes outcomes
 * (reward granted, no-fill, user cancel, or closed-before-reward) via the
 * resolved result's `status` / `reward` / `msg` fields, not by whether the
 * promise settles. `contentLocker` settles via its `readyCallback`. In all
 * cases the promises here settle exactly when the ad flow resolves — no timer
 * is used. If the loader is never present (misconfiguration), the promises
 * stay pending by design; the fix is to provide a valid `loaderUrl` /
 * `rewardedLoaderUrl`, not to race the real ad flow against a timeout.
 */
import { onMounted, onUnmounted, readonly, ref } from 'vue';
import type { Ref } from 'vue';
import { ensureRewardedCmdQueue, injectRewardedLoader } from './scripts';
import type { EzoicCmdFn } from './global';
import type {
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
   * Publisher-specific rewarded loader URL
   * (`/porpoiseant/ezadloadrewarded.js`). When provided, the composable injects
   * the loader on mount. Omit it when the plugin already injects the loader via
   * its `rewardedLoaderUrl` option — the composable shares the same
   * `ezRewardedAds` global either way.
   */
  loaderUrl?: string;
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
 * See the module doc for the SSR, availability, and "no timer" semantics.
 *
 * @param options optional {@link UseEzoicRewardedOptions}; pass `loaderUrl` to
 *   have the composable inject the rewarded loader itself.
 */
export function useEzoicRewarded(
  options: UseEzoicRewardedOptions = {},
): EzoicRewarded {
  const ready = ref(false);
  const status = ref<RewardedFlowStatus>('idle');

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

    // Inject the loader when the composable owns it. Idempotent — safe if the
    // plugin already injected the same loader.
    if (options.loaderUrl) injectRewardedLoader(options.loaderUrl);

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
