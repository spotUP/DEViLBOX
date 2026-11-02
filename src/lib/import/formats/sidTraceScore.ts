/**
 * Score a GoatTracker conversion of a SID trace: play the converted song
 * headless in the GTUltra WASM, snapshot the SID registers every frame and
 * compare with the original trace.
 *
 * Score = share of (frame, register) value CHANGES in the original that the
 * replay reproduces at the same frame. Frame snapshots are compared, not write
 * order. A +-1 frame tolerance is reported separately. Registers are compared
 * byte by byte and reported per class: freq, pulse, control, ADSR, filter.
 * The global alignment lag (-3..3 frames) that scores best is searched once
 * for the whole song and reported.
 */
import type { SidTrace } from './SIDParser';
import { writeGoatTrackerSng } from './GoatTrackerSid';
import type { SidTraceGoatTracker } from './sidTraceToGoatTracker';

export type RegisterClass = 'freq' | 'pulse' | 'control' | 'adsr' | 'filter';
export const REGISTER_CLASSES: RegisterClass[] = ['freq', 'pulse', 'control', 'adsr', 'filter'];

export interface ClassScore { changes: number; exact: number; tolerant: number }

export interface SidTraceScore {
  /** Exact share of register changes reproduced, 0..1 (1 when the original has no change). */
  score: number;
  /** Share reproduced within +-1 frame. */
  tolerantScore: number;
  lag: number;
  frames: number;
  changes: number;
  perClass: Record<RegisterClass, ClassScore>;
  /** Missed (frame, register) changes per register class, first few only. */
  firstMisses: Array<{ frame: number; chip: number; reg: number; want: number; got: number }>;
}

/**
 * Minimal headless GT engine: one SID register snapshot per frame. One engine
 * plays ONE song: the bridge's load/play/init never reset the channel state
 * (gplay.c initchannels is not called), so a second song would start with the
 * first song's freq, pulse and wave state. Create a new engine per song.
 */
export interface HeadlessGT {
  /** Registers of every chip per frame (chips * 32 bytes), `frames` frames of the song. Throws on a second call. */
  play(sng: Uint8Array, frames: number, chips: number, ntsc: boolean): Uint8Array[];
}

function classOf(reg: number): RegisterClass {
  if (reg >= 21) return 'filter';
  const r = reg % 7;
  if (r <= 1) return 'freq';
  if (r <= 3) return 'pulse';
  if (r === 4) return 'control';
  return 'adsr';
}

/** Load the GTUltra WASM bundle in node (vitest) and return a frame stepper. */
export async function createHeadlessGT(root = process.cwd()): Promise<HeadlessGT> {
  const { join } = await import('node:path');
  const { loadWebBundle } = await import('@/test/wasm/webBundle');
  interface GTModule {
    cwrap: (name: string, ret: string | null, args: string[]) => (...a: number[]) => number;
    _malloc: (n: number) => number;
    _free: (p: number) => void;
  }
  const dir = join(root, 'public/gtultra');
  const b = await loadWebBundle<GTModule>(join(dir, 'GTUltra.js'), join(dir, 'GTUltra.wasm'), 'createGTUltra');
  const m = b.module;
  const init = m.cwrap('gt_init', null, ['number', 'number']);
  const load = m.cwrap('gt_load_sng', 'number', ['number', 'number']);
  const play = m.cwrap('gt_play', null, ['number', 'number', 'number']);
  const stop = m.cwrap('gt_stop', null, []);
  const render = m.cwrap('gt_render_audio', null, ['number', 'number', 'number']);
  const regs = m.cwrap('gt_get_sid_registers', 'number', ['number']);
  init(44100, 0);
  let used = false;
  return {
    play(sng, frames, chips, ntsc) {
      if (used) throw new Error('HeadlessGT plays one song: create a new engine per song (channel state is not reset between songs)');
      used = true;
      const ptr = m._malloc(sng.length);
      b.heap().set(sng, ptr);
      const ok = load(ptr, sng.length);
      m._free(ptr);
      if (!ok) throw new Error('gt_load_sng refused the converted song');
      stop();
      play(0, 0, 0);
      const perFrame = Math.round(44100 / (ntsc ? 60 : 50));
      const pL = m._malloc(perFrame * 4), pR = m._malloc(perFrame * 4);
      const out: Uint8Array[] = [];
      for (let f = 0; f < frames; f++) {
        render(pL, pR, perFrame);
        const snap = new Uint8Array(chips * 32);
        for (let c = 0; c < chips; c++) {
          const p = regs(c);
          snap.set(b.heap().subarray(p, p + 32), c * 32);
        }
        out.push(snap);
      }
      m._free(pL); m._free(pR);
      stop();
      return out;
    },
  };
}

