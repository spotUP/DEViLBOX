/**
 * SunTronicEffects.ts — native port of the SunTronic V1.3 pitch/volume envelope
 * routine (`EFFECTS`, DP_Suntronic.s @415-496). Phase 2b of the native-engine
 * pilot; the companion to the wavetable timbre generator (Phase 2a,
 * SunTronicSynthVoice.ts).
 *
 * Per tick, for a synth voice, EFFECTS produces the two Paula outputs:
 *   - final volume byte  = volEnvTable[volEnvIndex] * voiceVolume >> 7   (0..0x80)
 *   - final period word   = PERIODS lookup of the vibrato-modulated pitch,
 *                           minus the per-song arpeggio note offset (drin),
 *                           with 8-bit fractional interpolation between adjacent
 *                           period table entries
 * and advances the voice's envelope/vibrato/pitch-slide/volume-slide state.
 *
 * `drin` is the per-song arpeggio note-offset table (located in the module data;
 * indexed by arpSelector*16 + arpPhase). It is passed IN — locating it in
 * hunk#1 is a separate parser step. With an empty drin the offset is 0 (no
 * arpeggio), which is correct for non-arpeggiated notes.
 *
 * PERIODS is the static Amiga period LUT baked into the replayer
 * (DP_Suntronic.s @1127-1135): 12 guard words of 0x3E followed by the real
 * note→period table. Indexed by (integer semitone - arp offset), word-scaled.
 */

/**
 * Static period table (word values), transcribed verbatim from DP_Suntronic.s
 * @1127-1135. First 12 words are the 0x3E guard region the replayer's `LEA
 * PERIODS(pc),A2` points at; `Periods:` (the real note 0) begins at index 12.
 */
export const SUN_PERIODS: number[] = [
  // guard: DC.L $3E003E x6  → 12 words of 0x003E
  0x3e, 0x3e, 0x3e, 0x3e, 0x3e, 0x3e, 0x3e, 0x3e, 0x3e, 0x3e, 0x3e, 0x3e,
  // Periods:
  0x3e, 0x47, 0x4b, 0x50, 0x55, 0x5a, 0x5f, 0x65, 0x6b, 0x71, 0x78, 0x7f,
  0x87, 0x8f, 0x97, 0xa0, 0xaa, 0xb4, 0xbe, 0xca, 0xd6, 0xe2, 0xf0, 0xfe,
  0x10d, 0x11d, 0x12e, 0x140, 0x153, 0x168, 0x17d, 0x194, 0x1ac, 0x1c5,
  0x1e0, 0x1fc, 0x21a, 0x23a, 0x25c, 0x280, 0x2a6, 0x2d0, 0x2fa, 0x328,
  0x358, 0x38a, 0x3c0, 0x3f8, 0x434, 0x474, 0x4b8, 0x500, 0x54c, 0x5a0,
  0x5f4, 0x650, 0x6b0, 0x714, 0x780, 0x7f0, 0x868, 0x8e8, 0x970, 0xa00,
  0xa98, 0xb40, 0xbe8, 0xca0, 0xd60, 0xe28, 0xf00, 0xfe0, 0xfe0, 0xfe0,
  0xfe0, 0xfe0, 0xfe0, 0xfe0, 0xfe0, 0xfe0, 0xfe0, 0xfe0, 0xfe0, 0xfe0,
];

import type { SunSynthInstrument } from '@/lib/import/formats/SunTronicV13';

/** Per-voice pitch/volume state carried across ticks (voice-struct subset). */
export interface SunVoicePitchState {
  /** voice+8 — pitch, 8.8 fixed-point semitone (integer part = note index). */
  pitch: number;
  /** voice+0x0A — pitch slide added to `pitch` each tick (signed word). */
  pitchSlide: number;
  /** voice+0x0C — voice volume 0..0x80. */
  volume: number;
  /** voice+0x0D — volume slide added to `volume` each tick (signed byte). */
  volumeSlide: number;
  /** voice+0x0E — arpeggio selector (row into drin, *16). */
  arpSelector: number;
  /** voice+0x0F — arpeggio phase 0..15. */
  arpPhase: number;
  /** voice+0x10 — volume-envelope index. */
  volEnvIndex: number;
  /** voice+0x22 — vibrato phase accumulator (signed word, triangle). */
  vibPhase: number;
  /** voice+0x24 — vibrato-depth table index. */
  vibIndex: number;
}

export interface SunEffectsOutput {
  /** Paula period word (voice+0x20). */
  period: number;
  /** Paula volume byte 0..0x80 (voice+0x15). */
  volume: number;
}

