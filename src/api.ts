/**
 * Builds the {@link EzoicApi} the plugin provides — the reactive `ready` flag,
 * the low-level `push` helper, and typed passthroughs to the `ezstandalone`
 * display, SPA, configuration, format-toggle, and consent methods.
 *
 * Setter-style passthroughs route their call through `push`, so they are queued
 * on the command queue and run after the standalone bundle initializes (or
 * immediately if it already has). All calls are guarded with optional chaining
 * so a blocked or missing bundle degrades to a no-op rather than throwing.
 *
 * Synchronous getters (`hasAnchorAdBeenClosed`, `isInterstitialAllowed`,
 * `isOutstreamAllowed`) return the bundle's live value once it has loaded and
 * `false` before then — the "answer false until known" contract `isEzoicUser`
 * already uses. `config` is write-only: the public `ezstandalone.config` wrapper
 * returns nothing, so a getter form would always yield `undefined`.
 */
import type { Ref } from 'vue';
import type {
  EzoicApi,
  EzoicConfigOptions,
  RewardedSiteWidePlacements,
  ShowAdsArg,
} from './types';

/**
 * Assembles a complete {@link EzoicApi} from a readiness ref and a `push`
 * implementation. Split out from the plugin so the passthrough wiring is
 * unit-testable in isolation.
 */
export function createEzoicApi(
  ready: Readonly<Ref<boolean>>,
  push: EzoicApi['push'],
): EzoicApi {
  return {
    ready,
    push,
    showAds: (...placeholders: ShowAdsArg[]): void =>
      push(() => window.ezstandalone?.showAds?.(...placeholders)),
    displayMore: (...placeholders: ShowAdsArg[]): void =>
      push(() => window.ezstandalone?.displayMore?.(...placeholders)),
    destroyPlaceholders: (...ids: number[]): void =>
      push(() => window.ezstandalone?.destroyPlaceholders?.(...ids)),
    destroyAll: (): void => push(() => window.ezstandalone?.destroyAll?.()),
    refreshAds: (...ids: number[]): void =>
      push(() => window.ezstandalone?.refreshAds?.(...ids)),
    setIsSinglePageApplication: (spa: boolean): void =>
      push(() => window.ezstandalone?.setIsSinglePageApplication?.(spa)),
    isEzoicUser: (
      percentage?: number,
      callback?: (isUser: boolean) => void,
    ): boolean => {
      if (typeof window === 'undefined') return false;
      const ez = window.ezstandalone;
      if (typeof ez?.isEzoicUser === 'function') {
        return ez.isEzoicUser(percentage, callback);
      }
      // Bundle not loaded yet: answer false now, but if the caller wants the
      // real value, deliver it via the callback once the bundle initializes.
      if (callback) {
        push(() => window.ezstandalone?.isEzoicUser?.(percentage, callback));
      }
      return false;
    },
    config: (options: EzoicConfigOptions): void =>
      push(() => window.ezstandalone?.config?.(options)),
    setEzoicAnchorAd: (enabled: boolean): void =>
      push(() => window.ezstandalone?.setEzoicAnchorAd?.(enabled)),
    hasAnchorAdBeenClosed: (): boolean => {
      if (typeof window === 'undefined') return false;
      const ez = window.ezstandalone;
      return typeof ez?.hasAnchorAdBeenClosed === 'function'
        ? ez.hasAnchorAdBeenClosed()
        : false;
    },
    setInterstitialAllowed: (
      allowed: boolean,
      options?: Record<string, unknown>,
    ): void =>
      push(() =>
        window.ezstandalone?.setInterstitialAllowed?.(allowed, options),
      ),
    isInterstitialAllowed: (): boolean => {
      if (typeof window === 'undefined') return false;
      const ez = window.ezstandalone;
      return typeof ez?.isInterstitialAllowed === 'function'
        ? ez.isInterstitialAllowed()
        : false;
    },
    setOutstreamAllowed: (
      allowed: boolean,
      options?: Record<string, unknown>,
    ): Promise<boolean> => {
      if (typeof window === 'undefined') return Promise.resolve(false);
      const ez = window.ezstandalone;
      if (typeof ez?.setOutstreamAllowed === 'function') {
        return Promise.resolve(ez.setOutstreamAllowed(allowed, options)).then(
          (result) => Boolean(result),
          () => false,
        );
      }
      // Bundle not loaded yet: queue the setter and report an unconfirmed false
      // now rather than leaving the promise pending until (or unless) it loads.
      // Swallow the queued call's own promise so a later rejection (once the cmd
      // queue drains at init) does not surface as an unhandled rejection — the
      // caller already has its resolved `false`.
      push(() => {
        void window.ezstandalone
          ?.setOutstreamAllowed?.(allowed, options)
          ?.catch(() => {});
      });
      return Promise.resolve(false);
    },
    isOutstreamAllowed: (): boolean => {
      if (typeof window === 'undefined') return false;
      const ez = window.ezstandalone;
      return typeof ez?.isOutstreamAllowed === 'function'
        ? ez.isOutstreamAllowed()
        : false;
    },
    enableConsent: (): void =>
      push(() => window.ezstandalone?.enableConsent?.()),
    setDisablePersonalizedStatistics: (disable: boolean): void =>
      push(() =>
        window.ezstandalone?.setDisablePersonalizedStatistics?.(disable),
      ),
    setDisablePersonalizedAds: (disable: boolean): void =>
      push(() => window.ezstandalone?.setDisablePersonalizedAds?.(disable)),
    initRewardedAds: (placements?: RewardedSiteWidePlacements): void =>
      push(() => window.ezstandalone?.initRewardedAds?.(placements)),
  };
}
