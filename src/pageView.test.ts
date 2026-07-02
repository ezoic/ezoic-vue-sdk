import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import { defineComponent, h, ref, type WatchSource } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { EzoicPlugin } from './plugin';
import { useEzoicPageView, type EzoicPageViewOptions } from './pageView';
import type { EzoicCmdFn } from './global';

let setIsSinglePageApplication: Mock;
let showAds: Mock;
let destroyPlaceholders: Mock;

beforeEach(() => {
  document.head.innerHTML = '';
  setIsSinglePageApplication = vi.fn();
  showAds = vi.fn();
  destroyPlaceholders = vi.fn();
  // Simulate a post-init ezstandalone: the queue runs callbacks immediately.
  window.ezstandalone = {
    cmd: { push: (fn: EzoicCmdFn) => fn() },
    setIsSinglePageApplication,
    showAds,
    destroyPlaceholders,
  };
});

afterEach(() => {
  document.head.innerHTML = '';
  delete window.ezstandalone;
  vi.restoreAllMocks();
});

function mountPageView(
  routeKey: WatchSource<unknown>,
  options?: EzoicPageViewOptions,
): ReturnType<typeof mount> {
  const Comp = defineComponent({
    setup() {
      useEzoicPageView(routeKey, options);
      return () => h('div');
    },
  });
  return mount(Comp, { global: { plugins: [EzoicPlugin] } });
}

describe('useEzoicPageView', () => {
  it('declares SPA mode once on setup', () => {
    const routeKey = ref(0);
    const wrapper = mountPageView(routeKey);

    expect(setIsSinglePageApplication).toHaveBeenCalledTimes(1);
    expect(setIsSinglePageApplication).toHaveBeenCalledWith(true);

    wrapper.unmount();
  });

  it('does not request ads on the initial render', async () => {
    const routeKey = ref(0);
    const wrapper = mountPageView(routeKey);
    await flushPromises();

    expect(showAds).not.toHaveBeenCalled();
    expect(destroyPlaceholders).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('scan mode: rescans with no ids on each route change', async () => {
    const routeKey = ref(0);
    const wrapper = mountPageView(routeKey);

    routeKey.value = 1;
    await flushPromises();
    expect(showAds).toHaveBeenCalledTimes(1);
    expect(showAds).toHaveBeenCalledWith();
    expect(destroyPlaceholders).not.toHaveBeenCalled();

    routeKey.value = 2;
    await flushPromises();
    expect(showAds).toHaveBeenCalledTimes(2);

    wrapper.unmount();
  });

  it('managed mode: destroys previous ids then requests new ids, in order', async () => {
    const routeKey = ref(0);
    const ids = ref<number[]>([101, 102]);
    const wrapper = mountPageView(routeKey, { ids });

    ids.value = [201];
    routeKey.value = 1;
    await flushPromises();

    // Previous route's ids are torn down, this route's ids requested.
    expect(destroyPlaceholders).toHaveBeenCalledTimes(1);
    expect(destroyPlaceholders).toHaveBeenCalledWith(101, 102);
    expect(showAds).toHaveBeenCalledTimes(1);
    expect(showAds).toHaveBeenCalledWith(201);
    // Teardown must run before the request.
    expect(destroyPlaceholders.mock.invocationCallOrder[0]).toBeLessThan(
      showAds.mock.invocationCallOrder[0],
    );

    wrapper.unmount();
  });

  it('managed mode: carries ids forward across successive changes', async () => {
    const routeKey = ref(0);
    const ids = ref<number[]>([101]);
    const wrapper = mountPageView(routeKey, { ids });

    ids.value = [201, 202];
    routeKey.value = 1;
    await flushPromises();
    expect(destroyPlaceholders).toHaveBeenNthCalledWith(1, 101);
    expect(showAds).toHaveBeenNthCalledWith(1, 201, 202);

    ids.value = [303];
    routeKey.value = 2;
    await flushPromises();
    // The ids requested last time are the ones destroyed this time.
    expect(destroyPlaceholders).toHaveBeenNthCalledWith(2, 201, 202);
    expect(showAds).toHaveBeenNthCalledWith(2, 303);

    wrapper.unmount();
  });

  it('managed mode: skips empty id sets without calling through', async () => {
    const routeKey = ref(0);
    const ids = ref<number[]>([]);
    const wrapper = mountPageView(routeKey, { ids });

    // Empty -> empty: nothing to destroy, nothing to request.
    routeKey.value = 1;
    await flushPromises();
    expect(destroyPlaceholders).not.toHaveBeenCalled();
    expect(showAds).not.toHaveBeenCalled();

    // Empty -> non-empty: only a request, no teardown.
    ids.value = [101];
    routeKey.value = 2;
    await flushPromises();
    expect(destroyPlaceholders).not.toHaveBeenCalled();
    expect(showAds).toHaveBeenCalledTimes(1);
    expect(showAds).toHaveBeenCalledWith(101);

    wrapper.unmount();
  });
});
