/**
 * Synthesis, Sonic Arranger, TFM Music Maker and StoneTracker: the pattern
 * editor follows the music.
 *
 * Each WASM replayer had a position getter (or only an edit API) but its
 * worklet posted no position, so NativeEngineRouting wired nothing and the
 * grid scrolled on the tracker scheduler's nominal tempo while the audio free-ran
 * ("the pattern editor does not follow the music"). The worklets now post
 * { type: 'position', songPos, row } when the replayer's own position changes;
 * songPos indexes TrackerSong.songPositions (the order list) and row is the row
 * of that grid pattern, which is what the engine's onPositionUpdate hands to
 * reportEnginePosition.
 *
 * Held here against the grid the importer builds, on a corpus song per engine:
 *   - the reported positions walk the grid exactly: (0,0), then row + 1 inside the
 *     pattern, then row 0 of the next order position after the pattern's last row;
 *   - a note the grid shows on a voice sounds on that voice at the reported
 *     row, not one row early or late (onset coincidence vs rows shifted by one);
 *   - Synthesis, whose clock is the grid's (initialSpeed ticks of 20 ms a row),
 *     reports a row every initialSpeed * 960 frames.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { ROOT, startWorklet, stereoOutputs, loadSharedWorkletScripts, type WorkletMsg } from './workletHarness';
import { synthesisTransform } from '@/engine/synthesis/SynthesisEngine';
import { sonicArrangerTransform } from '@/engine/sonic-arranger/SonicArrangerEngine';
import { parseSynthesisFile } from '@/lib/import/formats/SynthesisParser';
import { parseSonicArrangerFile } from '@/lib/import/formats/SonicArrangerParser';
import { parseTfmMusicMakerFile } from '@/lib/import/formats/TFMMusicMakerParser';
import { parseStoneTrackerFile } from '@/lib/import/formats/StoneTrackerParser';

const BLOCK = 128;
const FRAMES_PER_TICK = 960;   // 48 kHz / 50 Hz
const MAX_BLOCKS = Math.floor((48000 * 70) / BLOCK);
const ORDER_POSITIONS_TO_COVER = 4;

interface Case {
  name: string;
  dir: string;
  stem: string;
  file: string;
  bank?: string;
  transform?: (code: string) => string;
  /** Voices whose onsets are checked (the worklet's chBufs). */
  voices: number;
  parse: (bytes: Uint8Array, bank?: Uint8Array) => Promise<TrackerSong> | TrackerSong;
  /** The grid's own clock: ticks per row, frames per tick (Synthesis only). */
  gridClock: boolean;
  /** The grid carries Bxx (jump) / Dxx (break) that end a pattern early. */
  breaks?: boolean;
}

const CASES: Case[] = [
  { name: 'Synthesis (space sound.syn)', dir: 'synthesis', stem: 'Synthesis', file: 'public/data/songs/synthesis/space sound.syn',
    transform: synthesisTransform, voices: 4, gridClock: true,
    parse: (b) => parseSynthesisFile(b, 'space sound.syn') as TrackerSong },
  { name: 'Sonic Arranger (mega end.sa)', dir: 'sonic-arranger', stem: 'SonicArranger', file: 'public/data/songs/sonic-arranger/mega end.sa',
    transform: sonicArrangerTransform, voices: 4, gridClock: false, breaks: true,
    parse: (b) => parseSonicArrangerFile(b.slice().buffer as ArrayBuffer, 'mega end.sa') },
  { name: 'TFM Music Maker (rainstorm.tfe)', dir: 'tfm', stem: 'TFM', file: 'public/data/songs/tfm-music-maker/rainstorm.tfe',
    voices: 6, gridClock: false,
    parse: (b) => parseTfmMusicMakerFile(b, 'rainstorm.tfe') },
  { name: 'StoneTracker (hypnosphere.spm)', dir: 'stonetracker', stem: 'StoneTracker', file: 'public/data/songs/stonetracker/hypnosphere.spm',
    bank: 'public/data/songs/stonetracker/hypnosphere.sps', voices: 8, gridClock: false,
    parse: (b, bank) => parseStoneTrackerFile(b, 'hypnosphere.spm', bank) },
];

interface Report { frame: number; songPos: number; row: number }
interface Rendered { reports: Report[]; levels: number[][] }

const ab = (b: Uint8Array): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

