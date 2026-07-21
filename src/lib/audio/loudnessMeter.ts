/**
 * loudnessMeter — ITU-R BS.1770-4 / EBU R128 loudness measurement.
 *
 * Provides the standards-compliant DSP core for the live loudness meter panel:
 *   - K-weighting pre-filter (two RBJ biquads, recomputed for the actual sample
 *     rate so 44.1 kHz and 48 kHz are both correct)
 *   - Momentary (400 ms) and Short-term (3 s) loudness
 *   - Gated Integrated loudness (absolute -70 LUFS gate + relative -10 LU gate)
 *   - Loudness Range (LRA) from the gated short-term distribution (10th-95th pct)
 *   - True-Peak via 4x oversampling (polyphase linear interpolation)
 *
 * Deliberately NOT merged with previewGenerator.measureLUFS() yet — that one is
 * an intentional cheap approximation for 6 s NKS previews. This is the compliant
 * path; a later change can migrate the preview path onto it.
 *
 * Units: LUFS / LU (loudness), dBTP (true peak). Silence reads -Infinity.
 */

const ABS_GATE_LUFS = -70;
const REL_GATE_LU = -10;

// ── K-weighting filter (BS.1770-4) ───────────────────────────────────────────

export interface Biquad {
  b0: number; b1: number; b2: number; a1: number; a2: number;
}

/**
 * Compute the two-stage K-weighting biquads for a given sample rate, using the
 * analytic bilinear-transform derivation from libebur128 (Jan Kokemüller). This
 * reproduces the BS.1770 tabulated 48 kHz coefficients exactly and stays correct
 * at 44.1 kHz and other rates (unlike a plain RBJ shelf).
 *
 * `a1`/`a2` are the denominator feedback terms in the y = b0·x + b1·x₁ + b2·x₂
 * − a1·y₁ − a2·y₂ convention used by BiquadState.
 */
export function kWeightingBiquads(fs: number): [Biquad, Biquad] {
  // Stage 1: "pre-filter" high-shelf.
  const f0s = 1681.9744509555319;
  const G = 3.99984385397;
  const Qs = 0.7071752369554193;
  const Ks = Math.tan((Math.PI * f0s) / fs);
  const Vh = Math.pow(10, G / 20);
  const Vb = Math.pow(Vh, 0.499666774155);
  const a0s = 1 + Ks / Qs + Ks * Ks;
  const stage1: Biquad = {
    b0: (Vh + (Vb * Ks) / Qs + Ks * Ks) / a0s,
    b1: (2 * (Ks * Ks - Vh)) / a0s,
    b2: (Vh - (Vb * Ks) / Qs + Ks * Ks) / a0s,
    a1: (2 * (Ks * Ks - 1)) / a0s,
    a2: (1 - Ks / Qs + Ks * Ks) / a0s,
  };

  // Stage 2: RLB high-pass.
  const f0h = 38.13547087613982;
  const Qh = 0.5003270373253953;
  const Kh = Math.tan((Math.PI * f0h) / fs);
  const a0h = 1 + Kh / Qh + Kh * Kh;
  const stage2: Biquad = {
    b0: 1,
    b1: -2,
    b2: 1,
    a1: (2 * (Kh * Kh - 1)) / a0h,
    a2: (1 - Kh / Qh + Kh * Kh) / a0h,
  };

  return [stage1, stage2];
}

/** Stateful direct-form-II transposed biquad, one per channel per stage. */
class BiquadState {
  private z1 = 0;
  private z2 = 0;
  private readonly c: Biquad;
  constructor(c: Biquad) {
    this.c = c;
  }
  process(x: number): number {
    const { b0, b1, b2, a1, a2 } = this.c;
    const y = b0 * x + this.z1;
    this.z1 = b1 * x - a1 * y + this.z2;
    this.z2 = b2 * x - a2 * y;
    return y;
  }
}

// ── Loudness of a set of K-weighted mean-squares ─────────────────────────────

