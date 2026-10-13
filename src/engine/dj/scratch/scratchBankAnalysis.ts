/**
 * The demo's bank analyzer (ledger R3, scratch_bank.py :115-353) and its phrase auto-cue (R5, scratch_routine.py
 * :55-159), ported line for line: `analyze` (duration, centroid, voiced / noise amount, transients, onset rate, pitch
 * flips, the pre-scratched verdict), `_cue_points` (attack, the voiced vowel, tail, the 6 % envelope safe range),
 * `_flux_onsets` + `split_words` (word slices of a phrase), `load_bank`'s classification of one file
 * (`FILENAME_MAP`, `CATEGORY_RECS`), and `_voiced_anchor` / `_cue` / `_detect_onsets` / `load_wav_cues`.
 *
 * numpy's pieces as the demo uses them: `np.fft.rfft` magnitudes (a radix-2 FFT for powers of two, else the DFT
 * from tables), `np.hanning`, `np.convolve(x, ones(w) / w, "same")`, `np.diff(np.sign(.))`.
 */

import { TT_RATE } from '@/engine/turntable/turntableSim';
import { demoResample, s950 } from './scratchGrit';

const RATE = TT_RATE;

/** Reachability sentinels: analyses run (a record analysed at load), phrase WAVs auto-cued. */
export const bankAnalysisStats = { analyzeRecord: 0, wavCues: 0 };

// ── numpy pieces ────────────────────────────────────────────────────────────

/** `np.hanning(M)`. */
export function hanning(M: number): Float64Array {
  const w = new Float64Array(Math.max(0, M));
  if (M === 1) { w[0] = 1; return w; }
  for (let n = 0; n < M; n++) w[n] = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (M - 1));
  return w;
}

const dftTables = new Map<number, { cos: Float64Array; sin: Float64Array }>();

/** `np.abs(np.fft.rfft(x))`. */
export function rfftMag(x: ArrayLike<number>): Float64Array {
  const N = x.length;
  const K = Math.floor(N / 2) + 1;
  const out = new Float64Array(K);
  if (N === 0) return out;
  if ((N & (N - 1)) === 0) {
    // iterative radix-2
    const re = Float64Array.from(x), im = new Float64Array(N);
    for (let i = 1, j = 0; i < N; i++) {
      let bit = N >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { const t = re[i]!; re[i] = re[j]!; re[j] = t; }
    }
    for (let len = 2; len <= N; len <<= 1) {
      const ang = (-2 * Math.PI) / len;
      for (let i = 0; i < N; i += len) {
        for (let k = 0; k < len / 2; k++) {
          const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
          const a = i + k, b = a + len / 2;
          const xr = re[b]! * wr - im[b]! * wi, xi = re[b]! * wi + im[b]! * wr;
          re[b] = re[a]! - xr; im[b] = im[a]! - xi;
          re[a] = re[a]! + xr; im[a] = im[a]! + xi;
        }
      }
    }
    for (let k = 0; k < K; k++) out[k] = Math.hypot(re[k]!, im[k]!);
    return out;
  }
  let t = dftTables.get(N);
  if (!t) {
    t = { cos: new Float64Array(N), sin: new Float64Array(N) };
    for (let i = 0; i < N; i++) { t.cos[i] = Math.cos((2 * Math.PI * i) / N); t.sin[i] = Math.sin((2 * Math.PI * i) / N); }
    dftTables.set(N, t);
  }
  for (let k = 0; k < K; k++) {
    let re = 0, im = 0;
    for (let n = 0, idx = 0; n < N; n++, idx = (idx + k) % N) { re += x[n]! * t.cos[idx]!; im -= x[n]! * t.sin[idx]!; }
    out[k] = Math.hypot(re, im);
  }
  return out;
}

/** `np.convolve(x, np.ones(w) / w, "same")` (len(x) >= w). */
export function boxSame(x: ArrayLike<number>, w: number): Float64Array {
  const n = x.length, h = 1 / w, c = (w - 1) >> 1;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    const hiK = Math.min(w - 1, i + c), loK = Math.max(0, i + c - (n - 1));
    for (let k = loK; k <= hiK; k++) s += x[i + c - k]! * h;
    out[i] = s;
  }
  return out;
}

