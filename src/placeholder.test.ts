import { describe, expect, it } from 'vitest';
import {
  isValidPlaceholderId,
  placeholderDomId,
  resolvedPlaceholderDomId,
} from './placeholder';

describe('isValidPlaceholderId', () => {
  it('accepts integers in the inclusive 1–999 range', () => {
    expect(isValidPlaceholderId(1)).toBe(true);
    expect(isValidPlaceholderId(101)).toBe(true);
    expect(isValidPlaceholderId(999)).toBe(true);
  });

  it('rejects ids outside the range', () => {
    expect(isValidPlaceholderId(0)).toBe(false);
    expect(isValidPlaceholderId(1000)).toBe(false);
    expect(isValidPlaceholderId(-5)).toBe(false);
  });

  it('rejects non-integers', () => {
    expect(isValidPlaceholderId(1.5)).toBe(false);
    expect(isValidPlaceholderId(Number.NaN)).toBe(false);
    expect(isValidPlaceholderId(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('placeholderDomId', () => {
  it('builds the placeholder div id', () => {
    expect(placeholderDomId(101)).toBe('ezoic-pub-ad-placeholder-101');
    expect(placeholderDomId(900)).toBe('ezoic-pub-ad-placeholder-900');
  });

  it('throws for invalid ids instead of returning a bad id', () => {
    expect(() => placeholderDomId(0)).toThrow(RangeError);
    expect(() => placeholderDomId(1000)).toThrow(RangeError);
    expect(() => placeholderDomId(1.5)).toThrow(RangeError);
  });
});

describe('resolvedPlaceholderDomId', () => {
  it('builds the div id for in-range and allocated ids', () => {
    expect(resolvedPlaceholderDomId(909)).toBe('ezoic-pub-ad-placeholder-909');
    // Allocated ids above the 1–999 scan range are accepted here.
    expect(resolvedPlaceholderDomId(1000)).toBe(
      'ezoic-pub-ad-placeholder-1000',
    );
  });

  it('throws for non-positive or non-integer ids', () => {
    expect(() => resolvedPlaceholderDomId(0)).toThrow(RangeError);
    expect(() => resolvedPlaceholderDomId(-1)).toThrow(RangeError);
    expect(() => resolvedPlaceholderDomId(1.5)).toThrow(RangeError);
  });
});
