/**
 * voicePresets.ts — bundled parameter presets for the TMS5220 voice.
 *
 * Each preset sets a combination of chip parameters (formants K1-K3,
 * excitation energy/pitch/chirp, noise mode) so one click gives a distinct
 * voice character. Applied through the normal parameter-change path, so the
 * knobs/selects reflect the values and both speech and sung notes are shaped.
 * Single source of truth — consumed by ChipSynthControls.
 */

export interface TMS5220VoicePreset {
  id: string;
  name: string;
  params: Record<string, number>;
}

/**
 * pitch_index indexes the chip's PERIOD table: a higher index is a LONGER
 * pitch period, i.e. a LOWER voice. 32 is neutral (applySpeechParamOffsets
 * subtracts 32). The first version of these presets assumed the opposite
 * convention, which made Chipmunk a deep growl and Deep a squeak.
 *
 * Tone lives on the `brightness` knob (0.5 = the chip's bit-exact neutral,
 * mapped to the wasm's 0..2 tilt) and `cabinet` (the toy's speaker + case).
 * The first Bright/Muffled bent K1-K3 instead — but K indices are
 * reflection-coefficient table positions, and shifting them relocates the
 * formants: the vowels garbled rather than the tone changing.
 */
export const NEUTRAL_VOICE_PARAMS: Record<string, number> = {
  pitch_index: 32,
  energy_index: 10,
  k1_index: 15,
  k2_index: 15,
  k3_index: 15,
  noise_mode: 0,
  chirp_type: 0, // the 1978-79 patent chirp — the Speak & Spell excitation
  brightness: 0.5,
  cabinet: 0,
};

export const TMS5220_VOICE_PRESETS: TMS5220VoicePreset[] = [
  { id: 'default', name: 'Default (raw chip)', params: {} },
  // The chip is already a Speak & Spell; what the toy added is a small driver
  // in a resonant plastic case — the cabinet stage.
  { id: 'speakandspell', name: 'Speak & Spell', params: { cabinet: 0.5 } },
  // No preset touches K1-K3: shifting reflection-coefficient indices
  // relocates formants and collapses the liquids first — W/ER/L live in
  // extreme K1/K2 territory, so "WORLD" came out "frrzzll" on every preset
  // that carried K offsets while "HELLO" survived. Character comes from
  // pitch, excitation, noise, brightness and cabinet only.
  { id: 'chipmunk', name: 'Chipmunk', params: { pitch_index: 14, energy_index: 11, brightness: 0.65 } },
  { id: 'deep', name: 'Deep', params: { pitch_index: 46, energy_index: 12, brightness: 0.4 } },
  { id: 'robot', name: 'Robot', params: { pitch_index: 32, energy_index: 9, chirp_type: 2, brightness: 0.6 } },
  { id: 'alien', name: 'Alien', params: { pitch_index: 22, energy_index: 10, chirp_type: 1, brightness: 0.7 } },
  { id: 'whisper', name: 'Whisper', params: { noise_mode: 1, energy_index: 9 } },
  { id: 'bright', name: 'Bright', params: { pitch_index: 28, energy_index: 11, brightness: 0.8 } },
  { id: 'muffled', name: 'Muffled', params: { pitch_index: 36, energy_index: 9, brightness: 0.2 } },
  // Deliberate formant garble — the ONE preset allowed to bend K1-K3.
  // Relocating the reflection coefficients makes speech eerily
  // wrong-but-speechlike, the way the Black Lodge dialogue in Twin Peaks
  // (spoken reversed, then played reversed) sits just outside language.
  // Named by the user after hearing it.
  { id: 'twinpeaks', name: 'Twin Peaks', params: { pitch_index: 30, energy_index: 10, k1_index: 6, k2_index: 24, k3_index: 12, brightness: 0.45, cabinet: 0.3 } },
];

/**
 * Full parameter set for a preset: the neutral voice with the preset's own
 * values on top. Applying only the sparse params left the previous preset's
 * residue behind — picking Muffled after Alien kept Alien's formant shifts.
 */
export function resolvePresetParams(id: string): Record<string, number> | null {
  const preset = TMS5220_VOICE_PRESETS.find(p => p.id === id);
  if (!preset) return null;
  return { ...NEUTRAL_VOICE_PARAMS, ...preset.params };
}