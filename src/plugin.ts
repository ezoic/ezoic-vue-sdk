/**
 * The Ezoic Vue plugin. `app.use(EzoicPlugin, options)` injects the Ezoic
 * script set (CMP → cmd-queue stub → standalone bundle) and provides the
 * {@link EzoicApi} that {@link useEzoic} exposes.
 *
 * SSR-safe: on the server it provides the API but touches no `window` or
 * `document`; script injection and readiness tracking happen only on the
 * client. Works under Nuxt 3.
 */
import { readonly, ref, type App, type Plugin, type Ref } from 'vue';
import { createEzoicApi } from './api';
import { ezoicInjectionKey } from './keys';
import { ensureCmdQueue, injectEzoicScripts } from './scripts';
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

    // The bundle runs queued callbacks once it finishes initializing, so this
    // flips `ready` at exactly the point ezstandalone is usable.
    push(() => {
      ready.value = true;
    });
  },
};
