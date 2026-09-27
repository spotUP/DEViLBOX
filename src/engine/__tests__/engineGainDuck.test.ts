/**
 * "only the first defle song plays, the second one i load is silent"
 * (2026-09-25).
 *
 * Loading a song stops playback first; stop ducks the Furnace engines' shared
 * output gain to 0 and restores it 100 ms later. The load then disposes the old
 * song's instruments within those 100 ms, and disposeAllInstruments() cleared
 * every pending restore — the engine gain's too. It stayed at 0, and every
 * Furnace or DefleMask song after the first played into silence.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { EngineGainDuck } from '../engineGainDuck';

function fakeGain() {
  const param = {
    value: 1,
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn((v: number) => { param.value = v; }),
  };
  return { gain: param } as unknown as GainNode & { gain: typeof param };
}

afterEach(() => { vi.useRealTimers(); });

describe('ducking a chip engine on stop', () => {
  it('ramps the shared gain to 0 and restores it', () => {
    vi.useFakeTimers();
    const duck = new EngineGainDuck();
    const g = fakeGain();
    duck.duck('FurnaceDispatchEngine', g, 0);
    expect(g.gain.value).toBe(0);
    vi.advanceTimersByTime(100);
    expect(g.gain.value).toBe(1);
  });

  it('is restored even when the instruments are disposed right after the stop', { timeout: 60000 }, async () => {
    const { ToneEngine } = await import('../ToneEngine');
    const { FurnaceDispatchEngine } = await import('../furnace-dispatch/FurnaceDispatchEngine');
    const g = fakeGain();
    vi.spyOn(FurnaceDispatchEngine, 'getInstance').mockReturnValue({ getOrCreateSharedGain: () => g } as never);
    vi.useFakeTimers();

    // The real stop-path duck and the real disposeAllInstruments, on one engine
    // whose only state is that the dispatch engine's output is routed.
    const engine = new Proxy({
      chipEngineDuck: new EngineGainDuck(),
      nativeEngineRouting: new Map([['FurnaceDispatchEngine', {}]]),
    } as Record<string | symbol, unknown>, {
      get: (t, k) => (k in t ? t[k] : (t[k] = new Map())),
    });
    const proto = ToneEngine.prototype as unknown as Record<string, (...a: unknown[]) => void>;
    proto.muteChipEngineOutputs.call(engine, 0);      // stop
    expect(g.gain.value).toBe(0);
    proto.disposeAllInstruments.call(engine);          // the next song's load

    vi.advanceTimersByTime(100);
    expect(g.gain.value).toBe(1);
  });
});
