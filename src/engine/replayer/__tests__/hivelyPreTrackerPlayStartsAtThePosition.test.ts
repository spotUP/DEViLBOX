/**
 * Play / Play Pattern on a Hively or PreTracker song starts at the grid position, not at song position 0 row 0.
 *
 * Wired: the transport start (startNativeEngines) asks the descriptor for the target of the grid row (startTargetOf) and
 * hands it to startAt, which posts the worklet 'seekTo' message (the worklet then discards audio until the replayer's own
 * position/row match). Sentinel = the seekTo message the engine posts before play.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/engine/ToneEngine', () => ({ getToneEngine: () => ({ releaseAll: vi.fn(), getInstrument: vi.fn(), setBPM: vi.fn() }) }));

async function seekPosts(key: 'Hively' | 'PreTracker') {
  const { WASM_ENGINES } = await import('@/engine/replayer/wasmEngineRegistry');
  const mod = key === 'Hively'
    ? (await import('@/engine/hively/HivelyEngine')).HivelyEngine
    : (await import('@/engine/pretracker/PreTrackerEngine')).PreTrackerEngine;
  const desc = WASM_ENGINES.find((d) => d.key === key)!;
  expect(desc.startAt).toBeTypeOf('function');
  expect(desc.startTargetOf).toBeTypeOf('function');
  const target = desc.startTargetOf!({} as never, 3, 17, 48000);
  const posts: Array<Record<string, unknown>> = [];
  const engine = Object.create(mod.prototype) as Record<string, unknown>;
  Object.assign(engine, { workletNode: { port: { postMessage: (m: Record<string, unknown>) => { posts.push(m); } } } });
  desc.startAt!(engine as never, target!);
  return posts;
}

describe('Hively / PreTracker transport start', () => {
  it('Hively seeks the replayer to the grid position and row', async () => {
    expect(await seekPosts('Hively')).toEqual([{ type: 'seekTo', position: 3, row: 17 }]);
  });
  it('PreTracker seeks the replayer to the grid position and row', async () => {
    expect(await seekPosts('PreTracker')).toEqual([{ type: 'seekTo', songPos: 3, row: 17 }]);
  });
});
