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

  it('passthroughs are safe no-ops when the bundle exposes no methods', () => {
    window.ezstandalone = { cmd: { push: immediatePush } };
    const api = createEzoicApi(ref(false), immediatePush);
    expect(() => {
      api.showAds(101);
      api.displayMore(102);
      api.destroyPlaceholders(101);
      api.destroyAll();
      api.refreshAds(103);
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
});