const mean = (x: ArrayLike<number>, a: number, b: number, f: (v: number) => number): number => {
  let s = 0;
  for (let i = a; i < b; i++) s += f(x[i]!);
  return s / Math.max(1, b - a);
};

/** sqrt(mean(f * f)) of d[a:b]. */
const rmsOf = (d: ArrayLike<number>, a: number, b: number): number => Math.sqrt(mean(d, a, b, (v) => v * v));

/** mean(|diff(sign(f))|) / 2 of d[a:b]: the zero-crossing rate. */
function zcrOf(d: ArrayLike<number>, a: number, b: number): number {
  if (b - a < 2) return NaN;
  let s = 0;
  for (let i = a + 1; i < b; i++) s += Math.abs(Math.sign(d[i]!) - Math.sign(d[i - 1]!));
  return s / (b - a - 1) / 2.0;
}

/** `_frames(d, rate, fl, hop)`: frame starts and ends. */
function frames(n: number, rate: number, fl = 0.02, hop = 0.01): Array<[number, number]> {
  const f = Math.trunc(fl * rate), h = Math.trunc(hop * rate);
  const out: Array<[number, number]> = [];
  for (let i = 0; i < Math.max(1, n - f); i += h) out.push([i, Math.min(n, i + f)]);
  return out;
}

/** Python `round(x, nd)`: the nearest, a tie (an exactly representable half) to even. */
export function pyRound(x: number, nd = 0): number {
  const m = 10 ** nd, y = x * m;
  const r = Math.round(y);
  if (Math.abs(y - Math.trunc(y)) === 0.5 && r % 2 !== 0) return (r - 1) / m;
  return Number(x.toFixed(nd));
}

// ── analyze / _cue_points (R3) ─────────────────────────────────────────────

export interface BankAnalysis {
  durationMs: number; centroid: number; voicedAmount: number; noiseAmount: number;
  transientCount: number; onsetRate: number; pitchFlipRate: number; preScratched: boolean;
}

/** `analyze(d, rate)`: acoustic features and the clean-vs-pre-scratched estimate (unrounded; `bankEntry` rounds). */
export function analyze(d: ArrayLike<number>, rate = RATE): BankAnalysis {
  const n = d.length, dur = n / rate;
  let voiced = 0, total = 0;
  const cens: number[] = [];
  for (const [a, b] of frames(n, rate)) {
    const e = rmsOf(d, a, b);
    if (e < 0.02) continue;
    total++;
    const z = zcrOf(d, a, b);
    const len = b - a, win = hanning(len), f = new Float64Array(len);
    for (let i = 0; i < len; i++) f[i] = d[a + i]! * win[i]!;
    const sp = rfftMag(f);
    let num = 0, den = 0;
    for (let k = 0; k < sp.length; k++) { num += ((k * rate) / len) * sp[k]!; den += sp[k]!; }
    cens.push(num / (den + 1e-9));
    if (z < 0.18) voiced++;
  }
  const voicedAmount = voiced / Math.max(1, total);
  const centroid = cens.length ? cens.reduce((s, v) => s + v, 0) / cens.length : 0.0;
  // transients: envelope-derivative peaks
  const abs = new Float64Array(n);
  for (let i = 0; i < n; i++) abs[i] = Math.abs(d[i]!);
  const env = boxSame(abs, Math.trunc(0.005 * rate));
  const de = new Float64Array(Math.max(0, n - 1));
  let deMax = -Infinity;
  for (let i = 0; i < de.length; i++) { const v = env[i + 1]! - env[i]!; de[i] = v < 0 ? 0 : v; deMax = Math.max(deMax, de[i]!); }
  const thr = de.length ? deMax * 0.4 : 1;
  let tr = 0, last = -1;
  const gap = Math.trunc(0.05 * rate);
  for (let i = 1; i < de.length - 1; i++) {
    if (de[i]! > thr && de[i]! >= de[i - 1]! && de[i]! > de[i + 1]! && (last < 0 || i - last > gap)) { tr++; last = i; }
  }
  const onsetRate = tr / Math.max(0.1, dur);
  let flips = 0;
  if (cens.length > 4) {
    const dc = cens.slice(1).map((v, i) => v - cens[i]!);
    for (let i = 1; i < dc.length; i++) if (Math.abs(Math.sign(dc[i]!) - Math.sign(dc[i - 1]!)) > 0) flips++;
  }
  const flipRate = flips / Math.max(0.1, dur);
  return {
    durationMs: dur * 1000, centroid, voicedAmount, noiseAmount: 1 - voicedAmount,
    transientCount: tr, onsetRate, pitchFlipRate: flipRate, preScratched: flipRate > 22.0 && onsetRate > 6.0,
  };
}

