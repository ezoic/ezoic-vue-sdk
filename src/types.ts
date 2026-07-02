/**
 * Object form of a placeholder accepted by `ezstandalone.showAds(...)`.
 *
 * `id` is required; `required` defaults to `false`; each entry in `sizes` must
 * be a `"<width>x<height>"` string (e.g. `"728x90"`) — ezstandalone skips
 * entries that do not match and warns.
 */
export interface ShowAdsPlaceholder {
  /** Numeric placeholder id (1–999). */
  id: number;
  /** Whether the placeholder must be filled. Defaults to `false`. */
  required?: boolean;
  /** Explicit ad sizes as `"<width>x<height>"` strings. */
  sizes?: string[];
}

/**
 * A placeholder argument to `showAds`: either a bare numeric id or the full
 * {@link ShowAdsPlaceholder} object form.
 */
export type ShowAdsArg = number | ShowAdsPlaceholder;
