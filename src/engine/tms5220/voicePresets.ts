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

export const TMS5220_VOICE_PRESETS: TMS5220VoicePreset[] = [
  { id: 'default', name: 'Default', params: {} },
  { id: 'chipmunk', name: 'Chipmunk', params: { pitch_index: 46, energy_index: 11, k1_index: 20, k2_index: 18 } },
  { id: 'deep', name: 'Deep', params: { pitch_index: 18, energy_index: 12, k1_index: 8, k2_index: 8, k3_index: 8 } },
  { id: 'robot', name: 'Robot', params: { pitch_index: 30, energy_index: 9, k1_index: 16, k2_index: 16, k3_index: 8, chirp_type: 2 } },
  { id: 'alien', name: 'Alien', params: { pitch_index: 40, energy_index: 10, k1_index: 6, k2_index: 24, k3_index: 12, chirp_type: 1 } },
  { id: 'whisper', name: 'Whisper', params: { noise_mode: 1, energy_index: 9 } },
  { id: 'bright', name: 'Bright', params: { pitch_index: 36, energy_index: 11, k1_index: 22, k2_index: 20, k3_index: 10 } },
  { id: 'muffled', name: 'Muffled', params: { pitch_index: 28, energy_index: 8, k1_index: 6, k2_index: 6, k3_index: 4 } },
];