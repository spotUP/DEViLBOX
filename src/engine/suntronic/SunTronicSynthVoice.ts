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
 *   type 2  splice          first D1 bytes from wave1, remainder from wave2[D1..]
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
  /**
   * voice+0xA6 play buffer — the OUTPUT dest AND the feedback source for the
   * live-buffer types (1-pulse CALC3, else CALC14). Persists across ticks; null
   * until the first tick writes it. Cleared to null on note-start (GETNEXTNOTE
   * clears the bit1 latch) so feedback restarts from wave1 each note.
   */
  playBuffer: Int8Array | null;
}

/** Global PRNG word (workspace `rndnum`, RNDNUMBER seed = 0), shared by voices. */
export interface SunSynthPrng {
  value: number; // 16-bit unsigned
}

export function createVoiceState(): SunSynthVoiceState {
  return { arpIndex: 0, feedbackLatched: false, playBuffer: null };
}

export function createPrng(): SunSynthPrng {
  return { value: 0 };
}

const toS8 = (b: number): number => (b << 24) >> 24;
const asrW7 = (x: number): number => ((x << 16) >> 16) >> 7; // 16-bit signed ASR #7
const toS16 = (x: number): number => (x << 16) >> 16;

/** `muls.w a,b` — signed16 × signed16 → 32-bit (unsigned repr). */
const muls16 = (a: number, b: number): number => (toS16(a) * toS16(b)) >>> 0;

/**
 * `swap Dn ; rol.l #1,Dn` on a 32-bit product, returning the resulting low word.
 * SWAP exchanges the two 16-bit halves; ROL.L #1 rotates the 32-bit value left
 * one (bit31 → bit0). The CALC14 loop then consumes only the low word (.w ops).
 */
const swapRol1 = (p32: number): number => {
  let x = (((p32 << 16) | (p32 >>> 16)) >>> 0); // SWAP
  x = (((x << 1) | (x >>> 31)) >>> 0); // ROL.L #1
  return x & 0xffff; // low word
};

/**
 * CALC14 kernel — the else-branch smoothed feedback integrator, transcribed
 * BYTE-EXACT from the loaded replayer (loop @0x26dc8, verified via PC-filtered
 * register capture + capstone disasm against all 7 corpus modules that execute
 * it: kompo02/03, paradroid-synth, time0001/0002/1/2000).
 *
 *   d0   = s8(seed[last])          << 7        (16-bit accumulator)
 *   d1w  = s8(seed[last]-seed[-1]) << 7        (16-bit velocity)
 *   per sample i (0..byteLen-1):
 *     d1w = swapRol1( muls(d3v, d1w) )               ; ×fbDepth term (d3v=0 here)
 *     t   = swapRol1( muls(d2v, (s8(wave1[i])<<7) - d0) )
 *     d1w = (d1w + t)  & 0xffff
 *     d0  = (d0  + d1w) & 0xffff
 *     out[i] = (d0 & 0xffff) >>> 7                    ; lsr.w #7 (logical) → move.b
 *
 * `wave1` is streamed via `(a3)+` every sample; `seed*` are the two initial-
 * condition reads from A4 (= feedback play buffer when latched, wave1 on tick 0).
 * `d2v`/`d3v` are the coefficients derived from the arp value (see renderSmooth).
 */
