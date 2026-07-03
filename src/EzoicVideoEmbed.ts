/**
 * `<EzoicVideoEmbed>` — renders an Open Video inline video embed.
 *
 * This is the second, independent video path (distinct from `<EzoicVideo>`,
 * which drives the ad bundle). It renders a publisher-owned container div, then
 * on mount injects the Open Video embed script (once, async, idempotently) and
 * pushes an entry describing the container and video onto the canonical
 * `window.openVideoPlayers` queue. The embed script drains that queue and mounts
 * a player into the container.
 *
 * Because the container is a publisher element (not an Ezoic ad placeholder),
 * fall-through attributes are allowed (default `inheritAttrs`): put a `class` or
 * `style` on `<EzoicVideoEmbed>` to size and position the embed.
 *
 * Self-contained: it does NOT require the plugin — it injects the Open Video
 * script itself and seeds the queue, mirroring how the rewarded/consent
 * composables manage their own globals. Written as a render-function component
 * (no `.vue` single-file component). SSR-safe: the container div renders during
 * server render; the script injection and queue push run only on the client in
 * `onMounted`. There is no public teardown API for the embed — on unmount Vue
 * removes the container div.
 *
 * `float` and `autoplay` are the only supported behavior options (there is no
 * `loop`); each is included on the pushed entry only when the prop is provided.
 *
 * @example
 * ```vue
 * <EzoicVideoEmbed video-id="abc123" :float="true" :autoplay="false" />
 * ```
 */
import { defineComponent, h, onMounted, ref } from 'vue';
import type { OpenVideoPlayerEntry } from './global';
import { injectOpenVideoScript, pushOpenVideoPlayer } from './scripts';

export const EzoicVideoEmbed = defineComponent({
  name: 'EzoicVideoEmbed',
  props: {
    /** Publisher video id to play. Required and non-empty. */
    videoId: { type: String, required: true },
    /**
     * Enable the floating player behavior. Included on the embed entry only
     * when set; omit to use the embed default.
     */
    float: { type: Boolean, default: undefined },
    /**
     * Autoplay the video. Included on the embed entry only when set; omit to
     * use the embed default.
     */
    autoplay: { type: Boolean, default: undefined },
  },
  setup(props) {
    const containerRef = ref<HTMLDivElement | null>(null);

    if (props.videoId.length === 0) {
      console.warn(
        '[ezoic-vue-sdk] <EzoicVideoEmbed> requires a non-empty `videoId`. ' +
          'The container renders, but no embed is requested.',
      );
    }

    onMounted(() => {
      if (typeof window === 'undefined') return;
      if (props.videoId.length === 0) return;

      const target = containerRef.value;
      if (!target) return;

      injectOpenVideoScript();

      const entry: OpenVideoPlayerEntry = {
        target,
        videoID: props.videoId,
      };
      // Include the optional behavior flags only when the prop was provided, so
      // an unset prop falls through to the embed's own defaults.
      if (props.float !== undefined) entry.float = props.float;
      if (props.autoplay !== undefined) entry.autoplay = props.autoplay;

      pushOpenVideoPlayer(entry);
    });

    return () => h('div', { ref: containerRef });
  },
});
