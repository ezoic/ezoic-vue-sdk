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
 * Written as a render-function component (no `.vue` single-file component) so
 * the SDK needs no template compiler or `eslint-plugin-vue` in its toolchain;
 * consumers use it in templates exactly like any other component.
 *
 * @example
 * ```vue
 * <EzoicAd :id="101" />
 * <EzoicAd :id="102" required :sizes="['728x90', '970x250']" />
 * ```
 */
import { defineComponent, h, onMounted, onUnmounted, type PropType } from 'vue';
import { claimAdId, queueShowAd, releaseAdId } from './adBatch';
import { isValidPlaceholderId, placeholderDomId } from './placeholder';
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
    /** Numeric placeholder id (integer 1–999). */
    id: { type: Number, required: true },
    /**
     * Mark the placeholder as required (`saContext.rid`). Defaults to `false`.
     */
    required: { type: Boolean, default: false },
    /**
     * Explicit ad sizes as `"<width>x<height>"` strings (e.g. `"728x90"`).
     * ezstandalone skips any entry that does not match that shape.
     */
    sizes: { type: Array as PropType<string[]>, default: undefined },
  },
  setup(props) {
    // Establishes the plugin requirement (throws if not installed), even for an
    // invalid id, so misuse fails loudly.
    const ez = useEzoic();

    if (!isValidPlaceholderId(props.id)) {
      console.warn(
        `[ezoic-vue-sdk] <EzoicAd> ignored: invalid placeholder id ${props.id}. ` +
          'Ids must be integers in 1-999.',
      );
      return () => null;
    }

    const domId = placeholderDomId(props.id);
    // Whether this instance owns the id (won the duplicate check). Only the
    // owner registers a showAds and destroys the placeholder on unmount.
    let owns = false;

    onMounted(() => {
      owns = claimAdId(props.id);
      if (!owns) {
        console.warn(
          `[ezoic-vue-sdk] <EzoicAd> duplicate placeholder id ${props.id} ignored; ` +
            'an ad with this id is already mounted.',
        );
        return;
      }
      queueShowAd(toShowAdsArg(props.id, props.required, props.sizes), ez.push);
    });

    onUnmounted(() => {
      if (!owns) return;
      releaseAdId(props.id);
      ez.destroyPlaceholders(props.id);
    });

    return () => h('div', { id: domId });
  },
});
