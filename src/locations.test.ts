import { describe, expect, it } from 'vitest';
import {
  ID_TO_LOCATION,
  LOCATION_ALIASES,
  LOCATION_TO_ID,
  isKnownLocation,
  resolveLocationIdFromMap,
} from './locations';

/** Nothing is claimed. */
const noneClaimed = () => false;

/** Claims the given ids; everything else is free. */
function claimed(...ids: number[]): (id: number) => boolean {
  const set = new Set(ids);
  return (id) => set.has(id);
}

describe('location maps', () => {
  it('mirrors the reserved 900–999 range with the 961 gap', () => {
    expect(ID_TO_LOCATION[900]).toBe('top_of_page');
    expect(ID_TO_LOCATION[909]).toBe('under_first_paragraph');
    expect(ID_TO_LOCATION[960]).toBe('incontent_50');
    expect(ID_TO_LOCATION[999]).toBe('incontent_88');
    // The bundle's map skips 961.
    expect(ID_TO_LOCATION[961]).toBeUndefined();
    expect(ID_TO_LOCATION[962]).toBe('incontent_51');
  });

  it('maps each canonical name to its lowest id', () => {
    expect(LOCATION_TO_ID.top_of_page).toBe(900);
    expect(LOCATION_TO_ID.under_first_paragraph).toBe(909);
    expect(LOCATION_TO_ID.mid_content).toBe(911);
    // sidebar_middle covers 904–906; the lowest is the precise match.
    expect(LOCATION_TO_ID.sidebar_middle).toBe(904);
  });

  it('exposes the documented aliases', () => {
    expect(LOCATION_ALIASES.incontent_0).toBe('under_second_paragraph');
    expect(LOCATION_ALIASES.sidebar_floating).toBe('sidebar_floating_1');
  });
});

describe('isKnownLocation', () => {
  it('recognizes canonical names and aliases', () => {
    expect(isKnownLocation('under_first_paragraph')).toBe(true);
    expect(isKnownLocation('incontent_0')).toBe(true);
    expect(isKnownLocation('sidebar_floating')).toBe(true);
  });

  it('rejects unknown names', () => {
    expect(isKnownLocation('footer_banner')).toBe(false);
    expect(isKnownLocation('')).toBe(false);
  });
});

describe('resolveLocationIdFromMap', () => {
  it('returns the precise id for a free canonical location', () => {
    expect(resolveLocationIdFromMap('top_of_page', noneClaimed)).toBe(900);
    expect(resolveLocationIdFromMap('under_first_paragraph', noneClaimed)).toBe(
      909,
    );
  });

  it('resolves an alias to its canonical id', () => {
    // incontent_0 -> under_second_paragraph -> 910
    expect(resolveLocationIdFromMap('incontent_0', noneClaimed)).toBe(910);
  });

  it('falls to the first free in-content slot when the precise id is taken', () => {
    // top_of_page (900) is taken; a non-sidebar request gets a generic
    // incontent_* slot (915) rather than stealing another named anchor.
    expect(resolveLocationIdFromMap('top_of_page', claimed(900))).toBe(915);
  });

  it('reassigns repeated content locations to distinct in-content ids', () => {
    // First under_first_paragraph takes 909; a second (909 claimed) gets 915.
    expect(
      resolveLocationIdFromMap('under_first_paragraph', claimed(909)),
    ).toBe(915);
  });

  it('keeps sidebar requests on sidebar slots', () => {
    // sidebar (903) free -> precise.
    expect(resolveLocationIdFromMap('sidebar', noneClaimed)).toBe(903);
    // 903 taken -> next free sidebar slot (904), not an incontent slot.
    expect(resolveLocationIdFromMap('sidebar', claimed(903))).toBe(904);
  });

  it('routes unknown locations to a generic in-content slot', () => {
    expect(resolveLocationIdFromMap('footer_banner', noneClaimed)).toBe(915);
  });

  it('allocates a fresh id above the range when every slot is claimed', () => {
    const all = Object.keys(ID_TO_LOCATION).map(Number);
    expect(resolveLocationIdFromMap('mid_content', claimed(...all))).toBe(1000);
  });

  it('skips already-allocated ids above the range', () => {
    const all = Object.keys(ID_TO_LOCATION).map(Number);
    expect(
      resolveLocationIdFromMap('mid_content', claimed(...all, 1000, 1001)),
    ).toBe(1002);
  });
});
