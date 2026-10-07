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
import { parseDeltaMusic1File } from '@/lib/import/formats/DeltaMusic1Parser';
import { parseDigitalMugicianFile } from '@/lib/import/formats/DigitalMugicianParser';
import { parseSoundMonFile } from '@/lib/import/formats/SoundMonParser';
import { parseFCFile } from '@/lib/import/formats/FCParser';
import { parseSidMon2File } from '@/lib/import/formats/SidMon2Parser';
import { parseSoundFactoryFile } from '@/lib/import/formats/SoundFactoryParser';
import { parseBenDaglishFile } from '@/lib/import/formats/BenDaglishParser';
import { installWasmNodeFetch } from '@/lib/import/__tests__/helpers/dwNodeFetch';

/** The Emscripten glue of the replayer wasm, made loadable in a worklet scope (as the engines' own transforms do). */
const emscriptenTransform = (c: string) => c
  .replace(/import\.meta\.url/g, "'.'").replace(/export\s+default\s+\w+;?/g, '')
  .replace(/self\.location\.href/g, "'.'")
  .replace(/_scriptName=globalThis\.document\?\.currentScript\?\.src/, '_scriptName="."')
  .replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];')
  .replace('HEAPU8=new Uint8Array(b);', 'HEAPU8=Module["HEAPU8"]=new Uint8Array(b);')
  .replace('HEAPF32=new Float32Array(b);', 'HEAPF32=Module["HEAPF32"]=new Float32Array(b);');

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
  /** No per-voice buffers: render once per voice with only that voice audible (SidMon 2's mute mask). */
  isolate?: boolean;
  /**
   * Most reports between the replayer reading a note and its sound starting. Sound Factory
   * starts the sample on the tick after the note is read, or on that tick, by instrument
   * (note_start_flag in sf_modulator); the check is then: onset at the reported row or the next,
   * never one row early or two late.
   */
  maxOnsetLag?: number;
  /** The worklet starts rendering on load and has no play message. */
  noPlay?: boolean;
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
  { name: 'SoundMon 2 (nicktune1.bp)', dir: 'soundmon', stem: 'SoundMon', file: 'public/data/songs/bp-soundmon-2/nicktune1.bp',
    transform: emscriptenTransform, voices: 4, gridClock: false, breaks: true,
    parse: (b) => parseSoundMonFile(ab(b), 'nicktune1.bp') },
  { name: 'Future Composer 1.3 (commando.smod)', dir: 'futurecomposer', stem: 'FutureComposer', file: 'public/data/songs/future-composer-1.3/commando.smod',
    transform: emscriptenTransform, voices: 4, gridClock: false,
    parse: (b) => parseFCFile(ab(b), 'commando.smod') },
  { name: 'Future Composer 1.4 (starglide1.fc)', dir: 'futurecomposer', stem: 'FutureComposer', file: 'public/data/songs/future-composer-1.4/starglide1.fc',
    transform: emscriptenTransform, voices: 4, gridClock: false,
    parse: (b) => parseFCFile(ab(b), 'starglide1.fc') },
  { name: 'SidMon 2 (ice7-intro.sid2)', dir: 'sidmon2', stem: 'Sd2', file: 'public/data/songs/sidmon-2/ice7-intro.sid2',
    transform: emscriptenTransform, voices: 4, gridClock: false, isolate: true, noPlay: true,
    parse: (b) => parseSidMon2File(ab(b), 'ice7-intro.sid2') },
  { name: 'Delta Music 1 (triplex1.dm)', dir: 'deltamusic1', stem: 'DeltaMusic1', file: 'public/data/songs/delta-music/triplex1.dm',
    transform: emscriptenTransform, voices: 4, gridClock: false,
    parse: (b) => parseDeltaMusic1File(ab(b), 'triplex1.dm') },
  { name: 'Digital Mugician (believe.dmu)', dir: 'digmug', stem: 'DigMug', file: 'public/data/songs/digital-mugician/believe.dmu',
    transform: emscriptenTransform, voices: 4, gridClock: false,
    parse: (b) => parseDigitalMugicianFile(ab(b), 'believe.dmu') },
  { name: 'Sound Factory (im maien.psf)', dir: 'soundfactory', stem: 'SoundFactory2', file: 'public/data/songs/soundfactory/im maien.psf',
    transform: emscriptenTransform, voices: 4, gridClock: false, maxOnsetLag: 1,
    parse: (b) => parseSoundFactoryFile(b, 'im maien.psf') as TrackerSong },
  { name: 'Sound Factory (oriental.psf)', dir: 'soundfactory', stem: 'SoundFactory2', file: 'public/data/songs/soundfactory/oriental.psf',
    transform: emscriptenTransform, voices: 4, gridClock: false, maxOnsetLag: 1,
    parse: (b) => parseSoundFactoryFile(b, 'oriental.psf') as TrackerSong },
  // Ben Daglish: the grid is the walk (one row per 50 Hz tick); the worklet has no per-voice buffers and no play
  // message, and the sample's DMA starts on the tick after the note is read (as on the Amiga): onset lag 1.
  { name: 'Ben Daglish (mickey_mouse.bd)', dir: 'bd', stem: 'Bd', file: 'public/data/songs/formats/mickey_mouse.bd',
    transform: emscriptenTransform, voices: 4, gridClock: false, isolate: true, noPlay: true, maxOnsetLag: 1,
    parse: async (b) => { const restore = installWasmNodeFetch('bd', 'Bd'); try { return await parseBenDaglishFile(ab(b), 'mickey_mouse.bd'); } finally { restore(); } } },
];

