/**
 * DOM script injection for the Ezoic integration.
 *
 * Injects, in Ezoic's required order and idempotently: the two Gatekeeper CMP
 * consent scripts (each with `data-cfasync="false"` set before `src`), the
 * pre-load cmd-queue stub, then the async standalone ad bundle, then an optional
 * analytics loader. It also injects the optional, publisher-specific rewarded
 * loader (with its own pre-load stub) when a URL is supplied. Every function
 * here assumes a browser DOM — callers must guard against server-side rendering
 * before invoking them.
 *
 * @see https://docs.ezoic.com/docs/ezoicads/integration/
 */
import {
  CMP_SCRIPT_URLS,
  OPEN_VIDEO_SCRIPT_URL,
  STANDALONE_SCRIPT_URL,
} from './constants';
import type { EzoicCmdFn, OpenVideoPlayerEntry } from './global';

/** Attribute marking inline scripts this SDK injects, so re-installs dedup. */
const SDK_MARKER_ATTR = 'data-ezoic-vue-sdk';

/** Marker value identifying the injected cmd-queue stub script. */
const CMD_STUB_MARKER = 'cmd-stub';

/** Marker value identifying the injected rewarded cmd-queue stub script. */
const REWARDED_CMD_STUB_MARKER = 'rewarded-cmd-stub';

/**
 * The pre-load cmd-queue stub, matching Ezoic's published header snippet. It
 * runs before the standalone bundle so `ezstandalone.cmd.push(...)` is always
 * safe to call.
 */
export const CMD_QUEUE_STUB =
  'window.ezstandalone = window.ezstandalone || {}; window.ezstandalone.cmd = window.ezstandalone.cmd || [];';

/**
 * The pre-load rewarded cmd-queue stub. It runs before the rewarded loader so
 * `ezRewardedAds.cmd.push(...)` is always safe to call.
 */
export const REWARDED_CMD_QUEUE_STUB =
  'window.ezRewardedAds = window.ezRewardedAds || {}; window.ezRewardedAds.cmd = window.ezRewardedAds.cmd || [];';

function headElement(): HTMLHeadElement {
  const head = document.head ?? document.getElementsByTagName('head')[0];
  if (!head) {
    throw new Error(
      '[ezoic-vue-sdk] document has no <head> to inject Ezoic scripts into.',
    );
  }
  return head;
}

/**
 * Finds an existing `<script>` with the given `src`. Compares the `src`
 * attribute directly rather than building a selector, so arbitrary URLs cannot
 * break the query.
 */
function findExternalScript(url: string): HTMLScriptElement | null {
  const scripts = Array.from(
    document.querySelectorAll<HTMLScriptElement>('script[src]'),
  );
  return scripts.find((el) => el.getAttribute('src') === url) ?? null;
}

interface ExternalScriptOptions {
  /** Set `async` on the script tag. */
  async?: boolean;
  /** Set `data-cfasync="false"` (before `src`) to opt out of Rocket Loader. */
  cfasync?: boolean;
  /**
   * Insert before this element if it is still in `<head>`, otherwise append.
   * Used to keep CMP scripts ahead of a standalone bundle already in the HTML.
   */
  before?: Element | null;
}

/**
 * Injects an external `<script src>` unless a script with the same `src` is
 * already present (covers both prior SDK injections and scripts placed directly
 * in the host HTML).
 */
function injectExternalScript(
  url: string,
  {
    async: isAsync = false,
    cfasync = false,
    before,
  }: ExternalScriptOptions = {},
): void {
  if (findExternalScript(url)) return;
  const el = document.createElement('script');
  // data-cfasync must be set before src so Cloudflare Rocket Loader honors it.
  if (cfasync) el.setAttribute('data-cfasync', 'false');
  if (isAsync) el.async = true;
  el.src = url;
  const head = headElement();
  if (before && before.parentNode === head) {
    head.insertBefore(el, before);
  } else {
    head.appendChild(el);
  }
}

/**
 * Ensures `window.ezstandalone.cmd` exists so callbacks can be queued. Assumes
 * a browser environment; callers guard SSR.
 */
export function ensureCmdQueue(): void {
  if (!window.ezstandalone) window.ezstandalone = {};
  if (!window.ezstandalone.cmd) {
    const queue: EzoicCmdFn[] = [];
    window.ezstandalone.cmd = queue;
  }
}

/**
 * Injects the inline cmd-queue stub and ensures the queue exists.
 *
 * The stub script is injected (before the bundle) only when neither a prior SDK
 * injection nor a host-provided `window.ezstandalone` is present. The queue is
 * then guaranteed in JS so the composable works even if the injected inline
 * script has not executed yet (strict CSP, tests).
 *
 * @param before insert the stub ahead of this element (a standalone bundle
 *   already in the HTML) when present, so the stub keeps its pre-load position.
 */
function ensureCmdStub(before?: Element | null): void {
  const alreadyInjected =
    document.querySelector(
      `script[${SDK_MARKER_ATTR}="${CMD_STUB_MARKER}"]`,
    ) !== null;
  const hostProvidesQueue = typeof window.ezstandalone !== 'undefined';

  if (!alreadyInjected && !hostProvidesQueue) {
    const el = document.createElement('script');
    el.setAttribute(SDK_MARKER_ATTR, CMD_STUB_MARKER);
    el.textContent = CMD_QUEUE_STUB;
    const head = headElement();
    if (before && before.parentNode === head) {
      head.insertBefore(el, before);
    } else {
      head.appendChild(el);
    }
  }

  ensureCmdQueue();
}

