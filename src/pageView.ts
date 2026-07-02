/**
 * `useEzoicPageView()` — the router-agnostic core for single-page-app routing.
 *
 * Watch a value that changes on every route change (a route path, a route
 * `fullPath`, a `key`, anything) and this composable turns each change into an
 * Ezoic pageview: it declares SPA mode once, then on each change tears down the
 * departing placeholders and requests the new route's ads.
 *
 * Two modes:
 *
 * - **Scan mode** (no `ids`): on each change it calls `showAds()` with no
 *   arguments, so ezstandalone rescans the DOM for placeholders. Pair this with
 *   `<EzoicAd>`, whose unmount already destroys the placeholders leaving the
 *   page — the rescan just requests whatever the new route rendered.
 * - **Managed mode** (`ids` provided): on each change it calls
 *   `destroyPlaceholders(...previousIds)` then `showAds(...currentIds)`. Use
 *   this when you place the raw `<div id="ezoic-pub-ad-placeholder-N">` markup
 *   yourself (not via `<EzoicAd>`) and need explicit control over which ids are
 *   torn down and requested per route.
 *
 * The watcher uses `flush: 'post'`, so it runs after Vue has patched the new
 * route into the DOM — the placeholders exist before ezstandalone looks for
 * them. It does not fire on the initial render (the first pageview is handled
 * by the components/markup mounting normally); it only reacts to subsequent
 * changes.
 *
 * SSR-safe: the SPA declaration is queued on the command queue (a no-op on the
 * server) and the post-flush watcher never runs during server rendering.
 *
 * For Vue Router users the plugin's `router` option wires the scan-mode
 * behavior automatically; reach for this composable when you need managed ids,
 * a non-Vue-Router router, or a custom route key.
 *
 * @example Scan mode with Vue Router, paired with `<EzoicAd>`:
 * ```ts
 * import { useRoute } from 'vue-router';
 * import { useEzoicPageView } from '@ezoic/vue-sdk';
 *
 * const route = useRoute();
 * useEzoicPageView(() => route.fullPath);
 * ```
 *
 * @example Managed mode with explicit per-route ids:
 * ```ts
 * const route = useRoute();
 * const ids = computed(() => (route.name === 'article' ? [101, 102] : [201]));
 * useEzoicPageView(() => route.fullPath, { ids });
 * ```
 */
import { toValue, watch, type MaybeRefOrGetter, type WatchSource } from 'vue';
import { useEzoic } from './useEzoic';

/** Options for {@link useEzoicPageView}. */
export interface EzoicPageViewOptions {
  /**
   * The placeholder ids present on the current route. Provide this only when
   * you render the placeholder divs yourself (managed mode): on each route
   * change the previous route's ids are destroyed and these are requested.
   * Omit it to run in scan mode (`showAds()` with no arguments), which is the
   * right choice when `<EzoicAd>` manages the placeholders.
   */
  ids?: MaybeRefOrGetter<number[]>;
}

/**
 * Drive Ezoic pageviews from a reactive route key. See the module doc for the
 * scan-vs-managed modes and SSR behavior.
 *
 * Must be called from a component `setup()` (or another effect scope) within an
 * app that installed `EzoicPlugin`; it throws otherwise, via {@link useEzoic}.
 *
 * @param routeKey A watch source that changes on every route change.
 * @param options Optional {@link EzoicPageViewOptions}; pass `ids` for managed
 *   mode.
 */
export function useEzoicPageView(
  routeKey: WatchSource<unknown>,
  options: EzoicPageViewOptions = {},
): void {
  const ez = useEzoic();

  // Using this composable implies the app is a single-page app; declare it so a
  // no-argument showAds() on a route change refreshes the pageview rather than
  // adding incrementally. Queued on the command queue, so a no-op during SSR.
  ez.setIsSinglePageApplication(true);

  // Captured as a const so its `undefined` check narrows the type inside the
  // watcher closure (scan mode vs managed mode).
  const idsSource = options.ids;
  // The ids requested for the current route, so the next change knows what to
  // tear down. Seeded with the initial route's ids in managed mode.
  let currentIds: number[] = idsSource !== undefined ? toValue(idsSource) : [];

  watch(
    routeKey,
    () => {
      if (idsSource === undefined) {
        // Scan mode: departing placeholders are destroyed by their <EzoicAd>
        // unmounts; just request whatever the new route rendered.
        ez.showAds();
        return;
      }

      // Managed mode: tear down the previous route's ids, then request this
      // route's ids. Order is preserved because both route through the command
      // queue in call order.
      if (currentIds.length > 0) ez.destroyPlaceholders(...currentIds);
      const nextIds = toValue(idsSource);
      if (nextIds.length > 0) ez.showAds(...nextIds);
      currentIds = nextIds;
    },
    { flush: 'post' },
  );
}