interface Report { frame: number; songPos: number; row: number }
interface Rendered { reports: Report[]; levels: number[][] }

const ab = (b: Uint8Array): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

/**
 * Render the real worklet and WASM, collecting each position post with the voice
 * levels of its block. A worklet without per-voice buffers (`isolate`) is rendered
 * once per voice with only that voice audible; the position posts are identical
 * on every pass, so the first pass's are kept.
 */
async function renderReports(c: Case, song: TrackerSong, bytes: Uint8Array, bank?: Uint8Array): Promise<Rendered> {
  loadSharedWorkletScripts();
  const passes = c.isolate ? c.voices : 1;
  let reports: Report[] = [];
  const levels: number[][] = [];
  for (let pass = 0; pass < passes; pass++) {
    const { proc, send, posted } = await startWorklet(c.dir, c.stem, c.transform);
    if (c.isolate) await send({ type: 'setMuteMask', mask: 1 << pass });
    const load: Record<string, unknown> = { type: 'loadModule', moduleData: ab(bytes) };
    if (bank) load.sampleData = ab(bank);
    await send(load);
    if (!c.noPlay) await send({ type: 'play' });
    const out = stereoOutputs(37);
    const passReports: Report[] = [];
    const reached = new Set<number>();
    let seen = 0;
    for (let blk = 0; blk < MAX_BLOCKS && reached.size < ORDER_POSITIONS_TO_COVER + 1; blk++) {
      proc.process([], out);
      const level = (v: number): number => {
        if (c.isolate) {
          let e = 0;
          for (let i = 0; i < BLOCK; i++) e += out[0][0][i] * out[0][0][i] + out[0][1][i] * out[0][1][i];
          return Math.sqrt(e / (2 * BLOCK));
        }
        const buf = (proc.chBufs as Float32Array[])[v];
        let e = 0;
        for (let i = 0; i < BLOCK; i++) e += buf[i] * buf[i];
        return Math.sqrt(e / BLOCK);
      };
      const row = c.isolate ? [level(pass)] : Array.from({ length: c.voices }, (_, v) => level(v));
      if (c.isolate) { (levels[blk] ??= [])[pass] = row[0]; } else levels.push(row);
      for (; seen < posted.length; seen++) {
        const p = posted[seen] as WorkletMsg & { songPos?: number; row?: number };
        if (p.type !== 'position') continue;
        passReports.push({ frame: blk * BLOCK, songPos: p.songPos!, row: p.row! });
        reached.add(p.songPos!);
      }
    }
    if (pass === 0) reports = passReports;
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
    const lag = c.maxOnsetLag ?? 0;
    const aligned = Math.max(...Array.from({ length: lag + 1 }, (_, k) => score(k))), early = score(-1), late = score(lag + 1);
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

/** NativeEngineRouting wires any engine instance that has onPositionUpdate; each descriptor's engine must have it. */
describe('every position-reporting replayer engine is wirable by NativeEngineRouting', () => {
  it.each([
    ['SoundMonReplayer', () => import('@/engine/soundmon/SoundMonEngine').then((m) => m.SoundMonEngine)],
    ['FutureComposerReplayer', () => import('@/engine/futurecomposer/FutureComposerEngine').then((m) => m.FutureComposerEngine)],
    ['SidMon2', () => import('@/engine/sidmon2/Sd2Engine').then((m) => m.Sd2Engine)],
    ['SoundFactory2Replayer', () => import('@/engine/soundfactory/SoundFactory2Engine').then((m) => m.SoundFactory2Engine)],
    ['BenDaglish', () => import('@/engine/bd/BdEngine').then((m) => m.BdEngine)],
  ])('%s has onPositionUpdate', async (_key, load) => {
    const Engine = await load();
    expect(typeof Engine.prototype.onPositionUpdate).toBe('function');
  });
});
