/**
 * Page-level coordination for `<EzoicAd>` components: a duplicate-id guard and a
 * per-tick batcher that coalesces every ad mounting in the same tick into a
 * single `ezstandalone.showAds(...)` call.
 *
 * State is module-global on purpose. A page has exactly one `ezstandalone`
 * instance, so all placeholders — even across separate Vue app instances —
 * should share one duplicate registry and batch into one `showAds` call, which
 * is the most efficient way to hand ids to the ad bundle.
 *
 * Everything here is browser-only; the `<EzoicAd>` component calls in from its
 * client-side lifecycle hooks (`onMounted`/`onUnmounted`), never during SSR.
 */
import type { EzoicCmdFn } from './global';
import type { ShowAdsArg } from './types';

/** Queues a callback on the ezstandalone command queue. */
type PushFn = (fn: EzoicCmdFn) => void;

/** Placeholder ids currently mounted, used to detect duplicates. */
const claimedIds = new Set<number>();

/** Placeholders accumulated for the next `showAds` flush. */
let pendingArgs: ShowAdsArg[] = [];

/** The `push` used to dispatch the pending flush (any mounted ad's works). */
let pendingPush: PushFn | null = null;

/** Whether a microtask flush has already been scheduled for this tick. */
let flushScheduled = false;

/**
 * Claims a placeholder id for a newly mounting ad. Returns `true` if the id was
 * free (the caller now owns it and must release it on unmount), or `false` if
 * an ad with the same id is already mounted (a duplicate the caller must skip).
 */
export function claimAdId(id: number): boolean {
  if (claimedIds.has(id)) return false;
  claimedIds.add(id);
  return true;
}

/** Releases a previously claimed placeholder id (call on unmount). */
export function releaseAdId(id: number): void {
  claimedIds.delete(id);
}

/**
 * Reports whether a placeholder id is currently claimed by a mounted ad. Used by
 * the semantic-location resolver so it never hands out an id another `<EzoicAd>`
 * already owns.
 */
export function isAdIdClaimed(id: number): boolean {
  return claimedIds.has(id);
}

/**
 * Reports whether any `<EzoicAd>` display placeholder is currently mounted on the
 * page. Both numeric-`id` and semantic-`location` placeholders claim an id (a
 * location resolves to one, then claims it), so a non-empty claim registry means
 * at least one display placement is live and will drive the page's initial ad
 * load.
 *
 * The deferred rewarded-init scheduler reads this at its grace deadline to tell a
 * rewarded-only page — where `initRewardedAds` IS the page's ad bootstrap — apart
 * from a page whose display ads will start the initial load on their own.
 */
export function hasMountedPlacements(): boolean {
  return claimedIds.size > 0;
}

/**
 * Adds a placeholder to the pending batch and schedules a microtask flush.
 * Every ad that mounts in the same tick lands in the same batch, so the flush
 * emits exactly one `showAds(...)` carrying all of their ids.
 */
export function queueShowAd(arg: ShowAdsArg, push: PushFn): void {
  pendingArgs.push(arg);
  pendingPush = push;
  if (!flushScheduled) {
    flushScheduled = true;
    queueMicrotask(flushShowAds);
  }
}

/** Drains the pending batch into a single queued `showAds` call. */
function flushShowAds(): void {
  flushScheduled = false;
  const args = pendingArgs;
  const push = pendingPush;
  pendingArgs = [];
  pendingPush = null;
  if (args.length === 0 || !push) return;
  push(() => {
    window.ezstandalone?.showAds?.(...args);
  });
}

/**
 * Clears all module-global batch state. Testing-only: exported so unit tests
 * can isolate cases without leaking claimed ids or a pending flush between
 * them. Not part of the public API (not re-exported from the package entry).
 *
 * @internal
 */
export function resetAdBatchState(): void {
  claimedIds.clear();
  pendingArgs = [];
  pendingPush = null;
  flushScheduled = false;
}
