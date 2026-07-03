/**
 * Public Ezoic script URLs and the placeholder DOM contract.
 *
 * These values are part of Ezoic's published integration requirements: the two
 * Gatekeeper CMP consent scripts must load before the standalone ad bundle, and
 * placeholder divs use a fixed id prefix. See the Ezoic integration docs:
 * https://docs.ezoic.com/docs/ezoicads/integration/
 */

/** Standalone ad bundle. Must load after the CMP consent scripts. */
export const STANDALONE_SCRIPT_URL = 'https://www.ezojs.com/ezoic/sa.min.js';

/**
 * Open Video embed script. Powers the inline video embeds rendered by
 * `<EzoicVideoEmbed>`: once loaded it drains `window.openVideoPlayers` and
 * mounts a player into each pushed container. It is independent of the
 * standalone ad bundle and is injected on demand (async) by the embed
 * component. See the Ezoic video docs:
 * https://docs.ezoic.com/docs/ezoicads/integration/
 */
export const OPEN_VIDEO_SCRIPT_URL = 'https://open.video/video.js';

/**
 * Gatekeeper CMP consent scripts, in required load order.
 *
 * Both MUST be injected before {@link STANDALONE_SCRIPT_URL}. Each must carry
 * `data-cfasync="false"` (set before the `src` attribute) so Cloudflare Rocket
 * Loader does not defer them, which would break consent gating.
 */
export const CMP_SCRIPT_URLS = [
  'https://cmp.gatekeeperconsent.com/min.js',
  'https://the.gatekeeperconsent.com/cmp.min.js',
] as const;

/**
 * DOM id prefix for display-ad placeholder divs. A placeholder for id `101`
 * is `<div id="ezoic-pub-ad-placeholder-101">`.
 */
export const PLACEHOLDER_ID_PREFIX = 'ezoic-pub-ad-placeholder-';

/** Lowest numeric placeholder id ezstandalone scans on the page. */
export const MIN_PLACEHOLDER_ID = 1;

/** Highest numeric placeholder id ezstandalone scans on the page. */
export const MAX_PLACEHOLDER_ID = 999;
