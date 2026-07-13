/**
 * SunTronicSynthVoice.ts — native port of the SunTronic V1.3 wavetable timbre
 * generator (`MEGAEFFECTS`, DP_Suntronic.s @594-763).
 *
 * This is Phase 2a of the native-engine pilot: it reproduces ONLY the per-tick
 * WAVEFORM buffer the replayer computes for a synth voice (the instrument's
 * timbre). Pitch, volume envelope, vibrato and arpeggio-period are the separate
 * `EFFECTS` routine (@415-496) ported in Phase 2b — kept out of here so each
 * half is testable in isolation.
 *
 * Per tick the replayer reads one signed byte D1 = arpTable[voice.arpIndex] and
 * regenerates the voice's play buffer (waveWordLen*2 bytes) by combining the two
 * source waveforms (wave1/wave2) according to the record's synthesis type
 * (record+0x23):
 *
 *   type 0  linear morph   out = wave1 + ((wave2 - wave1) * D1 >> 7)
 *   type 1  pulse/noise     D1=-1 PRNG noise, D1=-2 hold-feedback, else recursive
 *                           pulse smoothing; feedback source latches via flag bit1
 *   type 2  splice          first D1 bytes from wave2, remainder from wave1[D1..]
 *   type 3  resample        two-segment rate-scaled replay of wave1 (0x8000/(D1+k))
 *   else    smoothed interp weighted crossfade, 0xFFFE0/(D1+0x20) coefficient
 *
 * FIDELITY NOTE: transcribed byte-for-byte from the 68k source (exact shift
 * widths, sign extension, constants). Structurally validated (endpoints of the
 * unambiguous types 0/2, determinism); sample-exact parity against a UADE
 * per-voice buffer oracle is the Phase 2 exit gate — do NOT treat the ambiguous
 * types (1/3/else) as audio-verified until that oracle lands.
 *
 * ARM/JS arithmetic mapping:
 *  - `s8` = signed 8-bit; all wave/arp bytes are read signed.
 *  - `ASR.W #7` on a 16-bit signed value → `(x << 16 >> 16) >> 7` (JS `>>` is
 *    arithmetic; we clamp to int16 first so the sign bit is right).
 *  - `MOVE.B Dn,(An)+` truncates to 8 bits → `& 0xff` then reinterpret signed.
 */

import type { SunSynthInstrument } from '@/lib/import/formats/SunTronicV13';

/** Mutable per-voice state the generator carries across ticks. */
export interface SunSynthVoiceState {
  /** arp/interp table index (voice+0x12); wraps arpLen → arpLoop each tick. */
  arpIndex: number;
  /** voice+0x14 bit1 — type-1 feedback latch (source becomes the play buffer). */
  feedbackLatched: boolean;
}

/** Global PRNG word (workspace `rndnum`, RNDNUMBER seed = 0), shared by voices. */
export interface SunSynthPrng {
  value: number; // 16-bit unsigned
}

export function createVoiceState(): SunSynthVoiceState {
  return { arpIndex: 0, feedbackLatched: false };
}

export function createPrng(): SunSynthPrng {
  return { value: 0 };
}

const toS8 = (b: number): number => (b << 24) >> 24;
const asrW7 = (x: number): number => ((x << 16) >> 16) >> 7; // 16-bit signed ASR #7

/**
 * Generate one tick's play buffer for a synth voice and advance its arp index.
 *
 * Returns a fresh signed-8-bit buffer of `waveWordLen*2` samples. `state` and
 * `prng` are mutated in place (arp index advance / feedback latch / PRNG step),
 * matching the replayer's in-place voice/workspace updates.
 */
export function renderSynthTick(
  inst: SunSynthInstrument,
  state: SunSynthVoiceState,
  prng: SunSynthPrng,
): Int8Array {
  const byteLen = inst.waveWordLen * 2; // D4 + 1
  const out = new Int8Array(byteLen);
  if (byteLen <= 0) return out;

  // D1 = arpTable[arpIndex] (signed). Out-of-range index → 0 (empty table guard).
  const arpIdx = inst.arpLen > 0 ? state.arpIndex % inst.arpLen : 0;
  const d1 = inst.arpTable.length > arpIdx ? inst.arpTable[arpIdx] : 0;

  const w1 = inst.wave1;
  const w2 = inst.wave2;
  const last = byteLen - 1; // D4

  switch (inst.synthType) {
    case 0: {
      // CALC1: linear morph wave1 → wave2 by D1/128.
      for (let i = 0; i < byteLen; i++) {
        const a = toS8(w1[i] ?? 0);
        const b = toS8(w2[i] ?? 0);
        out[i] = ((a + asrW7((b - a) * d1)) << 24) >> 24;
      }
      break;
    }
    case 1: {
      renderType1(out, w1, byteLen, d1, state, prng);
      break;
    }
    case 2: {
      // CALC7: splice — first D1 bytes from wave2, remainder from wave1[D1..].
      const n = d1; // D1 (0..127 typical); negative would underflow — clamp.
      let o = 0;
      const copyW2 = Math.max(0, Math.min(n, byteLen));
      for (let i = 0; i < copyW2; i++) out[o++] = ((w2[i] ?? 0) << 24) >> 24;
      let src = Math.max(0, n);
      while (o < byteLen) out[o++] = ((w1[src++] ?? 0) << 24) >> 24;
      break;
    }
    case 3: {
      renderType3(out, w1, byteLen, d1);
      break;
    }
    default: {
      renderSmooth(out, w1, byteLen, d1, state);
      break;
    }
  }

  // ME2: advance arp index, wrap arpLen → arpLoop.
  state.arpIndex += 1;
  if (inst.arpLen > 0 && state.arpIndex === inst.arpLen) state.arpIndex = inst.arpLoop;

  void last;
  return out;
}

