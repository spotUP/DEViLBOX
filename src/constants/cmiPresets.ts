/**
 * CMI Factory Presets — curated parameter combinations for the Fairlight CMI IIx
 *
 * Parameter ranges:
 * - volume: 0-255
 * - filter_cutoff: 0-255 (SSM2045 cascaded filter)
 * - envelope_rate: 0-255 (sustain droop speed)
 * - wave_select: 0-7 (builtin waveform bank)
 * - attack_time: 0-255 (mapped to ms internally)
 * - release_time: 0-255 (mapped to ms internally)
 * - filter_track: 0-255 (keyboard tracking amount)
 */

export interface CMIPreset {
  name: string;
  description: string;
  params: {
    volume: number;
    wave_select: number;
    filter_cutoff: number;
    filter_track: number;
    attack_time: number;
    release_time: number;
    envelope_rate: number;
  };
}

export const CMI_PRESETS: CMIPreset[] = [
  {
    name: 'Init',
    description: 'Default CMI patch — bright, snappy',
    params: { volume: 200, wave_select: 0, filter_cutoff: 200, filter_track: 128, attack_time: 10, release_time: 80, envelope_rate: 200 },
  },
  {
    name: 'Bright Strings',
    description: 'Lush sawtooth strings — Orch5 style',
    params: { volume: 200, wave_select: 1, filter_cutoff: 220, filter_track: 100, attack_time: 60, release_time: 120, envelope_rate: 245 },
  },
  {
    name: 'Dark Pad',
    description: 'Filtered triangle pad — warm and evolving',
    params: { volume: 210, wave_select: 3, filter_cutoff: 100, filter_track: 60, attack_time: 120, release_time: 180, envelope_rate: 230 },
  },
  {
    name: 'Choir',
    description: 'Ethereal choir waveform — Peter Gabriel era',
    params: { volume: 190, wave_select: 5, filter_cutoff: 180, filter_track: 90, attack_time: 80, release_time: 150, envelope_rate: 240 },
  },
  {
    name: 'Organ',
    description: 'Classic Fairlight organ — multiple harmonics',
    params: { volume: 200, wave_select: 6, filter_cutoff: 240, filter_track: 128, attack_time: 5, release_time: 40, envelope_rate: 250 },
  },
  {
    name: 'Bass',
    description: 'Deep subtractive bass — square wave filtered',
    params: { volume: 220, wave_select: 7, filter_cutoff: 120, filter_track: 40, attack_time: 5, release_time: 60, envelope_rate: 200 },
  },
  {
    name: 'Pluck',
    description: 'Short plucked — fast attack, quick decay',
    params: { volume: 200, wave_select: 1, filter_cutoff: 240, filter_track: 180, attack_time: 2, release_time: 30, envelope_rate: 150 },
  },
  {
    name: 'Bell',
    description: 'Metallic bell — sine with fast filter sweep',
    params: { volume: 180, wave_select: 0, filter_cutoff: 255, filter_track: 200, attack_time: 2, release_time: 200, envelope_rate: 180 },
  },
  {
    name: 'Mellow Keys',
    description: 'Soft electric piano — gentle attack',
    params: { volume: 190, wave_select: 4, filter_cutoff: 160, filter_track: 100, attack_time: 15, release_time: 100, envelope_rate: 220 },
  },
  {
    name: 'Sweep',
    description: 'Filter sweep pad — Art of Noise style',
    params: { volume: 200, wave_select: 2, filter_cutoff: 60, filter_track: 200, attack_time: 100, release_time: 200, envelope_rate: 210 },
  },
  {
    name: 'Stab',
    description: 'Aggressive stab — bright square, fast envelope',
    params: { volume: 230, wave_select: 2, filter_cutoff: 255, filter_track: 128, attack_time: 1, release_time: 20, envelope_rate: 120 },
  },
  {
    name: 'Atmosphere',
    description: 'Evolving atmosphere — slow attack, long release',
    params: { volume: 180, wave_select: 3, filter_cutoff: 140, filter_track: 60, attack_time: 200, release_time: 250, envelope_rate: 250 },
  },
];
