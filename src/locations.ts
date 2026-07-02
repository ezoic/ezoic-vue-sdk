/**
 * Zero-config semantic placements: mapping human-readable location names (e.g.
 * `"under_first_paragraph"`) to Ezoic's reserved placeholder ids so publishers
 * can drop in `<EzoicAd location="..." />` without generating a numeric id in
 * the dashboard first.
 *
 * Ezoic reserves the id range 900–999 for these semantic locations and ships the
 * ad bundle with a `GetGeneratedIdAsync(locationName)` helper that resolves a
 * name to a free id at runtime (and can allocate ids above 999 once every
 * reserved slot is in use). `<EzoicAd>` prefers that helper when the bundle has
 * loaded; the static maps and resolver here are the offline fallback used before
 * the bundle is available, so a named placement still resolves on first paint.
 *
 * See the Ezoic ad placement docs:
 * https://docs.ezoic.com/docs/ezoicads/implementation/
 */

/**
 * Reserved id → semantic location name. Mirrors the map the ad bundle ships, so
 * the fallback resolver picks the same ids the bundle would. Note the range has
 * a single gap: there is no id 961.
 */
export const ID_TO_LOCATION: Readonly<Record<number, string>> = {
  900: 'top_of_page',
  901: 'under_page_title',
  902: 'bottom_of_page',
  903: 'sidebar',
  904: 'sidebar_middle',
  905: 'sidebar_middle',
  906: 'sidebar_middle',
  907: 'sidebar_bottom',
  908: 'sidebar_floating_1',
  909: 'under_first_paragraph',
  910: 'under_second_paragraph',
  911: 'mid_content',
  912: 'long_content',
  913: 'longer_content',
  914: 'longest_content',
  915: 'incontent_5',
  916: 'incontent_6',
  917: 'incontent_7',
  918: 'incontent_8',
  919: 'incontent_9',
  920: 'incontent_10',
  921: 'incontent_11',
  922: 'incontent_12',
  923: 'incontent_13',
  924: 'incontent_14',
  925: 'incontent_15',
  926: 'incontent_16',
  927: 'incontent_17',
  928: 'incontent_18',
  929: 'incontent_19',
  930: 'incontent_20',
  931: 'incontent_21',
  932: 'incontent_22',
  933: 'incontent_23',
  934: 'incontent_24',
  935: 'incontent_25',
  936: 'incontent_26',
  937: 'incontent_27',
  938: 'incontent_28',
  939: 'incontent_29',
  940: 'incontent_30',
  941: 'incontent_31',
  942: 'incontent_32',
  943: 'incontent_33',
  944: 'incontent_34',
  945: 'incontent_35',
  946: 'incontent_36',
  947: 'incontent_37',
  948: 'incontent_38',
  949: 'incontent_39',
  950: 'incontent_40',
  951: 'incontent_41',
  952: 'incontent_42',
  953: 'incontent_43',
  954: 'incontent_44',
  955: 'incontent_45',
  956: 'incontent_46',
  957: 'incontent_47',
  958: 'incontent_48',
  959: 'incontent_49',
  960: 'incontent_50',
  962: 'incontent_51',
  963: 'incontent_52',
  964: 'incontent_53',
  965: 'incontent_54',
  966: 'incontent_55',
  967: 'incontent_56',
  968: 'incontent_57',
  969: 'incontent_58',
  970: 'incontent_59',
  971: 'incontent_60',
  972: 'incontent_61',
  973: 'incontent_62',
  974: 'incontent_63',
  975: 'incontent_64',
  976: 'incontent_65',
  977: 'incontent_66',
  978: 'incontent_67',
  979: 'incontent_68',
  980: 'incontent_69',
  981: 'incontent_70',
  982: 'incontent_71',
  983: 'incontent_72',
  984: 'incontent_73',
  985: 'incontent_74',
  986: 'incontent_75',
  987: 'incontent_76',
  988: 'incontent_77',
  989: 'incontent_78',
  990: 'incontent_79',
  991: 'incontent_80',
  992: 'incontent_81',
  993: 'incontent_82',
  994: 'incontent_83',
  995: 'incontent_84',
  996: 'incontent_85',
  997: 'incontent_86',
  998: 'incontent_87',
  999: 'incontent_88',
};