export interface BankCuePoints {
  attack: number; vowel: number; tail: number;
  safe: [number, number]; safeForward: [number, number]; safeReverse: [number, number];
}

/** `_cue_points(d, rate)`: attack (first voiced onset), vowel (the loudest voiced frame), tail, the safe ranges. */
export function cuePoints(d: ArrayLike<number>, rate = RATE): BankCuePoints {
  const n = d.length;
  const fl = Math.trunc(0.02 * rate);
  let best = Math.floor(n / 2), bestE = -1.0;
  let firstVoiced: number | null = null;
  const abs = new Float64Array(n);
  for (let i = 0; i < n; i++) abs[i] = Math.abs(d[i]!);
  const eEnv = boxSame(abs, Math.max(1, Math.floor(n / 200)));
  for (const [a, b] of frames(n, rate)) {
    const e = rmsOf(d, a, b);
    const z = zcrOf(d, a, b);
    if (e > 0.03 && z < 0.18) {
      if (firstVoiced === null) firstVoiced = a;
      if (e > bestE) { bestE = e; best = a + Math.floor(fl / 2); }
    }
  }
  return envelopeCues(eEnv, n, best, firstVoiced);
}

/** The 6 % envelope range and the clipped anchor (shared by `_cue_points` and `_cue`). */
function envelopeCues(eEnv: Float64Array, n: number, best: number, firstVoiced: number | null): BankCuePoints {
  let mx = -Infinity;
  for (let i = 0; i < eEnv.length; i++) mx = Math.max(mx, eEnv[i]!);
  const thr = mx * 0.06;
  let lo = -1, hi = -1;
  for (let i = 0; i < eEnv.length; i++) if (eEnv[i]! > thr) { if (lo < 0) lo = i; hi = i; }
  if (lo < 0) { lo = 0; hi = n - 1; }
  const vowel = Math.min(Math.max(best, lo), hi);
  const attack = firstVoiced ?? lo;
  return { attack, vowel, tail: hi, safe: [lo, Math.max(lo + 2, hi)], safeForward: [vowel, hi], safeReverse: [lo, vowel] };
}

/** Spectral flux over 1024-sample Hann frames, hop 256: [flux, frame start] (shared by both detectors). */
function spectralFlux(d: ArrayLike<number>, frameStarts: number[]): number[] {
  const win = 1024, w = hanning(win);
  let prev: Float64Array = new Float64Array(win / 2 + 1);
  const sf: number[] = [];
  const f = new Float64Array(win);
  for (const i of frameStarts) {
    for (let k = 0; k < win; k++) f[k] = (d[i + k] ?? 0) * w[k]!;
    const sp = rfftMag(f);
    let s = 0;
    for (let k = 0; k < sp.length; k++) s += Math.max(0.0, sp[k]! - prev[k]!);
    sf.push(s);
    prev = sp;
  }
  return sf;
}

