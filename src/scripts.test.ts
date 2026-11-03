import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CMP_SCRIPT_URLS,
  OPEN_VIDEO_SCRIPT_URL,
  STANDALONE_SCRIPT_URL,
} from './constants';
import {
  CMD_QUEUE_STUB,
  REWARDED_CMD_QUEUE_STUB,
  ensureEzNamespace,
  ensureOpenVideoQueue,
  ensureRewardedCmdQueue,
  injectEzoicScripts,
  injectOpenVideoScript,
  injectRewardedLoader,
  pushOpenVideoPlayer,
} from './scripts';
import type { OpenVideoPlayerEntry, OpenVideoPlayersQueue } from './global';

const [CMP1, CMP2] = CMP_SCRIPT_URLS;
const STUB_SELECTOR = 'script[data-ezoic-vue-sdk="cmd-stub"]';
const REWARDED_STUB_SELECTOR = 'script[data-ezoic-vue-sdk="rewarded-cmd-stub"]';
const REWARDED_LOADER_URL =
  'https://example.com/porpoiseant/ezadloadrewarded.js';

function headScriptOrder(): string[] {
  return [...document.head.querySelectorAll('script')].map(
    (el) => el.getAttribute('src') ?? '[inline-stub]',
  );
}

beforeEach(() => {
  document.head.innerHTML = '';
  delete window.ezstandalone;
  delete window.ezRewardedAds;
  delete window.__ez;
});

afterEach(() => {
  document.head.innerHTML = '';
  delete window.ezstandalone;
  delete window.ezRewardedAds;
  delete window.__ez;
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
    expect(order).toEqual([CMP1, CMP2, '[inline-stub]', STANDALONE_SCRIPT_URL]);
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
    expect(
      document.querySelectorAll(`script[src="${analytics}"]`),
    ).toHaveLength(1);
  });
});

