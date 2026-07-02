/**
 * Builds the {@link EzoicApi} the plugin provides — the reactive `ready` flag,
 * the low-level `push` helper, and typed passthroughs to the `ezstandalone`
 * display methods.
 *
 * Every passthrough routes its call through `push`, so it is queued on the
 * command queue and runs after the standalone bundle initializes (or
 * immediately if it already has). All calls are guarded with optional chaining
 * so a blocked or missing bundle degrades to a no-op rather than throwing.
 */
import type { Ref } from 'vue';
import type { EzoicApi, ShowAdsArg } from './types';

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
  };
}