/** `_flux_onsets(d, rate)`: word / syllable starts in continuous speech (sample indices). */
export function fluxOnsets(d: ArrayLike<number>, rate = RATE): number[] {
  const win = 1024, hop = 256;
  const starts: number[] = [];
  for (let i = 0; i < Math.max(1, d.length - win); i += hop) starts.push(i);
  if (d.length < win) return [];
  const sf = spectralFlux(d, starts);
  if (!sf.length) return [];
  const mx = Math.max(...sf) + 1e-9;
  const on: number[] = [];
  const gap = Math.trunc(0.09 * rate);
  for (let k = 2; k < sf.length - 2; k++) {
    const v = sf[k]!, i = starts[k]!;
    if (v / mx > 0.12 && v >= sf[k - 1]! && v > sf[k - 2]! && v >= sf[k + 1]!) {
      if (!on.length || i - on[on.length - 1]! > gap) on.push(i);
    }
  }
  return on;
}

export interface WordSlice { name: string; start: number; end: number; vowel: number }

const isDigit = (s: string): boolean => s.length > 0 && /^[0-9]+$/.test(s);

/** `split_words(d, rate, labels)`: a phrase cut at its strongest internal onsets, by the filename's word count. */
export function splitWords(d: ArrayLike<number>, rate = RATE, labelsIn: readonly string[] = []): WordSlice[] {
  const labels = labelsIn.filter((l) => (l && !isDigit(l)) || isDigit(l));
  const nw = labels.length ? Math.max(1, labels.length) : 1;
  const n = d.length;
  const onsets = fluxOnsets(d, rate);
  const abs = new Float64Array(n);
  for (let i = 0; i < n; i++) abs[i] = Math.abs(d[i]!);
  const env = boxSame(abs, Math.trunc(0.02 * rate));
  let mx = -Infinity;
  for (let i = 0; i < n; i++) mx = Math.max(mx, env[i]!);
  let start = -1, end = -1;
  for (let i = 0; i < n; i++) if (env[i]! > mx * 0.1) { if (start < 0) start = i; end = i; }
  if (start < 0) { start = 0; end = n - 1; }
  const m = Math.trunc(0.06 * rate);
  const internal = onsets.filter((o) => start + m < o && o < end - m);
  let cuts: number[];
  if (nw > 1 && internal.length >= nw - 1) {
    const bounds = internal.length === nw - 1 ? [...internal.slice(0, nw - 1)].sort((a, b) => a - b)
      : Array.from({ length: nw - 1 }, (_, k) => internal[Math.floor((k * internal.length) / (nw - 1))]!).sort((a, b) => a - b);
    cuts = [start, ...bounds, end];
  } else {
    cuts = [...Array.from({ length: nw }, (_, k) => Math.trunc(start + ((end - start) * k) / nw)), end];
  }
  const out: WordSlice[] = [];
  for (let k = 0; k < cuts.length - 1; k++) {
    const a = cuts[k]!, b = cuts[k + 1]!;
    const name = k < labels.length ? labels[k]!.toUpperCase() : `SEG${k}`;
    const c = cuePoints(sliceOf(d, a, Math.max(a + 2, b)), rate);
    out.push({ name, start: a, end: b, vowel: a + c.vowel });
  }
  return out;
}

const sliceOf = (d: ArrayLike<number>, a: number, b: number): Float64Array => {
  const out = new Float64Array(Math.max(0, Math.min(d.length, b) - a));
  for (let i = 0; i < out.length; i++) out[i] = d[a + i]!;
  return out;
};

// ── load_bank's classification (R3) ────────────────────────────────────────

