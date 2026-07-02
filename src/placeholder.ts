import {
  MAX_PLACEHOLDER_ID,
  MIN_PLACEHOLDER_ID,
  PLACEHOLDER_ID_PREFIX,
} from './constants';

/**
 * Returns `true` when `id` is a valid ezstandalone display-placeholder id: an
 * integer in the inclusive range 1–999. ezstandalone only scans ids in this
 * range, so ids outside it never render an ad.
 */
export function isValidPlaceholderId(id: number): boolean {
  return (
    Number.isInteger(id) && id >= MIN_PLACEHOLDER_ID && id <= MAX_PLACEHOLDER_ID
  );
}

/**
 * Returns the DOM id for a display-ad placeholder div, e.g.
 * `placeholderDomId(101)` → `"ezoic-pub-ad-placeholder-101"`.
 *
 * Throws a {@link RangeError} for invalid ids rather than returning a value
 * that would mount a div ezstandalone can never fill.
 */
export function placeholderDomId(id: number): string {
  if (!isValidPlaceholderId(id)) {
    throw new RangeError(
      `Invalid Ezoic placeholder id: ${id}. Ids must be integers in 1-999.`,
    );
  }
  return `${PLACEHOLDER_ID_PREFIX}${id}`;
}

/**
 * Returns the DOM id for a placeholder id that was resolved at runtime — either
 * by a semantic location lookup or by the ad bundle's own allocator, which may
 * return an id above the 1–999 scan range once every reserved slot is in use.
 *
 * Only requires a positive integer, so it accepts those out-of-range allocated
 * ids that {@link placeholderDomId} would reject. Use {@link placeholderDomId}
 * for ids a publisher supplies directly (those must stay within 1–999).
 *
 * Throws a {@link RangeError} for non-integer or non-positive ids.
 */
export function resolvedPlaceholderDomId(id: number): string {
  if (!Number.isInteger(id) || id < MIN_PLACEHOLDER_ID) {
    throw new RangeError(
      `Invalid resolved Ezoic placeholder id: ${id}. Ids must be positive integers.`,
    );
  }
  return `${PLACEHOLDER_ID_PREFIX}${id}`;
}
