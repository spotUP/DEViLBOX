/** Patch data model for the CZ-101 (NEC uPD933 phase distortion chip). */

// PD waveforms (chip waveform field values)
export const CZWaveform = {
  SAW: 0,
  SQUARE: 1,
  PULSE: 2,
  SILENT: 3,
  DOUBLE_SINE: 4,
  SAW_PULSE: 5,
  RESONANCE: 6,
  DOUBLE_PULSE: 7,
} as const;
export type CZWaveform = typeof CZWaveform[keyof typeof CZWaveform];

// Window functions (chip window field values)
export const CZWindow = {
  NONE: 0,
  SAW: 1,
  TRIANGLE: 2,
  TRAPEZOID: 3,
  PULSE: 4,
  DOUBLE_SAW: 5,
} as const;
export type CZWindow = typeof CZWindow[keyof typeof CZWindow];

/**
 * One envelope stage. `rate` 0-127 (about 1 ms to 6 s for a full-range move: each
 * +8 doubles the speed); `level` 0-99 on the panel scale for the amplitude and
 * waveform envelopes, 0-63 for the pitch envelope. A stage after the first with
 * rate 0 is the sustain point: the envelope holds there until key-off, which
 * runs the stages after it.
 */
export interface CZEnvelopeStage {
  rate: number;
  level: number;
  /** Pitch envelope only: level counts 2-semitone steps instead of 6.25-cent steps. */
  coarse?: boolean;
}

export interface CZLine {
  waveform1: CZWaveform;
  /** Second waveform, alternating with the first on every cycle. Defaults to waveform1. */
  waveform2?: CZWaveform;
  window?: CZWindow;
  dcaEnvelope: CZEnvelopeStage[];
  dcwEnvelope: CZEnvelopeStage[];
  /** Pitch envelope: offsets upward from the note pitch, so it starts at 0. */
  dcoEnvelope?: CZEnvelopeStage[];
  /** Line 2 only: offset from line 1 in cents. */
  detune?: number;
}

export interface CZPatch {
  name?: string;
  line1: CZLine;
  /** A second line makes the note use a pair of chip voices (4-note polyphony). */
  line2?: CZLine;
  detune?: number;      // fine tune, 1/128 semitone steps
  octave?: number;      // octave shift
  /** Ring modulation: line 2 is multiplied by line 1 (needs a pair, so line 2 is implied). */
  ringMod?: boolean;
  /** With ring modulation: silence line 1 itself so only the ring product (sum and difference tones) is heard. */
  ringOnly?: boolean;
  /** Noise: line 2's pitch is modulated by the chip's noise source. */
  noiseMode?: boolean;
}
