#!/usr/bin/env npx tsx
/**
 * gridVsPaula.ts — does the parsed grid say what the player plays?
 *
 * For an "Incorrect Pattern Data" verdict the ear is the wrong instrument:
 * the question is whether the native parser's grid matches the notes the
 * emulated player actually writes to Paula. This renders the file through
 * UADE with the Paula write log on, turns AUDxPER writes into a note-event
 * sequence per voice, takes the grid's note sequence per channel from the
 * registry's own parser (`detectFormatFromContent` + `nativeParser`), and
 * scores the two as the longest common subsequence of their INTERVAL
 * sequences (note-to-note semitone steps), so a parser that shows the right
 * tune an octave off, or in another base, still scores high while a parser
 * that shows carrier bytes as notes scores near zero.
 *
 *   npx tsx --tsconfig tsconfig.app.json tools/uade-audit/gridVsPaula.ts <file> [<file> ...] [--secs 20]
 *
 * Output per file: channels, grid events, Paula events, score 0..1 per
 * channel pairing (best assignment of grid channels to voices), and the first
 * 16 intervals of each so a mismatch can be read. The 2026-10-05
 * broken-formats sweep (sweep 2) uses it on the owner's verdicts.
 *
 * OTHER AUDIT SCRIPTS: see the header of tools/playback-smoke-test.ts.
 */
import { readFileSync, readdirSync } from 'fs';
import { basename, dirname, join } from 'path';
import { listingFromRelativePaths, resolveCompanions } from '../../src/lib/import/companionResolver';
import { detectFormatFromContent } from '../../src/lib/import/FormatRegistry';
import { periodToPtNote } from '../../src/lib/amiga/periodNotes';
import { addCompanions, loadUADEModule, refreshHeap, type UADEModule } from './uadeRenderCore';

interface LogModule extends UADEModule {
  _uade_wasm_enable_paula_log(on: number): void;
  _uade_wasm_get_paula_log(outPtr: number, max: number): number;
  _uade_wasm_set_subsong?(n: number): void;
}

const args = process.argv.slice(2);
const secsIdx = args.indexOf('--secs');
const SECS = secsIdx >= 0 ? Number(args[secsIdx + 1]) : 20;
const files = args.filter((a, i) => !a.startsWith('--') && (secsIdx < 0 || i !== secsIdx + 1));

/**
 * Note-on events per Paula voice, in two readings:
 *   loose  - a period write after a sample start (AUDxLC) on that voice;
 *   strict - a period write that directly follows that voice's own
 *            LCH, LCL, LEN writes, with no write to any other register or
 *            voice in between (the note-trigger burst of one voice).
 * The loose reading over-counts on players that rewrite the loop pointer
 * into AUDxLC after every row's DMA restart AND the period on every row
 * (Tomy Tracker: every row then reads as a note-on); the strict reading
 * misses players that write LC for all voices before any period. Each
 * channel is scored against both and keeps the better one (the strict one
 * only when it is not a handful of stray bursts - see the scoring loop).
 */
interface PaulaNotes { loose: number[][]; strict: number[][] }
async function paulaNotes(mod: LogModule, data: Uint8Array, name: string, dir: string): Promise<PaulaNotes> {
  // The sidecars the app itself would load (smpl.<tune>, instruments/, ...).
  const listing = listingFromRelativePaths(readdirSync(dir));
  const resolved = resolveCompanions(name, listing);
  addCompanions(mod, resolved.companions.map((c) => ({ name: c, data: readFileSync(join(dir, c)) })));
  const ptr = mod._malloc(data.byteLength);
  refreshHeap(mod);
  mod.HEAPU8.set(data, ptr);
  const hintLen = name.length * 4 + 1;
  const hintPtr = mod._malloc(hintLen);
  mod.stringToUTF8(name, hintPtr, hintLen);
  mod._uade_wasm_stop();
  mod._uade_wasm_set_looping(0);
  mod._uade_wasm_set_one_subsong(1);
  const ret = mod._uade_wasm_load(ptr, data.byteLength, hintPtr);
  mod._free(ptr); mod._free(hintPtr);
  if (ret !== 0) throw new Error(`UADE refused ${name} (ret=${ret})`);
  mod._uade_wasm_enable_paula_log(1);
  const chunk = 2048;
  const pL = mod._malloc(chunk * 4), pR = mod._malloc(chunk * 4);
  const logPtr = mod._malloc(512 * 3 * 4);
  const notes: number[][] = [[], [], [], []];
  const strict: number[][] = [[], [], [], []];
  const last = [0, 0, 0, 0];
  /** The last three writes, globally, as (channel << 8 | reg); -1 = none. */
  const recent = [-1, -1, -1];
  // A note-on on the Amiga is a new sample start (AUDxLCH/LCL) followed by
  // the period; a period write alone is an effect (arpeggio, vibrato,
  // portamento) and is not a grid note. `armed` remembers the LC write.
  const armed = [false, false, false, false];
  const drain = (): void => {
    const n = mod._uade_wasm_get_paula_log(logPtr, 512);
    refreshHeap(mod);
    const u32 = new Uint32Array(mod.HEAPU8.buffer, logPtr, n * 3);
    for (let i = 0; i < n; i++) {
      const w = u32[i * 3];
      const ch = w >>> 24, reg = (w >>> 16) & 0xff, value = w & 0xffff;
      const burst = recent[0] === (ch << 8 | 0) && recent[1] === (ch << 8 | 1) && recent[2] === (ch << 8 | 2);
      recent.shift(); recent.push(ch << 8 | reg);
      if (ch > 3) continue;
      if (burst && reg === 3 && value >= 108 && value <= 907) {
        const note = periodToPtNote(value);
        if (note > 0) strict[ch].push(note);
      }
      if (reg === 0 || reg === 1) { armed[ch] = true; continue; }
      if (reg !== 3 || value < 108 || value > 907) continue; // AUDxPER in the 3-octave ProTracker range
      if (!armed[ch]) continue;
      armed[ch] = false;
      const note = periodToPtNote(value);
      if (note > 0) { notes[ch].push(note); last[ch] = note; }
    }
  };
  for (let frames = 0; frames < 44100 * SECS;) {
    const got = mod._uade_wasm_render(pL, pR, chunk);
    if (got <= 0) break;
    frames += got;
    drain();
  }
  drain();
  mod._uade_wasm_enable_paula_log(0);
  mod._free(pL); mod._free(pR); mod._free(logPtr);
  mod._uade_wasm_stop();
  return { loose: notes, strict };
}

