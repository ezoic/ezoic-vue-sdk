import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { useEzoicRewarded } from './rewarded';
import type { EzoicRewarded, UseEzoicRewardedOptions } from './rewarded';
import type { EzRewardedGlobal } from './global';
import type { RewardedRequestResult, RewardedShowResult } from './types';

const REWARDED_STUB_SELECTOR = 'script[data-ezoic-vue-sdk="rewarded-cmd-stub"]';

/** An immediate-execute cmd queue, simulating a post-init rewarded loader. */
const immediateCmd = { push: (fn: () => void): void => fn() };

beforeEach(() => {
  document.head.innerHTML = '';
  delete window.ezRewardedAds;
});

afterEach(() => {
  document.head.innerHTML = '';
  delete window.ezRewardedAds;
  vi.restoreAllMocks();
});

/** Mount a component that exposes the rewarded API for assertions. */
function mountRewarded(options?: UseEzoicRewardedOptions): {
  wrapper: ReturnType<typeof mount>;
  rewarded: EzoicRewarded;
} {
  let rewarded!: EzoicRewarded;
  const Comp = defineComponent({
    setup() {
      rewarded = useEzoicRewarded(options);
      return () => h('div');
    },
  });
  const wrapper = mount(Comp);
  return { wrapper, rewarded };
}

