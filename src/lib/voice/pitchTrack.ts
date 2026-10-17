/**
 * pitchTrack.ts - the frame pitch track every melody path reads (SwiftF0).
 *
 * Constants follow swift_f0/core.py: 16 kHz input, 256-sample hop (16 ms),
 * model range 46.875-2093.75 Hz over 95 log-spaced pitch steps.
 */
export const TRACK_SAMPLE_RATE = 16000;
export const TRACK_HOP = 256;
export const TRACK_HOP_SECONDS = TRACK_HOP / TRACK_SAMPLE_RATE;
export const TRACK_FMIN_HZ = 46.875;
export const TRACK_FMAX_HZ = 2093.75;
/** Ratio between neighbouring model pitch steps: a band narrower than this holds no candidate. */
export const TRACK_BIN_RATIO = (TRACK_FMAX_HZ / TRACK_FMIN_HZ) ** (1 / 94);
/** A frame is voiced at or above this confidence (the model is calibrated to it). */
export const TRACK_VOICED_CONFIDENCE = 0.5;

export interface F0Track {
  /** Hz per frame. */
  hz: Float32Array;
  /** 0..1 per frame; 0 where the hop is digital silence. */
  confidence: Float32Array;
  /** dB level of the 32 ms of audio centred on each frame. */
  loudnessDb: Float32Array;
  hopSeconds: number;
}

export interface PitchRange {
  fminHz: number;
  fmaxHz: number;
}

/** Anything that turns 22050 Hz mono samples into a frame pitch track. */
export interface PitchTracker {
  track(samples22050: Float32Array, range?: PitchRange): Promise<F0Track>;
}

/** Clamp a range into the model's band, widened to hold at least one pitch step. */
export function clampRange(range?: PitchRange): PitchRange {
  let fminHz = Math.max(TRACK_FMIN_HZ, range?.fminHz ?? TRACK_FMIN_HZ);
  let fmaxHz = Math.min(TRACK_FMAX_HZ, range?.fmaxHz ?? TRACK_FMAX_HZ);
  if (fmaxHz < fminHz * TRACK_BIN_RATIO) {
    fmaxHz = Math.min(TRACK_FMAX_HZ, fminHz * TRACK_BIN_RATIO);
    fminHz = fmaxHz / TRACK_BIN_RATIO;
  }
  return { fminHz, fmaxHz };
}

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}