export function calc14Kernel(
  seedLast: number,
  seedPrev: number,
  wave1: Int8Array | Uint8Array,
  d2v: number,
  d3v: number,
  byteLen: number,
): Int8Array {
  const out = new Int8Array(byteLen);
  let d0 = (toS8(seedLast) << 7) & 0xffff;
  let d1w = (toS8((seedLast - seedPrev) & 0xff) << 7) & 0xffff;
  for (let i = 0; i < byteLen; i++) {
    d1w = swapRol1(muls16(d3v, d1w));
    let t = ((toS8(wave1[i] ?? 0) << 7) - d0) & 0xffff;
    t = swapRol1(muls16(d2v, t));
    d1w = (d1w + t) & 0xffff;
    d0 = (d0 + d1w) & 0xffff;
    out[i] = (((d0 & 0xffff) >>> 7) << 24) >> 24;
  }
  return out;
}

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

  // Feedback source (A4 for CALC14 seed, A3 for CALC3 stream): the voice's own
  // previous-tick play buffer once latched, else wave1 on the first pass.
  const fbSource: Int8Array | Uint8Array =
    state.feedbackLatched && state.playBuffer ? state.playBuffer : w1;
  let latch = false; // feedback types set this; commit to state after dispatch.

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
      latch = renderType1(out, w1, fbSource, byteLen, d1, prng);
      break;
    }
    case 2: {
      // CALC7: splice — first D1 bytes from wave1, remainder from wave2[D1..].
      // (Corrected against the UADE chip-RAM wave-buffer oracle, P5: the head is
      // wave1 and the tail is wave2 — the reverse of the original transcription.)
      const n = d1; // D1 (0..127 typical); negative would underflow — clamp.
      let o = 0;
      const copyW1 = Math.max(0, Math.min(n, byteLen));
      for (let i = 0; i < copyW1; i++) out[o++] = ((w1[i] ?? 0) << 24) >> 24;
      let src = Math.max(0, n);
      while (o < byteLen) out[o++] = ((w2[src++] ?? 0) << 24) >> 24;
      break;
    }
    case 3: {
      renderType3(out, w1, byteLen, d1);
      break;
    }
    default: {
      renderSmooth(out, w1, fbSource, inst.wave2Off, byteLen, d1);
      latch = true; // CALC15 BSET #1 — the A4 source latches to the play buffer.
      break;
    }
  }

  // voice+0xA6 is the play buffer for EVERY type; snapshot it so the next tick's
  // feedback reads this tick's output. Latch the feedback source for types 1/else.
  state.playBuffer = Int8Array.from(out);
  if (latch) state.feedbackLatched = true;

  // ME2: advance arp index, wrap arpLen → arpLoop.
  state.arpIndex += 1;
  if (inst.arpLen > 0 && state.arpIndex === inst.arpLen) state.arpIndex = inst.arpLoop;

  void last;
  return out;
}

/**
 * CALC2-6: type-1 pulse / hold / PRNG noise. Returns whether the feedback latch
 * should be set (BSET #1,voice+0x14) — true for the pulse path, false for noise
 * (source-independent) so callers only latch when a live-buffer source was used.
 *
 * `fbSource` is A3 for the pulse path: the play buffer once latched, wave1 on the
 * first pass. The pulse recurrence both seeds (source[last]) and streams
 * (source[i]) from it — unlike CALC14, where the feedback source is seed-only.
 */