/** CALC2-6: type-1 pulse / hold / PRNG noise. */
function renderType1(
  out: Int8Array,
  w1: Int8Array,
  byteLen: number,
  d1: number,
  state: SunSynthVoiceState,
  prng: SunSynthPrng,
): void {
  const last = byteLen - 1; // D4
  // D1==-2 & !latched → source stays wave1 (CALC4 falls through). D1==-2 &
  // latched → source is the play buffer (feedback). We model feedback by seeding
  // from the previous out is impossible (fresh buffer); the replayer reuses the
  // live voice buffer — approximated here by wave1 until the buffer oracle lands.
  state.feedbackLatched = true; // BSET #1,voice+0x14

  if (d1 === -1) {
    // CALC5/6: PRNG noise, writes words (byteLen/2 iterations).
    let d0 = prng.value & 0xffff;
    const words = byteLen >> 1;
    for (let i = 0; i < words; i++) {
      d0 = (d0 * d0) & 0xffffffff;
      d0 = (d0 >>> 8) & 0xffff;
      d0 = (d0 ^ 0xac91) & 0xffff; // EORI.W #-$536F
      out[i * 2] = (d0 >> 8 << 24) >> 24;
      out[i * 2 + 1] = ((d0 & 0xff) << 24) >> 24;
    }
    prng.value = (d0 ^ 0x7fa3) & 0xffff;
    return;
  }

  // CALC3: recursive pulse smoothing. D3 = wave1[D4]; D0 = 0x80 - D1.
  let d3 = toS8(w1[last] ?? 0);
  const d0 = (0x80 - d1) & 0xffff;
  for (let i = 0; i < byteLen; i++) {
    const d2v = toS8(w1[i] ?? 0);
    const step = asrW7((d2v - d3) * ((d0 << 16) >> 16));
    d3 = (d3 + step) & 0xffff;
    d3 = (d3 << 16) >> 16;
    out[i] = (d3 << 24) >> 24;
  }
}

/** CALC10-12: type-3 two-segment rate-scaled resample of wave1. */
function renderType3(out: Int8Array, w1: Int8Array, byteLen: number, d1: number): void {
  const last = byteLen - 1; // D4
  const div = ((d1 << 16) >> 16) + 0x40; // ext.w(D1) + 0x40
  if (div === 0) return;
  const step1 = ((Math.floor(0x8000 / div) & 0xffff) << 8) >>> 0; // 16.8 fixed
  let d2 = ((div & 0xffff) * last) & 0xffffffff;
  d2 = (d2 >>> 7) & 0xffff; // count of segment-1 samples
  let d3 = (last - d2) & 0xffff; // segment-2 count
  let acc = 0; // D4 long: high word = integer sample index
  let o = 0;
  for (let i = 0; i <= d2 && o < byteLen; i++) {
    const idx = (acc >>> 16) & 0xffff;
    out[o++] = ((w1[idx] ?? 0) << 24) >> 24;
    acc = (acc + step1) & 0xffffffff;
  }
  d3 = (d3 - 1) & 0xffff;
  if (d3 & 0x8000) return; // BMI
  const d0b = (0x80 - div) & 0xffff;
  if (d0b === 0) return;
  const step2 = ((Math.floor(0x8000 / d0b) & 0xffff) << 8) >>> 0;
  for (let i = 0; i <= d3 && o < byteLen; i++) {
    const idx = (acc >>> 16) & 0xffff;
    out[o++] = ((w1[idx] ?? 0) << 24) >> 24;
    acc = (acc + step2) & 0xffffffff;
  }
}

/** CALC13-14: else-branch smoothed weighted crossfade. */
function renderSmooth(
  out: Int8Array,
  w1: Int8Array,
  byteLen: number,
  d1: number,
  state: SunSynthVoiceState,
): void {
  const last = byteLen - 1; // D4
  state.feedbackLatched = true;
  const d0div = (d1 & 0xff) + 0x20;
  if (d0div === 0) return;
  const d2 = Math.floor(0xfffe0 / d0div) & 0xffff;
  const d3base = 0x26 * ((d1 << 16) >> 16);
  const coeff = (0x7fff - ((d2 - d3base) & 0xffff)) & 0xffff;
  const d3 = ((coeff * 0xc000) >>> 16) & 0xffff; // MULU #-$4000; SWAP → high word
  // Source select: latched → play buffer (approx wave1) else wave1.
  let d0 = toS8(w1[last] ?? 0) << 7;
  let d1w = (toS8(w1[last] ?? 0) - toS8(w1[Math.max(0, last - 1)] ?? 0)) << 7;
  let a3 = 0;
  for (let i = 0; i <= last; i++) {
    d1w = (((d1w * ((d3 << 16) >> 16)) / 0x10000) | 0) << 1;
    const s5base = toS8(w1[a3++] ?? 0) << 7;
    let d5 = (s5base - d0) & 0xffffffff;
    d5 = (((d5 * ((d2 << 16) >> 16)) / 0x10000) | 0) << 1;
    d1w = (d1w + d5) & 0xffffffff;
    d0 = (d0 + d1w) & 0xffffffff;
    out[i] = ((((d0 << 16) >> 16) >> 7) << 24) >> 24;
  }
}