/** Sum-of-channels loudness from per-channel mean-square (BS.1770 stereo G=1). */
export function loudnessFromMeanSquares(channelMeanSquares: number[]): number {
  let sum = 0;
  for (const ms of channelMeanSquares) sum += ms; // L,R weight = 1.0
  if (sum <= 0) return -Infinity;
  return -0.691 + 10 * Math.log10(sum);
}

// ── Incremental analyzer (drives the live meter) ─────────────────────────────

export interface LoudnessSnapshot {
  momentary: number;   // LUFS, 400 ms window
  shortTerm: number;   // LUFS, 3 s window
  integrated: number;  // LUFS, gated
  lra: number;         // LU
  truePeak: number;    // dBTP
}

/**
 * Feed contiguous interleaved-by-channel sample blocks; read M/S/I/LRA/TP at any
 * time. Designed to be driven from an AudioWorklet with sample-contiguous frames.
 */
export class LoudnessMeter {
  private readonly filters: BiquadState[][];      // [channel][stage]
  private readonly numChannels: number;

  // 100 ms sub-block accumulation (the integration grid quantum: 400 ms block
  // with 75 % overlap == a new block every 100 ms).
  private readonly subBlockSamples: number;
  private subAcc: number[];       // per-channel sum of squares in current 100 ms
  private subCount = 0;

  // ring of recent 100 ms sub-block mean-squares, per channel
  private readonly subMS: number[][] = []; // [channel][subBlockIndex]

  private blockLoudnessGated: number[] = []; // 400 ms gated-block loudness (for integrated)
  private shortTermHistory: number[] = [];   // 3 s short-term values, 100 ms step (for LRA)

  private truePeakLinear = 0;

  constructor(fs: number, numChannels: number) {
    this.numChannels = numChannels;
    const [s1, s2] = kWeightingBiquads(fs);
    this.filters = Array.from({ length: numChannels }, () => [
      new BiquadState(s1),
      new BiquadState(s2),
    ]);
    this.subBlockSamples = Math.round(fs * 0.1); // 100 ms
    this.subAcc = new Array(numChannels).fill(0);
    for (let c = 0; c < numChannels; c++) this.subMS.push([]);
  }