/**
 * Bits the SID ignores: GT writes the pan nibble into the pulse-high registers
 * (gplay.c) and players leave garbage in their high nibble; 0x15 holds only
 * cutoff bits 0..2.
 */
function regMask(reg: number): number {
  if (reg === 3 || reg === 10 || reg === 17) return 0x0f;
  if (reg === 21) return 0x07;
  return 0xff;
}

function scoreAtLag(orig: Uint8Array[], got: Uint8Array[], lag: number, chips: number, frameBase: number, firstMisses: SidTraceScore['firstMisses'] | null): Omit<SidTraceScore, 'lag' | 'firstMisses' | 'frames'> {
  const perClass = {} as Record<RegisterClass, ClassScore>;
  for (const c of REGISTER_CLASSES) perClass[c] = { changes: 0, exact: 0, tolerant: 0 };
  let changes = 0, exact = 0, tolerant = 0;
  for (let f = 0; f < orig.length; f++) {
    const g = f - lag;
    if (g < 0 || g >= got.length) continue;
    for (let chip = 0; chip < chips; chip++) {
      for (let reg = 0; reg < 25; reg++) {
        const i = chip * 32 + reg;
        const mask = regMask(reg);
        const want = orig[f][i] & mask;
        const before = f > 0 ? orig[f - 1][i] & mask : 0;
        if (want === before) continue;
        changes++;
        const cls = perClass[classOf(reg)];
        cls.changes++;
        const hit = (got[g][i] & mask) === want;
        const near = hit || (g > 0 && (got[g - 1][i] & mask) === want) || (g + 1 < got.length && (got[g + 1][i] & mask) === want);
        if (hit) { exact++; cls.exact++; }
        if (near) { tolerant++; cls.tolerant++; }
        if (!hit && firstMisses && firstMisses.length < 12) firstMisses.push({ frame: f + frameBase, chip, reg, want, got: got[g][i] & mask });
      }
    }
  }
  return { score: changes ? exact / changes : 1, tolerantScore: changes ? tolerant / changes : 1, changes, perClass };
}

export function scoreSidTrace(trace: SidTrace, built: SidTraceGoatTracker, gt: HeadlessGT, maxFrames = trace.frames): SidTraceScore {
  const frames = Math.min(trace.frames, maxFrames);
  const sng = writeGoatTrackerSng(built.song, built.settings);
  // GT snapshot i is trace frame i + frameOffset; the offset is negative when
  // the replay's startup latency is longer than the trace's lead-in.
  const off = built.frameOffset;
  const all = gt.play(sng, Math.max(0, frames - off + 4), trace.chips, built.settings.ntsc);
  const got = all.slice(Math.max(0, -off));
  const frameBase = Math.max(0, off);
  const orig = trace.chipRegs.slice(frameBase, frames);
  let bestLag = 0, best = -1;
  for (let lag = -3; lag <= 3; lag++) {
    const s = scoreAtLag(orig, got, lag, trace.chips, frameBase, null);
    if (s.score > best) { best = s.score; bestLag = lag; }
  }
  const firstMisses: SidTraceScore['firstMisses'] = [];
  const r = scoreAtLag(orig, got, bestLag, trace.chips, frameBase, firstMisses);
  return { ...r, lag: bestLag, frames: orig.length, firstMisses };
}
