/**
 * Play / Play Pattern on a Cinter4 song starts at the grid position, not at tick 0.
 *
 * Wired: the transport start (startNativeEngines) asks the Cinter4 descriptor for the tick of the grid row
 * (startTargetOf: folded pattern rows * initialSpeed) and hands it to startAt, which posts the worklet 'seek' message.
 * Sentinel = the seek message the engine posts. The worklet's seek -> _player_seek is the existing native path.
 */
import { describe, it, expect, vi } from 'vitest';
import { CINTER4_ROWS_PER_PATTERN } from '@/lib/import/formats/cinter4Music';

vi.mock('@/engine/ToneEngine', () => ({ getToneEngine: () => ({ releaseAll: vi.fn(), getInstrument: vi.fn(), setBPM: vi.fn() }) }));

describe('Cinter4 transport start', () => {
  it('the registry seam seeks the engine to the tick of the grid row', async () => {
    const { WASM_ENGINES } = await import('@/engine/replayer/wasmEngineRegistry');
    const { Cinter4Engine } = await import('@/engine/cinter4/Cinter4Engine');
    const desc = WASM_ENGINES.find((d) => d.key === 'Cinter4')!;
    expect(desc.startAt).toBeTypeOf('function');
    expect(desc.startTargetOf).toBeTypeOf('function');

    const song = { initialSpeed: 5, songPositions: [0, 1, 2, 3] };
    const tick = desc.startTargetOf!(song as never, 2, 7, 48000);
    expect(tick).toBe((2 * CINTER4_ROWS_PER_PATTERN + 7) * 5);

    const posts: Array<Record<string, unknown>> = [];
    const engine = Object.create(Cinter4Engine.prototype) as Record<string, unknown>;
    Object.assign(engine, { workletNode: { port: { postMessage: (m: Record<string, unknown>) => { posts.push(m); } } } });
    desc.startAt!(engine as never, tick!);
    expect(posts).toEqual([{ type: 'seek', tick }]);
  });
});
