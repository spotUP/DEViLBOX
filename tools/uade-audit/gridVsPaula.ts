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
 *   npx tsx --tsconfig tsconfig.app.json tools/uade-audit/gridVsPaula.ts <file> [<file> ...] [--secs N]
 *
 * Paula is read to the song's end (UADE, looping off); --secs N caps it.
 *
 * The UADE import's scan grid (a UADE-only format, or a native parser that
 * falls back to it) needs the worklet. Dump that grid's note sequence per
 * channel to JSON ({ "<basename>": number[][] }) and pass it with
 * --grid-json FILE; a file named there is scored against that grid instead
 * of its native parser's.
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
import { periodToPitch } from '../../src/lib/amiga/periodNotes';
import { addCompanions, loadUADEModule, refreshHeap, type UADEModule } from './uadeRenderCore';

interface LogModule extends UADEModule {
  _uade_wasm_enable_paula_log(on: number): void;
  _uade_wasm_get_paula_log(outPtr: number, max: number): number;
  _uade_wasm_set_subsong?(n: number): void;
}

const args = process.argv.slice(2);
const secsIdx = args.indexOf('--secs');
// The grid holds the whole song, so Paula is read to the song's end by
// default; --secs caps it. (Before 2026-10-05 the render loop added
// uade_wasm_render's return value - 1, not a frame count - to its clock, so
// every run read the whole song whatever --secs said.)
const SECS = secsIdx >= 0 ? Number(args[secsIdx + 1]) : 900;
const gridJsonIdx = args.indexOf('--grid-json');
const GRID_JSON: Record<string, number[][]> = gridJsonIdx >= 0 ? JSON.parse(readFileSync(args[gridJsonIdx + 1], 'utf8')) : {};
const optionValues = new Set([secsIdx, gridJsonIdx].filter((i) => i >= 0).map((i) => i + 1));
const files = args.filter((a, i) => !a.startsWith('--') && !optionValues.has(i));

/**
 * Paula note-on rules - one function each, applied per voice in log order.
 *
 *   isSampleStart  - an AUDxLCH/LCL write arms the voice: on the Amiga a
 *                    note starts with a new sample pointer.
 *   isNotePeriod   - the next AUDxPER write on an armed voice, inside the
 *                    range Paula can play, is the note's pitch. A period
 *                    write on an unarmed voice is never a note: players
 *                    that rewrite the period on every tick (Mugician, Tomy
 *                    Tracker) and effects (arpeggio, vibrato, portamento)
 *                    only move the pitch.
 *   isLoopReload   - the first sample start after a note-on, written
 *                    before the voice's period has been written again, is
 *                    the player pointing AUDxLC at the sample's loop once
 *                    DMA has latched the start (Mugician writes it on the
 *                    tick after every sampled note, then rewrites the
 *                    period; ProTracker writes it in the same tick). It
 *                    does not arm the voice. Only one per note-on: the next
 *                    sample start is a new note even when no period write
 *                    came between (a player that writes the period only on
 *                    note rows, repeating a note).
 *   isTickRewrite  - a sample start followed by the voice's current period,
 *                    within REWRITE_MS (one 50 Hz tick plus the clock's
 *                    10 ms grain) of the voice's previous trigger, is the
 *                    player restarting the same note's waveform on every
 *                    tick (SoundMon, Delta Music synth voices), not a new
 *                    note. Chained: each rewrite restarts the window. The
 *                    price: a note repeated at the same pitch one tick
 *                    later reads as one note.
 *   isStrictBurst  - the second reading: a period write that directly
 *                    follows that voice's own LCH, LCL, LEN writes, with no
 *                    write to any other register or voice in between (the
 *                    note-trigger burst of one voice). It catches players
 *                    that rewrite the loop pointer on every row (Tomy
 *                    Tracker); it misses players that write LC for all voices
 *                    before any period, or the volume between LEN and PER
 *                    (Mugician).
 * Each channel is scored against both readings and keeps the better one
 * (the strict one only when it is not a handful of stray bursts - see the
 * scoring loop). Pitches are read through src/lib/amiga/periodNotes.ts
 * periodToPitch, unbounded, so a period below C-0 (Mugician goes to 3220)
 * still has its own pitch instead of being clamped onto its neighbours.
 */
interface PaulaNotes { loose: number[][]; strict: number[][] }

/** Periods Paula can sound: 60 (beyond the DMA limit, written by some players) .. 7000 (below any real note). */
/** Render granularity: 441 frames = 10 ms, the grain of every write's time. */
const CHUNK_FRAMES = 441;
const MS_PER_CHUNK = (CHUNK_FRAMES / 44100) * 1000;
/** One 50 Hz tick (20 ms) plus the clock grain. */
const REWRITE_MS = 25;
const MIN_PERIOD = 60, MAX_PERIOD = 7000;

const REG_LCH = 0, REG_LCL = 1, REG_LEN = 2, REG_PER = 3;

interface VoiceState {
  armed: boolean;
  /** A note-on happened and the voice's period has not been written since. */
  noPeriodSinceOn: boolean;
  /** This note-on's loop reload has been seen. */
  reloadSeen: boolean;
  /** The sample start being written (LCH then LCL) is a loop reload. */
  inReload: boolean;
  lastReg: number;
  /** Time and period of the voice's last trigger (a note-on or a tick rewrite). */
  lastTriggerMs: number;
  lastPeriod: number;
}

