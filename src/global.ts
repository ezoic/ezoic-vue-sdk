/**
 * Minimal typing for the `window.ezstandalone` global the Ezoic ad bundle
 * exposes, plus the `Window` augmentation that makes it visible across the SDK.
 *
 * Only the surface this SDK actually uses is declared here. Later releases
 * extend {@link EzstandaloneGlobal} with the SPA, consent, and video methods
 * they wrap.
 */
import type { ShowAdsArg } from './types';

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
}

declare global {
  interface Window {
    ezstandalone?: EzstandaloneGlobal;
  }
}
