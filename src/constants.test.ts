import { describe, expect, it } from 'vitest';
import {
  CMP_SCRIPT_URLS,
  MAX_PLACEHOLDER_ID,
  MIN_PLACEHOLDER_ID,
  PLACEHOLDER_ID_PREFIX,
  STANDALONE_SCRIPT_URL,
} from './constants';

describe('script URL constants', () => {
  it('points at the public standalone bundle', () => {
    expect(STANDALONE_SCRIPT_URL).toBe('https://www.ezojs.com/ezoic/sa.min.js');
  });

  it('lists the two Gatekeeper CMP scripts in required order', () => {
    expect(CMP_SCRIPT_URLS).toEqual([
      'https://cmp.gatekeeperconsent.com/min.js',
      'https://the.gatekeeperconsent.com/cmp.min.js',
    ]);
  });
});

describe('placeholder DOM contract', () => {
  it('uses the ezstandalone placeholder id prefix', () => {
    expect(PLACEHOLDER_ID_PREFIX).toBe('ezoic-pub-ad-placeholder-');
  });

  it('scans ids 1 through 999', () => {
    expect(MIN_PLACEHOLDER_ID).toBe(1);
    expect(MAX_PLACEHOLDER_ID).toBe(999);
  });
});
