/**
 * Play / Play Pattern on a Voodoo Supreme song starts at the grid position, not at the song start (PLAY-FROM-POS-C2).
 *
 * Wired: a loaded .vss carries uadeEditableFileData and no UADE tick clock, so it plays on the UADEEditable descriptor;
 * the transport start (startNativeEngines) resolves the grid row with UADEEngine.targetOf (uadeRowFrames: rows times
 * ticksPerRow ticks of 2.5 / 125 s = 50 Hz) and the row-preview search, then posts UADEEngine.seek(frame) before play()
 * (worklet skips silently, C uade_wasm_skip_frames). Sentinel: the mock engine's seek and play calls, in order.
 * Measured: at the tick that frame names, the period UADE writes to Paula on each voice is the period of the grid note in
 * force there (UADE's AUDxPER log, gridOracle), so the seek lands on the grid row in the replayer's own time.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const PATH = 'public/data/songs/voodoo/voo8.vss';
const RATE = 48000;
type TargetOf = import('@/engine/uade/UADEEngine').UADEEngine['targetOf'];
const calls = vi.hoisted(() => [] as string[]);
const engine = vi.hoisted(() => ({
  ready: async () => {},
  loadTune: async () => {},
  setGrid: () => {},
  setMuteMask: () => {},
  playRowClip: () => {},
  rowClipMask: 0xffff,
  audioContext: { sampleRate: 48000 },
  output: { context: { sampleRate: 48000 } },
  targetOf: null as unknown as TargetOf,
  seek: (frame: number) => { calls.push(`seek:${frame}`); },
  play: () => { calls.push('play'); },
}));
vi.mock('@/engine/uade/UADEEngine', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/engine/uade/UADEEngine')>();
  engine.targetOf = real.UADEEngine.prototype.targetOf as TargetOf;
  return { ...real, UADEEngine: { hasInstance: () => true, getInstance: () => engine } };
});
// The parsed grid is the play source unedited; skip the edited-grid export round trip (not what this test measures).
vi.mock('@/engine/replayer/editedModuleForPlay', () => ({ editedModuleForPlay: async () => null }));
vi.mock('@/engine/ToneEngine', () => {
  const t = { releaseAll: vi.fn(), getInstrument: vi.fn(), setBPM: vi.fn() };
  return { getToneEngine: () => t };
});

let song: TrackerSong;
beforeAll(async () => {
  const { parseVoodooSupremeSynthesizerFile } = await import('@/lib/import/formats/VoodooSupremeSynthesizerParser');
  const raw = new Uint8Array(readFileSync(join(process.cwd(), PATH)));
  song = parseVoodooSupremeSynthesizerFile(raw.buffer as ArrayBuffer, 'voo8.vss');
  const { setRowPreviewClient } = await import('@engine/rowPreview/rowPreviewClient');
  // The stream answers a frames target with its `from` (rowPreviewStream: start = target.from).
  setRowPreviewClient({
    request: async (req) => {
      const t = req.target as { kind: string; from: number };
      expect(t.kind).toBe('frames');
      return { kind: 'clip', clip: { startFrame: t.from, sampleRate: RATE, frames: 1, stereo: new Float32Array(2), voices: null, panSteps: [], fadeFrames: 0 } };
    },
    prepare: async () => ({ kind: 'skipped' }),
  });
});

async function start(songPos: number, row: number): Promise<void> {
  const { startNativeEngines, clearRunningEngineKeys, playingEngineFor } = await import('@/engine/replayer/NativeEngineRouting');
  expect(playingEngineFor(song)).toBe('UADEEditable');
  clearRunningEngineKeys();
  calls.length = 0;
  await startNativeEngines(song, {} as never, false, false, new Set(), { songPos, row });
}

const tickOf = (songPos: number, row: number): number =>
  (song.songPositions.slice(0, songPos).reduce((a, p) => a + song.patterns[p].length, 0) + row) * song.initialSpeed;

describe('Voodoo Supreme transport start', () => {
  it('seeks UADE to the 50 Hz tick of the grid row before play', async () => {
    expect(song.initialSpeed).toBe(8);
    expect(song.songPositions.length).toBeGreaterThan(3);
    await start(3, 5);
    expect(calls).toEqual([`seek:${tickOf(3, 5) * (RATE / 50)}`, 'play']);
  }, 180000); // first test pays the cold import of the whole routing graph (58 s on a loaded machine)

  it('plays plainly from position 0 row 0', async () => {
    await start(0, 0);
    expect(calls).toEqual(['play']);
  }, 180000);

  it('the seek tick is the grid row in UADE time: Paula periods there are the grid notes in force', async () => {
    const { openUade, PaulaSession, PAULA_REG } = await import('@/engine/__tests__/gridOracle');
    const { periodToGridNote } = await import('@/lib/amiga/periodNotes');
    const target = tickOf(3, 5);
    const column = (v: number) => song.patterns.flatMap((p) => p.channels[v].rows);
    // The grid note in force at `tick`: the last pitched cell at or before its row (97 = key off, 0 = empty).
    const inForce = (v: number, tick: number): number => {
      const rows = column(v);
      for (let r = Math.floor(tick / song.initialSpeed); r >= 0; r--) { const n = rows[r].note; if (n !== 0 && n !== 97) return n; }
      return 0;
    };
    const session = new PaulaSession(await openUade(), new Uint8Array(song.uadeEditableFileData as ArrayBuffer), 'voo8.vss');
    const period = [0, 0, 0, 0];
    session.drain();
    for (let c = 0; c < (target + 1) * 2; c++) {
      const w = session.step();
      if (!w) break;
      for (const x of w) if (x.voice < 4 && x.reg === PAULA_REG.PER && x.value > 0) period[x.voice] = x.value;
    }
    session.close();
    const lines = [0, 1, 2, 3].map((v) => `voice ${v} tick ${target}: grid ${inForce(v, target)}, Paula ${period[v]} -> ${periodToGridNote(period[v])}`);
    console.log(lines.join('\n'));
    // Within a semitone: voo8 voice 3 samples below its table period (voodooGridMatchesPaula.test.ts), and vibrato moves a period.
    for (let v = 0; v < 4; v++) expect(Math.abs(periodToGridNote(period[v]) - inForce(v, target)), lines[v]).toBeLessThanOrEqual(1);
  }, 180000);
});
