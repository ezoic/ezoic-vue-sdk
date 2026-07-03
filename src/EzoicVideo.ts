/**
 * `<EzoicVideo>` — renders a single Ezoic video-ad placeholder and drives its
 * lifecycle through the ad bundle's video path.
 *
 * Unlike `<EzoicAd>`, a video placeholder uses a PUBLISHER-CHOSEN string div id
 * (not the `ezoic-pub-ad-placeholder-<n>` display convention). The component
 * renders a BARE `<div id="<divId>">` with no styling of its own — the ad
 * bundle controls the placeholder — so `inheritAttrs` is `false`; wrap
 * `<EzoicVideo>` in your own element to position it.
 *
 * On mount it calls `ezstandalone.displayMoreVideo(divId)` alone. That single
 * call both registers the div id and loads its video ad code, so the SDK must
 * NOT call `defineVideo` first: pre-registering would make the id already known
 * and turn the subsequent load into a silent no-op. (`defineVideo` remains
 * available as a `useEzoic()` passthrough for advanced register-now /
 * load-on-pageview flows.) On unmount it tears the placeholder down with
 * `ezstandalone.destroyVideoPlaceholders(divId)` in `onBeforeUnmount` — while
 * the div is still in the DOM — because the bundle only unregisters an id whose
 * element still exists; running teardown after removal would leave the
 * registration stale and block a remount with the same id.
 *
 * A module-level duplicate guard mirrors `<EzoicAd>`: if the same div id is
 * already claimed by another mounted `<EzoicVideo>`, this instance warns,
 * renders the div, but does not drive or destroy it (only the owner does).
 *
 * Requires the plugin (uses `useEzoic()` passthroughs). Written as a
 * render-function component (no `.vue` single-file component) so the SDK needs
 * no template compiler. SSR-safe: the div id is known synchronously so the div
 * renders during SSR too; the `displayMoreVideo` call runs only on the client in
 * `onMounted`.
 *
 * @example
 * ```vue
 * <EzoicVideo :div-id="'my-video-slot'" />
 * ```
 */
import { defineComponent, h, onBeforeUnmount, onMounted } from 'vue';
import { useEzoic } from './useEzoic';

/**
 * Video placeholder div ids currently claimed by a mounted `<EzoicVideo>`. A
 * page has exactly one `ezstandalone` instance, so the registry is module-global
 * (shared across Vue app instances) — mirroring the `<EzoicAd>` duplicate guard,
 * but keyed by publisher string ids and without batching.
 */
const claimedVideoDivIds = new Set<string>();

/**
 * Clears the claimed video-div registry. Testing-only: exported so unit tests
 * can isolate cases without leaking claimed ids between them. Not part of the
 * public API (not re-exported from the package entry).
 *
 * @internal
 */
export function resetVideoState(): void {
  claimedVideoDivIds.clear();
}

export const EzoicVideo = defineComponent({
  name: 'EzoicVideo',
  // Never let a consumer's class/style fall through onto the placeholder div;
  // the ad bundle controls it. Wrap <EzoicVideo> to position it.
  inheritAttrs: false,
  props: {
    /**
     * Publisher-chosen div id for the video placeholder. Required and
     * non-empty. Rendered verbatim as the div's `id` and passed to
     * `displayMoreVideo`/`destroyVideoPlaceholders`.
     */
    divId: { type: String, required: true },
  },
  setup(props) {
    // Establishes the plugin requirement (throws if not installed), even for an
    // invalid divId, so misuse fails loudly.
    const ez = useEzoic();

    if (props.divId.length === 0) {
      console.warn(
        '[ezoic-vue-sdk] <EzoicVideo> requires a non-empty `divId`. ' +
          'Provide the publisher-chosen video placeholder div id.',
      );
      return () => null;
    }

    // Whether this instance owns its div id (won the duplicate check). Only the
    // owner loads the video and destroys the placeholder on unmount.
    let owns = false;
    // The div id captured at claim time. `divId` is a reactive prop; if a
    // parent changes it on this instance without remounting, teardown must
    // still release the originally-claimed id, not whatever `props.divId` is
    // by the time onBeforeUnmount runs.
    let ownedDivId: string | null = null;

    onMounted(() => {
      if (claimedVideoDivIds.has(props.divId)) {
        console.warn(
          `[ezoic-vue-sdk] <EzoicVideo> duplicate div id "${props.divId}" ` +
            'ignored; a video placeholder with this id is already mounted.',
        );
        return;
      }
      claimedVideoDivIds.add(props.divId);
      owns = true;
      ownedDivId = props.divId;
      // displayMoreVideo alone both registers the div id and loads its ad code.
      ez.displayMoreVideo(props.divId);
    });

    // Teardown must run while the div is still in the DOM: the bundle only
    // unregisters an id whose element still exists, so onBeforeUnmount (not
    // onUnmounted) is required or a remount with the same id would be blocked.
    onBeforeUnmount(() => {
      if (!owns || ownedDivId === null) return;
      claimedVideoDivIds.delete(ownedDivId);
      ez.destroyVideoPlaceholders(ownedDivId);
    });

    return () => h('div', { id: props.divId });
  },
});
