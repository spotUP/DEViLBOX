/**
 * cinter4SynthCore.ts — the Cinter 4 synth voice, generating instrument PCM
 *
 * A 1:1 TypeScript port of the Amiga replayer's `CinterMakeInstruments`
 * (cinter4-wasm/src/cinter4/cinter4.c, itself a validated port of Cinter4.S).
 * Given the 9 stored synth words it synthesizes the 8-bit waveform exactly as the
 * Amiga regenerates it at runtime. This is what makes a Cinter instrument a *live*
 * DEViLBOX voice: edit a param, re-encode the words, re-render the buffer, the
 * sample engine plays it — no render-to-disk / re-import like classic Cinter.
 *
 * IMPORTANT — synthesize from the STORED WORDS, not from params+version.
 * The Amiga replayer never touches user params, pitchfun/decayfun, or a "version"
 * at replay time; it reads the 9 words from songdata and feeds them straight into
 * the loop (cinter4.c:399-430 init-state, :751-838 decay-apply). Re-deriving the
 * words from a lossy words→params→words round-trip (with a guessed version) was the
 * cause of wrong-pitch instruments on `.cinter4` import. The editor path converts
 * params→words once via the canonical converter (cinter4ParamsToWords) and then
 * feeds the SAME word-based synth — one path, zero version-guessing at audio time.
 *
 * Cinter is a two-oscillator phase-modulation synth with per-sample pitch/mod
 * decay, a power volume envelope, and iterated sine "distortion" (sine→square).
 *
 * Fixed-point note: the reference does 64-bit intermediate math. JS numbers are
 * exact integers up to 2^53; the largest intermediate here (`mul`) is ~2^46, so
 * plain numbers are safe. Arithmetic right shifts on values that may exceed 32
 * bits use Math.floor(x / 2^n) (equivalent for these magnitudes, sign-correct).
 *
 * Reference: cinter4-wasm/src/cinter4/cinter4.c CinterMakeInstruments (ground
 *            truth), Cinter4.S CinterMakeInstruments / CinterMakeSinus (upstream).
 */

import {
  cinter4ParamsToWords,
  type Cinter4SynthWords,
  type Cinter4Version,
} from '../../lib/import/formats/cinter4Params';

// ── Shared sine table (16384 entries, ±16384) ────────────────────────────────
// sine_table[i] = round(sin(i/16384 · 2π) · 16384), clamped to i16.
// (The Amiga builds this via an integer cubic polynomial, CinterMakeSinus; that
//  differs from Math.sin by ≤3 LSB — a faint timbre nuance, not a pitch error.)

let SINE_TABLE: Int16Array | null = null;

function sineTable(): Int16Array {
  if (SINE_TABLE) return SINE_TABLE;
  const t = new Int16Array(16384);
  for (let i = 0; i < 16384; i++) {
    t[i] = Math.round(Math.sin((i / 16384) * 2 * Math.PI) * 16384);
  }
  SINE_TABLE = t;
  return t;
}

// ── Helpers (engine.rs free functions) ───────────────────────────────────────

/** mul(v16, v32) = (v16 · (v32 >> 2)) >> 16, with 64-bit-safe intermediate. */
const mul = (v16: number, v32: number): number =>
  Math.floor((v16 * Math.floor(v32 / 4)) / 65536);

/** arithmetic right shift for possibly-large (>32-bit) values */
const asr = (x: number, n: number): number => Math.floor(x / Math.pow(2, n));

// ── The voice ─────────────────────────────────────────────────────────────────

export interface Cinter4VoiceConfig {
  /** The 9 stored synth words (mpitch, mod, bpitch, attack, dist, decay,
   *  mpitchdecay, moddecay, bpitchdecay) — exactly what the Amiga replayer reads. */
  words: Cinter4SynthWords;
  /** total sample length in 8-bit samples (bytes). */
  length: number;
  /** loop start in samples, or null for one-shot. */
  repeatStart?: number | null;
}

/**
 * A single Cinter instrument voice. Synthesizes samples lazily (matching the
 * reference), but `render()` produces the whole buffer up front for the tracker
 * sample engine and the editor waveform view.
 */
export class Cinter4Voice {
  private readonly sine: Int16Array;
  private readonly length: number;
  private readonly repeatStart: number | null;

  // running synth state (cinter4.c sample-state fields)
  private decay: number;      // amp fall rate (envfun of the decay word)
  private mpitch: number;     // u32, <<16 fixed point
  private bpitch: number;
  private mod_: number;
  private mpitchdecay: number; // stored 16-bit decay word (branch-applied)
  private bpitchdecay: number;
  private moddecay: number;
  private mdist: number;
  private bdist: number;
  private vpower: number;
  private fdist: number;

  private phase = 0;
  private amp = 0;
  private ampDelta = 0;

  private data: number[] = [];

