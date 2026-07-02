import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import { defineComponent, h, type Component } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { resetAdBatchState } from './adBatch';
import { EzoicAd } from './EzoicAd';
import { EzoicPlugin } from './plugin';
import { placeholderDomId } from './placeholder';
import type { EzoicCmdFn } from './global';

let showAds: Mock;
let destroyPlaceholders: Mock;

beforeEach(() => {
  document.head.innerHTML = '';
  resetAdBatchState();
  showAds = vi.fn();
  destroyPlaceholders = vi.fn();
  // Simulate a post-init ezstandalone: the queue runs callbacks immediately.
  window.ezstandalone = {
    cmd: { push: (fn: EzoicCmdFn) => fn() },
    showAds,
    destroyPlaceholders,
  };
});

afterEach(() => {
  document.head.innerHTML = '';
  delete window.ezstandalone;
  vi.restoreAllMocks();
});

function mountWithPlugin(
  component: Component,
  props?: Record<string, unknown>,
): ReturnType<typeof mount> {
  return mount(component, {
    props,
    global: { plugins: [EzoicPlugin] },
  });
}

describe('<EzoicAd>', () => {
  it('renders a bare placeholder div and requests the ad once', async () => {
    const wrapper = mountWithPlugin(EzoicAd, { id: 101 });

    const el = wrapper.element as HTMLElement;
    expect(el.tagName).toBe('DIV');
    expect(el.id).toBe(placeholderDomId(101));
    // Bare: no styling or extra attributes on the placeholder div.
    expect(el.getAttribute('class')).toBeNull();
    expect(el.getAttribute('style')).toBeNull();

    await flushPromises();
    expect(showAds).toHaveBeenCalledTimes(1);
    expect(showAds).toHaveBeenCalledWith(101);

    wrapper.unmount();
  });

  it('batches ads mounting in the same tick into one showAds call', async () => {
    const Parent = defineComponent({
      setup() {
        return () =>
          h('div', [
            h(EzoicAd, { id: 101 }),
            h(EzoicAd, { id: 102, required: true }),
            h(EzoicAd, { id: 103, sizes: ['728x90'] }),
          ]);
      },
    });

    const wrapper = mountWithPlugin(Parent);

    const placeholders = wrapper.findAll('[id^="ezoic-pub-ad-placeholder-"]');
    expect(placeholders).toHaveLength(3);
    for (const id of [101, 102, 103]) {
      expect(wrapper.html()).toContain(`id="${placeholderDomId(id)}"`);
    }

    await flushPromises();
    expect(showAds).toHaveBeenCalledTimes(1);
    expect(showAds).toHaveBeenCalledWith(
      101,
      { id: 102, required: true },
      { id: 103, sizes: ['728x90'] },
    );

    wrapper.unmount();
  });

  it('destroys the placeholder on unmount', async () => {
    const wrapper = mountWithPlugin(EzoicAd, { id: 101 });
    await flushPromises();

    wrapper.unmount();
    await flushPromises();

    expect(destroyPlaceholders).toHaveBeenCalledWith(101);
  });

  it('warns and skips a duplicate placeholder id', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const Parent = defineComponent({
      setup() {
        return () =>
          h('div', [h(EzoicAd, { id: 101 }), h(EzoicAd, { id: 101 })]);
      },
    });

    const wrapper = mountWithPlugin(Parent);
    await flushPromises();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('duplicate');
    // Only the first mount registered, so exactly one id reaches showAds.
    expect(showAds).toHaveBeenCalledTimes(1);
    expect(showAds).toHaveBeenCalledWith(101);

    wrapper.unmount();
  });

  it('warns and renders nothing for an invalid id', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const wrapper = mountWithPlugin(EzoicAd, { id: 1000 });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('invalid');
    expect(wrapper.find('[id^="ezoic-pub-ad-placeholder-"]').exists()).toBe(
      false,
    );

    await flushPromises();
    expect(showAds).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('keeps the placeholder div bare even when class and style are passed', async () => {
    const wrapper = mountWithPlugin(EzoicAd, {
      id: 101,
      class: 'my-wrapper',
      style: 'color: red',
    });

    const el = wrapper.element as HTMLElement;
    expect(el.id).toBe(placeholderDomId(101));
    expect(el.getAttribute('class')).toBeNull();
    expect(el.getAttribute('style')).toBeNull();

    await flushPromises();
    wrapper.unmount();
  });
});
