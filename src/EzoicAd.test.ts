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
import { isAdIdClaimed, resetAdBatchState } from './adBatch';
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

  it('warns and renders nothing when neither id nor location is given', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const wrapper = mountWithPlugin(EzoicAd);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('exactly one');
    expect(wrapper.find('div').exists()).toBe(false);

    await flushPromises();
    expect(showAds).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('warns and renders nothing when both id and location are given', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const wrapper = mountWithPlugin(EzoicAd, {
      id: 101,
      location: 'under_first_paragraph',
    });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('exactly one');
    expect(wrapper.find('div').exists()).toBe(false);

    await flushPromises();
    expect(showAds).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});

describe('<EzoicAd location> — static fallback (bundle not loaded)', () => {
  it('resolves a location to its reserved id and requests it once', async () => {
    const wrapper = mountWithPlugin(EzoicAd, {
      location: 'under_first_paragraph',
    });

    await flushPromises();

    const el = wrapper.element as HTMLElement;
    expect(el.tagName).toBe('DIV');
    expect(el.id).toBe(placeholderDomId(909));
    expect(showAds).toHaveBeenCalledTimes(1);
    expect(showAds).toHaveBeenCalledWith(909);

    wrapper.unmount();
    await flushPromises();
    expect(destroyPlaceholders).toHaveBeenCalledWith(909);
  });

  it('batches distinct locations into a single showAds call', async () => {
    const Parent = defineComponent({
      setup() {
        return () =>
          h('div', [
            h(EzoicAd, { location: 'top_of_page' }),
            h(EzoicAd, { location: 'under_first_paragraph' }),
            h(EzoicAd, { location: 'mid_content' }),
          ]);
      },
    });

    const wrapper = mountWithPlugin(Parent);
    await flushPromises();

    for (const id of [900, 909, 911]) {
      expect(wrapper.html()).toContain(`id="${placeholderDomId(id)}"`);
    }
    expect(showAds).toHaveBeenCalledTimes(1);
    expect(showAds).toHaveBeenCalledWith(900, 909, 911);

    wrapper.unmount();
  });

  it('reassigns a repeated location to a distinct in-content id', async () => {
    const Parent = defineComponent({
      setup() {
        return () =>
          h('div', [
            h(EzoicAd, { location: 'under_first_paragraph' }),
            h(EzoicAd, { location: 'under_first_paragraph' }),
          ]);
      },
    });

    const wrapper = mountWithPlugin(Parent);
    await flushPromises();

    // First gets the precise id (909); the second is reassigned to 915.
    expect(wrapper.html()).toContain(`id="${placeholderDomId(909)}"`);
    expect(wrapper.html()).toContain(`id="${placeholderDomId(915)}"`);
    expect(showAds).toHaveBeenCalledTimes(1);
    expect(showAds).toHaveBeenCalledWith(909, 915);

    wrapper.unmount();
  });

  it('warns on an unknown location but still resolves a generic slot', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const wrapper = mountWithPlugin(EzoicAd, { location: 'footer_banner' });
    await flushPromises();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('unknown location');
    expect((wrapper.element as HTMLElement).id).toBe(placeholderDomId(915));
    expect(showAds).toHaveBeenCalledWith(915);

    wrapper.unmount();
  });

  it('passes required and sizes options through for a location', async () => {
    const wrapper = mountWithPlugin(EzoicAd, {
      location: 'mid_content',
      required: true,
      sizes: ['728x90'],
    });
    await flushPromises();

    expect(showAds).toHaveBeenCalledWith({
      id: 911,
      required: true,
      sizes: ['728x90'],
    });

    wrapper.unmount();
  });
});