/** `CATEGORY_RECS`: (gestures, roles, styles) per category (scratch_bank.py, generated from the demo). */
export const CATEGORY_RECS: Readonly<Record<string, readonly [readonly string[], readonly string[], readonly string[]]>> = {
  COUNT: [["forward_stab", "transformer8"], ["intro", "count", "reconstruction"], ["old_school", "electro"]],
  AH_VOWEL: [["baby", "chirp", "flare1", "orbit", "tear_fwd", "scribble", "drag", "transformer8"], ["hook", "showcase", "phrase_end"], ["boombap", "battle", "lofi"]],
  FRESH: [["forward_stab", "chirp", "transformer8", "flare1"], ["hook", "phrase_end", "reconstruction"], ["boombap", "electro"]],
  YEAH_RESPONSE: [["baby", "forward_stab", "chirp", "drag"], ["answer", "hook", "phrase_end"], ["boombap"]],
  SHORT_EXCLAMATION: [["forward_stab", "chirp"], ["answer", "accent"], ["boombap", "old_school"]],
  LONG_VOWEL_OR_HYPE: [["drag", "transformer8", "baby", "chirp"], ["intro", "breakdown", "showcase"], ["lofi", "battle"]],
  DJ_COMMAND: [["forward_stab", "cut"], ["intro", "transition", "phrase_end"], ["boombap"]],
  INTRO_ANNOUNCEMENT: [["drag", "forward_stab"], ["intro", "drop_cue"], ["electro", "old_school"]],
  HIP_HOP_TAG: [["forward_stab", "chirp"], ["hook", "reconstruction"], ["boombap"]],
  LONG_SPECIALTY_PHRASE: [["drag"], ["intro", "specialty"], ["boombap"]],
  FX: [["chirp", "forward_stab", "transformer8", "drag"], ["accent", "transition"], ["electro"]],
  UNKNOWN: [[], ["unknown"], []],
};
/** `FILENAME_MAP`: a named file's canonical name and category (scratch_bank.py, generated from the demo). */
export const FILENAME_MAP: Readonly<Record<string, readonly [string, string]>> = {
  "1": ["ONE", "COUNT"],
  "2": ["TWO", "COUNT"],
  "3": ["THREE", "COUNT"],
  "3-2-1": ["THREE_TWO_ONE", "COUNT"],
  "aaaah": ["AH_STANDARD", "AH_VOWEL"],
  "aaaaah": ["AH_LONG", "AH_VOWEL"],
  "aaaaah_alt_2": ["AH_ALT_2", "AH_VOWEL"],
  "aaaaah_alt3": ["AH_ALT_3", "AH_VOWEL"],
  "aaaah_alt": ["AH_ALT", "AH_VOWEL"],
  "fresh": ["FRESH_STANDARD", "FRESH"],
  "fresh_alt": ["FRESH_ALT", "FRESH"],
  "fresh_alt_4": ["FRESH_ALT_4", "FRESH"],
  "aaaah-fresh-that-was-fresh": ["AH_FRESH_FULL_PHRASE", "FRESH"],
  "fresh-yeah": ["FRESH_YEAH", "FRESH"],
  "yeah": ["YEAH_STANDARD", "YEAH_RESPONSE"],
  "yeah_alt": ["YEAH_ALT", "YEAH_RESPONSE"],
  "a-yeah": ["A_YEAH", "YEAH_RESPONSE"],
  "ayeah": ["AH_YEAH", "YEAH_RESPONSE"],
  "aaah-yeah": ["LONG_AH_YEAH", "YEAH_RESPONSE"],
  "yeah-boy": ["YEAH_BOY", "YEAH_RESPONSE"],
  "uh-hah": ["UH_HAH", "YEAH_RESPONSE"],
  "uh": ["UH_SHORT", "SHORT_EXCLAMATION"],
  "ough": ["OUGH_GRUNT", "SHORT_EXCLAMATION"],
  "hey": ["HEY", "SHORT_EXCLAMATION"],
  "hey-hey": ["HEY_HEY", "SHORT_EXCLAMATION"],
  "boy": ["BOY", "SHORT_EXCLAMATION"],
  "ooh": ["OOH_LONG", "LONG_VOWEL_OR_HYPE"],
  "whooo": ["WHOO_LONG", "LONG_VOWEL_OR_HYPE"],
  "noooow": ["NOW_LONG", "LONG_VOWEL_OR_HYPE"],
  "allright_stop": ["ALRIGHT_STOP", "DJ_COMMAND"],
  "check-this-out": ["CHECK_THIS_OUT", "DJ_COMMAND"],
  "do-it-again": ["DO_IT_AGAIN", "DJ_COMMAND"],
  "here-we-go-again": ["HERE_WE_GO_AGAIN", "DJ_COMMAND"],
  "say-what": ["SAY_WHAT", "DJ_COMMAND"],
  "stop-that": ["STOP_THAT", "DJ_COMMAND"],
  "ladies-and-gentlemen": ["LADIES_AND_GENTLEMEN", "INTRO_ANNOUNCEMENT"],
  "welcome-to-the-next-level": ["WELCOME_TO_THE_NEXT_LEVEL", "INTRO_ANNOUNCEMENT"],
  "ey-yo": ["EY_YO", "INTRO_ANNOUNCEMENT"],
  "hip-hop": ["HIP_HOP", "HIP_HOP_TAG"],
  "the-l-i-k-s": ["THE_LIKS", "HIP_HOP_TAG"],
  "he-cut-the-music-so.much-class": ["HE_CUT_THE_MUSIC", "LONG_SPECIALTY_PHRASE"],
  "if-you-really-like-to-rock-the-funky-beat": ["IF_YOU_REALLY_LIKE_TO_ROCK_THE_FUNKY_BEAT", "LONG_SPECIALTY_PHRASE"],
  "laser": ["LASER_FX", "FX"],
  "hit": ["GENERIC_HIT", "FX"],
};