function isSampleStart(reg: number): boolean {
  return reg === REG_LCH || reg === REG_LCL;
}
function isNotePeriod(v: VoiceState, reg: number, period: number): boolean {
  return reg === REG_PER && v.armed && period >= MIN_PERIOD && period <= MAX_PERIOD;
}
/** Called on a sample-start write; the LCL of an LCH/LCL pair shares the LCH's verdict. */
function isLoopReload(v: VoiceState, reg: number): boolean {
  if (reg === REG_LCL && v.lastReg === REG_LCH) return v.inReload;
  return v.noPeriodSinceOn && !v.reloadSeen;
}
function isTickRewrite(v: VoiceState, nowMs: number, period: number): boolean {
  return period === v.lastPeriod && nowMs - v.lastTriggerMs <= REWRITE_MS;
}
/** `recent` = the three writes before this one, globally, as (channel << 8 | reg). */
function isStrictBurst(recent: readonly number[], ch: number, reg: number, period: number): boolean {
  return reg === REG_PER && period >= MIN_PERIOD && period <= MAX_PERIOD
    && recent[0] === (ch << 8 | REG_LCH) && recent[1] === (ch << 8 | REG_LCL) && recent[2] === (ch << 8 | REG_LEN);
}

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
  const pL = mod._malloc(CHUNK_FRAMES * 4), pR = mod._malloc(CHUNK_FRAMES * 4);
  const logPtr = mod._malloc(512 * 3 * 4);
  const loose: number[][] = [[], [], [], []];
  const strict: number[][] = [[], [], [], []];
  const voices: VoiceState[] = [0, 1, 2, 3].map(() => ({
    armed: false, noPeriodSinceOn: false, reloadSeen: false, inReload: false, lastReg: -1,
    lastTriggerMs: -Infinity, lastPeriod: 0,
  }));
  const recent = [-1, -1, -1];
  const drain = (nowMs: number): void => {
    const n = mod._uade_wasm_get_paula_log(logPtr, 512);
    refreshHeap(mod);
    const u32 = new Uint32Array(mod.HEAPU8.buffer, logPtr, n * 3);
    for (let i = 0; i < n; i++) {
      const w = u32[i * 3];
      const ch = w >>> 24, reg = (w >>> 16) & 0xff, value = w & 0xffff;
      const burst = ch <= 3 && isStrictBurst(recent, ch, reg, value);
      recent.shift(); recent.push(ch << 8 | reg);
      if (ch > 3) continue;
      if (burst) strict[ch].push(periodToPitch(value));
      const v = voices[ch];
      if (isSampleStart(reg)) {
        v.inReload = isLoopReload(v, reg);
        if (v.inReload) v.reloadSeen = true; else v.armed = true;
      } else if (isNotePeriod(v, reg, value)) {
        v.armed = false;
        const rewrite = isTickRewrite(v, nowMs, value);
        v.lastTriggerMs = nowMs;
        v.lastPeriod = value;
        if (rewrite) {
          v.noPeriodSinceOn = false;
        } else {
          loose[ch].push(periodToPitch(value));
          v.noPeriodSinceOn = true;
          v.reloadSeen = false;
        }
      } else if (reg === REG_PER) {
        v.noPeriodSinceOn = false;
      }
      v.lastReg = reg;
    }
  };
  // uade_wasm_render returns 1 while playing and 0 at the song end - not a
  // frame count - so the clock advances by the frames asked for.
  let chunks = 0;
  for (let frames = 0; frames < 44100 * SECS; frames += CHUNK_FRAMES) {
    if (mod._uade_wasm_render(pL, pR, CHUNK_FRAMES) <= 0) break;
    drain(++chunks * MS_PER_CHUNK);
  }
  drain(chunks * MS_PER_CHUNK);
  mod._uade_wasm_enable_paula_log(0);
  mod._free(pL); mod._free(pR); mod._free(logPtr);
  mod._uade_wasm_stop();
  return { loose, strict };
}

/** The grid's note sequence per channel, in song order. */
async function gridNotes(data: Uint8Array, name: string): Promise<{ format: string; notes: number[][] } | null> {
  if (GRID_JSON[name]) return { format: 'grid-json', notes: GRID_JSON[name] };
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
  const dp = new Uint32Array(b.length + 1);
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
/**
 * 0..1: how much of the shorter interval sequence the other contains, in
 * order. The grid holds the whole song and Paula only --secs of it, so the
 * longer side is cut to the span the shorter one can cover (SPAN_SLACK times
 * its length): a long voice is compared over its whole run, not its first
 * few hundred notes, and a short one is not matched against stray intervals
 * from the far end of the song.
 */
const SPAN_SLACK = 1.25;
function score(a: number[], b: number[]): number {
  const ia = intervals(a), ib = intervals(b);
  const n = Math.min(ia.length, ib.length);
  if (n < 4) return 0;
  const span = Math.ceil(n * SPAN_SLACK) + 8;
  return lcs(ia.slice(0, span), ib.slice(0, span)) / n;
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