describe('<EzoicAd location> — bundle-loaded resolver', () => {
  it('uses GetGeneratedIdAsync when the bundle exposes it', async () => {
    const getId = vi.fn(() => Promise.resolve(942));
    window.ezstandalone = {
      cmd: { push: (fn: EzoicCmdFn) => fn() },
      showAds,
      destroyPlaceholders,
      GetGeneratedIdAsync: getId,
    };

    const wrapper = mountWithPlugin(EzoicAd, { location: 'mid_content' });
    await flushPromises();

    expect(getId).toHaveBeenCalledWith('mid_content');
    expect((wrapper.element as HTMLElement).id).toBe(placeholderDomId(942));
    expect(showAds).toHaveBeenCalledWith(942);

    wrapper.unmount();
    await flushPromises();
    expect(destroyPlaceholders).toHaveBeenCalledWith(942);
  });

  it('accepts a numeric-string id from the resolver', async () => {
    window.ezstandalone = {
      cmd: { push: (fn: EzoicCmdFn) => fn() },
      showAds,
      destroyPlaceholders,
      GetGeneratedIdAsync: () => Promise.resolve('1000'),
    };

    const wrapper = mountWithPlugin(EzoicAd, { location: 'mid_content' });
    await flushPromises();

    expect((wrapper.element as HTMLElement).id).toBe(
      'ezoic-pub-ad-placeholder-1000',
    );
    expect(showAds).toHaveBeenCalledWith(1000);

    wrapper.unmount();
  });

  it('falls back to the static map when the resolver returns an unusable id', async () => {
    window.ezstandalone = {
      cmd: { push: (fn: EzoicCmdFn) => fn() },
      showAds,
      destroyPlaceholders,
      GetGeneratedIdAsync: () => Promise.resolve(Number.NaN),
    };

    const wrapper = mountWithPlugin(EzoicAd, {
      location: 'under_first_paragraph',
    });
    await flushPromises();

    expect((wrapper.element as HTMLElement).id).toBe(placeholderDomId(909));
    expect(showAds).toHaveBeenCalledWith(909);

    wrapper.unmount();
  });

  it('falls back to the static map when the resolver rejects', async () => {
    window.ezstandalone = {
      cmd: { push: (fn: EzoicCmdFn) => fn() },
      showAds,
      destroyPlaceholders,
      GetGeneratedIdAsync: () => Promise.reject(new Error('no placement svc')),
    };

    const wrapper = mountWithPlugin(EzoicAd, { location: 'top_of_page' });
    await flushPromises();

    expect((wrapper.element as HTMLElement).id).toBe(placeholderDomId(900));
    expect(showAds).toHaveBeenCalledWith(900);

    wrapper.unmount();
  });

  it('does not request or leak an id when unmounted before the resolver settles', async () => {
    let settle!: (v: number) => void;
    window.ezstandalone = {
      cmd: { push: (fn: EzoicCmdFn) => fn() },
      showAds,
      destroyPlaceholders,
      GetGeneratedIdAsync: () =>
        new Promise<number>((resolve) => {
          settle = resolve;
        }),
    };

    const wrapper = mountWithPlugin(EzoicAd, { location: 'mid_content' });
    // Unmount (e.g. an SPA route change) before the async resolver settles.
    wrapper.unmount();
    settle(911);
    await flushPromises();

    // The late callback must not claim the id or request/tear down an ad.
    expect(showAds).not.toHaveBeenCalled();
    expect(destroyPlaceholders).not.toHaveBeenCalled();
    expect(isAdIdClaimed(911)).toBe(false);
  });

  it('re-resolves concurrent async duplicates to distinct ids', async () => {
    // The bundle hands both concurrent mounts the same id; the SDK must split
    // them so neither location placeholder is dropped.
    window.ezstandalone = {
      cmd: { push: (fn: EzoicCmdFn) => fn() },
      showAds,
      destroyPlaceholders,
      GetGeneratedIdAsync: () => Promise.resolve(911),
    };

    const Parent = defineComponent({
      setup() {
        return () =>
          h('div', [
            h(EzoicAd, { location: 'mid_content' }),
            h(EzoicAd, { location: 'mid_content' }),
          ]);
      },
    });

    const wrapper = mountWithPlugin(Parent);
    await flushPromises();

    // First takes the resolver's 911; the second re-resolves to the next free
    // in-content slot (915) instead of colliding and disappearing.
    expect(wrapper.html()).toContain(`id="${placeholderDomId(911)}"`);
    expect(wrapper.html()).toContain(`id="${placeholderDomId(915)}"`);
    const requested = showAds.mock.calls.flat();
    expect(requested).toContain(911);
    expect(requested).toContain(915);

    wrapper.unmount();
  });
});
