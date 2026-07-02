import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { useEzoicConsent, type EzoicConsentState } from './consent';
import type { TcfData } from './global';

/** Listener captured by the fake `__tcfapi`, so tests can drive TC data in. */
type TcfListener = (data: TcfData, success: boolean) => void;

let listener: TcfListener | undefined;
let removeListenerId: number | undefined;

/** Install a fake TCF `__tcfapi` that records the add/remove calls. */
function installTcfApi(): void {
  window.__tcfapi = ((
    command: string,
    _version: number,
    cb: TcfListener | ((success: boolean) => void),
    listenerId?: number,
  ): void => {
    if (command === 'addEventListener') {
      listener = cb as TcfListener;
    } else if (command === 'removeEventListener') {
      removeListenerId = listenerId;
    }
  }) as unknown as Window['__tcfapi'];
}

beforeEach(() => {
  listener = undefined;
  removeListenerId = undefined;
  delete window.__tcfapi;
});

afterEach(() => {
  delete window.__tcfapi;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** Mount a component that exposes the consent state for assertions. */
function mountConsent(): {
  wrapper: ReturnType<typeof mount>;
  state: EzoicConsentState;
} {
  let state!: EzoicConsentState;
  const Comp = defineComponent({
    setup() {
      state = useEzoicConsent();
      return () => h('div');
    },
  });
  const wrapper = mount(Comp);
  return { wrapper, state };
}

describe('useEzoicConsent', () => {
  it('starts with unloaded defaults', () => {
    const { state } = mountConsent();
    expect(state.tcfLoaded.value).toBe(false);
    expect(state.consentString.value).toBeNull();
    expect(state.gdprApplies.value).toBeUndefined();
    expect(state.eventStatus.value).toBeNull();
  });

  it('subscribes to __tcfapi present at mount and reflects a tcloaded event', () => {
    installTcfApi();
    const { state } = mountConsent();
    expect(typeof listener).toBe('function');

    listener!(
      {
        tcString: 'CONSENT123',
        gdprApplies: true,
        eventStatus: 'tcloaded',
        listenerId: 7,
      },
      true,
    );

    expect(state.tcfLoaded.value).toBe(true);
    expect(state.consentString.value).toBe('CONSENT123');
    expect(state.gdprApplies.value).toBe(true);
    expect(state.eventStatus.value).toBe('tcloaded');
  });

  it('reflects eventStatus without marking loaded for cmpuishown', () => {
    installTcfApi();
    const { state } = mountConsent();

    listener!({ eventStatus: 'cmpuishown', gdprApplies: true }, true);

    expect(state.eventStatus.value).toBe('cmpuishown');
    expect(state.tcfLoaded.value).toBe(false);
    expect(state.gdprApplies.value).toBe(true);
    expect(state.consentString.value).toBeNull();
  });

  it('marks loaded on useractioncomplete', () => {
    installTcfApi();
    const { state } = mountConsent();

    listener!(
      { eventStatus: 'useractioncomplete', tcString: 'ABC', listenerId: 3 },
      true,
    );

    expect(state.tcfLoaded.value).toBe(true);
    expect(state.consentString.value).toBe('ABC');
  });

  it('ignores unsuccessful callbacks', () => {
    installTcfApi();
    const { state } = mountConsent();

    listener!({ eventStatus: 'tcloaded', tcString: 'X' }, false);

    expect(state.tcfLoaded.value).toBe(false);
    expect(state.consentString.value).toBeNull();
  });

  it('removes the TCF listener on unmount using the captured listenerId', () => {
    installTcfApi();
    const { wrapper } = mountConsent();
    listener!({ eventStatus: 'tcloaded', listenerId: 42 }, true);

    wrapper.unmount();

    expect(removeListenerId).toBe(42);
  });

  it('polls for __tcfapi and attaches once the CMP loads', async () => {
    vi.useFakeTimers();
    const { state } = mountConsent();
    // Not present at mount: no listener yet.
    expect(listener).toBeUndefined();

    installTcfApi();
    await vi.advanceTimersByTimeAsync(250);
    expect(typeof listener).toBe('function');

    listener!({ eventStatus: 'tcloaded', tcString: 'LATE' }, true);
    expect(state.consentString.value).toBe('LATE');
  });

  it('does not attach when the component unmounts before the CMP loads', async () => {
    vi.useFakeTimers();
    const { wrapper } = mountConsent();
    expect(listener).toBeUndefined();

    wrapper.unmount();
    installTcfApi();
    await vi.advanceTimersByTimeAsync(1000);

    expect(listener).toBeUndefined();
  });

  it('stops polling after the max wait when no CMP appears', async () => {
    vi.useFakeTimers();
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    mountConsent();
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10_000);

    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
    expect(listener).toBeUndefined();
  });
});