/**
 * Location-name aliases the ad bundle recognizes. An alias resolves to a
 * canonical name before id lookup (e.g. `"incontent_0"` →
 * `"under_second_paragraph"`, `"sidebar_floating"` → `"sidebar_floating_1"`).
 */
export const LOCATION_ALIASES: Readonly<Record<string, string>> = {
  incontent_0: 'under_second_paragraph',
  incontent_1: 'mid_content',
  incontent_2: 'long_content',
  incontent_3: 'longer_content',
  incontent_4: 'longest_content',
  sidebar_floating: 'sidebar_floating_1',
  sidebar_floating_2: 'sidebar_middle',
  sidebar_floating_3: 'sidebar_bottom',
};

/** Placeholder ids in {@link ID_TO_LOCATION}, ascending. */
const SORTED_IDS: readonly number[] = Object.keys(ID_TO_LOCATION)
  .map(Number)
  .sort((a, b) => a - b);

/** Highest id in the reserved map; new ids are allocated above it. */
const MAX_KNOWN_ID = SORTED_IDS[SORTED_IDS.length - 1];

/**
 * Canonical location name → its lowest reserved id. Several names map to more
 * than one id (e.g. `sidebar_middle` covers 904–906); the lowest is the precise
 * match the bundle picks first.
 */
export const LOCATION_TO_ID: Readonly<Record<string, number>> = (() => {
  const map: Record<string, number> = {};
  for (const id of SORTED_IDS) {
    const name = ID_TO_LOCATION[id];
    if (!(name in map)) map[name] = id;
  }
  return map;
})();

/**
 * Returns `true` when `location` is a known semantic name or a known alias.
 * Matching is exact (case-sensitive), matching the ad bundle's own lookup.
 */
export function isKnownLocation(location: string): boolean {
  return location in LOCATION_TO_ID || location in LOCATION_ALIASES;
}

/**
 * Resolves a semantic location name to a placeholder id using the static map,
 * mirroring the ad bundle's `GetGeneratedId` algorithm but keyed off the SDK's
 * own claimed-id registry instead of the DOM. Used as the offline fallback when
 * `ezstandalone.GetGeneratedIdAsync` is not yet available.
 *
 * Order of preference:
 * 1. the canonical location's precise id, if free;
 * 2. otherwise the first free id of a matching kind — a sidebar slot for a
 *    sidebar request, an `incontent_*` slot for anything else (which protects
 *    named anchors like `top_of_page` from being reused generically);
 * 3. otherwise a freshly allocated id above the reserved range.
 *
 * The result is always an integer ≥ 1 that `isClaimed` reports as free.
 *
 * @param location - Semantic location name (aliases are resolved first).
 * @param isClaimed - Predicate reporting whether an id is already in use.
 */
export function resolveLocationIdFromMap(
  location: string,
  isClaimed: (id: number) => boolean,
): number {
  const canonical = LOCATION_ALIASES[location] ?? location;

  const precise = LOCATION_TO_ID[canonical];
  if (precise !== undefined && !isClaimed(precise)) return precise;

  const wantsSidebar = canonical.toLowerCase().includes('sidebar');
  for (const id of SORTED_IDS) {
    if (isClaimed(id)) continue;
    const name = ID_TO_LOCATION[id];
    if (wantsSidebar) {
      if (name.toLowerCase().includes('sidebar')) return id;
    } else if (name.startsWith('incontent_')) {
      return id;
    }
  }

  let allocated = MAX_KNOWN_ID + 1;
  while (isClaimed(allocated)) allocated++;
  return allocated;
}
