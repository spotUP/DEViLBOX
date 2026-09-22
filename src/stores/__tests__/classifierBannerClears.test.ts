import { describe, it, expect, beforeEach } from 'vitest';
import { useInstrumentTypeStore } from '../useInstrumentTypeStore';
import { useUIStore } from '../useUIStore';

/**
 * "the 'loading instrument classifier' is stuck in the main window"
 * (2026-09-22).
 *
 * The loading banner is posted with timeout 0 — never auto-revert — and the
 * 'ready' branch left it up, on the assumption that a classification RESULT
 * would replace it. Nothing guarantees one arrives: with nothing queued to
 * classify, or with every result erroring, the banner stayed for the whole
 * session. The worker's own log reached `[CED worker] model ready` after
 * fetching 86,870,208 bytes, so the model had loaded fine — the banner simply
 * had no one to clear it.
 */
const LOADING = 'Loading instrument classifier…';

/** Drive the worker message handler the way the worker would. */
const workerSays = (data: Record<string, unknown>) =>
  (useInstrumentTypeStore.getState() as unknown as {
    _onWorkerMessage: (d: unknown) => void;
  })._onWorkerMessage(data);

beforeEach(() => {
  useUIStore.getState().setStatusMessage('All Right', false, 0);
});

describe('the instrument classifier banner clears itself', () => {
  it('goes up while the model loads', () => {
    workerSays({ type: 'loading' });
    expect(useUIStore.getState().statusMessage).toBe(LOADING);
    expect(useInstrumentTypeStore.getState().status).toBe('loading');
  });

  it('comes down when the model is ready, without waiting for a result', () => {
    workerSays({ type: 'loading' });
    workerSays({ type: 'ready' });

    expect(useInstrumentTypeStore.getState().status).toBe('ready');
    expect(
      useUIStore.getState().statusMessage,
      'the banner outlived the load — this is the stuck-banner report'
    ).not.toBe(LOADING);
  });

  it('does not trample a message someone else put up in the meantime', () => {
    workerSays({ type: 'loading' });
    useUIStore.getState().setStatusMessage('Rendering stems', false, 0);
    workerSays({ type: 'ready' });

    expect(useUIStore.getState().statusMessage).toBe('Rendering stems');
  });
});
