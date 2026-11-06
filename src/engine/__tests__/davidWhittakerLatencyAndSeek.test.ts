/**
 * apb.dw: the grid ran ahead of the ear (the worklet reported the tick it had just RENDERED, which is heard one output
 * latency later) and Play Pattern did not loop (no seek). Held here:
 *   - the worklet holds a playTick back until latencyFrames have been played after it (the Nuade pattern), and stamps the
 *     frame it rendered at;
 *   - seekTicks runs the replayer silently to a target tick, also backwards, and tags later reports with a generation;
 *   - the engine drops reports of an older generation and posts the pattern-start tick of the row clock;
 *   - Play Pattern, driven through PlaybackCoordinator.dispatchEnginePosition, seeks the engine when the position leaves
 *     the loop range (call-count sentinel) and does not seek inside it.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { installDwNodeFetch } from '@/lib/import/__tests__/helpers/dwNodeFetch';
import { openWorklet } from './helpers/workletHarness';
import { DavidWhittakerEngine, dwPatternStartTick } from '../davidwhittaker/DavidWhittakerEngine';
import { makeRowClock } from '@/lib/import/formats/stepRowClock';
import { PositionCallbacks } from '@engine/wasm/PositionCallbacks';
import { PlaybackCoordinator } from '../PlaybackCoordinator';
import { TrackerReplayer } from '../TrackerReplayer';

const worklet = { dir: 'davidwhittaker', name: 'DavidWhittaker', factory: 'createDavidWhittaker' };
let restoreFetch = () => {};
beforeAll(() => { restoreFetch = installDwNodeFetch(); });
afterAll(() => restoreFetch());

const apb = () => {
  const f = readFileSync(resolve(process.cwd(), 'public/data/songs/formats/apb.dw'));
  return f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer;
};
const tickMsgs = (posted: Array<Record<string, unknown>>) => posted.filter((m) => m.type === 'playTick');

describe('David Whittaker output latency and seek', { timeout: 60_000 }, () => {
  it('holds a tick report back by latencyFrames and stamps the frame it rendered at', async () => {
    const run = async (latencyFrames: number) => {
      const h = await openWorklet(worklet);
      await h.send({ type: 'loadModule', moduleData: apb().slice(0), subsong: 0 });
      await h.send({ type: 'play', latencyFrames });
      h.render(600);
      return tickMsgs(h.posted);
    };
    const none = await run(0);
    const late = await run(4410);   // 100 ms
    expect(none.length).toBeGreaterThan(10);
    expect(late.length).toBeGreaterThan(5);
    expect(late.length, 'a delayed report stream is shorter over the same render').toBeLessThan(none.length);
    const lastLate = late[late.length - 1].ticks as number;
    const idx = none.findIndex((m) => m.ticks === lastLate);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(none.length - idx, 'about 100 ms of ticks (5 at 50 Hz) have not been heard yet').toBeGreaterThanOrEqual(4);
    expect(typeof late[0].frame, 'render frame stamp').toBe('number');
  });

  it('seekTicks reaches the target tick silently, backwards too, and tags later reports with the generation', async () => {
    const h = await openWorklet(worklet);
    await h.send({ type: 'loadModule', moduleData: apb().slice(0), subsong: 0 });
    await h.send({ type: 'play' });
    h.render(100);
    h.posted.length = 0;
    await h.send({ type: 'seekTicks', ticks: 150, gen: 3 });
    expect(h.posted.find((m) => m.type === 'seeked')).toMatchObject({ ticks: 150, gen: 3 });
    h.render(20);
    const after = tickMsgs(h.posted);
    expect(after[0].ticks as number, 'playing resumes from the target').toBeGreaterThanOrEqual(150);
    expect(after[0].ticks as number).toBeLessThan(170);
    expect(after.every((m) => m.gen === 3)).toBe(true);
    h.posted.length = 0;
    await h.send({ type: 'seekTicks', ticks: 40, gen: 4 });   // backwards: the subsong restarts
    h.render(20);
    const back = tickMsgs(h.posted);
    expect(back[0].ticks as number).toBeGreaterThanOrEqual(40);
    expect(back[0].ticks as number).toBeLessThan(60);
  });

  it('seekTicks stops on the target tick boundary: the first frame after it plays tick `target`, never the rest of the tick before', async () => {
    // A seek that stopped inside tick target - 1 left its remaining frames to the next render, so the first report after a
    // seek (and after every Play Pattern wrap) was played_ticks == target: the previous pattern's last row on the grid.
    for (const target of [150, 40, 101]) {
      const h = await openWorklet(worklet);
      await h.send({ type: 'loadModule', moduleData: apb().slice(0), subsong: 0 });
      await h.send({ type: 'play', latencyFrames: 0 });
      h.render(30);
      h.posted.length = 0;
      await h.send({ type: 'seekTicks', ticks: target, gen: 1 });
      h.render(1);
      const first = tickMsgs(h.posted);
      expect(first.map((m) => m.ticks), `seek ${target}: the first block runs tick ${target} and reports it`).toEqual([target + 1]);
      h.render(40);
      expect(tickMsgs(h.posted).every((m) => (m.ticks as number) > target), `seek ${target}: no report from before the target`).toBe(true);
    }
  });

  it('Play Pattern loop wraps on the render position: no frame of the next pattern is rendered, and the main thread is not needed', async () => {
    const run = async (loop: boolean) => {
      const h = await openWorklet(worklet);
      await h.send({ type: 'loadModule', moduleData: apb().slice(0), subsong: 0 });
      if (loop) await h.send({ type: 'setLoop', startTick: 40, endTick: 150 });
      await h.send({ type: 'play', latencyFrames: 0 });   // zero latency: a report is the render position
      h.render(1500);   // ~4.3 s, 215 ticks at 50 Hz: crosses tick 150 once or twice
      return h;
    };
    const looped = await run(true);
    const ticks = tickMsgs(looped.posted).map((m) => m.ticks as number);
    const wraps = looped.posted.filter((m) => m.type === 'looped');
    expect(wraps.length, 'wrap sentinel: the worklet looped by itself').toBeGreaterThanOrEqual(1);
    expect(Math.max(...ticks), 'the render never reaches the next pattern').toBeLessThan(150);
    expect(wraps[0].ticks).toBe(40);
    expect(ticks.filter((t) => t >= 40).length).toBeGreaterThan(100);
    const free = tickMsgs((await run(false)).posted).map((m) => m.ticks as number);
    expect(Math.max(...free), 'without a loop the same render does pass tick 150').toBeGreaterThanOrEqual(150);
  });

  it('Play Pattern on a later pattern starts at the loop start: no tick before it is rendered (no seek message needed)', async () => {
    // The app's Play Pattern posts setLoop then play; nothing seeks the worklet (DW positions bypass the coordinator's
    // enforceLoop), so the worklet itself must move a position below the loop start into the loop before rendering.
    const h = await openWorklet(worklet);
    await h.send({ type: 'loadModule', moduleData: apb().slice(0), subsong: 0 });
    await h.send({ type: 'setLoop', startTick: 101, endTick: 150 });
    await h.send({ type: 'play', latencyFrames: 0 });
    h.render(400);
    const ticks = tickMsgs(h.posted).map((m) => m.ticks as number);
    expect(ticks.length).toBeGreaterThan(5);
    expect(ticks[0], 'the first heard tick is the loop start').toBe(102);
    expect(Math.min(...ticks), 'no tick of the patterns before the loop is rendered').toBeGreaterThan(101);
  });

  it('the engine drops reports of an older seek generation and posts the pattern-start tick', () => {
    class FakeNode {
      posts: unknown[] = [];
      port = { postMessage: (m: unknown) => { this.posts.push(m); }, onmessage: null as null | ((e: { data: unknown }) => void) };
      connect() {}
      disconnect() {}
    }
    (globalThis as { AudioWorkletNode?: unknown }).AudioWorkletNode = FakeNode;
    const engine = Object.create(DavidWhittakerEngine.prototype) as Record<string, unknown>;
    Object.assign(engine, { audioContext: { sampleRate: 48000 }, output: {}, _positions: new PositionCallbacks(), _tickLog: [], _seekGen: 0 });
    (engine as unknown as { createNode(): void }).createNode();
    const speedChanges = [{ tick: 0, speed: 6 }];
    (engine as unknown as { setGridClock(c: unknown): void }).setGridClock({ speedChanges, passTicks: 100000 });
    const e = engine as unknown as DavidWhittakerEngine;
    const seen: unknown[] = [];
    e.onPositionUpdate((u) => seen.push(u));
    const node = (engine as unknown as { workletNode: FakeNode }).workletNode;
    expect(e.seekToPattern(2)).toBe(true);
    expect(dwPatternStartTick(makeRowClock(speedChanges), 2), '2 patterns x 64 rows x speed 6').toBe(768);
    expect(node.posts.at(-1)).toEqual({ type: 'seekTicks', ticks: 768, gen: 1 });
    e.setPatternLoop({ start: 1, end: 2 });
    expect(node.posts.at(-1), 'loop patterns 1..2 = ticks of pattern 1 start to pattern 3 start').toEqual({ type: 'setLoop', startTick: 384, endTick: 1152 });
    e.setPatternLoop(null);
    expect(node.posts.at(-1)).toEqual({ type: 'setLoop', startTick: -1, endTick: -1 });
    // DW-LOOP-LAST-PATTERN: the song's last pattern ends at the pass end, which the replayer's tick count does reach.
    (engine as unknown as { setGridClock(c: unknown): void }).setGridClock({ speedChanges, passTicks: 1000 });
    e.setPatternLoop({ start: 2, end: 2 });
    expect(node.posts.at(-1), 'last pattern loops at the pass end, not at pattern 3 start').toEqual({ type: 'setLoop', startTick: 768, endTick: 1000 });
    node.port.onmessage!({ data: { type: 'playTick', ticks: 5, gen: 0 } });   // stale, from before the seek
    expect(seen).toHaveLength(0);
    node.port.onmessage!({ data: { type: 'playTick', ticks: 769, gen: 1 } });
    expect(seen).toHaveLength(1);
    expect((seen[0] as { songPos: number }).songPos).toBe(2);
  });

  it('Play Pattern seeks a David Whittaker engine when the position leaves the loop, and only then', () => {
    const seek = vi.fn(() => true);
    const hasInstance = vi.spyOn(DavidWhittakerEngine, 'hasInstance').mockReturnValue(true);
    const getInstance = vi.spyOn(DavidWhittakerEngine, 'getInstance').mockReturnValue({ seekToPattern: seek } as unknown as DavidWhittakerEngine);
    try {
      const replayer = Object.create(TrackerReplayer.prototype) as Record<string, unknown>;
      Object.assign(replayer, {
        useLibopenmptPlayback: false, song: { davidWhittakerClock: {} },
        patternLoopActive: true, patternLoopStartPos: 2, patternLoopEndPos: 3,
      });
      const c = new PlaybackCoordinator();
      c.stateRing.playing = true;
      c.context.songPositions = [0, 1, 2, 3, 4];
      c.context.enforceLoop = (p) => (replayer as unknown as { enforcePatternLoopOnEngine(p: number): boolean }).enforcePatternLoopOnEngine(p);
      c.dispatchEnginePosition(0, 2);
      c.dispatchEnginePosition(5, 3);
      expect(seek, 'inside the loop range: no seek').not.toHaveBeenCalled();
      c.dispatchEnginePosition(0, 4);
      expect(seek).toHaveBeenCalledTimes(1);
      expect(seek).toHaveBeenCalledWith(2);
      expect(c.songPos, 'the out-of-range position is dropped').toBe(3);
    } finally {
      hasInstance.mockRestore();
      getInstance.mockRestore();
    }
  });
});
