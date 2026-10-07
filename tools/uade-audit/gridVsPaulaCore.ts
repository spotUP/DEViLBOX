/**
 * gridVsPaulaCore.ts - the Paula note-on reader and the interval-sequence score
 * shared by tools/uade-audit/gridVsPaula.ts (CLI) and the grid sweep tests.
 * Nothing here runs on import.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { listingFromRelativePaths, resolveCompanions } from '../../src/lib/import/companionResolver';
import { periodToPitch } from '../../src/lib/amiga/periodNotes';
import { addCompanions, refreshHeap, type UADEModule } from './uadeRenderCore';

export interface LogModule extends UADEModule {
  _uade_wasm_enable_paula_log(on: number): void;
  _uade_wasm_get_paula_log(outPtr: number, max: number): number;
  _uade_wasm_set_subsong?(n: number): void;
}

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
export interface PaulaNotes { loose: number[][]; strict: number[][] }

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

export async function paulaNotes(mod: LogModule, data: Uint8Array, name: string, dir: string, secs = 900): Promise<PaulaNotes> {
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
  for (let frames = 0; frames < 44100 * secs; frames += CHUNK_FRAMES) {
    if (mod._uade_wasm_render(pL, pR, CHUNK_FRAMES) <= 0) break;
    drain(++chunks * MS_PER_CHUNK);
  }
  drain(chunks * MS_PER_CHUNK);
  mod._uade_wasm_enable_paula_log(0);
  mod._free(pL); mod._free(pR); mod._free(logPtr);
  mod._uade_wasm_stop();
  return { loose, strict };
}

export const intervals = (seq: number[]): number[] => seq.slice(1).map((n, i) => n - seq[i]);
export function lcs(a: number[], b: number[]): number {
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
export function score(a: number[], b: number[]): number {
  const ia = intervals(a), ib = intervals(b);
  const n = Math.min(ia.length, ib.length);
  if (n < 4) return 0;
  const span = Math.ceil(n * SPAN_SLACK) + 8;
  return lcs(ia.slice(0, span), ib.slice(0, span)) / n;
}