export function createPitchState(pitch = 0, volume = 0x40): SunVoicePitchState {
  return {
    pitch, pitchSlide: 0, volume, volumeSlide: 0,
    arpSelector: 0, arpPhase: 0, volEnvIndex: 0, vibPhase: 0, vibIndex: 0,
  };
}

const s8 = (b: number): number => (b << 24) >> 24;
const s16 = (w: number): number => (w << 16) >> 16;
const u8 = (b: number): number => b & 0xff;

/**
 * Run one EFFECTS tick for a synth voice: compute Paula period + volume and
 * advance envelope/vibrato/slide state in place. `drin` is the per-song arp
 * note-offset table (empty → no arpeggio offset).
 */
export function stepEffects(
  inst: SunSynthInstrument,
  st: SunVoicePitchState,
  drin: Int8Array = new Int8Array(0),
): SunEffectsOutput {
  // ── Paula volume ──
  // NOTE (2026-07-17): the disasm's speculative "THREE stages, ×masterVolA/B>>6"
  // theory was REFUTED by measurement. probe-mastervol.ts diffed native $15 vs the
  // UADE AUD{n}VOL oracle across the corpus: mean ratio ≈1.0 (the master words are
  // identity — no dynamic global fade), and the ONLY systematic native/UADE delta
  // was full-scale voices reading 64 where Paula caps AUDxVOL at 63. That is the
  // Paula 6-bit register clamp (audio.c:808 `v & 64 ? 63 : v & 63`), applied at the
  // Paula boundary via paulaAudxVol() in SunTronicNativeRender — NOT a master
  // multiply here. This standalone preview path is single-note audition (empty drin,
  // no song master state); its >>7 vs the player's >>6 only shifts preview loudness,
  // not the corpus render. No masterVolA/B port is warranted.
  const volEnvVal = u8(inst.volEnv[st.volEnvIndex] ?? 0);
  const outVolume = (volEnvVal * (st.volume & 0xff)) >> 7;

  // ── period: vibrato-modulated pitch → PERIODS LUT − arp offset, interpolated ─
  const d5 = ((st.arpSelector & 0xff) << 4) + (st.arpPhase & 0x0f); // drin index
  let d0 = s16(st.pitch);
  const vibSample = s8(inst.vibDepth[st.vibIndex] ?? 0);
  let d3v = st.vibPhase < 0 ? -st.vibPhase : st.vibPhase; // triangle
  d3v = (d3v - 0x4000) & 0xffffffff;
  d3v = ((s16(d3v & 0xffff) * vibSample) >> 12); // MULS then LSR.L #6 #6 (>>12)
  d0 = s16((d0 + d3v) & 0xffff);

  let noteIdx = (d0 >> 8) & 0xffff; // integer semitone
  noteIdx = s16(noteIdx) - s8(drin[d5] ?? 0); // minus arp offset
  const wordIdx = noteIdx; // PERIODS is a word array; (A2,D1.W) with D1 pre-<<1
  let period = SUN_PERIODS[clampIdx(wordIdx)] ?? 0xfe0;
  const frac = d0 & 0xff;
  if (frac !== 0) {
    const next = SUN_PERIODS[clampIdx(wordIdx + 1)] ?? period;
    period = (period + (((next - period) * frac) >> 8)) & 0xffff;
  }

  // ── advance state ──
  // pitch slide, wrap [0,0x4800)
  st.pitch = s16((st.pitch + st.pitchSlide) & 0xffff);
  if (st.pitch < 0) st.pitch = (st.pitch + 0x4800) & 0xffff;
  if (st.pitch >= 0x4800) st.pitch -= 0x4800;
  // volume slide, clamp [0,0x80]
  let vol = (st.volume + s8(st.volumeSlide)) | 0;
  if (vol < 0) vol = 0;
  else if (vol > 0x80) vol = 0x80;
  st.volume = vol;
  // arp phase 0..15
  st.arpPhase = (st.arpPhase + 1) & 0x0f;
  // vol-env index, wrap volEnvLen → volEnvLoop
  st.volEnvIndex += 1;
  if (st.volEnvIndex === inst.volEnvLen) st.volEnvIndex = inst.volEnvLoop;
  // vibrato phase accumulate + depth index wrap freqEnvLen → freqEnvLoop
  st.vibPhase = s16((st.vibPhase + inst.freqEnvSpeed) & 0xffff);
  st.vibIndex += 1;
  if (st.vibIndex === inst.freqEnvLen) st.vibIndex = inst.freqEnvLoop;

  return { period, volume: outVolume };
}

/** Clamp a word index into the PERIODS table (negative → 0, over → last). */
function clampIdx(i: number): number {
  if (i < 0) return 0;
  if (i >= SUN_PERIODS.length) return SUN_PERIODS.length - 1;
  return i;
}