const PHRASE_CATEGORIES = new Set(['DJ_COMMAND', 'INTRO_ANNOUNCEMENT', 'LONG_SPECIALTY_PHRASE', 'COUNT']);

/** One bank entry as `load_bank` writes it to the metadata (audio stripped), from the file's name and its `_read_wav` PCM. */
export interface BankEntry {
  filename: string; canonical_name: string; literal_phrase: string; category: string;
  source_is_clean: boolean; source_is_pre_scratched: boolean;
  recommended_gestures: string[]; recommended_roles: string[]; recommended_styles: string[];
  duration_ms: number; centroid: number; voiced_amount: number; noise_amount: number; transient_count: number;
  onset_rate: number; pitch_flip_rate: number; pre_scratched: boolean;
  anchor_attack: number; anchor_vowel: number; anchor_tail: number;
  safe: [number, number]; safe_forward: [number, number]; safe_reverse: [number, number];
  word_slices: WordSlice[]; factory_safe: boolean;
}

/** `load_bank`'s entry for one WAV (`filename`, e.g. "fresh-yeah.wav") from its PCM read the demo's way. */
export function bankEntry(filename: string, d: ArrayLike<number>, rate = RATE): BankEntry {
  const a = analyzeRecord(d, rate);
  const base = filename.replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '');
  const named = FILENAME_MAP[base];
  const canon = named ? named[0] : base.toUpperCase();
  const pre = named ? false : a.info.preScratched;
  const cat = named ? named[1] : pre ? 'PRE_RENDERED_SCRATCH' : 'UNKNOWN';
  const [gestures, roles, styles] = CATEGORY_RECS[cat] ?? CATEGORY_RECS.UNKNOWN!;
  const wordish = base.replace(/_/g, '-').split('-');
  const slices = wordish.length >= 2 && PHRASE_CATEGORIES.has(cat) ? splitWords(d, rate, wordish) : [];
  const i = a.info, c = a.cues;
  return {
    filename: filename.replace(/^.*[\\/]/, ''), canonical_name: canon, literal_phrase: base.replace(/-/g, ' ').replace(/_/g, ' '),
    category: cat, source_is_clean: !pre, source_is_pre_scratched: pre,
    recommended_gestures: pre ? [] : [...gestures], recommended_roles: [...roles], recommended_styles: [...styles],
    duration_ms: pyRound(i.durationMs, 1), centroid: pyRound(i.centroid, 0), voiced_amount: pyRound(i.voicedAmount, 2),
    noise_amount: pyRound(i.noiseAmount, 2), transient_count: i.transientCount, onset_rate: pyRound(i.onsetRate, 1),
    pitch_flip_rate: pyRound(i.pitchFlipRate, 1), pre_scratched: i.preScratched,
    anchor_attack: c.attack, anchor_vowel: c.vowel, anchor_tail: c.tail, safe: c.safe, safe_forward: c.safeForward, safe_reverse: c.safeReverse,
    word_slices: slices, factory_safe: cat !== 'HIP_HOP_TAG' && cat !== 'LONG_SPECIALTY_PHRASE',
  };
}