/** The grid's note sequence per channel, in song order. */
async function gridNotes(data: Uint8Array, name: string): Promise<{ format: string; notes: number[][] } | null> {
  const fmt = detectFormatFromContent(name, data.subarray(0, 128));
  if (!fmt?.nativeParser) return null;
  const modPath = fmt.nativeParser.module.replace('@lib/', `${process.cwd()}/src/lib/`);
  const m = await import(modPath);
  const parse = m[fmt.nativeParser.parseFn];
  if (typeof parse !== 'function') return null;
  const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  const song = await parse(buf, name);
  if (!song?.patterns) return null;
  const order: number[] = song.songPositions?.length ? song.songPositions : song.patterns.map((_: unknown, i: number) => i);
  const notes: number[][] = Array.from({ length: song.numChannels ?? song.patterns[0].channels.length }, () => []);
  const last = notes.map(() => 0);
  for (const p of order) {
    const pat = song.patterns[p]; if (!pat) continue;
    pat.channels.forEach((c: { rows: { note: number }[] }, ch: number) => {
      for (const r of c.rows) if (r.note > 0 && r.note < 97) { notes[ch].push(r.note); last[ch] = r.note; }
    });
  }
  return { format: fmt.key, notes };
}

const intervals = (seq: number[]): number[] => seq.slice(1).map((n, i) => n - seq[i]);
function lcs(a: number[], b: number[]): number {
  const dp = new Uint16Array((b.length + 1));
  for (let i = 1; i <= a.length; i++) {
    let prev = 0;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[b.length];
}
/** 0..1: how much of the shorter interval sequence the other contains, in order. */
function score(a: number[], b: number[]): number {
  const ia = intervals(a).slice(0, 400), ib = intervals(b).slice(0, 400);
  const n = Math.min(ia.length, ib.length);
  return n < 4 ? 0 : lcs(ia, ib) / n;
}

(async () => {
  const mod = (await loadUADEModule(false)) as LogModule;
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('uade init failed');
  for (const f of files) {
    const data = new Uint8Array(readFileSync(f));
    const name = basename(f);
    let grid: Awaited<ReturnType<typeof gridNotes>> = null;
    try { grid = await gridNotes(data, name); } catch (e) { console.log(`${name}: parser threw: ${String((e as Error).message).slice(0, 100)}`); continue; }
    if (!grid) { console.log(`${name}: no native parser / no grid`); continue; }
    let paula: PaulaNotes;
    try { paula = await paulaNotes(mod, data, name, dirname(f)); } catch (e) { console.log(`${name}: ${(e as Error).message}`); continue; }
    const voices = paula.loose.map((v, i) => `${v.length}(${paula.strict[i].length})`);
    console.log(`${name} [${grid.format}]: grid channels=${grid.notes.length} events=${grid.notes.map((c) => c.length).join('/')}; paula voices events=${voices.join('/')} (strict in brackets)`);
    for (let ch = 0; ch < grid.notes.length; ch++) {
      const g = grid.notes[ch];
      let best = 0, bestV = -1, bestSeq: number[] = [], bestRead = '';
      for (let v = 0; v < 4; v++) {
        for (const [read, seq] of [['loose', paula.loose[v]], ['strict', paula.strict[v]]] as const) {
          // The score normalises by the shorter sequence, so a strict reading
          // that caught only a handful of bursts would fit any grid; it only
          // counts when it holds at least half as many notes as the grid.
          if (read === 'strict' && seq.length * 2 < g.length) continue;
          const s = score(g, seq);
          if (s > best) { best = s; bestV = v; bestSeq = seq; bestRead = read; }
        }
      }
      const show = (s: number[]) => intervals(s).slice(0, 16).join(',');
      console.log(`  ch${ch}: best voice ${bestV} score ${best.toFixed(2)}${bestRead ? ` (${bestRead})` : ''}  grid[${show(g)}]  paula[${show(bestSeq)}]`);
    }
  }
  try { mod._uade_wasm_cleanup(); } catch { /* a refused load leaves the core in a state cleanup traps on */ }
})();