/** Options controlling {@link injectEzoicScripts}. */
export interface InjectEzoicScriptsOptions {
  /** Inject the Gatekeeper CMP consent scripts first. Defaults to `true`. */
  cmp?: boolean;
  /** Optional analytics loader URL, injected after the standalone bundle. */
  analyticsScriptUrl?: string;
}

/**
 * Injects the full Ezoic script set into `<head>` in the required order:
 * CMP → CMP → cmd-queue stub → standalone bundle → optional analytics.
 *
 * Idempotent: safe to call repeatedly and tolerant of scripts already present
 * in the host HTML. Browser-only — callers must not invoke it during SSR.
 */
export function injectEzoicScripts(
  options: InjectEzoicScriptsOptions = {},
): void {
  const { cmp = true, analyticsScriptUrl } = options;

  // If the host HTML already placed the standalone bundle, anchor the CMP and
  // stub scripts before it so the consent-first ordering guarantee holds even
  // in a partial pre-existing-scripts setup.
  const existingStandalone = findExternalScript(STANDALONE_SCRIPT_URL);

  if (cmp) {
    for (const url of CMP_SCRIPT_URLS) {
      injectExternalScript(url, { cfasync: true, before: existingStandalone });
    }
  }

  ensureCmdStub(existingStandalone);

  injectExternalScript(STANDALONE_SCRIPT_URL, { async: true });

  if (analyticsScriptUrl) {
    injectExternalScript(analyticsScriptUrl, { async: true });
  }
}

/**
 * Ensures `window.ezRewardedAds.cmd` exists so rewarded callbacks can be
 * queued. Mirrors {@link ensureCmdQueue} for the rewarded global. Assumes a
 * browser environment; callers guard SSR.
 */
export function ensureRewardedCmdQueue(): void {
  if (!window.ezRewardedAds) window.ezRewardedAds = {};
  if (!window.ezRewardedAds.cmd) {
    const queue: EzoicCmdFn[] = [];
    window.ezRewardedAds.cmd = queue;
  }
}

/**
 * Injects the inline rewarded cmd-queue stub and ensures the queue exists.
 *
 * Mirrors {@link ensureCmdStub}: the stub script is injected (before the
 * loader) only when neither a prior SDK injection nor a host-provided
 * `window.ezRewardedAds` is present. The queue is then guaranteed in JS so the
 * composable works even if the injected inline script has not executed yet
 * (strict CSP, tests).
 */
function ensureRewardedCmdStub(): void {
  const alreadyInjected =
    document.querySelector(
      `script[${SDK_MARKER_ATTR}="${REWARDED_CMD_STUB_MARKER}"]`,
    ) !== null;
  const hostProvidesQueue = typeof window.ezRewardedAds !== 'undefined';

  if (!alreadyInjected && !hostProvidesQueue) {
    const el = document.createElement('script');
    el.setAttribute(SDK_MARKER_ATTR, REWARDED_CMD_STUB_MARKER);
    el.textContent = REWARDED_CMD_QUEUE_STUB;
    headElement().appendChild(el);
  }

  ensureRewardedCmdQueue();
}

/**
 * Injects the publisher-specific rewarded-ads loader
 * (`/porpoiseant/ezadloadrewarded.js`), preceded by the rewarded cmd-queue
 * stub so `ezRewardedAds.cmd.push(...)` is safe before it initializes.
 *
 * Idempotent: {@link findExternalScript} dedups the loader and the stub marker
 * dedups the inline stub, so repeated calls add nothing. Browser-only — callers
 * must not invoke it during SSR. The loader URL is publisher-specific, so it is
 * never hardcoded; it is injected only when a URL is supplied.
 *
 * @param loaderUrl the publisher's rewarded loader URL.
 */
export function injectRewardedLoader(loaderUrl: string): void {
  ensureRewardedCmdStub();
  injectExternalScript(loaderUrl, { async: true });
}

/**
 * Ensures `window.openVideoPlayers` exists as a plain array so embed entries can
 * be queued before the Open Video script loads. Mirrors {@link ensureCmdQueue}:
 * it only seeds when the value is falsy. It must never overwrite a truthy value
 * — once the embed script loads it replaces `openVideoPlayers` with a live
 * handler object, and clobbering that would silently drop every pushed entry.
 * Assumes a browser environment; callers guard SSR.
 */
export function ensureOpenVideoQueue(): void {
  if (!window.openVideoPlayers) {
    const queue: OpenVideoPlayerEntry[] = [];
    window.openVideoPlayers = queue;
  }
}

/**
 * Injects the Open Video embed script (async), after ensuring the
 * `openVideoPlayers` queue exists so entries pushed before it loads are honored.
 *
 * Idempotent: {@link findExternalScript} dedups the script, so repeated calls
 * add nothing. Browser-only — callers must not invoke it during SSR.
 */
export function injectOpenVideoScript(): void {
  ensureOpenVideoQueue();
  injectExternalScript(OPEN_VIDEO_SCRIPT_URL, { async: true });
}

/**
 * Pushes an embed entry onto `window.openVideoPlayers` so the Open Video script
 * mounts a player into the entry's `target`. Returns `false` (queuing nothing)
 * during SSR or when no queue is available, so callers can skip cleanly instead
 * of throwing. Mirrors the rewarded queue's `pushRewarded`.
 */
export function pushOpenVideoPlayer(entry: OpenVideoPlayerEntry): boolean {
  if (typeof window === 'undefined') return false;
  ensureOpenVideoQueue();
  const q = window.openVideoPlayers;
  if (!q) return false;
  q.push(entry);
  return true;
}
