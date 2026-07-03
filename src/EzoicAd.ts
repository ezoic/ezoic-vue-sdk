/**
 * `<EzoicAd>` — renders a single Ezoic display-ad placeholder and drives its
 * lifecycle through the ad bundle.
 *
 * It renders a BARE `<div id="ezoic-pub-ad-placeholder-<id>">` with no styling
 * or attributes of its own: Ezoic's integration requires the placeholder div to
 * be unstyled so the bundle controls sizing. `inheritAttrs` is `false` so a
 * stray `class`/`style` on the component never lands on the placeholder div —
 * wrap `<EzoicAd>` in your own element to position it. On mount the id is
 * batched into a single page-wide `showAds(...)` call (see the adBatch module);
 * on unmount the placeholder is destroyed.
 *
 * Give it either a numeric `id` (generated in your Ezoic dashboard) or a
 * semantic `location` name for a zero-config placement — exactly one, never
 * both. A `location` is resolved to a placeholder id at runtime: the ad bundle's
 * `GetGeneratedIdAsync` is used when it has loaded, otherwise the SDK's static
 * location map resolves it so the placeholder still appears on first paint.
 * Because a location resolves on the client, a `location` placeholder renders
 * nothing during SSR and appears after mount; a numeric `id` renders its div
 * during SSR as well.
 *
 * Written as a render-function component (no `.vue` single-file component) so
 * the SDK needs no template compiler or `eslint-plugin-vue` in its toolchain;
 * consumers use it in templates exactly like any other component.
 *
 * @example
 * ```vue
 * <EzoicAd :id="101" />
 * <EzoicAd :id="102" required :sizes="['728x90', '970x250']" />
 * <EzoicAd location="under_first_paragraph" />
 * ```
 */
import {
  defineComponent,
  h,
  onMounted,
  onUnmounted,
  ref,
  type PropType,
} from 'vue';
import { claimAdId, isAdIdClaimed, queueShowAd, releaseAdId } from './adBatch';
import { isDevMode } from './env';
import { isKnownLocation, resolveLocationIdFromMap } from './locations';
import { isValidPlaceholderId, resolvedPlaceholderDomId } from './placeholder';
import type { ShowAdsArg, ShowAdsPlaceholder } from './types';
import { useEzoic } from './useEzoic';

/**
 * Builds the `showAds` argument for a placeholder: a bare id when it has no
 * options, or the object form when `required` or `sizes` are set.
 */
function toShowAdsArg(
  id: number,
  required: boolean,
  sizes: string[] | undefined,
): ShowAdsArg {
  const hasSizes = Array.isArray(sizes) && sizes.length > 0;
  if (!required && !hasSizes) return id;
  const arg: ShowAdsPlaceholder = { id };
  if (required) arg.required = true;
  if (hasSizes) arg.sizes = sizes;
  return arg;
}

