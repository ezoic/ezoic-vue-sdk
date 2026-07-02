// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createApp, defineComponent, h, ref } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { EzoicAd, EzoicPlugin, useEzoic, useEzoicPageView } from './index';

/**
 * These tests run in the Node environment (no `window`/`document`). Any access
 * to browser globals during plugin install or rendering would throw a
 * ReferenceError and fail the test, proving the SDK is SSR-safe.
 */
describe('server-side rendering', () => {
  it('renders a component that uses the plugin without touching the DOM', async () => {
    const Comp = defineComponent({
      setup() {
        const ez = useEzoic();
        return () => h('div', { id: 'ready' }, String(ez.ready.value));
      },
    });

    const app = createApp(Comp);
    app.use(EzoicPlugin);

    const html = await renderToString(app);
    expect(html).toContain('>false<');
  });

  it('push() is a safe no-op during server render', async () => {
    let threw = false;
    const Comp = defineComponent({
      setup() {
        const ez = useEzoic();
        try {
          ez.push(() => {});
        } catch {
          threw = true;
        }
        return () => h('div');
      },
    });

    const app = createApp(Comp);
    app.use(EzoicPlugin);
    await renderToString(app);
    expect(threw).toBe(false);
  });

  it('renders <EzoicAd> to a bare placeholder div without touching the DOM', async () => {
    const app = createApp({
      setup() {
        return () => h(EzoicAd, { id: 101 });
      },
    });
    app.use(EzoicPlugin);

    const html = await renderToString(app);
    expect(html).toContain('id="ezoic-pub-ad-placeholder-101"');
  });

  it('useEzoicPageView renders without touching the DOM', async () => {
    const Comp = defineComponent({
      setup() {
        const routeKey = ref('/a');
        useEzoicPageView(routeKey);
        return () => h('div', { id: 'pageview' }, 'ok');
      },
    });

    const app = createApp(Comp);
    app.use(EzoicPlugin);

    const html = await renderToString(app);
    expect(html).toContain('id="pageview"');
  });
});
