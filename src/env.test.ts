import { afterEach, describe, expect, it, vi } from 'vitest';
import { isDevMode } from './env';

describe('isDevMode()', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns true by default under vitest (NODE_ENV is not production)', () => {
    expect(isDevMode()).toBe(true);
  });

  it('returns false when NODE_ENV is production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(isDevMode()).toBe(false);
  });
});
