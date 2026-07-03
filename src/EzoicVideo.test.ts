import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import {
  createApp,
  defineComponent,
  h,
  nextTick,
  ref,
  type Component,
} from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { EzoicVideo, resetVideoState } from './EzoicVideo';
import { EzoicPlugin } from './plugin';
import type { EzoicCmdFn } from './global';

let defineVideo: Mock;
let displayMoreVideo: Mock;
let destroyVideoPlaceholders: Mock;
/** Records whether the div still existed in the DOM when destroy was called. */
let domPresentAtDestroy: boolean | null;

beforeEach(() => {
  document.body.innerHTML = '';
  resetVideoState();
  domPresentAtDestroy = null;
  defineVideo = vi.fn();
  displayMoreVideo = vi.fn();
  destroyVideoPlaceholders = vi.fn((divId: string) => {
    domPresentAtDestroy = document.getElementById(divId) !== null;
  });
  // Simulate a post-init ezstandalone: the queue runs callbacks immediately.
  window.ezstandalone = {
    cmd: { push: (fn: EzoicCmdFn) => fn() },
    defineVideo,
    displayMoreVideo,
    destroyVideoPlaceholders,
  };
});

afterEach(() => {
  document.body.innerHTML = '';
  delete window.ezstandalone;
  vi.restoreAllMocks();
});

function mountWithPlugin(
  component: Component,
  props?: Record<string, unknown>,
): ReturnType<typeof mount> {
  return mount(component, {
    props,
    attachTo: document.body,
    global: { plugins: [EzoicPlugin] },
  });
}

describe('<EzoicVideo>', () => {
  it('renders the publisher div and loads the video once', async () => {
    const wrapper = mountWithPlugin(EzoicVideo, { divId: 'myVid' });

    const el = wrapper.element as HTMLElement;
    expect(el.tagName).toBe('DIV');
    expect(el.id).toBe('myVid');
    // Bare: no styling or extra attributes on the placeholder div.
    expect(el.getAttribute('class')).toBeNull();
    expect(el.getAttribute('style')).toBeNull();

    await flushPromises();
    // displayMoreVideo alone registers + loads; defineVideo must NOT be called.
    expect(displayMoreVideo).toHaveBeenCalledTimes(1);
    expect(displayMoreVideo).toHaveBeenCalledWith('myVid');
    expect(defineVideo).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('destroys the video placeholder on unmount', async () => {
    const wrapper = mountWithPlugin(EzoicVideo, { divId: 'myVid' });
    await flushPromises();

    wrapper.unmount();
    await flushPromises();

    expect(destroyVideoPlaceholders).toHaveBeenCalledTimes(1);
    expect(destroyVideoPlaceholders).toHaveBeenCalledWith('myVid');
  });

  it('tears down while the div is still in the DOM', async () => {
    // Mount via a host element we own and unmount the app directly. @vue/test-
    // utils' wrapper.unmount() detaches the `attachTo` element before running
    // the app's unmount lifecycle, which would remove the div before
    // onBeforeUnmount fires; a direct app.unmount() preserves Vue's real order
    // (beforeUnmount hooks run while the DOM is still attached).
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(EzoicVideo, { divId: 'myVid' });
    app.use(EzoicPlugin);
    app.mount(host);
    await flushPromises();

    app.unmount();
    await flushPromises();

    // onBeforeUnmount (not onUnmounted) runs teardown so the bundle can find
    // and unregister the element; onUnmounted would fire after removal.
    expect(domPresentAtDestroy).toBe(true);

    host.remove();
  });

  it('releases the originally-claimed div id on unmount, not a live prop change', async () => {
    // Reproduces a divId change on the SAME instance (no remount): the parent
    // holds a reactive ref and flips it after mount.
    const idRef = ref('A');
    const Parent = defineComponent({
      setup() {
        return () => h(EzoicVideo, { divId: idRef.value });
      },
    });

    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(Parent);
    app.use(EzoicPlugin);
    app.mount(host);
    await flushPromises();

    expect(displayMoreVideo).toHaveBeenCalledWith('A');

    // Same instance, live prop now 'B' — no remount occurred.
    idRef.value = 'B';
    await nextTick();

    app.unmount();
    await flushPromises();

    // Teardown must release the id claimed at mount time ('A'), not the
    // current live prop value ('B').
    expect(destroyVideoPlaceholders).toHaveBeenCalledTimes(1);
    expect(destroyVideoPlaceholders).toHaveBeenCalledWith('A');

    host.remove();

    // If 'A' had leaked in the registry (deleting 'B' instead), this fresh
    // mount would be rejected as a duplicate and displayMoreVideo would not
    // be called for it a second time.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const host2 = document.createElement('div');
    document.body.appendChild(host2);
    const app2 = createApp(EzoicVideo, { divId: 'A' });
    app2.use(EzoicPlugin);
    app2.mount(host2);
    await flushPromises();

    expect(warn).not.toHaveBeenCalled();
    expect(displayMoreVideo).toHaveBeenCalledTimes(2);
    expect(displayMoreVideo).toHaveBeenNthCalledWith(2, 'A');

    app2.unmount();
    await flushPromises();
    host2.remove();
  });

  it('keeps the placeholder div bare even when class and style are passed', async () => {
    const wrapper = mountWithPlugin(EzoicVideo, {
      divId: 'myVid',
      class: 'my-wrapper',
      style: 'color: red',
    });

    const el = wrapper.element as HTMLElement;
    expect(el.id).toBe('myVid');
    expect(el.getAttribute('class')).toBeNull();
    expect(el.getAttribute('style')).toBeNull();

    await flushPromises();
    wrapper.unmount();
  });

  it('warns and does not drive a duplicate div id', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const Parent = defineComponent({
      setup() {
        return () =>
          h('div', [
            h(EzoicVideo, { divId: 'dup' }),
            h(EzoicVideo, { divId: 'dup' }),
          ]);
      },
    });

    const wrapper = mountWithPlugin(Parent);
    await flushPromises();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('duplicate');
    // Only the owner loaded the video.
    expect(displayMoreVideo).toHaveBeenCalledTimes(1);
    expect(displayMoreVideo).toHaveBeenCalledWith('dup');

    wrapper.unmount();
    await flushPromises();

    // Only the owner tears the placeholder down.
    expect(destroyVideoPlaceholders).toHaveBeenCalledTimes(1);
    expect(destroyVideoPlaceholders).toHaveBeenCalledWith('dup');
  });

  it('throws when the plugin is not installed', () => {
    expect(() => mount(EzoicVideo, { props: { divId: 'myVid' } })).toThrow(
      /plugin/i,
    );
  });

  it('warns and renders nothing for an empty div id', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const wrapper = mountWithPlugin(EzoicVideo, { divId: '' });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('non-empty');
    expect(wrapper.find('div').exists()).toBe(false);

    await flushPromises();
    expect(displayMoreVideo).not.toHaveBeenCalled();
    expect(defineVideo).not.toHaveBeenCalled();

    wrapper.unmount();
  });
});