function renderType1(
  out: Int8Array,
  w1: Int8Array,
  fbSource: Int8Array | Uint8Array,
  byteLen: number,
  d1: number,
  prng: SunSynthPrng,
): boolean {
  const last = byteLen - 1; // D4

  if (d1 === -1) {
    // CALC5/6: PRNG noise, writes words (byteLen/2 iterations). The output word
    // is written BEFORE the recurrence steps (out[0] == the incoming seed), and
    // the middle-square is shifted right by 4, not 8 — both recovered byte-exact
    // from UADE chip-RAM noise buffers (mule.src, seed 0x6d77) via the P5 wave-
    // buffer oracle; the earlier transcription had >>8 and stepped-then-wrote.
    //   d0_next = ((d0*d0) >>> 4 & 0xffff) ^ 0xac91   (EORI.W #-$536F)
    // The per-tick seed carry is NOT byte-verified (the workspace `rndnum` value
    // between ticks does not follow this stream continuation) — we continue the
    // stream as the closest known model; it affects only which noise instance
    // plays, not its spectral character.
    let d0 = prng.value & 0xffff;
    const words = byteLen >> 1;
    for (let i = 0; i < words; i++) {
      out[i * 2] = (d0 >> 8 << 24) >> 24;
      out[i * 2 + 1] = ((d0 & 0xff) << 24) >> 24;
      d0 = ((d0 * d0) >>> 4) & 0xffff;
      d0 = (d0 ^ 0xac91) & 0xffff; // EORI.W #-$536F
    }
    prng.value = d0;
    return false; // noise is source-independent — no feedback latch.
  }

  // CALC3: recursive pulse smoothing (arp >= 0). Verified byte-for-byte against the
  // LOADED replayer disasm at 0x26cc0-0x26ce0 (NOT the DP_Suntronic.s variant, which
  // differs): d1 = 0x80 - arp (byte sub; arp>=0 keeps high byte 0, coeff in [1,128]);
  // d0 seeds source[last]; per sample d0 += ((source[i]-d0)*coeff) asr 7; out = d0.b.
  // Source is the feedback play buffer once latched, wave1 on the first pass (A3 select).
  // LIMIT: negative-arp variants (0x26d4a consecutive-delta, 0x26ce6 arp==-2 escape)
  // are NOT ported. The corpus barely exercises the pulse path (~1 fire per 250 ticks,
  // p8e histogram) so no oracle golden could be captured to lock them; the
  // first-hit-per-render-chunk capture ABI cannot sample past the 0x26c8a entry.
  let d3 = toS8(fbSource[last] ?? 0);
  const d0 = (0x80 - d1) & 0xffff;
  for (let i = 0; i < byteLen; i++) {
    const d2v = toS8(fbSource[i] ?? 0);
    const step = asrW7((d2v - d3) * ((d0 << 16) >> 16));
    d3 = (d3 + step) & 0xffff;
    d3 = (d3 << 16) >> 16;
    out[i] = (d3 << 24) >> 24;
  }
  void w1;
  return true; // CALC4 BSET #1 — pulse path latches the feedback source.
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

/**
 * CALC13-14: else-branch smoothed feedback integrator. Derives the two loop
 * coefficients (d2v/d3v) from the arp value + the record's fbDepth byte, seeds
 * from the feedback source's tail, then runs the verified `calc14Kernel`.
 *
 * Coefficient derivation (disasm @0x26de6):
 *   divisor = (d1 & 0xff) + 0x20                                   ; addi.w #$20
 *   d2v = (0xfffe0 / divisor) - (0x26 * extw(d1)) & 0xffff         ; divu / mulu / sub.w
 *   d3v = ((0x7fff - d2v) & 0xffff) * fbDepth >> 8                 ; mulu d5 / lsr.l #8
 *
 * `fbDepth` = the `move.b $1e(a1),d5` byte = the TOP byte of the wave2 pointer
 * (record+0x1e is the wave2 u32). Chip pointers are < 0x200000, so this byte is
 * always 0 → d3v = 0 in practice (the velocity term is inert). Kept explicit so a
 * non-chip layout would still port faithfully.
 */
function renderSmooth(
  out: Int8Array,
  w1: Int8Array,
  fbSource: Int8Array | Uint8Array,
  wave2Off: number,
  byteLen: number,
  d1: number,
): void {
  const last = byteLen - 1; // D4
  const divisor = (d1 & 0xff) + 0x20; // never 0 (>= 0x20)
  const quotient = Math.floor(0xfffe0 / divisor) & 0xffff;
  const term = (0x26 * (toS8(d1) & 0xffff)) & 0xffff; // 0x26 * ext.w(d1)
  const d2v = (quotient - term) & 0xffff;
  const fbDepth = (wave2Off >>> 24) & 0xff; // move.b $1e(a1),d5 — always 0 for chip ptrs
  const d3v = (((0x7fff - d2v) & 0xffff) * fbDepth) >>> 8 & 0xffff;
  const seedLast = fbSource[last] ?? 0;
  const seedPrev = fbSource[Math.max(0, last - 1)] ?? 0;
  const res = calc14Kernel(seedLast, seedPrev, w1, d2v, d3v, byteLen);
  out.set(res);
}