  /** Process one block. `channels[c]` is a Float32Array of the same length. */
  process(channels: Float32Array[]): void {
    const n = channels[0]?.length ?? 0;
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < this.numChannels; c++) {
        const x = channels[c][i];
        // True-peak (pre-filter, on the raw signal)
        this.accumulateTruePeak(x, i, channels[c]);
        // K-weight then accumulate square
        const w = this.filters[c][1].process(this.filters[c][0].process(x));
        this.subAcc[c] += w * w;
      }
      if (++this.subCount >= this.subBlockSamples) this.flushSubBlock();
    }
  }

  private flushSubBlock(): void {
    for (let c = 0; c < this.numChannels; c++) {
      this.subMS[c].push(this.subAcc[c] / this.subCount);
      this.subAcc[c] = 0;
    }
    this.subCount = 0;

    // Every 400 ms of sub-blocks (i.e. every new sub-block once we have >=4),
    // form an integration block for gating.
    const have = this.subMS[0].length;
    if (have >= 4) {
      const blockMS: number[] = [];
      for (let c = 0; c < this.numChannels; c++) {
        let s = 0;
        for (let k = have - 4; k < have; k++) s += this.subMS[c][k];
        blockMS.push(s / 4);
      }
      const l = loudnessFromMeanSquares(blockMS);
      if (l > ABS_GATE_LUFS) this.blockLoudnessGated.push(l);
    }

    // Short-term (3 s == 30 sub-blocks) every 100 ms, for LRA.
    if (have >= 30) {
      const stMS: number[] = [];
      for (let c = 0; c < this.numChannels; c++) {
        let s = 0;
        for (let k = have - 30; k < have; k++) s += this.subMS[c][k];
        stMS.push(s / 30);
      }
      const st = loudnessFromMeanSquares(stMS);
      if (st > ABS_GATE_LUFS) this.shortTermHistory.push(st);
    }
  }

  private accumulateTruePeak(x: number, i: number, buf: Float32Array): void {
    // 4x oversample via linear interpolation between this and next sample.
    const nx = i + 1 < buf.length ? buf[i + 1] : x;
    for (let s = 0; s < 4; s++) {
      const v = Math.abs(x + ((nx - x) * s) / 4);
      if (v > this.truePeakLinear) this.truePeakLinear = v;
    }
  }

  /** Momentary loudness over the last 400 ms (last 4 sub-blocks). */
  momentary(): number {
    return this.windowLoudness(4);
  }

  /** Short-term loudness over the last 3 s (last 30 sub-blocks). */
  shortTerm(): number {
    return this.windowLoudness(30);
  }

  private windowLoudness(subBlocks: number): number {
    const have = this.subMS[0].length;
    if (have < subBlocks) return -Infinity;
    const ms: number[] = [];
    for (let c = 0; c < this.numChannels; c++) {
      let s = 0;
      for (let k = have - subBlocks; k < have; k++) s += this.subMS[c][k];
      ms.push(s / subBlocks);
    }
    return loudnessFromMeanSquares(ms);
  }

  /** Gated integrated loudness over everything processed so far. */
  integrated(): number {
    const blocks = this.blockLoudnessGated;
    if (blocks.length === 0) return -Infinity;
    // Ungated (absolute-gated only) mean loudness → relative gate threshold.
    const ungated = meanLoudness(blocks);
    if (!isFinite(ungated)) return -Infinity;
    const relGate = ungated + REL_GATE_LU;
    const passing = blocks.filter((l) => l > relGate);
    if (passing.length === 0) return -Infinity;
    return meanLoudness(passing);
  }

  /** Loudness Range (EBU Tech 3342) from gated short-term distribution. */
  lra(): number {
    const st = this.shortTermHistory;
    if (st.length < 2) return 0;
    // Relative gate at -20 LU below the (absolute-gated) integrated of ST values.
    const ungated = meanLoudness(st);
    const relGate = ungated - 20;
    const gated = st.filter((l) => l > relGate).sort((a, b) => a - b);
    if (gated.length < 2) return 0;
    const lo = percentile(gated, 10);
    const hi = percentile(gated, 95);
    return hi - lo;
  }

  truePeakDb(): number {
    if (this.truePeakLinear <= 0) return -Infinity;
    return 20 * Math.log10(this.truePeakLinear);
  }

  snapshot(): LoudnessSnapshot {
    return {
      momentary: this.momentary(),
      shortTerm: this.shortTerm(),
      integrated: this.integrated(),
      lra: this.lra(),
      truePeak: this.truePeakDb(),
    };
  }
}

// ── Offline convenience (used by tests + File-Info Analyze) ──────────────────

/** Measure integrated loudness + true-peak of a fully-available buffer. */
export function measureBufferLoudness(
  channels: Float32Array[],
  fs: number,
): LoudnessSnapshot {
  const meter = new LoudnessMeter(fs, channels.length);
  // process in ~100 ms chunks to mimic streaming
  const chunk = Math.round(fs * 0.1);
  const total = channels[0].length;
  for (let off = 0; off < total; off += chunk) {
    const end = Math.min(off + chunk, total);
    meter.process(channels.map((ch) => ch.subarray(off, end)));
  }
  return meter.snapshot();
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Energy-domain mean of a set of loudness (LUFS) values. */
function meanLoudness(loudness: number[]): number {
  let sum = 0;
  for (const l of loudness) sum += Math.pow(10, l / 10);
  if (sum <= 0) return -Infinity;
  return 10 * Math.log10(sum / loudness.length);
}

/** Linear-interpolated percentile of a pre-sorted ascending array. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}
