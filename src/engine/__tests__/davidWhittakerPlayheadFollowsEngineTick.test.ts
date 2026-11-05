/**
 * apb.dw: the grid playhead lagged the audio because the David Whittaker engine reported no play position, so the
 * replayer fell back to the free-running TS scheduler. The worklet now posts the player's processed-tick count
 * ('playTick', dw_played_ticks), DavidWhittakerEngine maps it onto the grid rows (the song's row clock) and reports it
 * through onPositionUpdate, which NativeEngineRouting turns into reportEnginePosition.
 *
 *   - real worklet and WASM: playTick messages are posted, increase while playing, and keep going after a swapModule;
 *   - the engine turns a playTick into the grid {songPos,row} of the song's row clock, speed changes and pass wrap included;
 *   - the registry hands the song's clock to loadTune / swapModule.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { installDwNodeFetch } from '@/lib/import/__tests__/helpers/dwNodeFetch';
import { openWorklet } from './helpers/workletHarness';
import { DavidWhittakerEngine, dwGridPosition } from '../davidwhittaker/DavidWhittakerEngine';
import { makeRowClock } from '@/lib/import/formats/stepRowClock';
import { PositionCallbacks } from '@engine/wasm/PositionCallbacks';
import { WASM_ENGINES } from '../replayer/wasmEngineRegistry';

const worklet = { dir: 'davidwhittaker', name: 'DavidWhittaker', factory: 'createDavidWhittaker' };
let restoreFetch = () => {};
beforeAll(() => { restoreFetch = installDwNodeFetch(); });
afterAll(() => restoreFetch());

const ticksOf = (posted: Array<Record<string, unknown>>) => posted.filter((m) => m.type === 'playTick').map((m) => m.ticks as number);

describe('David Whittaker reports its play position', { timeout: 60_000 }, () => {
  it('the worklet posts a rising processed-tick count, also after a swapModule', async () => {
    const f = readFileSync(resolve(process.cwd(), 'public/data/songs/formats/apb.dw'));
    const bytes = f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer;
    const h = await openWorklet(worklet);
    await h.send({ type: 'loadModule', moduleData: bytes.slice(0), subsong: 0 });
    await h.send({ type: 'play' });
    h.render(400);
    const first = ticksOf(h.posted);
    expect(first.length, 'tick reports').toBeGreaterThan(10);
    expect(first.every((t, i) => i === 0 || t > first[i - 1]), 'strictly rising').toBe(true);
    h.posted.length = 0;
    await h.send({ type: 'swapModule', moduleData: bytes.slice(0), subsong: 0 });
    h.render(400);
    const after = ticksOf(h.posted);
    expect(after.length, 'tick reports after the swap').toBeGreaterThan(10);
    expect(after[0], 'the count carries on through the swap').toBeGreaterThanOrEqual(first[first.length - 1]);
  });

  it('DavidWhittakerEngine maps a playTick onto the grid row of the song clock', () => {
    class FakeNode { port = { postMessage() {}, onmessage: null as null | ((e: { data: unknown }) => void) }; connect() {} disconnect() {} }
    (globalThis as { AudioWorkletNode?: unknown }).AudioWorkletNode = FakeNode;
    const engine = Object.create(DavidWhittakerEngine.prototype) as Record<string, unknown>;
    const speedChanges = [{ tick: 0, speed: 6 }, { tick: 600, speed: 3 }];
    Object.assign(engine, { audioContext: { sampleRate: 48000 }, output: {}, _positions: undefined, _seekGen: 0, _tickLog: [] });
    // the engine's own field initialisers did not run on Object.create: set what the handler reads
    engine._positions = new PositionCallbacks();
    (engine as unknown as { createNode(): void }).createNode();
    (engine as unknown as { setGridClock(c: unknown): void }).setGridClock({ speedChanges, passTicks: 1200 });
    const seen: unknown[] = [];
    (engine as unknown as DavidWhittakerEngine).onPositionUpdate((u) => seen.push(u));
    const node = (engine as unknown as { workletNode: FakeNode }).workletNode;
    const clock = makeRowClock(speedChanges);
    for (const ticks of [1, 61, 601, 900, 1201]) node.port.onmessage!({ data: { type: 'playTick', ticks } });
    expect(seen).toEqual([1, 61, 601, 900, 1201].map((t) => dwGridPosition(clock, 1200, t)));
    // speed 6 then 3: tick 599 is row 99, tick 600 + 3k is row 100 + k; the pass wraps at 1200
    expect(seen[0]).toEqual({ songPos: 0, row: 0 });
    expect(seen[1]).toEqual({ songPos: 0, row: 10 });
    expect((seen[2] as { row: number }).row + 64 * (seen[2] as { songPos: number }).songPos, 'after the speed change').toBe(100);
    expect(seen[4], 'one pass later the grid is back at the start').toEqual(seen[0]);
    // no clock (a song without a grid): no report
    (engine as unknown as { setGridClock(c: unknown): void }).setGridClock(undefined);
    node.port.onmessage!({ data: { type: 'playTick', ticks: 50 } });
    expect(seen).toHaveLength(5);
  });

  it('the registry gives loadTune and swapModule the song clock', () => {
    const desc = WASM_ENGINES.find((d) => d.key === 'DavidWhittakerReplayer')!;
    const clock = { speedChanges: [{ tick: 0, speed: 6 }], passTicks: 100 };
    expect(desc.getLoadArgs!({ fileSubsongs: { current: 2 }, davidWhittakerClock: clock } as never)).toEqual([2, clock]);
  });
});