/** A record analysed at load (the bank's analysis + cue points): one sentinel count per record. */
export function analyzeRecord(d: ArrayLike<number>, rate = RATE): { info: BankAnalysis; cues: BankCuePoints } {
  bankAnalysisStats.analyzeRecord++;
  return { info: analyze(d, rate), cues: cuePoints(d, rate) };
}

// ── load_wav_cues (R5) ──────────────────────────────────────────────────────

/** `_voiced_anchor(s, rate)`: the loudest voiced frame (zcr < 0.18), the middle when none. */
export function voicedAnchor(s: ArrayLike<number>, rate = RATE): number {
  const fl = Math.trunc(0.02 * rate), hop = Math.trunc(0.01 * rate);
  let best = Math.floor(s.length / 2), bestE = -1.0;
  for (let i = 0; i < Math.max(1, s.length - fl); i += hop) {
    const b = Math.min(s.length, i + fl);
    const e = rmsOf(s, i, b), zcr = zcrOf(s, i, b);
    if (zcr < 0.18 && e > bestE) { bestE = e; best = i + Math.floor(fl / 2); }
  }
  return best;
}

export interface WavCue {
  sig: Float64Array; anchor: number; safe: [number, number]; safeForward: [number, number]; safeReverse: [number, number];
  sub: { attack: number; vowel: number; ending: number }; preferred: readonly string[];
}

/** `_cue(sig, rate, preferred)`: a cue source - normalised, anchored on the vowel, its safe ranges. */
export function wavCue(sig: ArrayLike<number>, rate: number, preferred: readonly string[]): WavCue {
  let m = 0;
  for (let i = 0; i < sig.length; i++) m = Math.max(m, Math.abs(sig[i]!));
  const s = new Float64Array(sig.length);
  for (let i = 0; i < s.length; i++) s[i] = sig[i]! / (m + 1e-9);
  const e = s.map((v) => Math.abs(v));
  const ee = boxSame(e, Math.max(1, Math.floor(s.length / 200)));
  const c = envelopeCues(ee, s.length, voicedAnchor(s, rate), null);
  return { sig: s, anchor: c.vowel, safe: c.safe, safeForward: c.safeForward, safeReverse: c.safeReverse, sub: { attack: c.safe[0], vowel: c.vowel, ending: c.tail }, preferred };
}

/** `_detect_onsets(d, sr, thresh, min_gap)`: spectral-flux onsets in seconds. */
export function detectOnsets(d: ArrayLike<number>, sr: number, thresh = 0.12, minGap = 0.10): number[] {
  const win = 1024, hop = 256;
  const starts: number[] = [];
  for (let i = 0; i < d.length - win; i += hop) starts.push(i);
  const raw = spectralFlux(d, starts);
  const mx = (raw.length ? Math.max(...raw) : 0) + 1e-9;
  const sf = raw.map((v) => v / mx);
  const onsets: number[] = [];
  for (let i = 2; i < sf.length - 2; i++) {
    if (sf[i]! > thresh && sf[i]! >= sf[i - 1]! && sf[i]! > sf[i - 2]! && sf[i]! >= sf[i + 1]!) {
      const t = (i * hop) / sr;
      if (!onsets.length || t - onsets[onsets.length - 1]! > minGap) onsets.push(t);
    }
  }
  return onsets;
}

/** The default cue windows of `load_wav_cues` (seconds of the reference take, 2.44 s long) and their gestures. */
export const WAV_CUE_MAP: Readonly<Record<string, readonly [number, number] | number>> = {
  IF: [0.00, 0.30], YOU: [0.38, 0.62], REALLY: [0.70, 0.98], ROCK: [1.40, 1.72], FUNKY: [1.75, 2.12], BEAT: [2.12, 2.44],
};
const WAV_CUE_PREFS: Readonly<Record<string, readonly string[]>> = {
  IF: ['forward_stab'], YOU: ['forward_stab', 'baby'], REALLY: ['baby', 'forward_stab'],
  ROCK: ['forward_stab', 'baby', 'chirp'], FUNKY: ['baby', 'forward_stab'], BEAT: ['chirp', 'transformer8'],
};