  constructor(cfg: Cinter4VoiceConfig) {
    this.sine = sineTable();
    const w = cfg.words;

    this.length = cfg.length;
    this.repeatStart =
      cfg.repeatStart != null && cfg.repeatStart < cfg.length ? cfg.repeatStart : null;

    // Pitch/mod states: stored word (unsigned 16-bit) placed in the high word,
    // i.e. state = word << 16 (cinter4.c:399-405 MOVE.W then CLR.W).
    this.mpitch = ((w.mpitch & 0xffff) * 65536) >>> 0;
    this.bpitch = ((w.bpitch & 0xffff) * 65536) >>> 0;
    this.mod_ = ((w.mod & 0xffff) * 65536) >>> 0;

    // Per-sample decay words applied via the Amiga branch logic (applyDecay).
    this.mpitchdecay = w.mpitchdecay & 0xffff;
    this.bpitchdecay = w.bpitchdecay & 0xffff;
    this.moddecay = w.moddecay & 0xffff;

    // Amplitude envelope. The stored attack word = (65536 − envfun); as a signed
    // int16 that is −envfun, and the Amiga does `amp -= attackWord` each sample,
    // i.e. amp rises by envfun (cinter4.c:723). So ampDelta = −(int16)attackWord.
    // The decay word is envfun(decay-param) directly; on clip ampDelta = −decay.
    this.ampDelta = -(((w.attack & 0xffff) << 16) >> 16);
    this.decay = w.decay & 0xffff;

    // Distortion nibbles packed in the dist word (cinter4.c reads the dist word
    // once per sample and walks it 0x1000 at a time: mdist, bdist, vpower, fdist).
    const dist = w.dist & 0xffff;
    this.mdist = (dist >> 12) & 0xf;
    this.bdist = (dist >> 8) & 0xf;
    this.vpower = (dist >> 4) & 0xf;
    this.fdist = dist & 0xf;

    this.data.push(0, 0);
  }

  private sintab(i: number): number {
    return this.sine[(asr(i, 2) & 16383)];
  }

  private distort(val: number, shift: number): number {
    while (shift > 0) {
      val = this.sintab(val);
      shift -= 1;
    }
    return val;
  }

  /**
   * Per-sample pitch/mod decay (cinter4.c:751-838). The stored word carries only
   * the fractional/excess part; the Amiga re-adds the implicit 1.0 via a branch:
   *   word == 0            → state unchanged            (BEQ skip)
   *   word high-bit set    → state = (word·state)>>16   (falloff, ×[0.5,1.0))
   *   word positive (<0x8000) → state += (word·state)>>16 = state·(1+word/65536) (growth)
   */
  private applyDecay(state: number, word: number): number {
    if (word === 0) return state;
    const prod = asr(state * word, 16) >>> 0; // (word · state) >> 16, 32-bit
    if (word & 0x8000) return prod >>> 0; // falloff (BMI)
    return (state + prod) >>> 0; // growth
  }

  private computeSample(): number {
    // Oscillator phase is a 16-bit index (cinter4.c MOVE.W d6,d2, :463-468).
    const ph = this.phase & 0xffff;
    const mval = this.distort(this.sintab(mul(ph, this.mpitch)), this.mdist);
    let val = this.distort(
      this.sintab(mul(ph, this.bpitch) + mul(mval, this.mod_)),
      this.bdist,
    );
    let pw = this.vpower;
    while (pw >= 0) {
      // amplitude multiply: take the high 16 bits of (val·amp)<<1 = arithmetic
      // floor((val·amp)/32768) (cinter4.c:647-654 MULS/ADD.L/SWAP).
      val = Math.floor((val * this.amp) / 32768);
      pw -= 1;
    }
    val = Math.min(asr(this.distort(val, this.fdist), 7), 127);

    // per-sample pitch / mod decays (stored-word branch logic)
    this.mpitch = this.applyDecay(this.mpitch, this.mpitchdecay);
    this.bpitch = this.applyDecay(this.bpitch, this.bpitchdecay);
    this.mod_ = this.applyDecay(this.mod_, this.moddecay);

    // amplitude envelope: rise by ampDelta until clipping, then fall by -decay
    this.amp += this.ampDelta;
    if (this.amp > 32767) {
      this.amp = 32767;
      this.ampDelta = -this.decay;
    } else if (this.amp < 0) {
      this.amp = 0;
    }

    this.phase += 1;
    // wrap to signed 8-bit (i8)
    return (val << 24) >> 24;
  }

  private repeatedIndex(index: number): number | null {
    if (index < this.length) return index;
    if (this.repeatStart == null) return null;
    return this.repeatStart + ((index - this.length) % (this.length - this.repeatStart));
  }

  private getSampleRaw(index: number): number {
    while (this.data.length <= index) this.data.push(this.computeSample());
    return this.data[index];
  }

  /** Sample value at `index` (with loop handling); 0 past a one-shot's end. */
  getSample(index: number): number {
    const idx = this.repeatedIndex(index);
    return idx == null ? 0 : this.getSampleRaw(idx);
  }

  /** Render the full instrument waveform as signed 8-bit PCM. */
  render(): Int8Array {
    const out = new Int8Array(this.length);
    for (let i = 0; i < this.length; i++) out[i] = this.getSampleRaw(i);
    return out;
  }
}

/** Render a Cinter instrument's PCM directly from its 9 stored synth words. */
export function renderCinter4SampleFromWords(
  words: Cinter4SynthWords,
  length: number,
  repeatStart: number | null = null,
): Int8Array {
  return new Cinter4Voice({ words, length, repeatStart }).render();
}

/**
 * Convenience for the editor / presets: render from the 12 user params. The
 * params are encoded to words via the canonical converter (exactly what
 * CinterConvert stores and the Amiga then reads), then synthesized word-based.
 */
export function renderCinter4Sample(
  params: readonly number[],
  length: number,
  repeatStart: number | null = null,
  version: Cinter4Version = 4,
): Int8Array {
  const words = cinter4ParamsToWords(params, version);
  return new Cinter4Voice({ words, length, repeatStart }).render();
}
