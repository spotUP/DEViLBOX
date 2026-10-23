/**
 * Game Music Creator songs played on their own WASM replayer but the worklet reported no position and no channel
 * levels, so the TS scheduler ran on its own clock: the VU meters lagged the audio and the pattern editor did not
 * follow the replayer. The worklet now posts 'position' and 'chLevels' (levels, note starts, audio time) like
 * JamCracker, and GmcEngine forwards them. Real worklet and WASM, real song.
 */
import { describe, it, expect, vi } from 'vitest';
import { startWorklet, songBuffer, stereoOutputs } from './workletHarness';
import { gmcTransform, GmcEngine } from '../gmc/GmcEngine';

const feed = vi.hoisted(() => ({ reports: [] as unknown[] }));
vi.mock('../tone/channelMeterFeed', () => ({
  ChannelMeterFeed: class { reportFromWorklet(d: unknown) { feed.reports.push(d); } clearHeld() {} },
}));

type Msg = { type?: string; songPos?: number; row?: number; speed?: number; levels?: number[]; noteStarts?: number[]; audioTime?: number };

describe('GMC replayer drives the channel meters and the editor position', { timeout: 60_000 }, () => {
  it('the worklet posts the replayer playhead and per-channel levels with note starts', async () => {
    const { proc, send, posted } = await startWorklet('gmc', 'Gmc', gmcTransform);
    await send({ type: 'loadModule', moduleData: songBuffer('public/data/songs/formats/knights_of_sky.gmc') });
    await send({ type: 'play' });
    const positions: Msg[] = []; const levels: Msg[] = [];
    for (let q = 0; q < (48000 * 6) / 128; q++) {
      proc.process([], stereoOutputs(1));
      while (posted.length) {
        const m = posted.shift() as Msg;
        if (m.type === 'position') positions.push(m);
        if (m.type === 'chLevels') levels.push(m);
      }
    }
    expect(positions.length, 'position reports').toBeGreaterThan(50);
    expect(new Set(positions.map((p) => p.row)).size, 'the row advances').toBeGreaterThan(8);
    expect(positions.every((p) => (p.speed ?? 0) > 0), 'speed reported').toBe(true);
    expect(levels.length, 'level reports').toBeGreaterThan(50);
    expect(Math.max(...levels.flatMap((l) => l.levels ?? [])), 'a voice is audible').toBeGreaterThan(0.01);
    const last = levels[levels.length - 1];
    expect(last.noteStarts!.reduce((a, b) => a + b, 0), 'notes were started').toBeGreaterThan(4);
    expect(typeof last.audioTime, 'stamped with the audio clock').toBe('number');
  });

  it('GmcEngine forwards the position to its subscribers and the levels to the meter feed', () => {
    class FakeNode { port = { postMessage() {}, onmessage: null as null | ((e: { data: unknown }) => void) }; connect() {} disconnect() {} }
    (globalThis as { AudioWorkletNode?: unknown }).AudioWorkletNode = FakeNode;
    const engine = Object.create(GmcEngine.prototype) as Record<string, unknown>;
    Object.assign(engine, { audioContext: { sampleRate: 48000 }, output: {}, _positions: new (class { cbs = new Set<(u: unknown) => void>(); add(cb: (u: unknown) => void) { this.cbs.add(cb); return () => this.cbs.delete(cb); } emit(d: { songPos: number; row: number }) { for (const cb of this.cbs) cb({ songPos: d.songPos, row: d.row }); } })() });
    (engine as unknown as { createNode(): void }).createNode();
    const seen: unknown[] = [];
    (engine as unknown as GmcEngine).onPositionUpdate((u) => seen.push(u));
    const node = (engine as unknown as { workletNode: FakeNode }).workletNode;
    node.port.onmessage!({ data: { type: 'position', songPos: 3, row: 17 } });
    node.port.onmessage!({ data: { type: 'chLevels', levels: [0.5, 0, 0, 0], noteStarts: [1, 0, 0, 0], audioTime: 1 } });
    expect(seen).toEqual([{ songPos: 3, row: 17 }]);
    expect(feed.reports).toHaveLength(1);
  });
});