/**
 * `load_wav_cues(path, rate, cue_map)`: a spoken-phrase WAV auto-cued - read (16 / 8 bit, else 32-bit integer, the
 * channels averaged), resampled to `rate`, through the S950, each named word sliced by its window (scaled to the take)
 * or at the onset nearest its fraction, anchored on its vowel; plus the whole PHRASE.
 */
export function loadWavCues(bytes: ArrayBuffer, rate = RATE, cueMap: Readonly<Record<string, readonly [number, number] | number>> = WAV_CUE_MAP): Record<string, WavCue> {
  bankAnalysisStats.wavCues++;
  const v = new DataView(bytes);
  let off = 12, fmt: { ch: number; sr: number; bits: number } | null = null, data: [number, number] | null = null;
  while (off + 8 <= v.byteLength) {
    const id = String.fromCharCode(v.getUint8(off), v.getUint8(off + 1), v.getUint8(off + 2), v.getUint8(off + 3));
    const size = v.getUint32(off + 4, true);
    if (id === 'fmt ') fmt = { ch: v.getUint16(off + 10, true), sr: v.getUint32(off + 12, true), bits: v.getUint16(off + 22, true) };
    else if (id === 'data') data = [off + 8, Math.min(size, v.byteLength - off - 8)];
    off += 8 + size + (size & 1);
  }
  if (!fmt || !data) throw new Error('loadWavCues: not a PCM WAV');
  const sw = fmt.bits / 8, frames = Math.floor(data[1] / (sw * fmt.ch));
  // the demo's reader knows 16, 8 and 32 bit; a 24-bit file fails there (numpy cannot shape it) - and here
  if (sw !== 1 && sw !== 2 && sw !== 4) throw new Error(`loadWavCues: ${fmt.bits}-bit WAV (the demo reads 8, 16 and 32 bit)`);
  const mono = new Float64Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let c = 0; c < fmt.ch; c++) {
      const p = data[0] + (f * fmt.ch + c) * sw;
      sum += sw === 2 ? v.getInt16(p, true) / 32768.0 : sw === 1 ? (v.getUint8(p) - 128) / 128.0 : v.getInt32(p, true) / 2.0 ** 31;
    }
    mono[f] = fmt.ch > 1 ? sum / fmt.ch : sum;
  }
  // _resample (resample_rate: the signal itself at the same rate), then the sampler grit and _norm
  const d = s950(fmt.sr === rate ? mono : demoResample(mono, fmt.sr, rate), rate);
  const dur = d.length / rate;
  const onsets = [...detectOnsets(d, rate)].sort((a, b) => a - b);
  onsets.push(dur);
  const ref = 2.44;
  const clip = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);
  const cues: Record<string, WavCue> = {};
  for (const [name, spec] of Object.entries(cueMap)) {
    let a: number, b: number;
    if (typeof spec !== 'number') {
      a = Math.trunc(clip((spec[0] / ref) * dur, 0, dur) * rate);
      b = Math.trunc(clip((spec[1] / ref) * dur, 0, dur) * rate);
    } else {
      const tpos = spec * dur;
      let oi = 0;
      for (let k = 1; k < onsets.length - 1; k++) if (Math.abs(onsets[k]! - tpos) < Math.abs(onsets[oi]! - tpos)) oi = k;
      a = Math.trunc(Math.max(0, onsets[oi]! - 0.02) * rate);
      b = Math.trunc(Math.min(dur, onsets[oi + 1]! + 0.06) * rate);
    }
    cues[name] = wavCue(sliceOf(d, a, Math.max(a + 2, b)), rate, WAV_CUE_PREFS[name] ?? ['baby']);
  }
  cues.PHRASE = wavCue(d, rate, ['drag', 'forward_stab']);
  return cues;
}
