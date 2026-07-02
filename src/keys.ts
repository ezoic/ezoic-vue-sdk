import type { InjectionKey } from 'vue';
import type { EzoicApi } from './types';

/**
 * Vue injection key for the {@link EzoicApi} the plugin provides. Advanced
 * consumers can `inject(ezoicInjectionKey)` directly; most should use
 * {@link useEzoic} instead.
 *
 * Uses `Symbol.for` (the global symbol registry) so provide/inject still match
 * if a bundle loads both the ESM and CJS builds of this package.
 */
export const ezoicInjectionKey: InjectionKey<EzoicApi> = Symbol.for(
  'ezoic-vue-sdk',
) as InjectionKey<EzoicApi>;
