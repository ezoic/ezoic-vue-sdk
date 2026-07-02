/**
 * `useEzoic()` composable — access the Ezoic runtime API from any component
 * within an app that installed {@link EzoicPlugin}.
 */
import { inject } from 'vue';
import { ezoicInjectionKey } from './keys';
import type { EzoicApi } from './types';

/**
 * Returns the {@link EzoicApi} provided by the plugin: the reactive `ready`
 * flag and the `push` command-queue helper.
 *
 * Throws if called outside a component whose app installed `EzoicPlugin`, so
 * a missing installation fails loudly rather than silently no-op'ing.
 */
export function useEzoic(): EzoicApi {
  const api = inject(ezoicInjectionKey);
  if (!api) {
    throw new Error(
      '[ezoic-vue-sdk] useEzoic() requires the Ezoic plugin. Call ' +
        'app.use(EzoicPlugin) before using it, and call useEzoic() from within ' +
        'a component setup.',
    );
  }
  return api;
}
