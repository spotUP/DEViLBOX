/**
 * cmi-dsp-utils.ts — Shared Fairlight CMI DSP computation
 *
 * Single source of truth for waveform generation, harmonic presets,
 * and filter math. Consumed by both DOM (CMIControls) and Pixi
 * (future PixiCMIKnobPanel) UIs without duplication.
 *
 * All formulas match CMISynth.cpp (the WASM engine) exactly.
 */

// ── Constants ──────────────────────────────────────────────────
export const NUM_HARMONICS = 32;
export const WAVE_SAMPLES = 128;
export const MAX_VOICES = 16;

export const WAVE_NAMES = [
  'Sine', 'Sawtooth', 'Square', 'Triangle',
  'Strings', 'Choir', 'Organ', 'Bass',
] as const;

// ── Waveform generation ────────────────────────────────────────

/** Generate a 128-sample waveform from harmonic amplitudes (normalized to -1..1) */
export function generateFromHarmonics(harmonics: number[]): Float32Array {
  const out = new Float32Array(WAVE_SAMPLES);
  for (let i = 0; i < WAVE_SAMPLES; i++) {
    let sum = 0;
    for (let h = 0; h < harmonics.length; h++) {
      if (Math.abs(harmonics[h]) > 0.001) {
        sum += harmonics[h] * Math.sin(2 * Math.PI * (h + 1) * i / WAVE_SAMPLES);
      }
    }
    out[i] = sum;
  }
  // Normalize peak to ±1
  let peak = 0;
  for (let i = 0; i < WAVE_SAMPLES; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) for (let i = 0; i < WAVE_SAMPLES; i++) out[i] /= peak;
  return out;
}

/** Get harmonic amplitudes for a built-in waveform bank (matches CMISynth.cpp) */
export function getBuiltinHarmonics(bank: number): number[] {
  const h = new Array(NUM_HARMONICS).fill(0);
  switch (bank) {
    case 0: // Sine
      h[0] = 1;
      break;
    case 1: // Sawtooth — 1/n series
      for (let n = 0; n < NUM_HARMONICS; n++) h[n] = 1 / (n + 1);
      break;
    case 2: // Square — odd harmonics 1/n
      for (let n = 0; n < NUM_HARMONICS; n++) {
        if ((n + 1) % 2 === 1) h[n] = 1 / (n + 1);
      }
      break;
    case 3: // Triangle — odd harmonics 1/n², alternating sign (display as abs)
      for (let n = 0; n < NUM_HARMONICS; n++) {
        if ((n + 1) % 2 === 1) h[n] = 1 / ((n + 1) * (n + 1));
      }
      break;
    case 4: // Strings
      h[0] = 1; h[1] = 0.7; h[2] = 0.5; h[3] = 0.3; h[4] = 0.2;
      break;
    case 5: // Choir (odd harmonics)
      h[0] = 1; h[2] = 0.33; h[4] = 0.2; h[6] = 0.14;
      break;
    case 6: // Organ
      h[0] = 1; h[2] = 0.5; h[4] = 0.3;
      break;
    case 7: // Bass
      h[0] = 1; h[1] = 0.6; h[2] = 0.1;
      break;
  }
  return h;
}

/** Generate built-in waveform samples for a bank index */
export function getBuiltinWaveform(bank: number): Float32Array {
  return generateFromHarmonics(getBuiltinHarmonics(bank));
}

// ── Filter math (from CMI Service Manual p.133) ────────────────

/** Convert raw 0-255 cutoff value to Hz (matches CMISynth.cpp SSM2045 formula) */
export function cutoffToHz(raw: number): number {
  return Math.min(14000, 6410 * Math.pow(1.02162, raw - 256));
}

/** 4th-order Butterworth magnitude response in dB at a given frequency */
export function filterResponseDb(freq: number, cutoffHz: number): number {
  const ratio = freq / cutoffHz;
  // Two cascaded 2nd-order sections = 4th-order
  const mag = 1 / Math.sqrt(1 + Math.pow(ratio, 8));
  return 20 * Math.log10(Math.max(mag, 1e-6));
}

/** Format cutoff Hz for display */
export function formatCutoffHz(raw: number): string {
  const fc = cutoffToHz(raw);
  return fc >= 1000 ? `${(fc / 1000).toFixed(1)}k` : `${Math.round(fc)}`;
}

// ── Envelope math ──────────────────────────────────────────────

/** Generate envelope curve points for display (normalized 0..1 x/y) */
export function generateEnvelopeCurve(
  attack: number,    // 0-255
  release: number,   // 0-255
  rate: number,      // 0-255
  numPoints: number = 100,
): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  const aNorm = Math.max(0.01, attack / 255);
  const rNorm = Math.max(0.01, release / 255);

  // Phase widths (proportional)
  const aW = 0.35 * aNorm;
  const sW = 0.3;
  const rW = 0.35 * rNorm;
  const total = aW + sW + rW;

  for (let i = 0; i <= numPoints; i++) {
    const x = i / numPoints;
    const t = x * total;
    let y: number;

    if (t < aW) {
      // Attack — fast exponential rise
      const p = t / aW;
      y = 1 - Math.pow(1 - p, 2);
    } else if (t < aW + sW) {
      // Sustain — slight droop based on rate
      const p = (t - aW) / sW;
      const droop = 0.05 + (1 - rate / 255) * 0.1;
      y = 1 - p * droop;
    } else {
      // Release — exponential decay
      const p = (t - aW - sW) / rW;
      const sustainEnd = 1 - (0.05 + (1 - rate / 255) * 0.1);
      y = sustainEnd * Math.pow(1 - p, 1.5);
    }

    pts.push({ x: x, y: Math.max(0, Math.min(1, y)) });
  }
  return pts;
}

// ── Wave RAM conversion ────────────────────────────────────────

/** Convert Float32 (-1..1) waveform to 8-bit unsigned PCM (0x80 = center) */
export function floatToUint8PCM(samples: Float32Array): Uint8Array {
  const out = new Uint8Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    out[i] = Math.max(0, Math.min(255, Math.round(samples[i] * 127 + 128)));
  }
  return out;
}
