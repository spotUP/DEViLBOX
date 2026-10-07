/**
 * SunTronic native engine: the pattern editor follows the music.
 *
 * SunTronicSongEngine posted no position, so NativeEngineRouting wired nothing and
 * the grid scrolled on the tracker scheduler while the audio free-ran. The engine now
 * reports the grid row (SunPlayhead: voice 0's decoded rows, read at the samples the
 * worklet has consumed) through onPositionUpdate, which NativeEngineRouting hands to
 * reportEnginePosition.
 *
 * Driven through the real engine (loadTune, its pump, the worklet's 'consumed'
 * feedback) with the audio context and worklet node faked: at each pump tick
 * time the reported row is the row the replayer's own walk puts the music on (its player
 * steps on the PAL vblank clock), advancing one row at a time; a shift-by-one fails.
 *
 * Fails on revert: without the report, no position arrives.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readdirSync } from 'node:fs';
import { walkSunTronic } from '../SunTronicWalk';
import { parseSunTronicV13Score } from '@/lib/import/formats/SunTronicV13';

interface Posted { type: string; voices?: Float32Array[] }
const posted: Posted[] = [];
let nodePort: { onmessage: ((e: { data: unknown }) => void) | null } | null = null;

vi.mock('@/utils/audio-context', () => {
  const ctx = {
    createGain: () => ({ connect() {}, disconnect() {}, gain: { value: 1 } }),
    audioWorklet: { addModule: async () => {} },
    sampleRate: 44100,
  };
  return { getDevilboxAudioContext: () => ctx };
});
vi.mock('@engine/tone/ChannelRoutedEffects', () => ({ getChannelRoutedEffectsManager: () => null }));

class FakeNode {
  port: { onmessage: ((e: { data: unknown }) => void) | null; postMessage: (m: Posted) => void };
  constructor() {
    this.port = {
      onmessage: null,
      postMessage: (m: Posted) => {
        posted.push(m);
        if (m.type === 'init') queueMicrotask(() => this.port.onmessage?.({ data: { type: 'ready' } }));
      },
    };
    nodePort = this.port;
  }
  connect() {}
  disconnect() {}
}

const CORPUS = join(process.cwd(), 'public/data/songs/formats/SUNTronicTunes');
const SAMPLE_RATE = 44100;

beforeAll(() => { vi.stubGlobal('AudioWorkletNode', FakeNode); vi.useFakeTimers(); });
afterAll(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('SunTronic native engine reports the row the music is on', () => {
  it('analgestic2: the reported row is the walk row the music is on, one row at a time', async () => {
    const bytes = new Uint8Array(readFileSync(join(CORPUS, 'analgestic2.src')));
    const { SunTronicSongEngine } = await import('../SunTronicSongEngine');
    const { parseSunTronicFile } = await import('@/lib/import/formats/SunTronicParser');
    const song = parseSunTronicFile(bytes.slice().buffer as ArrayBuffer, 'analgestic2.src');
    const grid = song.patterns.flatMap((p) => p.channels[0].rows);

    const engine = SunTronicSongEngine.getInstance();
    await engine.ready();
    const reports: Array<{ consumed: number; flat: number }> = [];
    let consumed = 0;
    engine.onPositionUpdate((u) => reports.push({ consumed, flat: u.songPos * 64 + u.row }));
    const instr = join(CORPUS, 'instr');
    const companions = readdirSync(instr).map((n) => ({ name: n, data: new Uint8Array(readFileSync(join(instr, n))) }));
    await engine.loadTune(bytes, companions);

    // The worklet consumes 40 ms per pump tick, never more than was queued.
    const queued = () => posted.filter((m) => m.type === 'chunk').length * 2048;
    for (let t = 0; t < 400; t++) {
      consumed = Math.min(queued(), consumed + Math.round(SAMPLE_RATE * 0.04));
      nodePort!.onmessage?.({ data: { type: 'consumed', samples: consumed } });
      vi.advanceTimersByTime(40);
    }
    engine.stop();

    expect(reports.length, 'positions were reported').toBeGreaterThan(20);
    // The oracle: the walk's own player steps. Step S is decoded at the S-th PAL vblank
    // latch, sample ceil((S - 1) * 25600 / 29) of the render (one latch per 882.76 samples),
    // so the music is on walk row i from there until the next row's latch.
    const walk = walkSunTronic(parseSunTronicV13Score(bytes)).voices[0];
    const startOf = walk.map((g) => Math.ceil(((g.step - 1) * 25600) / 29));
    const expectedAt = (sample: number): number => {
      let k = -1;
      for (let i = 0; i < startOf.length && startOf[i] <= sample; i++) k = i;
      return k;
    };
    const wrong = reports.filter((r) => r.flat !== expectedAt(r.consumed));
    expect(wrong.slice(0, 5)).toEqual([]);
    // The playhead moved through many rows, none skipped, and the grid has notes on them.
    const flats = reports.map((r) => r.flat);
    expect(Math.max(...flats)).toBeGreaterThan(30);
    expect(flats.every((f, n) => n === 0 || f === flats[n - 1] + 1)).toBe(true);
    expect(flats.filter((f) => grid[f]?.note > 0).length).toBeGreaterThan(5);
  }, 60_000);
});
