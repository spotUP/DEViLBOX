/**
 * speechParamOffsets.ts — apply TMS5220 knob offsets to TTS frames.
 *
 * Pure function used by TMS5220Synth._applySpeechParamsToFrames: shifts pitch,
 * scales energy, offsets K1-K3 formant indices and forces noise excitation
 * (whisper). Frame k values are table indices (K1: 0-31, K2: 0-31, K3: 0-15),
 * so formant knobs apply as index-domain offsets from their 15 center.
 */
import type { TMS5220Frame } from '@engine/speech/tms5220PhonemeMap';
import { FRAME_K_MAX } from '@engine/speech/tms5220FrameBuffer';

export interface SpeechParamOffsets {
  pitchIndex?: number;   // knob value, center 32 → offset (pitchIndex - 32)
  energyIndex?: number;  // knob value, default 10 → scale (energyIndex / 10)
  kIndices?: [number, number, number]; // K1-K3 knob values, center 15
  noiseMode?: number;    // 1 = force noise excitation on all frames
}

export function applySpeechParamOffsets(
  frames: TMS5220Frame[],
  offsets: SpeechParamOffsets
): TMS5220Frame[] {
  const pitchOffset = (offsets.pitchIndex ?? 32) - 32;
  const energyScale = (offsets.energyIndex ?? 10) / 10;
  const kOffsets = (offsets.kIndices ?? [15, 15, 15]).map(k => k - 15) as [number, number, number];
  const forceNoise = (offsets.noiseMode ?? 0) >= 1;

  // Skip if no modification needed
  if (pitchOffset === 0 && Math.abs(energyScale - 1) < 0.01 &&
      kOffsets.every(o => o === 0) && !forceNoise) return frames;

  return frames.map(f => {
    let newPitch = f.pitch;
    let newEnergy = f.energy;
    let newUnvoiced = f.unvoiced;
    const kTouched = kOffsets.some(o => o !== 0);
    const newK = (kTouched || forceNoise) ? [...f.k] : f.k;

    // Apply pitch offset to voiced frames (pitch > 0)
    if (pitchOffset !== 0 && f.pitch > 0) {
      newPitch = Math.max(1, Math.min(31, f.pitch + pitchOffset));
    }

    // Apply energy scaling
    if (Math.abs(energyScale - 1) >= 0.01 && f.energy > 0 && f.energy < 15) {
      newEnergy = Math.max(1, Math.min(14, Math.round(f.energy * energyScale)));
    }

    // Apply K1-K3 formant offsets (index domain, same units as the knobs)
    for (let i = 0; i < 3; i++) {
      if (kOffsets[i] !== 0) {
        newK[i] = Math.max(0, Math.min(FRAME_K_MAX[i], newK[i] + kOffsets[i]));
      }
    }

    // Force noise excitation (whisper) — packer encodes unvoiced as pitch=0
    if (forceNoise) newUnvoiced = true;

    if (newPitch === f.pitch && newEnergy === f.energy &&
        newUnvoiced === f.unvoiced && newK === f.k) return f;
    return { ...f, pitch: newPitch, energy: newEnergy, unvoiced: newUnvoiced, k: newK };
  });
}