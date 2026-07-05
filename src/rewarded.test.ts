import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import {
  resetRewardedInitializationForTests,
  useEzoicRewarded,
} from './rewarded';
import type { EzoicRewarded, UseEzoicRewardedOptions } from './rewarded';
import { claimAdId, resetAdBatchState } from './adBatch';
import {
  injectRewardedLoader,
  resetRewardedLoaderInjectedForTests,
} from './scripts';
import { ezoicInjectionKey } from './keys';
import type { EzRewardedGlobal } from './global';
import type {
  EzoicApi,
  RewardedRequestResult,
  RewardedShowResult,
  RewardedSiteWidePlacements,
} from './types';

const REWARDED_STUB_SELECTOR = 'script[data-ezoic-vue-sdk="rewarded-cmd-stub"]';
const LOADER_URL = 'https://example.com/porpoiseant/ezadloadrewarded.js';

/** An immediate-execute cmd queue, simulating a post-init rewarded loader. */
const immediateCmd = { push: (fn: () => void): void => fn() };

beforeEach(() => {
  document.head.innerHTML = '';
  delete window.ezRewardedAds;
  delete window.ezstandalone;
  resetRewardedInitializationForTests();
  resetRewardedLoaderInjectedForTests();
  resetAdBatchState();
});

afterEach(() => {
  document.head.innerHTML = '';
  // Remove any Ezoic placeholders / GPT containers a predicate-arm test added.
  document
    .querySelectorAll('[id^="ezoic-pub-ad-placeholder-"], [id^="div-gpt-ad"]')
    .forEach((el) => el.remove());
  delete window.ezRewardedAds;
  delete window.ezstandalone;
  resetRewardedInitializationForTests();
  resetRewardedLoaderInjectedForTests();
  resetAdBatchState();
  vi.useRealTimers();
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

/**
 * Mount with a provided plugin API (the injected {@link EzoicApi}), so default
 * (runtime-served) mode can reach `initRewardedAds`. Only `initRewardedAds` is
 * exercised, so a partial mock suffices.
 */
function mountRewardedWithApi(
  api: Pick<EzoicApi, 'initRewardedAds'>,
  options?: UseEzoicRewardedOptions,
): { wrapper: ReturnType<typeof mount>; rewarded: EzoicRewarded } {
  let rewarded!: EzoicRewarded;
  const Comp = defineComponent({
    setup() {
      rewarded = useEzoicRewarded(options);
      return () => h('div');
    },
  });
  const wrapper = mount(Comp, {
    global: { provide: { [ezoicInjectionKey as symbol]: api } },
  });
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

  it('does not inject a loader when loaderUrl is absent (no plugin API)', () => {
    window.ezRewardedAds = { cmd: immediateCmd };
    mountRewarded();
    expect(document.querySelector('script[src]')).toBeNull();
    expect(document.querySelector(REWARDED_STUB_SELECTOR)).toBeNull();
  });

  describe('default (runtime-served) mode', () => {
    it('calls initRewardedAds once with no placements and injects no loader', () => {
      window.ezRewardedAds = { cmd: immediateCmd };
      // Initial load already started (enabled=true) → the scheduler's fast path
      // dispatches init synchronously on mount.
      window.ezstandalone = { enabled: true };
      const initRewardedAds = vi.fn();
      mountRewardedWithApi({ initRewardedAds });

      expect(initRewardedAds).toHaveBeenCalledTimes(1);
      expect(initRewardedAds).toHaveBeenCalledWith(undefined);
      expect(document.querySelector('script[src]')).toBeNull();
      expect(document.querySelector(REWARDED_STUB_SELECTOR)).toBeNull();
    });

    it('forwards the configured placements to initRewardedAds', () => {
      window.ezRewardedAds = { cmd: immediateCmd };
      window.ezstandalone = { enabled: true };
      const initRewardedAds = vi.fn();
      const placements: RewardedSiteWidePlacements = {
        anchor: false,
        interstitial: false,
        video: true,
        sideRails: false,
      };
      mountRewardedWithApi({ initRewardedAds }, { placements });

      expect(initRewardedAds).toHaveBeenCalledTimes(1);
      expect(initRewardedAds).toHaveBeenCalledWith(placements);
    });

    it('calls initRewardedAds only once across multiple mounts (first placements win)', () => {
      window.ezRewardedAds = { cmd: immediateCmd };
      window.ezstandalone = { enabled: true };
      const initRewardedAds = vi.fn();
      const first: RewardedSiteWidePlacements = { video: true };

      mountRewardedWithApi({ initRewardedAds }, { placements: first });
      mountRewardedWithApi(
        { initRewardedAds },
        { placements: { video: false } },
      );

      expect(initRewardedAds).toHaveBeenCalledTimes(1);
      expect(initRewardedAds).toHaveBeenCalledWith(first);
    });

    it('does not call initRewardedAds when no plugin API is available', () => {
      window.ezRewardedAds = { cmd: immediateCmd };
      // No provided API — decoupled/escape-hatch-only usage. Nothing to init.
      const { rewarded } = mountRewarded();
      expect(rewarded.ready.value).toBe(true);
      expect(document.querySelector('script[src]')).toBeNull();
    });
  });

  describe('deferred init scheduling', () => {
    it('does not fire init when no initial-ad-load signal is present', () => {
      vi.useFakeTimers();
      window.ezRewardedAds = { cmd: immediateCmd };
      window.ezstandalone = {}; // enabled undefined — initial load not started
      // No /sa.go resource-timing entry loads in the test env and no div-gpt-ad
      // container exists, so none of the three predicate arms is satisfied.
      const initRewardedAds = vi.fn();
      mountRewardedWithApi({ initRewardedAds });

      expect(initRewardedAds).not.toHaveBeenCalled();
      // Polling before any signal appears must not fire it either.
      vi.advanceTimersByTime(1000);
      expect(initRewardedAds).not.toHaveBeenCalled();
    });

    it('fires init once when enabled flips true before the grace deadline, then stops polling', () => {
      vi.useFakeTimers();
      window.ezRewardedAds = { cmd: immediateCmd };
      window.ezstandalone = {};
      const initRewardedAds = vi.fn();
      mountRewardedWithApi({ initRewardedAds });

      expect(initRewardedAds).not.toHaveBeenCalled();

      // Runtime enables ads (initial load started); the next poll dispatches once.
      window.ezstandalone.enabled = true;
      vi.advanceTimersByTime(250);
      expect(initRewardedAds).toHaveBeenCalledTimes(1);
      expect(initRewardedAds).toHaveBeenCalledWith(undefined);

      // Timers are cleaned up: no further dispatch however long we advance.
      vi.advanceTimersByTime(60_000);
      expect(initRewardedAds).toHaveBeenCalledTimes(1);
    });

    it('fires init at the grace deadline when no display placements are mounted', () => {
      vi.useFakeTimers();
      window.ezRewardedAds = { cmd: immediateCmd };
      window.ezstandalone = {}; // never enabled
      const initRewardedAds = vi.fn();
      mountRewardedWithApi({ initRewardedAds });

      // Just before the deadline: still deferred.
      vi.advanceTimersByTime(3999);
      expect(initRewardedAds).not.toHaveBeenCalled();
      // At the deadline, with no placements, the rewarded-only page self-boots.
      vi.advanceTimersByTime(1);
      expect(initRewardedAds).toHaveBeenCalledTimes(1);
    });

    it('does NOT fire at the grace deadline while display placements are mounted; fires when enabled flips', () => {
      vi.useFakeTimers();
      window.ezRewardedAds = { cmd: immediateCmd };
      window.ezstandalone = {}; // not enabled
      // Simulate a mounted <EzoicAd> display placement claiming its id.
      claimAdId(910);
      const initRewardedAds = vi.fn();
      mountRewardedWithApi({ initRewardedAds });

      // Grace window passes but placements exist → do not preempt the load.
      vi.advanceTimersByTime(4000);
      expect(initRewardedAds).not.toHaveBeenCalled();
      // Poll keeps running well past the grace window (never gives up silently).
      vi.advanceTimersByTime(10_000);
      expect(initRewardedAds).not.toHaveBeenCalled();
      // Once the initial load finally starts, init fires exactly once.
      window.ezstandalone.enabled = true;
      vi.advanceTimersByTime(250);
      expect(initRewardedAds).toHaveBeenCalledTimes(1);
    });

    it('schedules once across multiple default-mode consumers (first placements win, deferred)', () => {
      vi.useFakeTimers();
      window.ezRewardedAds = { cmd: immediateCmd };
      window.ezstandalone = {};
      const initRewardedAds = vi.fn();
      const first: RewardedSiteWidePlacements = { video: true };
      mountRewardedWithApi({ initRewardedAds }, { placements: first });
      mountRewardedWithApi(
        { initRewardedAds },
        { placements: { video: false } },
      );

      // Deadline with no placements → single dispatch with the first placements.
      vi.advanceTimersByTime(4000);
      expect(initRewardedAds).toHaveBeenCalledTimes(1);
      expect(initRewardedAds).toHaveBeenCalledWith(first);
    });

    it('fires init when a /sa.go entry is in resource timing (public enabled stays false)', () => {
      window.ezRewardedAds = { cmd: immediateCmd };
      // The real-page bug: public enabled never flips. The /sa.go resource entry
      // is the reliable signal that the initial ad request was issued.
      window.ezstandalone = {};
      vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
        { name: 'https://g.ezoic.net/sa.go?t=1' },
      ] as unknown as PerformanceEntryList);
      const initRewardedAds = vi.fn();
      mountRewardedWithApi({ initRewardedAds });

      // Fast path detects the /sa.go signal and dispatches synchronously.
      expect(initRewardedAds).toHaveBeenCalledTimes(1);
      expect(initRewardedAds).toHaveBeenCalledWith(undefined);
    });

    it('fires init when a GPT container is rendered inside an Ezoic placeholder (public enabled stays false)', () => {
      window.ezRewardedAds = { cmd: immediateCmd };
      window.ezstandalone = {}; // public enabled never flips
      // Ezoic renders its GPT container inside the placeholder once the ad
      // response is rendering.
      const placeholder = document.createElement('div');
      placeholder.id = 'ezoic-pub-ad-placeholder-910';
      const gpt = document.createElement('div');
      gpt.id = 'div-gpt-ad-ezoic_com-medrectangle-4-0';
      placeholder.appendChild(gpt);
      document.body.appendChild(placeholder);
      const initRewardedAds = vi.fn();
      mountRewardedWithApi({ initRewardedAds });

      expect(initRewardedAds).toHaveBeenCalledTimes(1);
    });

    it('does NOT fire init for a plain publisher GPT container outside any Ezoic placeholder', () => {
      vi.useFakeTimers();
      window.ezRewardedAds = { cmd: immediateCmd };
      window.ezstandalone = {}; // initial load not started
      // Plain publisher-hardcoded GPT present in the HTML before the Ezoic load —
      // must not be mistaken for the Ezoic initial load starting.
      const gpt = document.createElement('div');
      gpt.id = 'div-gpt-ad-publisher-slot-1';
      document.body.appendChild(gpt);
      const initRewardedAds = vi.fn();
      mountRewardedWithApi({ initRewardedAds });

      expect(initRewardedAds).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1000);
      expect(initRewardedAds).not.toHaveBeenCalled();
    });

    it('keeps a started scheduler running after the initiating component unmounts, then dispatches once', () => {
      vi.useFakeTimers();
      window.ezRewardedAds = { cmd: immediateCmd };
      window.ezstandalone = {}; // initial load not started
      const initRewardedAds = vi.fn();
      const { wrapper } = mountRewardedWithApi({ initRewardedAds });
      expect(initRewardedAds).not.toHaveBeenCalled();

      // The initiating component unmounts before the load starts. The scheduler
      // is page-global and must NOT be cancelled by unmount.
      wrapper.unmount();

      // The initial load later starts → the still-running poll dispatches once.
      window.ezstandalone.enabled = true;
      vi.advanceTimersByTime(250);
      expect(initRewardedAds).toHaveBeenCalledTimes(1);
    });
  });

  describe('escape-hatch (explicit loader) mode', () => {
    it('composable loaderUrl injects the loader and does not call initRewardedAds', () => {
      const initRewardedAds = vi.fn();
      mountRewardedWithApi({ initRewardedAds }, { loaderUrl: LOADER_URL });

      expect(
        document.querySelectorAll(`script[src="${LOADER_URL}"]`),
      ).toHaveLength(1);
      expect(document.querySelector(REWARDED_STUB_SELECTOR)).not.toBeNull();
      expect(initRewardedAds).not.toHaveBeenCalled();
    });

    it('does not call initRewardedAds when a loader was already injected (plugin rewardedLoaderUrl)', () => {
      // Simulate the plugin injecting its rewarded loader at install time.
      injectRewardedLoader(LOADER_URL);
      const initRewardedAds = vi.fn();
      mountRewardedWithApi({ initRewardedAds });

      expect(initRewardedAds).not.toHaveBeenCalled();
      // No second loader script is injected by the default-mode composable.
      expect(
        document.querySelectorAll(`script[src="${LOADER_URL}"]`),
      ).toHaveLength(1);
    });

    it('does not call initRewardedAds when the host pre-defined window.ezRewardedAds and the plugin injected a loader', () => {
      // Host HTML defines the rewarded global before the SDK runs. This makes
      // ensureRewardedCmdStub skip the inline stub node, so the stub-marker
      // sniff alone would miss the escape hatch (the reviewed gap).
      window.ezRewardedAds = { cmd: immediateCmd };
      injectRewardedLoader(LOADER_URL);
      // Prove the gap condition: no SDK stub-marker node exists in this case.
      expect(document.querySelector(REWARDED_STUB_SELECTOR)).toBeNull();

      const initRewardedAds = vi.fn();
      mountRewardedWithApi({ initRewardedAds });
      expect(initRewardedAds).not.toHaveBeenCalled();
    });

    it('does not call initRewardedAds when the host HTML hand-included the loader script (no SDK involvement)', () => {
      // A rewarded loader <script> placed directly in the host HTML, with no
      // SDK injection (module flag stays false) and no stub-marker node.
      window.ezRewardedAds = { cmd: immediateCmd };
      const el = document.createElement('script');
      el.src = 'https://host.example/porpoiseant/ezadloadrewarded.js';
      document.head.appendChild(el);
      expect(document.querySelector(REWARDED_STUB_SELECTOR)).toBeNull();

      const initRewardedAds = vi.fn();
      mountRewardedWithApi({ initRewardedAds });
      expect(initRewardedAds).not.toHaveBeenCalled();
    });
  });
});
