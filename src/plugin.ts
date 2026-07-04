/**
 * The Ezoic Vue plugin. `app.use(EzoicPlugin, options)` injects the Ezoic
 * script set (CMP → cmd-queue stub → standalone bundle) and provides the
 * {@link EzoicApi} that {@link useEzoic} exposes.
 *
 * SSR-safe: on the server it provides the API but touches no `window` or
 * `document`; script injection and readiness tracking happen only on the
 * client. Works under Nuxt 3.
 */
import { nextTick, readonly, ref, type App, type Plugin, type Ref } from 'vue';
import { createEzoicApi } from './api';
import { ezoicInjectionKey } from './keys';
import {
  ensureCmdQueue,
  injectEzoicScripts,
  injectRewardedLoader,
} from './scripts';
import type { EzoicApi, EzoicPluginOptions } from './types';

function createPush(): EzoicApi['push'] {
  return (fn: () => void): void => {
    if (typeof window === 'undefined') return;
    ensureCmdQueue();
    // ensureCmdQueue guarantees the queue exists; the guard narrows the type.
    const ez = window.ezstandalone;
    if (ez?.cmd) ez.cmd.push(fn);
  };
}

export const EzoicPlugin: Plugin<[EzoicPluginOptions?]> = {
  install(app: App, options: EzoicPluginOptions = {}): void {
    const ready = ref(false);
    const push = createPush();

    const api = createEzoicApi(readonly(ready) as Readonly<Ref<boolean>>, push);
    app.provide(ezoicInjectionKey, api);

    // Server render: API is provided, but never touch the DOM.
    if (typeof document === 'undefined') return;

    injectEzoicScripts({
      cmp: options.cmp,
      analyticsScriptUrl: options.analyticsScriptUrl,
    });

    // Rewarded ads: escape hatch only. Inject an explicit loader script when the
    // publisher supplies one for a non-JS-integrated page. On a normal page this
    // stays unset and `useEzoicRewarded()` lets the Ezoic runtime serve the
    // loader via initRewardedAds instead.
    if (options.rewardedLoaderUrl) {
      injectRewardedLoader(options.rewardedLoaderUrl);
    }

    // SPA mode: declare the page a single-page app at boot so a later
    // `showAds()` on a route change becomes a new pageview instead of an
    // incremental add. Enabled explicitly via `spa`, or implicitly by wiring a
    // router.
    if (options.spa || options.router) {
      api.setIsSinglePageApplication(true);
    }

    // First-class router integration: rescan the page for placeholders after
    // every navigation. This pairs with `<EzoicAd>` (whose unmount destroys the
    // departing placeholders) and mirrors Ezoic's documented route-change
    // pattern. The scan is deferred to the next tick so the new route's DOM is
    // in place before ezstandalone looks for placeholders; the built-in
    // navigation monitor and ezstandalone's own debounce coalesce this into a
    // single ad request per route change rather than a double-fire.
    if (options.router) {
      options.router.afterEach(() => {
        void nextTick(() => {
          api.showAds();
        });
      });
    }

    // The bundle runs queued callbacks once it finishes initializing, so this
    // flips `ready` at exactly the point ezstandalone is usable.
    push(() => {
      ready.value = true;
    });
  },
};
