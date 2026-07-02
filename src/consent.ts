/**
 * `useEzoicConsent()` — a reactive view of the IAB TCF v2.2 consent state
 * published by the active CMP (the Ezoic Gatekeeper CMP, or any TCF CMP present
 * on the page) through `window.__tcfapi`.
 *
 * The composable is decoupled from {@link EzoicPlugin}: it reads the standard
 * TCF surface directly, so it reflects whichever TCF CMP is running regardless
 * of how consent was set up. It is SSR-safe — no browser global is touched
 * during setup; the listener attaches in `onMounted` (client only) and detaches
 * in `onUnmounted`.
 */
import { onMounted, onUnmounted, readonly, ref } from 'vue';
import type { Ref } from 'vue';
import type { TcfData } from './global';

/** How often to re-check for `window.__tcfapi` before it appears (ms). */
const TCFAPI_POLL_INTERVAL_MS = 250;
/**
 * Maximum time to wait for a CMP to publish `window.__tcfapi` before giving up
 * (ms). A page with no TCF CMP simply never resolves; the bounded poll stops
 * the interval from running for the lifetime of a long-lived component.
 */
const TCFAPI_MAX_WAIT_MS = 10_000;

/** The reactive TCF consent state returned by {@link useEzoicConsent}. */
export interface EzoicConsentState {
  /**
   * `true` once the CMP has delivered a TC data payload whose `eventStatus` is
   * `tcloaded` or `useractioncomplete` (i.e. a final consent string is ready).
   * Stays `false` during SSR and until the CMP loads.
   */
  tcfLoaded: Readonly<Ref<boolean>>;
  /**
   * The latest IAB TC consent string, or `null` until the CMP provides one.
   */
  consentString: Readonly<Ref<string | null>>;
  /**
   * Whether GDPR applies to this visitor, or `undefined` until the CMP reports
   * it (per the TCF spec, `gdprApplies` may legitimately be `undefined`).
   */
  gdprApplies: Readonly<Ref<boolean | undefined>>;
  /**
   * The latest TCF `eventStatus` (`tcloaded` | `cmpuishown` |
   * `useractioncomplete`), or `null` before the first event.
   */
  eventStatus: Readonly<Ref<string | null>>;
}

/**
 * Subscribe to the active TCF CMP and expose its consent state as reactive
 * refs. Call from a component `setup()`.
 *
 * Because CMP scripts load asynchronously, `window.__tcfapi` may not exist when
 * the component mounts; the composable polls for it (bounded to
 * {@link TCFAPI_MAX_WAIT_MS}) and attaches a TCF `addEventListener` as soon as
 * it appears. The listener is removed on unmount, and a poll that resolves
 * after unmount is discarded, so no work leaks past the component's lifetime.
 */
export function useEzoicConsent(): EzoicConsentState {
  const tcfLoaded = ref(false);
  const consentString = ref<string | null>(null);
  const gdprApplies = ref<boolean | undefined>(undefined);
  const eventStatus = ref<string | null>(null);

  let disposed = false;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let listenerId: number | undefined;

  const handleTcData = (data: TcfData, success: boolean): void => {
    if (disposed || !success || !data) return;
    if (typeof data.listenerId === 'number') listenerId = data.listenerId;
    if (typeof data.eventStatus === 'string')
      eventStatus.value = data.eventStatus;
    gdprApplies.value = data.gdprApplies;
    if (typeof data.tcString === 'string') consentString.value = data.tcString;
    if (
      data.eventStatus === 'tcloaded' ||
      data.eventStatus === 'useractioncomplete'
    ) {
      tcfLoaded.value = true;
    }
  };

  const stopPolling = (): void => {
    if (pollTimer !== undefined) {
      clearInterval(pollTimer);
      pollTimer = undefined;
    }
  };

  const attach = (): boolean => {
    const tcfapi = window.__tcfapi;
    if (typeof tcfapi !== 'function') return false;
    tcfapi('addEventListener', 2, handleTcData);
    return true;
  };

  onMounted(() => {
    if (typeof window === 'undefined') return;
    if (attach()) return;
    // CMP not present yet — poll until it publishes __tcfapi or we time out.
    let waited = 0;
    pollTimer = setInterval(() => {
      waited += TCFAPI_POLL_INTERVAL_MS;
      if (disposed || attach() || waited >= TCFAPI_MAX_WAIT_MS) {
        stopPolling();
      }
    }, TCFAPI_POLL_INTERVAL_MS);
  });

  onUnmounted(() => {
    disposed = true;
    stopPolling();
    if (
      typeof window !== 'undefined' &&
      typeof window.__tcfapi === 'function' &&
      typeof listenerId === 'number'
    ) {
      window.__tcfapi('removeEventListener', 2, () => {}, listenerId);
    }
  });

  return {
    tcfLoaded: readonly(tcfLoaded) as Readonly<Ref<boolean>>,
    consentString: readonly(consentString) as Readonly<Ref<string | null>>,
    gdprApplies: readonly(gdprApplies) as Readonly<Ref<boolean | undefined>>,
    eventStatus: readonly(eventStatus) as Readonly<Ref<string | null>>,
  };
}
