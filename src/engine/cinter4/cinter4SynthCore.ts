/**
 * cinter4SynthCore.ts — the Cinter 4 synth voice, generating instrument PCM
 *
 * A 1:1 TypeScript port of askeksa/Cinter's `cinter/src/engine.rs`
 * (`CinterInstrument` / `compute_sample`). Given the 12 instrument parameters it
 * synthesizes the 8-bit waveform exactly as the Amiga replayer regenerates it at
 * runtime. This is what makes a Cinter instrument a *live* DEViLBOX voice: edit a
 * param, re-render the buffer, the sample engine plays it — no render-to-disk and
 * re-import like the classic Cinter→ProTracker workflow.
 *
 * Cinter is a two-oscillator phase-modulation synth with per-sample pitch/mod
 * decay, a power volume envelope, and iterated sine "distortion" (sine→square).
 *
 * Fixed-point note: the reference does 64-bit intermediate math. JS numbers are
 * exact integers up to 2^53; the largest intermediate here (`mul`) is ~2^46, so
 * plain numbers are safe. Arithmetic right shifts on values that may exceed 32
 * bits use Math.floor(x / 2^n) (equivalent for these magnitudes, sign-correct).
 *
 * Reference: cinter/src/engine.rs — CinterEngine, CinterInstrument, compute_sample,
 *            sintab, distort, mul, p10/p100/envfun/pitchfun/decayfun.
 */

import {
  CINTER4_PARAM_COUNT,
  cinter4EnvFun,
  cinter4PitchFun,
  type Cinter4Version,
} from '../../lib/import/formats/cinter4Params';

/**
 * Synth-side decay curve (engine.rs decayfun / decayfun3) — UNMASKED.
 *
 * Distinct from cinter4DecayFun in cinter4Params, which masks to 16 bits for
 * songdata storage. The synth multiplies pitch/mod by (decay/65536) every sample,
 * so the neutral value must be 65536 (×1.0, no change); the masked songdata 0
 * means the same thing to the Amiga only because its replayer skips-if-zero and
 * adds-the-original-if-positive. Here we replicate the VST synth directly.
 */
const synthDecay = (p: number, version: Cinter4Version): number => {
  // v3 uses the simple falloff curve directly (matches the Cinter 3 GUI render);
  // v4 uses the exponential curve that can also grow.
  if (version === 3) return Math.round(Math.exp(-0.000002 * p * p) * 65536);
  const v = p / 50 - 1;
  return Math.round(Math.exp(0.0008 * v + 0.1 * Math.pow(v, 7)) * 65536);
};

// ── Shared sine table (16384 entries, ±16384) ────────────────────────────────
// sine_table[i] = round(sin(i/16384 · 2π) · 16384), clamped to i16.

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
  /** 12 user parameters (integer domain: idx 0-7 ∈ [0,100], idx 8-11 ∈ [0,10]). */
  params: readonly number[];
  /** total sample length in 8-bit samples (bytes). */
  length: number;
  /** loop start in samples, or null for one-shot. */
  repeatStart?: number | null;
  /** pitch/decay curve version (v3 or v4). Defaults to 4. */
  version?: Cinter4Version;
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

  // running synth state (engine.rs CinterInstrument fields)
  private attack: number;
  private decay: number;
  private mpitch: number;     // u32, <<16 fixed point
  private bpitch: number;
  private mod_: number;
  private mpitchdecay: number;
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
    const p = cfg.params;
    if (p.length < CINTER4_PARAM_COUNT) throw new Error('Cinter4Voice: need 12 params');
    const version = cfg.version ?? 4;

    this.length = cfg.length;
    this.repeatStart =
      cfg.repeatStart != null && cfg.repeatStart < cfg.length ? cfg.repeatStart : null;

    // envfun(p) used directly here as the envelope rate (the stored "attack word"
    // is 65536 - envfun, which the Amiga inverts back to this).
    // Params here are the integer display values (idx 0-7 ∈ [0,100], 8-11 ∈ [0,10]).
    this.attack = cinter4EnvFun(p[0]);
    this.decay = cinter4EnvFun(p[1]);
    this.mpitch = (cinter4PitchFun(p[2], version) * 65536) >>> 0;
    this.mpitchdecay = synthDecay(p[3], version);
    this.bpitch = (cinter4PitchFun(p[4], version) * 65536) >>> 0;
    this.bpitchdecay = synthDecay(p[5], version);
    this.mod_ = (p[6] * 65536) >>> 0;
    this.moddecay = synthDecay(p[7], version);
    this.mdist = p[8];
    this.bdist = p[9];
    this.vpower = p[10];
    this.fdist = p[11];

    this.data.push(0, 0);
    this.ampDelta = this.attack;
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

  private computeSample(): number {
    const mval = this.distort(this.sintab(mul(this.phase, this.mpitch)), this.mdist);
    let val = this.distort(
      this.sintab(mul(this.phase, this.bpitch) + mul(mval, this.mod_)),
      this.bdist,
    );
    let pw = this.vpower;
    while (pw >= 0) {
      val = Math.trunc((val * this.amp) / 32768);
      pw -= 1;
    }
    val = Math.min(asr(this.distort(val, this.fdist), 7), 127);

    // per-sample pitch / mod decays (u64 * u32 >> 16)
    this.mpitch = asr(this.mpitch * this.mpitchdecay, 16) >>> 0;
    this.bpitch = asr(this.bpitch * this.bpitchdecay, 16) >>> 0;
    this.mod_ = asr(this.mod_ * this.moddecay, 16) >>> 0;

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

/** Convenience: render a Cinter instrument's PCM from its 12 params. */
export function renderCinter4Sample(
  params: readonly number[],
  length: number,
  repeatStart: number | null = null,
  version: Cinter4Version = 4,
): Int8Array {
  return new Cinter4Voice({ params, length, repeatStart, version }).render();
}
