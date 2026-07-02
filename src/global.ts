/**
 * Minimal typing for the `window.ezstandalone` global the Ezoic ad bundle
 * exposes, plus the `Window` augmentation that makes it visible across the SDK.
 *
 * Only the surface this SDK actually uses is declared here. Later releases
 * extend {@link EzstandaloneGlobal} with the display, SPA, consent, and video
 * methods they wrap.
 */

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
 * with the display, SPA, consent, and video methods they wrap.
 */
export interface EzstandaloneGlobal {
  cmd?: EzstandaloneCmdQueue;
}

declare global {
  interface Window {
    ezstandalone?: EzstandaloneGlobal;
  }
}