/** Render the real worklet and WASM, collecting each position post with the voice levels of its block. */
async function renderReports(c: Case, song: TrackerSong, bytes: Uint8Array, bank?: Uint8Array): Promise<Rendered> {
  loadSharedWorkletScripts();
  const { proc, send, posted } = await startWorklet(c.dir, c.stem, c.transform);
  const load: Record<string, unknown> = { type: 'loadModule', moduleData: ab(bytes) };
  if (bank) load.sampleData = ab(bank);
  await send(load);
  await send({ type: 'play' });
  const out = stereoOutputs(37);
  const reports: Report[] = [];
  const levels: number[][] = [];
  const reached = new Set<number>();
  let seen = 0;
  for (let blk = 0; blk < MAX_BLOCKS && reached.size < ORDER_POSITIONS_TO_COVER + 1; blk++) {
    proc.process([], out);
    const bufs = proc.chBufs as Float32Array[];
    levels.push(Array.from({ length: c.voices }, (_, v) => {
      let e = 0;
      for (let i = 0; i < BLOCK; i++) e += bufs[v][i] * bufs[v][i];
      return Math.sqrt(e / BLOCK);
    }));
    for (; seen < posted.length; seen++) {
      const p = posted[seen] as WorkletMsg & { songPos?: number; row?: number };
      if (p.type !== 'position') continue;
      reports.push({ frame: blk * BLOCK, songPos: p.songPos!, row: p.row! });
      reached.add(p.songPos!);
    }
  }
  expect(song.songPositions!.length, 'the song has an order list').toBeGreaterThan(ORDER_POSITIONS_TO_COVER);
  return { reports, levels };
}

/**
 * How much voice `v` rises when the row starting at `block` starts: the loudest
 * of the next four blocks over the mean of the six before (log ratio).
 */
function rise(levels: number[][], block: number, v: number): number {
  const at = (b: number) => (levels[b]?.[v] ?? 0);
  let after = 0, before = 0;
  for (let k = 0; k < 4; k++) after = Math.max(after, at(block + k));
  for (let k = 1; k <= 6; k++) before += at(block - k) / 6;
  return Math.log((after + 1e-4) / (before + 1e-4));
}

describe('native replayer playhead follows the grid row', () => {
  it.each(CASES)('$name: the reported position walks the grid and lands on the notes', async (c) => {
    const bytes = new Uint8Array(readFileSync(join(ROOT, c.file)));
    const bank = c.bank ? new Uint8Array(readFileSync(join(ROOT, c.bank))) : undefined;
    const song = await c.parse(bytes, bank);
    const order = song.songPositions!;
    const lengthAt = (songPos: number) => song.patterns[order[songPos]].length;

    const { reports, levels } = await renderReports(c, song, bytes, bank);
    expect(reports.length, 'the worklet posts its position as it changes').toBeGreaterThan(50);

    // 1. The walk: (0,0) first, then exactly the grid's next row.
    expect({ songPos: reports[0].songPos, row: reports[0].row }).toEqual({ songPos: 0, row: 0 });
    const bad: string[] = [];
    for (let i = 1; i < reports.length && bad.length < 5; i++) {
      const a = reports[i - 1], b = reports[i];
      const sameRowNext = b.songPos === a.songPos && b.row === a.row + 1 && b.row < lengthAt(a.songPos);
      const rowEffects = song.patterns[order[a.songPos]].channels.map((ch) => ch.rows[a.row]?.effTyp);
      const ended = a.row === lengthAt(a.songPos) - 1 || (c.breaks === true && rowEffects.includes(0x0d));
      const jumped = c.breaks === true && rowEffects.includes(0x0b) && b.row === 0;
      const nextPos = b.songPos === a.songPos + 1 && b.row === 0 && ended;
      if (!sameRowNext && !nextPos && !jumped) bad.push(`#${i} at frame ${b.frame}: (${a.songPos},${a.row}) -> (${b.songPos},${b.row}), pattern of ${lengthAt(a.songPos)} rows`);
    }
    expect(bad).toEqual([]);

    // 2. A note the grid shows sounds at the reported row: the voice's onset at
    // the reported row beats the same voice's onsets at rows one before and one after.
    const score = (shift: number): number => {
      let sum = 0, n = 0;
      for (let i = 2; i < reports.length - 2; i++) {
        const at = reports[i];
        for (let v = 0; v < Math.min(c.voices, song.numChannels); v++) {
          const cell = song.patterns[order[at.songPos]].channels[v]?.rows[at.row];
          if (!cell || cell.note <= 0 || cell.note > 96) continue;
          sum += rise(levels, reports[i + shift].frame / BLOCK, v);
          n++;
        }
      }
      return n ? sum / n : 0;
    };
    const aligned = score(0), early = score(-1), late = score(1);
    expect(aligned, `a voice with a grid note rises at the reported row (${aligned.toFixed(3)} vs early ${early.toFixed(3)}, late ${late.toFixed(3)})`).toBeGreaterThan(early);
    expect(aligned).toBeGreaterThan(late);

    // 3. Synthesis: the grid's clock is initialSpeed ticks of 20 ms a row.
    if (c.gridClock) {
      const want = song.initialSpeed * FRAMES_PER_TICK;
      const off = reports.slice(1).map((r, i) => r.frame - reports[i].frame).filter((d) => Math.abs(d - want) > BLOCK);
      expect(off, `every row lasts initialSpeed (${song.initialSpeed}) ticks = ${want} frames`).toEqual([]);
    }
  }, 300000);
});
