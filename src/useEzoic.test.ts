import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from 'vue';
import { EzoicPlugin } from './plugin';
import { useEzoic } from './useEzoic';

beforeEach(() => {
  document.head.innerHTML = '';
  delete window.ezstandalone;
});

afterEach(() => {
  document.head.innerHTML = '';
  delete window.ezstandalone;
});

describe('useEzoic', () => {
  it('returns the API when the plugin is installed', () => {
    const app = createApp({ render: () => null });
    app.use(EzoicPlugin);
    const api = app.runWithContext(() => useEzoic());
    expect(api).toHaveProperty('ready');
    expect(api).toHaveProperty('push');
  });

  it('throws when the plugin was not installed', () => {
    const app = createApp({ render: () => null });
    expect(() => app.runWithContext(() => useEzoic())).toThrow(
      /requires the Ezoic plugin/,
    );
  });
});