describe('browser-resolved script reuse', () => {
  beforeEach(() => {
    const base = document.createElement('base');
    base.href = 'https://publisher.example/assets/';
    document.head.appendChild(base);
  });

  function hostScript(src: string): HTMLScriptElement {
    const script = document.createElement('script');
    script.setAttribute('src', src);
    script.setAttribute('data-host', 'keep');
    document.head.appendChild(script);
    return script;
  }

  function externalScripts(): HTMLScriptElement[] {
    return [...document.querySelectorAll<HTMLScriptElement>('script[src]')];
  }

  it('reuses protocol-relative CMP and standalone tags across repeated calls', () => {
    const scripts = [CMP1, CMP2, STANDALONE_SCRIPT_URL].map((url) =>
      hostScript(url.replace('https:', '')),
    );
    const attributes = scripts.map((script) => script.outerHTML);
    const cmd = [vi.fn()];
    window.ezstandalone = { cmd };

    injectEzoicScripts();
    injectEzoicScripts();

    expect(externalScripts()).toEqual(scripts);
    expect(scripts.map((script) => script.outerHTML)).toEqual(attributes);
    expect(window.ezstandalone.cmd).toBe(cmd);
    expect(document.querySelector(STUB_SELECTOR)).toBeNull();
  });

  it('places CMP and stub before a protocol-relative standalone tag', () => {
    const src = STANDALONE_SCRIPT_URL.replace('https:', '');
    const standalone = hostScript(src);

    injectEzoicScripts();
    injectEzoicScripts();

    expect(headScriptOrder()).toEqual([CMP1, CMP2, '[inline-stub]', src]);
    expect(externalScripts()[2]).toBe(standalone);
    expect(Array.isArray(window.ezstandalone?.cmd)).toBe(true);
  });

  it.each([
    ['analytics.js', 'https://publisher.example/assets/analytics.js'],
    ['https://publisher.example/assets/analytics.js', './analytics.js'],
  ])('reuses analytics %s when given %s under a base element', (host, sdk) => {
    const existing = hostScript(host);

    injectEzoicScripts({ cmp: false, analyticsScriptUrl: sdk });
    injectEzoicScripts({ cmp: false, analyticsScriptUrl: sdk });

    expect(
      externalScripts().filter((script) => script.src === existing.src),
    ).toEqual([existing]);
    expect(existing.getAttribute('src')).toBe(host);
  });

  it.each([
    [
      '../porpoiseant/ezadloadrewarded.js',
      'https://publisher.example/porpoiseant/ezadloadrewarded.js',
    ],
    [
      'https://publisher.example/porpoiseant/ezadloadrewarded.js',
      '/porpoiseant/ezadloadrewarded.js',
    ],
  ])('reuses rewarded %s when given %s under a base element', (host, sdk) => {
    const existing = hostScript(host);
    const cmd = [vi.fn()];
    window.ezRewardedAds = { cmd };

    injectRewardedLoader(sdk);
    injectRewardedLoader(sdk);

    expect(externalScripts()).toEqual([existing]);
    expect(existing.getAttribute('src')).toBe(host);
    expect(window.ezRewardedAds.cmd).toBe(cmd);
  });

  it('reuses protocol-relative Open Video without replacing its live handler', () => {
    const existing = hostScript(OPEN_VIDEO_SCRIPT_URL.replace('https:', ''));
    const handler = { push: vi.fn() };
    window.openVideoPlayers = handler;

    try {
      injectOpenVideoScript();
      injectOpenVideoScript();

      expect(externalScripts()).toEqual([existing]);
      expect(window.openVideoPlayers).toBe(handler);
    } finally {
      delete window.openVideoPlayers;
    }
  });

  it('keeps distinct protocols, query strings and fragments as separate scripts', () => {
    const urls = [
      'https://publisher.example/analytics.js?site=1#first',
      'http://publisher.example/analytics.js?site=1#first',
      'https://publisher.example/analytics.js?site=2#first',
      'https://publisher.example/analytics.js?site=1#second',
    ];
    const existing = hostScript(urls[0]);

    for (const analyticsScriptUrl of urls) {
      injectEzoicScripts({ cmp: false, analyticsScriptUrl });
      injectEzoicScripts({ cmp: false, analyticsScriptUrl });
    }

    expect(
      externalScripts()
        .filter((script) => script.src !== STANDALONE_SCRIPT_URL)
        .map((script) => script.src),
    ).toEqual(urls);
    expect(externalScripts()[0]).toBe(existing);
  });

  it('matches URL text with quotes without building a selector', () => {
    const src = 'https://publisher.example/analytics.js?label="host"';
    const existing = hostScript(src);

    injectEzoicScripts({ cmp: false, analyticsScriptUrl: src });
    injectEzoicScripts({ cmp: false, analyticsScriptUrl: src });

    expect(
      externalScripts().filter((script) => script.src === existing.src),
    ).toEqual([existing]);
  });

  it('reuses host scripts and queues when script src writes are blocked', () => {
    const scripts = [CMP1, CMP2, STANDALONE_SCRIPT_URL].map((url) =>
      hostScript(url.replace('https:', '')),
    );
    const cmd = [vi.fn()];
    window.ezstandalone = { cmd };
    const setter = vi
      .spyOn(HTMLScriptElement.prototype, 'src', 'set')
      .mockImplementation(() => {
        throw new TypeError('TrustedScriptURL required');
      });

    try {
      expect(() => injectEzoicScripts()).not.toThrow();
      expect(externalScripts()).toEqual(scripts);
      expect(window.ezstandalone.cmd).toBe(cmd);
      expect(setter).not.toHaveBeenCalled();
    } finally {
      setter.mockRestore();
    }
  });
});

describe('ensureRewardedCmdQueue', () => {
  it('creates window.ezRewardedAds.cmd as an array', () => {
    ensureRewardedCmdQueue();
    expect(Array.isArray(window.ezRewardedAds?.cmd)).toBe(true);
  });

  it('preserves an existing host-provided queue', () => {
    const cmd: Array<() => void> = [];
    window.ezRewardedAds = { cmd };
    ensureRewardedCmdQueue();
    expect(window.ezRewardedAds.cmd).toBe(cmd);
  });
});

describe('injectRewardedLoader', () => {
  it('injects the rewarded stub before the async loader', () => {
    injectRewardedLoader(REWARDED_LOADER_URL);

    const order = [...document.head.querySelectorAll('script')].map(
      (el) => el.getAttribute('src') ?? '[rewarded-stub]',
    );
    expect(order).toEqual(['[rewarded-stub]', REWARDED_LOADER_URL]);

    const stub = document.querySelector(REWARDED_STUB_SELECTOR);
    expect(stub?.textContent).toBe(REWARDED_CMD_QUEUE_STUB);

    const loader = document.querySelector<HTMLScriptElement>(
      `script[src="${REWARDED_LOADER_URL}"]`,
    );
    expect(loader?.async).toBe(true);
    expect(Array.isArray(window.ezRewardedAds?.cmd)).toBe(true);
  });

  it('is idempotent: repeated calls add no duplicate loader or stub', () => {
    injectRewardedLoader(REWARDED_LOADER_URL);
    injectRewardedLoader(REWARDED_LOADER_URL);
    injectRewardedLoader(REWARDED_LOADER_URL);

    expect(
      document.querySelectorAll(`script[src="${REWARDED_LOADER_URL}"]`),
    ).toHaveLength(1);
    expect(document.querySelectorAll(REWARDED_STUB_SELECTOR)).toHaveLength(1);
  });

  it('tolerates a host-provided window.ezRewardedAds (no stub injected)', () => {
    window.ezRewardedAds = { cmd: [] };
    injectRewardedLoader(REWARDED_LOADER_URL);

    expect(document.querySelector(REWARDED_STUB_SELECTOR)).toBeNull();
    expect(
      document.querySelectorAll(`script[src="${REWARDED_LOADER_URL}"]`),
    ).toHaveLength(1);
  });

  it('ensures window.__ez exists after injection', () => {
    injectRewardedLoader(REWARDED_LOADER_URL);
    expect(window.__ez).toBeDefined();
    expect(typeof window.__ez).toBe('object');
  });

  it('preserves an existing host-provided window.__ez', () => {
    const ez = { adLoadRewarded: vi.fn() };
    window.__ez = ez;
    injectRewardedLoader(REWARDED_LOADER_URL);
    expect(window.__ez).toBe(ez);
  });
});

