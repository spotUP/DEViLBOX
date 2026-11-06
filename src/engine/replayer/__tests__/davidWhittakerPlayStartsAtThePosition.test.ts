/**
 * Play / Play Pattern on a David Whittaker song starts at the grid position, not at pattern 0 (apb.dw, 2026-11-06).
 *
 * Wired: the transport start (startNativeEngines) asks the DavidWhittakerReplayer descriptor for the target tick of the grid
 * row (startTargetOf, on the song's row clock) and hands it to startAt, which posts seekTicks to the worklet before play().
 * Sentinel = the seekTicks / play messages the engine posts. The worklet's seekTicks-then-play behaviour is held in
 * engine/__tests__/davidWhittakerLatencyAndSeek.test.ts.
 */
import { describe, it, expect, vi } from 'vitest';
import { PositionCallbacks } from '@engine/wasm/PositionCallbacks';
import { makeRowClock } from '@/lib/import/formats/stepRowClock';

vi.mock('@/engine/ToneEngine', () => ({ getToneEngine: () => ({ releaseAll: vi.fn(), getInstrument: vi.fn(), setBPM: vi.fn() }) }));

describe('David Whittaker transport start', () => {
  it('the registry seam seeks the engine to the tick of the grid row before play', async () => {
    const { WASM_ENGINES } = await import('@/engine/replayer/wasmEngineRegistry');
    const { DavidWhittakerEngine } = await import('@/engine/davidwhittaker/DavidWhittakerEngine');
    const desc = WASM_ENGINES.find((d) => d.key === 'DavidWhittakerReplayer')!;
    expect(desc.startAt).toBeTypeOf('function');
    expect(desc.startTargetOf).toBeTypeOf('function');

    // Speed 6 for the first 2 patterns (128 rows), then speed 3.
    const speedChanges = [{ tick: 0, speed: 6 }, { tick: 768, speed: 3 }];
    const song = { davidWhittakerClock: { speedChanges, passTicks: 100000 } };
    const tick = desc.startTargetOf!(song as never, 3, 5, 48000);
    expect(tick).toBe(makeRowClock(speedChanges).rowToTick(3 * 64 + 5));
    expect(tick).toBe(768 + (64 + 5) * 3);

    const posts: Array<Record<string, unknown>> = [];
    const engine = Object.create(DavidWhittakerEngine.prototype) as Record<string, unknown>;
    Object.assign(engine, {
      audioContext: { sampleRate: 48000 }, _positions: new PositionCallbacks(), _tickLog: [], _seekGen: 0,
      workletNode: { port: { postMessage: (m: Record<string, unknown>) => { posts.push(m); } } },
      afterPlay: () => {},
    });
    desc.startAt!(engine as never, tick!);
    (engine as unknown as { play(): void }).play();
    expect(posts.map((m) => m.type)).toEqual(['seekTicks', 'play']);
    expect(posts[0]).toEqual({ type: 'seekTicks', ticks: tick, gen: 1 });

    expect(desc.startTargetOf!({ davidWhittakerClock: undefined } as never, 3, 5, 48000)).toBeNull();
  });
});
