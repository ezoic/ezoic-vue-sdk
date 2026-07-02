import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { CMP_SCRIPT_URLS, STANDALONE_SCRIPT_URL } from './constants';
import { EzoicPlugin } from './plugin';
import { useEzoic } from './useEzoic';

/** Runs queued callbacks immediately, simulating a post-init ezstandalone. */
const immediatePush = (fn: () => void): void => {
  fn();
};

const [CMP1, CMP2] = CMP_SCRIPT_URLS;
const STUB_SELECTOR = 'script[data-ezoic-vue-sdk="cmd-stub"]';

/** Runs and clears everything queued on ezstandalone.cmd, simulating init. */
function drainCmdQueue(): void {
  // Before init the queue is a real array; cast to inspect and drain it.
  const queue = window.ezstandalone?.cmd as unknown as
    Array<() => void> | undefined;
  if (!queue) return;
  const pending = [...queue];
  queue.length = 0;
  for (const fn of pending) fn();
}

const REWARDED_LOADER_URL =
  'https://example.com/porpoiseant/ezadloadrewarded.js';

beforeEach(() => {
  document.head.innerHTML = '';
  delete window.ezstandalone;
  delete window.ezRewardedAds;
});

afterEach(() => {
  document.head.innerHTML = '';
  delete window.ezstandalone;
  delete window.ezRewardedAds;
});

describe('EzoicPlugin install', () => {
  it('provides an EzoicApi resolvable via useEzoic()', () => {
    const app = createApp({ render: () => null });
    app.use(EzoicPlugin);
    const api = app.runWithContext(() => useEzoic());
    expect(typeof api.push).toBe('function');
    expect(api.ready.value).toBe(false);
  });

  it('injects the Ezoic script set on install', () => {
    const app = createApp({ render: () => null });
    app.use(EzoicPlugin);
    expect(document.querySelector(`script[src="${CMP1}"]`)).not.toBeNull();
    expect(document.querySelector(`script[src="${CMP2}"]`)).not.toBeNull();
    expect(document.querySelector(STUB_SELECTOR)).not.toBeNull();
    expect(
      document.querySelector(`script[src="${STANDALONE_SCRIPT_URL}"]`),
    ).not.toBeNull();
  });

  it('does not duplicate script tags across two installs', () => {
    createApp({ render: () => null }).use(EzoicPlugin);
    createApp({ render: () => null }).use(EzoicPlugin);
    expect(document.querySelectorAll(`script[src="${CMP1}"]`)).toHaveLength(1);
    expect(document.querySelectorAll(`script[src="${CMP2}"]`)).toHaveLength(1);
    expect(document.querySelectorAll(STUB_SELECTOR)).toHaveLength(1);
    expect(
      document.querySelectorAll(`script[src="${STANDALONE_SCRIPT_URL}"]`),
    ).toHaveLength(1);
  });

  it('flips ready to true once the command queue drains', () => {
    const app = createApp({ render: () => null });
    app.use(EzoicPlugin);
    const api = app.runWithContext(() => useEzoic());
    expect(api.ready.value).toBe(false);
    drainCmdQueue();
    expect(api.ready.value).toBe(true);
  });

  it('push() queues a callback on ezstandalone.cmd', () => {
    const app = createApp({ render: () => null });
    app.use(EzoicPlugin);
    const api = app.runWithContext(() => useEzoic());
    const spy = vi.fn();
    api.push(spy);
    expect(window.ezstandalone?.cmd).toContain(spy);
    drainCmdQueue();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('flips ready immediately when the bundle already initialized', () => {
    // Simulate a post-init ezstandalone: cmd is an immediate-execute wrapper.
    window.ezstandalone = { cmd: { push: (fn: () => void) => fn() } };
    const app = createApp({ render: () => null });
    app.use(EzoicPlugin);
    const api = app.runWithContext(() => useEzoic());
    expect(api.ready.value).toBe(true);
  });

  it('injects the rewarded loader when rewardedLoaderUrl is set', () => {
    createApp({ render: () => null }).use(EzoicPlugin, {
      rewardedLoaderUrl: REWARDED_LOADER_URL,
    });
    expect(
      document.querySelector(`script[src="${REWARDED_LOADER_URL}"]`),
    ).not.toBeNull();
    expect(
      document.querySelector('script[data-ezoic-vue-sdk="rewarded-cmd-stub"]'),
    ).not.toBeNull();
  });

  it('does not inject a rewarded loader without rewardedLoaderUrl', () => {
    createApp({ render: () => null }).use(EzoicPlugin);
    expect(
      document.querySelector('script[src*="ezadloadrewarded"]'),
    ).toBeNull();
    expect(
      document.querySelector('script[data-ezoic-vue-sdk="rewarded-cmd-stub"]'),
    ).toBeNull();
  });

  it('respects the cmp: false option', () => {
    const app = createApp({ render: () => null });
    app.use(EzoicPlugin, { cmp: false });
    expect(document.querySelector(`script[src="${CMP1}"]`)).toBeNull();
    expect(document.querySelector(STUB_SELECTOR)).not.toBeNull();
  });

  it('spa option declares a single-page application at boot', () => {
    const setIsSinglePageApplication = vi.fn();
    window.ezstandalone = {
      cmd: { push: immediatePush },
      setIsSinglePageApplication,
    };
    createApp({ render: () => null }).use(EzoicPlugin, { spa: true });
    expect(setIsSinglePageApplication).toHaveBeenCalledWith(true);
  });

  it('does not declare SPA mode without the spa or router option', () => {
    const setIsSinglePageApplication = vi.fn();
    window.ezstandalone = {
      cmd: { push: immediatePush },
      setIsSinglePageApplication,
    };
    createApp({ render: () => null }).use(EzoicPlugin);
    expect(setIsSinglePageApplication).not.toHaveBeenCalled();
  });

  it('router option enables SPA mode and rescans after each navigation', async () => {
    const setIsSinglePageApplication = vi.fn();
    const showAds = vi.fn();
    window.ezstandalone = {
      cmd: { push: immediatePush },
      setIsSinglePageApplication,
      showAds,
    };
    const afterEach = vi.fn();
    createApp({ render: () => null }).use(EzoicPlugin, {
      router: { afterEach },
    });

    // SPA mode declared, and an afterEach hook was registered.
    expect(setIsSinglePageApplication).toHaveBeenCalledWith(true);
    expect(afterEach).toHaveBeenCalledTimes(1);

    // The registered hook rescans (deferred to the next tick), with no ids so
    // ezstandalone scans the whole page.
    const guard = afterEach.mock.calls[0][0] as () => void;
    expect(showAds).not.toHaveBeenCalled();
    guard();
    await nextTick();
    expect(showAds).toHaveBeenCalledTimes(1);
    expect(showAds).toHaveBeenCalledWith();
  });
});
