import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { OPEN_VIDEO_SCRIPT_URL } from './constants';
import { EzoicVideoEmbed } from './EzoicVideoEmbed';
import type { OpenVideoPlayerEntry, OpenVideoPlayersQueue } from './global';

const SCRIPT_SELECTOR = `script[src="${OPEN_VIDEO_SCRIPT_URL}"]`;

/** Reads the seeded queue as the plain array it is before the script loads. */
function queueEntries(): OpenVideoPlayerEntry[] {
  return (window.openVideoPlayers ?? []) as unknown as OpenVideoPlayerEntry[];
}

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  delete window.openVideoPlayers;
});

afterEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  delete window.openVideoPlayers;
  vi.restoreAllMocks();
});

describe('<EzoicVideoEmbed>', () => {
  it('injects the Open Video script once (async) and pushes the embed entry', async () => {
    const wrapper = mount(EzoicVideoEmbed, {
      props: { videoId: 'abc' },
      attachTo: document.body,
    });
    await flushPromises();

    const script = document.querySelector<HTMLScriptElement>(SCRIPT_SELECTOR);
    expect(script).not.toBeNull();
    expect(script?.async).toBe(true);
    expect(document.querySelectorAll(SCRIPT_SELECTOR)).toHaveLength(1);

    expect(Array.isArray(window.openVideoPlayers)).toBe(true);
    const entries = queueEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].target).toBe(wrapper.element);
    expect(entries[0].videoID).toBe('abc');

    wrapper.unmount();
  });

  it('does not inject a duplicate script across multiple embeds', async () => {
    const Parent = defineComponent({
      setup() {
        return () =>
          h('div', [
            h(EzoicVideoEmbed, { videoId: 'one' }),
            h(EzoicVideoEmbed, { videoId: 'two' }),
          ]);
      },
    });

    const wrapper = mount(Parent, { attachTo: document.body });
    await flushPromises();

    expect(document.querySelectorAll(SCRIPT_SELECTOR)).toHaveLength(1);
    expect(queueEntries()).toHaveLength(2);

    wrapper.unmount();
  });

  it('omits float/autoplay when the props are not set', async () => {
    const wrapper = mount(EzoicVideoEmbed, {
      props: { videoId: 'abc' },
      attachTo: document.body,
    });
    await flushPromises();

    const entry = queueEntries()[0];
    expect('float' in entry).toBe(false);
    expect('autoplay' in entry).toBe(false);

    wrapper.unmount();
  });

  it('includes float/autoplay when the props are set', async () => {
    const wrapper = mount(EzoicVideoEmbed, {
      props: { videoId: 'abc', float: true, autoplay: false },
      attachTo: document.body,
    });
    await flushPromises();

    const entry = queueEntries()[0];
    expect(entry.float).toBe(true);
    expect(entry.autoplay).toBe(false);

    wrapper.unmount();
  });

  it('pushes to an existing handler object without replacing it', async () => {
    const push = vi.fn();
    const handler = { push, visited: true };
    window.openVideoPlayers = handler as unknown as OpenVideoPlayersQueue;

    const wrapper = mount(EzoicVideoEmbed, {
      props: { videoId: 'abc' },
      attachTo: document.body,
    });
    await flushPromises();

    // The live handler is preserved (not reset to an array) and receives the push.
    expect(window.openVideoPlayers).toBe(
      handler as unknown as OpenVideoPlayersQueue,
    );
    expect(handler.visited).toBe(true);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0]).toMatchObject({
      target: wrapper.element,
      videoID: 'abc',
    });

    wrapper.unmount();
  });

  it('warns and renders the container but pushes nothing for an empty videoId', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const wrapper = mount(EzoicVideoEmbed, {
      props: { videoId: '' },
      attachTo: document.body,
    });
    await flushPromises();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('non-empty');
    expect((wrapper.element as HTMLElement).tagName).toBe('DIV');
    expect(document.querySelector(SCRIPT_SELECTOR)).toBeNull();
    expect(window.openVideoPlayers).toBeUndefined();

    wrapper.unmount();
  });
});