export const EzoicAd = defineComponent({
  name: 'EzoicAd',
  // Never let a consumer's class/style fall through onto the placeholder div;
  // Ezoic requires it to stay bare so the ad bundle controls sizing.
  inheritAttrs: false,
  props: {
    /**
     * Numeric placeholder id (integer 1–999), generated in your Ezoic
     * dashboard. Mutually exclusive with {@link location}.
     */
    id: { type: Number, default: undefined },
    /**
     * Semantic location name for a zero-config placement (e.g.
     * `"under_first_paragraph"`, `"top_of_page"`, `"mid_content"`). Resolved to
     * a placeholder id at runtime. Mutually exclusive with {@link id}.
     */
    location: { type: String, default: undefined },
    /**
     * Mark the placeholder as required (`saContext.rid`). Defaults to `true`
     * for `location` placements — the Ezoic ad server only treats a zero-config (900-range) id
     * as zero-config when it is required — and to `false` for numeric `id`
     * placements. Opt a location out with `:required="false"`.
     */
    required: { type: Boolean, default: undefined },
    /**
     * Explicit ad sizes as `"<width>x<height>"` strings (e.g. `"728x90"`).
     * ezstandalone skips any entry that does not match that shape.
     */
    sizes: { type: Array as PropType<string[]>, default: undefined },
  },
  setup(props) {
    // Establishes the plugin requirement (throws if not installed), even for
    // invalid props, so misuse fails loudly.
    const ez = useEzoic();

    const hasId = props.id != null;
    const hasLocation =
      typeof props.location === 'string' && props.location.length > 0;

    if (hasId === hasLocation) {
      console.warn(
        '[ezoic-vue-sdk] <EzoicAd> requires exactly one of `id` or `location`. ' +
          'Provide a numeric `id` from your dashboard or a semantic `location` name.',
      );
      return () => null;
    }

    if (hasId && !isValidPlaceholderId(props.id as number)) {
      console.warn(
        `[ezoic-vue-sdk] <EzoicAd> ignored: invalid placeholder id ${props.id}. ` +
          'Ids must be integers in 1-999.',
      );
      return () => null;
    }

    if (hasLocation && !isKnownLocation(props.location as string)) {
      console.warn(
        `[ezoic-vue-sdk] <EzoicAd> unknown location "${props.location}"; ` +
          'resolving it to a generic in-content slot. Check for a typo.',
      );
    }

    // The placeholder id once known. A numeric id is known synchronously (so its
    // div renders during SSR and on first paint); a location resolves after
    // mount on the client.
    const resolvedId = ref<number | null>(hasId ? (props.id as number) : null);
    // Whether this instance owns its id (won the duplicate check). Only the
    // owner registers a showAds and destroys the placeholder on unmount.
    let owns = false;
    let ownedId: number | null = null;
    // Set once the component has unmounted. A location resolves asynchronously,
    // so the component can unmount while `GetGeneratedIdAsync` is still pending
    // (e.g. an SPA route change); the late callback must not claim an id or
    // request an ad for a placeholder that is no longer in the DOM.
    let disposed = false;

    /**
     * Claims `id` and queues its showAds. Returns `false` when the id is already
     * owned by another mounted ad (the caller decides whether to warn or retry).
     */
    function claimAndQueue(id: number): boolean {
      if (!claimAdId(id)) return false;
      owns = true;
      ownedId = id;
      resolvedId.value = id;
      // A zero-config `location` placeholder resolves into the reserved 900-range,
      // which has no dashboard-configured sizing, so the caller must pass `sizes`
      // or the placement yields no size-driven ad. A numeric `id` is a
      // dashboard placeholder whose sizing can be set in the Ezoic UI, so `sizes`
      // is optional there and omitting it is not warned about.
      if (
        isDevMode() &&
        hasLocation &&
        !(Array.isArray(props.sizes) && props.sizes.length > 0)
      ) {
        console.warn(
          `[ezoic-vue-sdk] <EzoicAd> location "${props.location}" (placeholder ` +
            `id ${id}) was shown without \`sizes\`. Zero-config location ` +
            'placeholders have no dashboard sizing, so a placement with no sizes ' +
            'yields no size-driven ad. Pass explicit sizes, e.g. ' +
            `:sizes="['728x90', '320x50']".`,
        );
      }
      // Read `required` live at claim time (a location claims after the async
      // id resolve, so a snapshot could go stale if the parent flips the prop).
      // `required` defaults to `true` for a location (zero-config ids are only
      // treated as zero-config server-side when required) and `false` for a
      // numeric id; `??` only falls through on null/undefined, so an explicit
      // `:required="false"` stays `false`.
      const effectiveRequired = props.required ?? hasLocation;
      queueShowAd(toShowAdsArg(id, effectiveRequired, props.sizes), ez.push);
      return true;
    }

    /** Activates a numeric id: a taken id is a duplicate to warn about and skip. */
    function activateNumeric(id: number): void {
      if (disposed) return;
      if (!claimAndQueue(id)) {
        console.warn(
          `[ezoic-vue-sdk] <EzoicAd> duplicate placeholder id ${id} ignored; ` +
            'an ad with this id is already mounted.',
        );
      }
    }

    /**
     * Activates a resolved location id. If the id was taken between resolution
     * and now — two location ads resolving concurrently via the async bundle can
     * land on the same id — re-resolve to the next free slot synchronously (no
     * further race), so each location placeholder still renders a distinct id.
     */
    function activateLocation(location: string, id: number): void {
      if (disposed) return;
      if (claimAndQueue(id)) return;
      claimAndQueue(resolveLocationIdFromMap(location, isAdIdClaimed));
    }

    onMounted(() => {
      if (hasId) {
        activateNumeric(props.id as number);
        return;
      }

      const location = props.location as string;
      const ezg = window.ezstandalone;
      if (!ezg || typeof ezg.GetGeneratedIdAsync !== 'function') {
        activateLocation(
          location,
          resolveLocationIdFromMap(location, isAdIdClaimed),
        );
        return;
      }

      // Bundle is loaded: let it pick the id (DOM-aware, allocates fresh ids for
      // repeated locations). Call it as a method so its internal `this` resolves.
      // Fall back to the static map if it returns something unusable or already
      // claimed by another mounted ad.
      Promise.resolve(ezg.GetGeneratedIdAsync(location))
        .then((raw) => {
          const id = Number(raw);
          if (!Number.isInteger(id) || id < 1 || isAdIdClaimed(id)) {
            return resolveLocationIdFromMap(location, isAdIdClaimed);
          }
          return id;
        })
        .catch(() => resolveLocationIdFromMap(location, isAdIdClaimed))
        .then((id) => activateLocation(location, id));
    });

    onUnmounted(() => {
      disposed = true;
      if (!owns || ownedId == null) return;
      releaseAdId(ownedId);
      ez.destroyPlaceholders(ownedId);
    });

    return () =>
      resolvedId.value == null
        ? null
        : h('div', { id: resolvedPlaceholderDomId(resolvedId.value) });
  },
});