describe('useEzoicRewarded', () => {
  it('request resolves the callback data and forwards its config verbatim', async () => {
    const result: RewardedRequestResult = {
      status: true,
      msg: 'ad available',
      adInfo: { placement: 'rewarded' },
    };
    const request = vi.fn<NonNullable<EzRewardedGlobal['request']>>((cb) =>
      cb(result),
    );
    window.ezRewardedAds = { cmd: immediateCmd, request };
    const { rewarded } = mountRewarded();

    await expect(
      rewarded.request({ minCPM: 2, rewardType: 'coins' }),
    ).resolves.toEqual(result);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][1]).toEqual({
      minCPM: 2,
      rewardType: 'coins',
    });
    expect(typeof request.mock.calls[0][0]).toBe('function');
  });

  it('show resolves the reward outcome and forwards its config', async () => {
    const result: RewardedShowResult = {
      status: true,
      reward: true,
      msg: 'ad watched',
      adInfo: { id: 1 },
      userInfo: { tier: 'gold' },
    };
    const show = vi.fn<NonNullable<EzRewardedGlobal['show']>>((cb) =>
      cb(result),
    );
    window.ezRewardedAds = { cmd: immediateCmd, show };
    const { rewarded } = mountRewarded();

    await expect(
      rewarded.show({ rewardName: 'premium', userInfo: { tier: 'gold' } }),
    ).resolves.toEqual(result);
    expect(show.mock.calls[0][1]).toEqual({
      rewardName: 'premium',
      userInfo: { tier: 'gold' },
    });
  });

  it('requestAndShow resolves the reward outcome and forwards its config', async () => {
    const result: RewardedShowResult = {
      status: true,
      reward: true,
      msg: 'ad watched',
    };
    const requestAndShow = vi.fn<
      NonNullable<EzRewardedGlobal['requestAndShow']>
    >((cb) => cb(result));
    window.ezRewardedAds = { cmd: immediateCmd, requestAndShow };
    const { rewarded } = mountRewarded();

    await expect(
      rewarded.requestAndShow({ rewardName: 'premium', rewardOnNoFill: true }),
    ).resolves.toEqual(result);
    expect(requestAndShow.mock.calls[0][1]).toEqual({
      rewardName: 'premium',
      rewardOnNoFill: true,
      alwaysCallback: true,
    });
  });

  it('requestAndShow forces alwaysCallback so a no-fill outcome still resolves (regression: hang fix)', async () => {
    const result: RewardedShowResult = {
      status: false,
      reward: false,
      msg: 'failed to load ad',
    };
    const requestAndShow = vi.fn<
      NonNullable<EzRewardedGlobal['requestAndShow']>
    >((cb) => cb(result));
    window.ezRewardedAds = { cmd: immediateCmd, requestAndShow };
    const { rewarded } = mountRewarded();

    await expect(rewarded.requestAndShow()).resolves.toEqual(result);
    expect(requestAndShow.mock.calls[0][1]).toEqual({ alwaysCallback: true });
  });

  it('requestWithOverlay forwards text as arg 2 and config as arg 3', async () => {
    const result: RewardedShowResult = {
      status: false,
      reward: false,
      msg: 'user cancelled',
    };
    const requestWithOverlay = vi.fn<
      NonNullable<EzRewardedGlobal['requestWithOverlay']>
    >((cb) => cb(result));
    window.ezRewardedAds = { cmd: immediateCmd, requestWithOverlay };
    const { rewarded } = mountRewarded();

    const text = { header: 'Watch an ad', body: ['line'], accept: 'OK' };
    const config = { rewardName: 'premium', lockScroll: true };
    await expect(rewarded.requestWithOverlay(text, config)).resolves.toEqual(
      result,
    );
    expect(requestWithOverlay).toHaveBeenCalledTimes(1);
    expect(typeof requestWithOverlay.mock.calls[0][0]).toBe('function');
    expect(requestWithOverlay.mock.calls[0][1]).toEqual(text);
    expect(requestWithOverlay.mock.calls[0][2]).toEqual({
      ...config,
      alwaysCallback: true,
    });
  });

  it('contentLocker resolves via readyCallback and also invokes the user callback (function action)', async () => {
    const ready: RewardedRequestResult = { status: true, msg: 'ready' };
    const contentLocker = vi.fn(
      (
        _action: unknown,
        config?: { readyCallback?: (r: RewardedRequestResult) => void },
      ): void => config?.readyCallback?.(ready),
    );
    window.ezRewardedAds = { cmd: immediateCmd, contentLocker };
    const { rewarded } = mountRewarded();

    const userReady = vi.fn();
    const action = (): void => {};
    await expect(
      rewarded.contentLocker(action, { readyCallback: userReady }),
    ).resolves.toEqual(ready);
    expect(userReady).toHaveBeenCalledWith(ready);
    expect(contentLocker).toHaveBeenCalledTimes(1);
    expect(contentLocker.mock.calls[0][0]).toBe(action);
  });

  it('contentLocker forwards a string action unchanged', async () => {
    const contentLocker = vi.fn(
      (
        _action: unknown,
        config?: { readyCallback?: (r: RewardedRequestResult) => void },
      ): void => config?.readyCallback?.({ status: true, msg: 'ready' }),
    );
    window.ezRewardedAds = { cmd: immediateCmd, contentLocker };
    const { rewarded } = mountRewarded();

    const url = 'https://example.com/reward';
    await rewarded.contentLocker(url);
    expect(contentLocker.mock.calls[0][0]).toBe(url);
  });

  it('queues request pre-init and settles only when the queue drains', async () => {
    window.ezRewardedAds = { cmd: [] };
    const { rewarded } = mountRewarded();
    // The mount's ready-flip is queued too; isolate the request push.
    const queue = window.ezRewardedAds.cmd as unknown as Array<() => void>;
    queue.length = 0;

    let resolved = false;
    const p = rewarded.request({ minCPM: 1 }).then((r) => {
      resolved = true;
      return r;
    });

    expect(queue).toHaveLength(1);
    await Promise.resolve();
    expect(resolved).toBe(false);

    // Loader arrives with a real method; draining the queue resolves the call.
    window.ezRewardedAds.request = vi.fn(
      (cb: (d: RewardedRequestResult) => void): void =>
        cb({ status: true, msg: 'ok' }),
    );
    for (const fn of [...queue]) fn();

    await expect(p).resolves.toEqual({ status: true, msg: 'ok' });
    expect(resolved).toBe(true);
  });

  it('resolves a typed request failure when the method is unavailable', async () => {
    // Loader present (immediate-execute) but exposes no methods.
    window.ezRewardedAds = { cmd: immediateCmd };
    const { rewarded } = mountRewarded();

    const result = await rewarded.request();
    expect(result.status).toBe(false);
    expect(result.msg).toContain('unavailable');
  });

  it('resolves a typed show-family failure when the method is unavailable', async () => {
    window.ezRewardedAds = { cmd: immediateCmd };
    const { rewarded } = mountRewarded();

    await expect(rewarded.show()).resolves.toMatchObject({
      status: false,
      reward: false,
    });
    await expect(rewarded.requestAndShow()).resolves.toMatchObject({
      status: false,
      reward: false,
    });
    await expect(rewarded.requestWithOverlay()).resolves.toMatchObject({
      status: false,
      reward: false,
    });
    await expect(
      rewarded.contentLocker('https://example.com'),
    ).resolves.toMatchObject({ status: false });
  });

  it('register queues ezRewardedAds.register', () => {
    const register = vi.fn();
    window.ezRewardedAds = { cmd: immediateCmd, register };
    const { rewarded } = mountRewarded();

    rewarded.register();
    expect(register).toHaveBeenCalledTimes(1);
  });

  it('tracks status through the rewarded window events', () => {
    window.ezRewardedAds = { cmd: immediateCmd };
    const { rewarded } = mountRewarded();
    expect(rewarded.status.value).toBe('idle');

    window.dispatchEvent(new Event('ezRewardedInitiated'));
    expect(rewarded.status.value).toBe('initiated');
    window.dispatchEvent(new Event('ezRewardedDisplayed'));
    expect(rewarded.status.value).toBe('displayed');
    window.dispatchEvent(new Event('ezRewardedClosed'));
    expect(rewarded.status.value).toBe('closed');
  });

  it('removes the window event listeners on unmount', () => {
    window.ezRewardedAds = { cmd: immediateCmd };
    const { wrapper, rewarded } = mountRewarded();
    window.dispatchEvent(new Event('ezRewardedDisplayed'));
    expect(rewarded.status.value).toBe('displayed');

    wrapper.unmount();
    window.dispatchEvent(new Event('ezRewardedInitiated'));
    expect(rewarded.status.value).toBe('displayed');
  });

  it('flips ready true once the rewarded cmd callback runs', () => {
    window.ezRewardedAds = { cmd: immediateCmd };
    const { rewarded } = mountRewarded();
    expect(rewarded.ready.value).toBe(true);
  });

  it('leaves ready false until the pre-init queue drains', () => {
    window.ezRewardedAds = { cmd: [] };
    const { rewarded } = mountRewarded();
    expect(rewarded.ready.value).toBe(false);

    const queue = window.ezRewardedAds.cmd as unknown as Array<() => void>;
    for (const fn of [...queue]) fn();
    expect(rewarded.ready.value).toBe(true);
  });

  it('injects the loader once when loaderUrl is provided and is idempotent on re-mount', () => {
    const loaderUrl = 'https://example.com/porpoiseant/ezadloadrewarded.js';
    mountRewarded({ loaderUrl });
    expect(
      document.querySelectorAll(`script[src="${loaderUrl}"]`),
    ).toHaveLength(1);
    expect(document.querySelector(REWARDED_STUB_SELECTOR)).not.toBeNull();

    mountRewarded({ loaderUrl });
    expect(
      document.querySelectorAll(`script[src="${loaderUrl}"]`),
    ).toHaveLength(1);
    expect(document.querySelectorAll(REWARDED_STUB_SELECTOR)).toHaveLength(1);
  });

  it('does not inject a loader when loaderUrl is absent', () => {
    window.ezRewardedAds = { cmd: immediateCmd };
    mountRewarded();
    expect(document.querySelector('script[src]')).toBeNull();
  });
});
