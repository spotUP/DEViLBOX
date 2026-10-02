/**
 * DJ Kill All must not touch the performer's dub levels.
 *
 * It used to force-write `echoWet/springWet/echoIntensity/returnGain = 0` into
 * the drum-pad store, which persists to localStorage, so one accidental hit
 * (`dj.killAll` on Pad 5, several grid buttons, `window.__djKillAll()`)
 * flattened the dub bus for good: the store held `echoIntensity: 0` against a
 * default of 0.62 and Echo wet read as a dead knob (2026-10-02). A later
 * snapshot-and-restore timer still lost the levels to any reload inside the
 * window. The engine's own drain already ignores echo and spring writes, so
 * the flush was never needed: KILL writes `enabled: false` and nothing else.
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

/** A realistic pre-panic mix, so a restore is distinguishable from a flush. */
const PRE_PANIC = {
  echoWet: 0.88,
  springWet: 0.4,
  echoIntensity: 0.62,
  returnGain: 0.85,
};

describe('DJ Kill All leaves the dub levels alone', () => {
  let store: Record<string, unknown>;

  beforeEach(() => {
    vi.useFakeTimers();
    setDubBus.mockReset();
    getDubBus.mockReset();
    store = { ...PRE_PANIC, enabled: true };
    getDubBus.mockImplementation(() => store);
    setDubBus.mockImplementation((patch: Record<string, unknown>) => { store = { ...store, ...patch }; });
  });

  afterEach(() => { vi.useRealTimers(); });

  it('never writes a level, so a reload at any moment keeps the voicing', () => {
    djKillAll();
    // Checked before any timer runs: this is what localStorage holds if the
    // page reloads straight after the hit.
    expect(store.echoIntensity, 'echo intensity was destroyed by a panic').toBe(PRE_PANIC.echoIntensity);
    expect(store.echoWet).toBe(PRE_PANIC.echoWet);
    expect(store.springWet).toBe(PRE_PANIC.springWet);
    expect(store.returnGain).toBe(PRE_PANIC.returnGain);
    for (const [patch] of setDubBus.mock.calls) {
      expect(Object.keys(patch as object)).toEqual(['enabled']);
    }
  });

  it('switches the bus off, because that is what a panic means', () => {
    djKillAll();
    expect(store.enabled).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(store.enabled).toBe(false);
  });
});
