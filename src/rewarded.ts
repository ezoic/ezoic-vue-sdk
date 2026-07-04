/**
 * `useEzoicRewarded()` — a composable wrapper around `window.ezRewardedAds`,
 * the Ezoic rewarded-ads global. It exposes the rewarded methods as
 * promise-returning (or fire-and-forget) calls and tracks the rewarded flow's
 * lifecycle as a reactive `status`.
 *
 * It manages its own `ezRewardedAds` command-queue stub via
 * {@link ensureRewardedCmdQueue}, so it works with the rewarded runtime however
 * it is bootstrapped. It is SSR-safe — no browser global is touched during
 * setup; the default init call, ready flip, and event listeners attach in
 * `onMounted` (client only) and detach in `onUnmounted`.
 *
 * **Default (runtime-served) mode.** On an Ezoic JS-integrated page — one this
 * SDK bootstraps via {@link EzoicPlugin} — no loader URL is needed. When neither
 * {@link UseEzoicRewardedOptions.loaderUrl} nor the plugin's `rewardedLoaderUrl`
 * is set, the composable calls `ezstandalone.initRewardedAds(placements)` once
 * per page (through {@link useEzoic}'s `initRewardedAds`, so the ezstandalone
 * command-queue plumbing is not duplicated). The Ezoic runtime then serves the
 * host-correct rewarded loader in its own response and drains
 * `window.ezRewardedAds.cmd`.
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
 * Test-only: reset the module-level {@link rewardedInitialized} guard so each
 * test starts from a clean per-page state. Not part of the public package
 * surface (not re-exported from `index.ts`).
 */
export function resetRewardedInitializationForTests(): void {
  rewardedInitialized = false;
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
 * calls `ezstandalone.initRewardedAds(options.placements)` once per page so the
 * Ezoic runtime serves the rewarded loader. Pass `loaderUrl` only as an escape
 * hatch for non-integrated pages (see the module doc for the SSR, availability,
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
      // configured a loader URL. Ask the Ezoic runtime to serve the
      // host-correct rewarded loader by calling initRewardedAds once per page.
      // Reuses useEzoic()'s initRewardedAds so the ezstandalone command-queue
      // logic is not duplicated.
      if (!rewardedInitialized && ezoic) {
        rewardedInitialized = true;
        ezoic.initRewardedAds(options.placements);
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
