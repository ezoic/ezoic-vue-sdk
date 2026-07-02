import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { createEzoicApi } from './api';
import type { EzoicCmdFn } from './global';

/** A `push` that runs queued callbacks immediately (post-init ezstandalone). */
const immediatePush = (fn: EzoicCmdFn): void => {
  fn();
};

beforeEach(() => {
  delete window.ezstandalone;
});

afterEach(() => {
  delete window.ezstandalone;
  vi.restoreAllMocks();
});

describe('createEzoicApi', () => {
  it('exposes the readiness ref and push helper', () => {
    const ready = ref(false);
    const api = createEzoicApi(ready, immediatePush);
    expect(api.ready.value).toBe(false);
    expect(typeof api.push).toBe('function');
  });

  it('showAds forwards every argument through the command queue', () => {
    const showAds = vi.fn();
    window.ezstandalone = { cmd: { push: immediatePush }, showAds };
    const api = createEzoicApi(ref(false), immediatePush);

    api.showAds(101, { id: 102, required: true, sizes: ['728x90'] });

    expect(showAds).toHaveBeenCalledTimes(1);
    expect(showAds).toHaveBeenCalledWith(101, {
      id: 102,
      required: true,
      sizes: ['728x90'],
    });
  });

  it('forwards displayMore, destroyPlaceholders, destroyAll and refreshAds', () => {
    const displayMore = vi.fn();
    const destroyPlaceholders = vi.fn();
    const destroyAll = vi.fn();
    const refreshAds = vi.fn();
    window.ezstandalone = {
      cmd: { push: immediatePush },
      displayMore,
      destroyPlaceholders,
      destroyAll,
      refreshAds,
    };
    const api = createEzoicApi(ref(false), immediatePush);

    api.displayMore(201);
    api.destroyPlaceholders(101, 102);
    api.destroyAll();
    api.refreshAds(303);

    expect(displayMore).toHaveBeenCalledWith(201);
    expect(destroyPlaceholders).toHaveBeenCalledWith(101, 102);
    expect(destroyAll).toHaveBeenCalledTimes(1);
    expect(refreshAds).toHaveBeenCalledWith(303);
  });

  it('setIsSinglePageApplication forwards through the command queue', () => {
    const setIsSinglePageApplication = vi.fn();
    window.ezstandalone = {
      cmd: { push: immediatePush },
      setIsSinglePageApplication,
    };
    const api = createEzoicApi(ref(false), immediatePush);

    api.setIsSinglePageApplication(true);

    expect(setIsSinglePageApplication).toHaveBeenCalledTimes(1);
    expect(setIsSinglePageApplication).toHaveBeenCalledWith(true);
  });

  it('passthroughs are safe no-ops when the bundle exposes no methods', () => {
    window.ezstandalone = { cmd: { push: immediatePush } };
    const api = createEzoicApi(ref(false), immediatePush);
    expect(() => {
      api.showAds(101);
      api.displayMore(102);
      api.destroyPlaceholders(101);
      api.destroyAll();
      api.refreshAds(103);
      api.setIsSinglePageApplication(true);
    }).not.toThrow();
  });

  it('isEzoicUser returns the bundle answer synchronously once loaded', () => {
    const isEzoicUser = vi.fn().mockReturnValue(true);
    window.ezstandalone = { cmd: { push: immediatePush }, isEzoicUser };
    const api = createEzoicApi(ref(false), immediatePush);

    expect(api.isEzoicUser(10)).toBe(true);
    expect(isEzoicUser).toHaveBeenCalledWith(10, undefined);
  });

  it('isEzoicUser returns false before load and delivers the callback later', () => {
    const queue: EzoicCmdFn[] = [];
    const deferredPush = (fn: EzoicCmdFn): void => {
      queue.push(fn);
    };
    window.ezstandalone = { cmd: { push: deferredPush } };
    const api = createEzoicApi(ref(false), deferredPush);
    const callback = vi.fn();

    // Bundle not loaded yet: answer is false, callback deferred.
    expect(api.isEzoicUser(undefined, callback)).toBe(false);

    // Bundle loads and exposes isEzoicUser; draining the queue delivers it.
    const isEzoicUser = vi.fn().mockReturnValue(true);
    window.ezstandalone.isEzoicUser = isEzoicUser;
    for (const fn of queue) fn();

    expect(isEzoicUser).toHaveBeenCalledWith(undefined, callback);
  });

  it('isEzoicUser returns false and does not throw when nothing is available', () => {
    const api = createEzoicApi(ref(false), immediatePush);
    expect(api.isEzoicUser()).toBe(false);
  });

  it('config forwards the options object through the command queue', () => {
    const config = vi.fn();
    window.ezstandalone = { cmd: { push: immediatePush }, config };
    const api = createEzoicApi(ref(false), immediatePush);

    api.config({ anchorAdPosition: 'top', disableVideo: true });

    expect(config).toHaveBeenCalledTimes(1);
    expect(config).toHaveBeenCalledWith({
      anchorAdPosition: 'top',
      disableVideo: true,
    });
  });

  it('forwards setEzoicAnchorAd, setInterstitialAllowed and the consent setters', () => {
    const setEzoicAnchorAd = vi.fn();
    const setInterstitialAllowed = vi.fn();
    const enableConsent = vi.fn();
    const setDisablePersonalizedStatistics = vi.fn();
    const setDisablePersonalizedAds = vi.fn();
    window.ezstandalone = {
      cmd: { push: immediatePush },
      setEzoicAnchorAd,
      setInterstitialAllowed,
      enableConsent,
      setDisablePersonalizedStatistics,
      setDisablePersonalizedAds,
    };
    const api = createEzoicApi(ref(false), immediatePush);

    api.setEzoicAnchorAd(true);
    api.setInterstitialAllowed(false, { foo: 1 });
    api.enableConsent();
    api.setDisablePersonalizedStatistics(true);
    api.setDisablePersonalizedAds(false);

    expect(setEzoicAnchorAd).toHaveBeenCalledWith(true);
    expect(setInterstitialAllowed).toHaveBeenCalledWith(false, { foo: 1 });
    expect(enableConsent).toHaveBeenCalledTimes(1);
    expect(setDisablePersonalizedStatistics).toHaveBeenCalledWith(true);
    expect(setDisablePersonalizedAds).toHaveBeenCalledWith(false);
  });

  it('boolean getters return the bundle value once loaded', () => {
    window.ezstandalone = {
      cmd: { push: immediatePush },
      hasAnchorAdBeenClosed: vi.fn().mockReturnValue(true),
      isInterstitialAllowed: vi.fn().mockReturnValue(true),
      isOutstreamAllowed: vi.fn().mockReturnValue(false),
    };
    const api = createEzoicApi(ref(false), immediatePush);

    expect(api.hasAnchorAdBeenClosed()).toBe(true);
    expect(api.isInterstitialAllowed()).toBe(true);
    expect(api.isOutstreamAllowed()).toBe(false);
  });

  it('boolean getters return false before the bundle loads', () => {
    window.ezstandalone = { cmd: { push: immediatePush } };
    const api = createEzoicApi(ref(false), immediatePush);

    expect(api.hasAnchorAdBeenClosed()).toBe(false);
    expect(api.isInterstitialAllowed()).toBe(false);
    expect(api.isOutstreamAllowed()).toBe(false);
  });

  it('setOutstreamAllowed resolves the bundle answer once loaded', async () => {
    const setOutstreamAllowed = vi.fn().mockResolvedValue(true);
    window.ezstandalone = { cmd: { push: immediatePush }, setOutstreamAllowed };
    const api = createEzoicApi(ref(false), immediatePush);

    await expect(api.setOutstreamAllowed(true, { foo: 1 })).resolves.toBe(true);
    expect(setOutstreamAllowed).toHaveBeenCalledWith(true, { foo: 1 });
  });

  it('setOutstreamAllowed queues the call and resolves false before load', async () => {
    const queue: EzoicCmdFn[] = [];
    const deferredPush = (fn: EzoicCmdFn): void => {
      queue.push(fn);
    };
    window.ezstandalone = { cmd: { push: deferredPush } };
    const api = createEzoicApi(ref(false), deferredPush);

    // Bundle not loaded: resolves false now, without hanging.
    await expect(api.setOutstreamAllowed(true)).resolves.toBe(false);

    // Bundle loads and exposes the method; draining the queue applies the call.
    const setOutstreamAllowed = vi.fn().mockResolvedValue(true);
    window.ezstandalone.setOutstreamAllowed = setOutstreamAllowed;
    for (const fn of queue) fn();

    expect(setOutstreamAllowed).toHaveBeenCalledWith(true, undefined);
  });

  it('swallows a queued setOutstreamAllowed rejection when the queue drains', async () => {
    const queue: EzoicCmdFn[] = [];
    const deferredPush = (fn: EzoicCmdFn): void => {
      queue.push(fn);
    };
    window.ezstandalone = { cmd: { push: deferredPush } };
    const api = createEzoicApi(ref(false), deferredPush);

    await expect(api.setOutstreamAllowed(true)).resolves.toBe(false);

    // Bundle loads but its setter rejects; draining the queue must not throw or
    // produce an unhandled rejection.
    const rejection = Promise.reject(new Error('outstream failed'));
    window.ezstandalone.setOutstreamAllowed = vi
      .fn()
      .mockReturnValue(rejection);
    expect(() => {
      for (const fn of queue) fn();
    }).not.toThrow();
    // Settle the rejected promise so the test itself does not flag it.
    await rejection.catch(() => {});
  });

  it('config, toggles and consent setters are safe no-ops when the bundle exposes no methods', async () => {
    window.ezstandalone = { cmd: { push: immediatePush } };
    const api = createEzoicApi(ref(false), immediatePush);
    expect(() => {
      api.config({ disableVideo: true });
      api.setEzoicAnchorAd(true);
      api.setInterstitialAllowed(true);
      api.enableConsent();
      api.setDisablePersonalizedStatistics(true);
      api.setDisablePersonalizedAds(true);
      expect(api.hasAnchorAdBeenClosed()).toBe(false);
      expect(api.isInterstitialAllowed()).toBe(false);
      expect(api.isOutstreamAllowed()).toBe(false);
    }).not.toThrow();
    await expect(api.setOutstreamAllowed(true)).resolves.toBe(false);
  });
});