describe('ensureEzNamespace', () => {
  it('creates window.__ez as an object when missing', () => {
    ensureEzNamespace();
    expect(window.__ez).toBeDefined();
    expect(typeof window.__ez).toBe('object');
  });

  it('preserves an existing host-provided window.__ez', () => {
    const ez = { adLoadRewarded: vi.fn() };
    window.__ez = ez;
    ensureEzNamespace();
    expect(window.__ez).toBe(ez);
  });
});

describe('Open Video helpers', () => {
  const OPEN_VIDEO_SELECTOR = `script[src="${OPEN_VIDEO_SCRIPT_URL}"]`;
  const entry = (): OpenVideoPlayerEntry => ({
    target: document.createElement('div'),
    videoID: 'abc',
  });

  beforeEach(() => {
    document.head.innerHTML = '';
    delete window.openVideoPlayers;
  });

  afterEach(() => {
    // Unstub first: the no-window test stubs `window` to undefined, so touching
    // window before restoring it would throw.
    vi.unstubAllGlobals();
    document.head.innerHTML = '';
    delete window.openVideoPlayers;
  });

  describe('ensureOpenVideoQueue', () => {
    it('seeds window.openVideoPlayers as an array when missing', () => {
      ensureOpenVideoQueue();
      expect(Array.isArray(window.openVideoPlayers)).toBe(true);
    });

    it('does not overwrite a truthy handler object', () => {
      const handler = { push: vi.fn(), visited: true };
      window.openVideoPlayers = handler as unknown as OpenVideoPlayersQueue;
      ensureOpenVideoQueue();
      expect(window.openVideoPlayers).toBe(
        handler as unknown as OpenVideoPlayersQueue,
      );
      expect(handler.visited).toBe(true);
    });
  });

  describe('injectOpenVideoScript', () => {
    it('injects the script async and seeds the queue', () => {
      injectOpenVideoScript();
      const el = document.querySelector<HTMLScriptElement>(OPEN_VIDEO_SELECTOR);
      expect(el?.async).toBe(true);
      expect(Array.isArray(window.openVideoPlayers)).toBe(true);
    });

    it('is idempotent: repeated calls add no duplicate script', () => {
      injectOpenVideoScript();
      injectOpenVideoScript();
      injectOpenVideoScript();
      expect(document.querySelectorAll(OPEN_VIDEO_SELECTOR)).toHaveLength(1);
    });
  });

  describe('pushOpenVideoPlayer', () => {
    it('seeds the queue and pushes when a window is present', () => {
      const e = entry();
      expect(pushOpenVideoPlayer(e)).toBe(true);
      const q = window.openVideoPlayers as unknown as OpenVideoPlayerEntry[];
      expect(q).toHaveLength(1);
      expect(q[0]).toBe(e);
    });

    it('pushes to an existing handler without replacing it', () => {
      const push = vi.fn();
      const handler = { push, visited: true };
      window.openVideoPlayers = handler as unknown as OpenVideoPlayersQueue;
      const e = entry();

      expect(pushOpenVideoPlayer(e)).toBe(true);
      expect(window.openVideoPlayers).toBe(
        handler as unknown as OpenVideoPlayersQueue,
      );
      expect(push).toHaveBeenCalledTimes(1);
      expect(push).toHaveBeenCalledWith(e);
    });

    it('returns false when there is no window', () => {
      vi.stubGlobal('window', undefined);
      expect(pushOpenVideoPlayer(entry())).toBe(false);
    });
  });
});
