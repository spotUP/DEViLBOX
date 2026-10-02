/**
 * DJ Kill All used to destroy the user's dub levels permanently.
 *
 * `djKillAll` is a panic: it force-writes `echoWet/springWet/echoIntensity/
 * returnGain = 0` into the drum-pad store so the settings mirror cannot revive
 * the echo during the 2 s drain. Those zeros were never undone. Because the
 * store persists to localStorage, one accidental hit flattened the dub bus for
 * good — and `djKillAll` is `dj.killAll` on Pad 5 and several grid buttons
 * across the controller profiles, as well as `window.__djKillAll()`.
 *
 * Found 2026-10-02 while auditing dead knobs: the user reported Echo wet and
 * Spring wet as inoperable. The store held `echoIntensity: 0` against a default
 * of 0.62. Echo wet was fine; nothing was being fed INTO the echo. Turning the
 * knob moved nothing because its input was zero, which is why it read as a dead
 * knob rather than a panic that had eaten the settings.
 *
 * The fix snapshots the four levels and restores them after the drain window,
 * skipping the restore if the user moved one of them in the meantime.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

const setDubBus = vi.fn();
const getDubBus = vi.fn();

/**
 * A store whose every method is a spy. `djPanic` reaches across six stores and
 * a different one breaks on each run, so the methods are resolved lazily rather
 * than enumerated.
 */
const stubStore = (overrides: Record<string, unknown> = {}) => ({
  getState: () => new Proxy(overrides, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      return vi.fn();
    },
  }),
  setState: vi.fn(),
  getInitialState: () => overrides,
  subscribe: () => () => {},
});

vi.mock('@/stores/useDrumPadStore', () => ({
  useDrumPadStore: {
    getState: () => ({ dubBus: getDubBus(), setDubBus }),
  },
}));

vi.mock('@/stores/useDJStore', () => ({
  useDJStore: stubStore({ masterVolume: 0.8, crossfaderCurve: 'linear' }),
}));
vi.mock('@/stores/useDJSetStore', () => ({ useDJSetStore: stubStore({}) }));
vi.mock('@/stores/useAudioStore', () => ({ useAudioStore: stubStore({ masterEffects: [], masterVolume: 0.8 }) }));
vi.mock('@/stores/useVocoderStore', () => ({
  VOCODER_PRESETS: {},
  useVocoderStore: stubStore({}),
}));
vi.mock('@/hooks/drumpad/useMIDIPadRouting', () => ({
  getDrumPadEngine: () => null,
  getNoteRepeatEngine: () => null,
}));
vi.mock('../DJEngine', () => ({
  getDJEngine: () => null,
  getDJEngineIfActive: () => null,
}));
vi.mock('../DJQuantizedFX', () => ({
  quantizedEQKill: vi.fn(), getQuantizeMode: vi.fn(), quantizeAction: vi.fn(), cancelAllAutomation: vi.fn(),
}));
vi.mock('../DJAutoSync', () => ({ syncBPMToOther: vi.fn(), phaseAlign: vi.fn(), snapPositionToBeat: vi.fn() }));
vi.mock('../DJBeatSync', () => ({ DJBeatSync: class { constructor() { /* no transport */ } } }));
vi.mock('../DJAutoDJ', () => ({ getAutoDJ: () => null }));

const { djKillAll } = await import('../DJActions');
const { DubBus } = await import('../../dub/DubBus');

/** A realistic pre-panic mix, so a restore is distinguishable from a flush. */
const PRE_PANIC = {
  echoWet: 0.88,
  springWet: 0.4,
  echoIntensity: 0.62,
  returnGain: 3.0,
};

describe('DJ Kill All leaves the dub levels recoverable', () => {
  let store: Record<string, unknown>;

  beforeEach(() => {
    vi.useFakeTimers();
    setDubBus.mockReset();
    getDubBus.mockReset();
    store = { ...PRE_PANIC, enabled: true };
    // The store is the source of truth for the reads inside djKillAll, so make
    // every getState() reflect whatever was last written.
    getDubBus.mockImplementation(() => store);
    setDubBus.mockImplementation((patch: Record<string, unknown>) => { store = { ...store, ...patch }; });
  });

  afterEach(() => { vi.useRealTimers(); });

  it('restores the dub levels after the drain window', () => {
    djKillAll();

    // During the drain the levels are zero — that is the whole point of the
    // flush, so the mirror cannot revive the echo while the bus tears down.
    expect(store.echoIntensity).toBe(0);
    expect(store.echoWet).toBe(0);
    expect(store.springWet).toBe(0);
    expect(store.returnGain).toBe(0);
    expect(store.enabled).toBe(false);

    vi.advanceTimersByTime(DubBus.DRAIN_MS + 200);

    expect(store.echoIntensity, 'echo intensity was destroyed by a panic').toBe(PRE_PANIC.echoIntensity);
    expect(store.echoWet).toBe(PRE_PANIC.echoWet);
    expect(store.springWet).toBe(PRE_PANIC.springWet);
    expect(store.returnGain).toBe(PRE_PANIC.returnGain);
  });

  it('leaves the bus disabled, because that is what a panic means', () => {
    djKillAll();
    vi.advanceTimersByTime(DubBus.DRAIN_MS + 200);
    expect(store.enabled).toBe(false);
  });

  it('does not clobber a level the user moved during the drain', () => {
    djKillAll();
    // The user grabs Echo intensity while the drain is still running.
    setDubBus({ echoIntensity: 0.3 });
    vi.advanceTimersByTime(DubBus.DRAIN_MS + 200);
    expect(store.echoIntensity, 'a deliberate tweak was overwritten by the restore').toBe(0.3);
  });

  it('snapshots the pre-panic values, not the zeros from a previous panic', () => {
    djKillAll();
    vi.advanceTimersByTime(DubBus.DRAIN_MS + 200);
    // Second panic must restore the same real values, not zero.
    djKillAll();
    expect(store.echoIntensity).toBe(0);
    vi.advanceTimersByTime(DubBus.DRAIN_MS + 200);
    expect(store.echoIntensity).toBe(PRE_PANIC.echoIntensity);
  });
});