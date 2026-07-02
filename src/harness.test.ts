import { describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';

/**
 * Smoke test proving the Vue 3 + @vue/test-utils + jsdom test harness is wired
 * up. Component-level tests for the SDK's own components arrive with the
 * `<EzoicAd>` release.
 */
describe('test harness', () => {
  it('mounts a Vue component and renders it', () => {
    const Probe = defineComponent({
      setup() {
        return () => h('div', { class: 'probe' }, 'ok');
      },
    });

    const wrapper = mount(Probe);
    expect(wrapper.find('.probe').text()).toBe('ok');
  });
});
