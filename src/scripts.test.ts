import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CMP_SCRIPT_URLS, STANDALONE_SCRIPT_URL } from './constants';
import { CMD_QUEUE_STUB, injectEzoicScripts } from './scripts';

const [CMP1, CMP2] = CMP_SCRIPT_URLS;
const STUB_SELECTOR = 'script[data-ezoic-vue-sdk="cmd-stub"]';

function headScriptOrder(): string[] {
  return [...document.head.querySelectorAll('script')].map(
    (el) => el.getAttribute('src') ?? '[inline-stub]',
  );
}

beforeEach(() => {
  document.head.innerHTML = '';
  delete window.ezstandalone;
});

afterEach(() => {
  document.head.innerHTML = '';
  delete window.ezstandalone;
});

describe('injectEzoicScripts', () => {
  it('injects scripts in the required order: CMP, CMP, stub, standalone', () => {
    injectEzoicScripts();
    expect(headScriptOrder()).toEqual([
      CMP1,
      CMP2,
      '[inline-stub]',
      STANDALONE_SCRIPT_URL,
    ]);
  });

  it('sets data-cfasync="false" on the CMP scripts, before src', () => {
    injectEzoicScripts();
    for (const url of [CMP1, CMP2]) {
      const el = document.querySelector(`script[src="${url}"]`);
      expect(el?.getAttribute('data-cfasync')).toBe('false');
    }
  });

  it('loads the standalone bundle async and without data-cfasync', () => {
    injectEzoicScripts();
    const sa = document.querySelector<HTMLScriptElement>(
      `script[src="${STANDALONE_SCRIPT_URL}"]`,
    );
    expect(sa?.async).toBe(true);
    expect(sa?.hasAttribute('data-cfasync')).toBe(false);
  });

  it('injects the cmd-queue stub content', () => {
    injectEzoicScripts();
    const stub = document.querySelector(STUB_SELECTOR);
    expect(stub?.textContent).toBe(CMD_QUEUE_STUB);
  });

  it('ensures window.ezstandalone.cmd exists after injection', () => {
    injectEzoicScripts();
    expect(Array.isArray(window.ezstandalone?.cmd)).toBe(true);
  });

  it('is idempotent: repeated calls never duplicate tags', () => {
    injectEzoicScripts();
    injectEzoicScripts();
    injectEzoicScripts();
    expect(document.querySelectorAll(`script[src="${CMP1}"]`)).toHaveLength(1);
    expect(document.querySelectorAll(`script[src="${CMP2}"]`)).toHaveLength(1);
    expect(document.querySelectorAll(STUB_SELECTOR)).toHaveLength(1);
    expect(
      document.querySelectorAll(`script[src="${STANDALONE_SCRIPT_URL}"]`),
    ).toHaveLength(1);
  });

  it('tolerates a standalone script already present in the host HTML', () => {
    const existing = document.createElement('script');
    existing.src = STANDALONE_SCRIPT_URL;
    document.head.appendChild(existing);

    injectEzoicScripts();

    expect(
      document.querySelectorAll(`script[src="${STANDALONE_SCRIPT_URL}"]`),
    ).toHaveLength(1);
  });

  it('keeps CMP + stub before a standalone script already in the HTML', () => {
    const existing = document.createElement('script');
    existing.src = STANDALONE_SCRIPT_URL;
    document.head.appendChild(existing);

    injectEzoicScripts();

    const order = headScriptOrder();
    expect(order).toEqual([
      CMP1,
      CMP2,
      '[inline-stub]',
      STANDALONE_SCRIPT_URL,
    ]);
  });

  it('does not inject its own stub when the host already defines ezstandalone', () => {
    window.ezstandalone = { cmd: [] };
    injectEzoicScripts();
    expect(document.querySelector(STUB_SELECTOR)).toBeNull();
    // The host queue is preserved, not replaced.
    expect(Array.isArray(window.ezstandalone.cmd)).toBe(true);
  });

  it('skips CMP scripts when cmp is false but still injects stub + bundle', () => {
    injectEzoicScripts({ cmp: false });
    expect(document.querySelector(`script[src="${CMP1}"]`)).toBeNull();
    expect(document.querySelector(`script[src="${CMP2}"]`)).toBeNull();
    expect(document.querySelector(STUB_SELECTOR)).not.toBeNull();
    expect(
      document.querySelector(`script[src="${STANDALONE_SCRIPT_URL}"]`),
    ).not.toBeNull();
  });

  it('injects an analytics loader after the standalone bundle when given', () => {
    const analytics = 'https://example.com/analytics.js';
    injectEzoicScripts({ analyticsScriptUrl: analytics });
    const order = headScriptOrder();
    expect(order).toContain(analytics);
    expect(order.indexOf(analytics)).toBeGreaterThan(
      order.indexOf(STANDALONE_SCRIPT_URL),
    );
    const el = document.querySelector<HTMLScriptElement>(
      `script[src="${analytics}"]`,
    );
    expect(el?.async).toBe(true);
  });

  it('does not duplicate the analytics loader across repeated calls', () => {
    const analytics = 'https://example.com/analytics.js';
    injectEzoicScripts({ analyticsScriptUrl: analytics });
    injectEzoicScripts({ analyticsScriptUrl: analytics });
    expect(document.querySelectorAll(`script[src="${analytics}"]`)).toHaveLength(
      1,
    );
  });
});
