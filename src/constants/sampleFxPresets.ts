/**
 * Sample FX Presets — Reggae Sound System Edition
 *
 * Effects-only presets for sample-based drum pads.
 * Apply SpringReverb, SpaceEcho, TapeSaturation, and more
 * to any loaded sample for that full dub treatment.
 *
 * Each preset is an array of EffectConfig — no synth config needed.
 */

import type { EffectConfig } from '@typedefs/instrument';

export interface SampleFxPreset {
  name: string;
  category: 'Dub Classics' | 'Echo Chamber' | 'Lo-Fi Vibes' | 'Clean & Punchy' | 'Extreme FX';
  effects: EffectConfig[];
}

// =============================================================================
// DUB CLASSICS — The essential reggae sound system treatment
// =============================================================================

const DUB_PLATE_SPECIAL: SampleFxPreset = {
  name: 'Dub Plate Special',
  category: 'Dub Classics',
  effects: [
    { id: 'sfx-eq', category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 3, mid: -2, high: -1.5 } },
    { id: 'sfx-sat', category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 40, parameters: { drive: 35, frequency: 1600 } },
    { id: 'sfx-spring', category: 'wasm', type: 'SpringReverb', enabled: true, wet: 30, parameters: { decay: 0.55, damping: 0.35, tension: 0.45, mix: 0.35, drip: 0.6, diffusion: 0.7 } },
    { id: 'sfx-echo', category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 35, parameters: { mode: 4, rate: 300, intensity: 0.25, echoVolume: 0.4, reverbVolume: 0.15, bpmSync: 1, syncDivision: '1/4' } },
  ],
};

const KING_TUBBYS: SampleFxPreset = {
  name: "King Tubby's Mix",
  category: 'Dub Classics',
  effects: [
    { id: 'sfx-eq', category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 4, mid: -3, high: -2 } },
    { id: 'sfx-sat', category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 50, parameters: { drive: 45, frequency: 1200 } },
    { id: 'sfx-spring', category: 'wasm', type: 'SpringReverb', enabled: true, wet: 40, parameters: { decay: 0.7, damping: 0.3, tension: 0.4, mix: 0.45, drip: 0.65, diffusion: 0.8 } },
    { id: 'sfx-echo', category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 45, parameters: { mode: 4, rate: 350, intensity: 0.3, echoVolume: 0.45, reverbVolume: 0.25, bpmSync: 1, syncDivision: '1/4' } },
  ],
};

const SCIENTIST_DUB: SampleFxPreset = {
  name: 'Scientist Dub',
  category: 'Dub Classics',
  effects: [
    { id: 'sfx-eq', category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 3.5, mid: -1.5, high: -1 } },
    { id: 'sfx-sat', category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 35, parameters: { drive: 30, frequency: 2000 } },
    { id: 'sfx-spring', category: 'wasm', type: 'SpringReverb', enabled: true, wet: 35, parameters: { decay: 0.65, damping: 0.25, tension: 0.5, mix: 0.4, drip: 0.55, diffusion: 0.75 } },
    { id: 'sfx-echo', category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 40, parameters: { mode: 3, rate: 250, intensity: 0.25, echoVolume: 0.4, reverbVolume: 0.2, bpmSync: 1, syncDivision: '1/8' } },
    { id: 'sfx-comp', category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -10, ratio: 6, attack: 0.003, release: 0.05 } },
  ],
};

const LEE_PERRY_BLACK_ARK: SampleFxPreset = {
  name: 'Black Ark',
  category: 'Dub Classics',
  effects: [
    { id: 'sfx-eq', category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 5, mid: -4, high: -3 } },
    { id: 'sfx-sat', category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 60, parameters: { drive: 55, frequency: 1000 } },
    { id: 'sfx-spring', category: 'wasm', type: 'SpringReverb', enabled: true, wet: 45, parameters: { decay: 0.8, damping: 0.2, tension: 0.35, mix: 0.5, drip: 0.7, diffusion: 0.85 } },
    { id: 'sfx-echo', category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 50, parameters: { mode: 4, rate: 400, intensity: 0.3, echoVolume: 0.45, reverbVolume: 0.3, bpmSync: 1, syncDivision: '1/4' } },
  ],
};

const REGGAE_SOUNDSYSTEM: SampleFxPreset = {
  name: 'Reggae Soundsystem',
  category: 'Dub Classics',
  effects: [
    { id: 'sfx-eq', category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 4, mid: -2, high: -2 } },
    { id: 'sfx-sat', category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 45, parameters: { drive: 40, frequency: 1400 } },
    { id: 'sfx-spring', category: 'wasm', type: 'SpringReverb', enabled: true, wet: 30, parameters: { decay: 0.55, damping: 0.4, tension: 0.5, mix: 0.35, drip: 0.55, diffusion: 0.7 } },
    // intensity 0.45 at rate 300ms → ~2s tail (tail stays below -40 dB within ~2s).
    { id: 'sfx-echo', category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 35, parameters: { mode: 4, rate: 300, intensity: 0.45, echoVolume: 0.45, reverbVolume: 0.15, bpmSync: 1, syncDivision: '1/4' } },
  ],
};

// =============================================================================
// ECHO CHAMBER — Delay-heavy presets
// =============================================================================

const TAPE_ECHO_DUB: SampleFxPreset = {
  name: 'Tape Echo Dub',
  category: 'Echo Chamber',
  effects: [
    { id: 'sfx-sat', category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 45, parameters: { drive: 40, frequency: 1400 } },
    { id: 'sfx-echo', category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 55, parameters: { mode: 4, rate: 280, intensity: 0.3, echoVolume: 0.45, reverbVolume: 0.1, bpmSync: 1, syncDivision: '1/4' } },
    { id: 'sfx-spring', category: 'wasm', type: 'SpringReverb', enabled: true, wet: 20, parameters: { decay: 0.4, damping: 0.4, tension: 0.5, mix: 0.25, drip: 0.45, diffusion: 0.6 } },
  ],
};

const STEPPERS_DELAY: SampleFxPreset = {
  name: 'Steppers Delay',
  category: 'Echo Chamber',
  effects: [
    { id: 'sfx-eq', category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 2, mid: 0, high: -1 } },
    { id: 'sfx-echo', category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 50, parameters: { mode: 3, rate: 200, intensity: 0.3, echoVolume: 0.45, reverbVolume: 0.15, bpmSync: 1, syncDivision: '1/8' } },
    { id: 'sfx-sat', category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 35, parameters: { drive: 30, frequency: 1800 } },
  ],
};

const DUB_SIREN_ECHO: SampleFxPreset = {
  name: 'Siren Echo',
  category: 'Echo Chamber',
  effects: [
    { id: 'sfx-sat', category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 50, parameters: { drive: 50, frequency: 1600 } },
    { id: 'sfx-echo', category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 60, parameters: { mode: 4, rate: 350, intensity: 0.35, echoVolume: 0.3, reverbVolume: 0.2, bpmSync: 1, syncDivision: '1/4' } },
    { id: 'sfx-spring', category: 'wasm', type: 'SpringReverb', enabled: true, wet: 30, parameters: { decay: 0.6, damping: 0.3, tension: 0.45, mix: 0.35, drip: 0.6, diffusion: 0.7 } },
  ],
};

const INFINITE_ECHO: SampleFxPreset = {
  name: 'Infinite Echo',
  category: 'Echo Chamber',
  effects: [
    { id: 'sfx-echo', category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 65, parameters: { mode: 4, rate: 400, intensity: 0.35, echoVolume: 0.3, reverbVolume: 0.3, bpmSync: 1, syncDivision: '1/4' } },
    { id: 'sfx-spring', category: 'wasm', type: 'SpringReverb', enabled: true, wet: 35, parameters: { decay: 0.75, damping: 0.2, tension: 0.4, mix: 0.4, drip: 0.5, diffusion: 0.8 } },
    { id: 'sfx-sat', category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 40, parameters: { drive: 35, frequency: 1200 } },
  ],
};

// =============================================================================
// LO-FI VIBES — Warm, degraded, analog character
// =============================================================================

const VINYL_DUB: SampleFxPreset = {
  name: 'Vinyl Dub',
  category: 'Lo-Fi Vibes',
  effects: [
    { id: 'sfx-eq', category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 2, mid: -1, high: -4 } },
    { id: 'sfx-sat', category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 60, parameters: { drive: 55, frequency: 800 } },
    { id: 'sfx-spring', category: 'wasm', type: 'SpringReverb', enabled: true, wet: 25, parameters: { decay: 0.5, damping: 0.45, tension: 0.5, mix: 0.3, drip: 0.4, diffusion: 0.6 } },
    { id: 'sfx-echo', category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 30, parameters: { mode: 3, rate: 300, intensity: 0.2, echoVolume: 0.35, reverbVolume: 0.15, bpmSync: 1, syncDivision: '1/4' } },
  ],
};

const ROOTS_RIDDIM: SampleFxPreset = {
  name: 'Roots Riddim',
  category: 'Lo-Fi Vibes',
  effects: [
    { id: 'sfx-eq', category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 4.5, mid: -2, high: -2.5 } },
    { id: 'sfx-sat', category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 55, parameters: { drive: 50, frequency: 1000 } },
    { id: 'sfx-comp', category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -12, ratio: 8, attack: 0.005, release: 0.06 } },
    { id: 'sfx-spring', category: 'wasm', type: 'SpringReverb', enabled: true, wet: 20, parameters: { decay: 0.45, damping: 0.4, tension: 0.5, mix: 0.25, drip: 0.5, diffusion: 0.65 } },
  ],
};

const DANCEHALL_CRUNCH: SampleFxPreset = {
  name: 'Dancehall Crunch',
  category: 'Lo-Fi Vibes',
  effects: [
    { id: 'sfx-eq', category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 3, mid: 1, high: -1 } },
    { id: 'sfx-sat', category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 65, parameters: { drive: 60, frequency: 2200 } },
    { id: 'sfx-comp', category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -8, ratio: 10, attack: 0.001, release: 0.04 } },
    { id: 'sfx-echo', category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 25, parameters: { mode: 3, rate: 200, intensity: 0.2, echoVolume: 0.35, reverbVolume: 0.1, bpmSync: 1, syncDivision: '1/8' } },
  ],
};

const SOUND_SYSTEM_BASS: SampleFxPreset = {
  name: 'Sound System Bass',
  category: 'Lo-Fi Vibes',
  effects: [
    { id: 'sfx-eq', category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 6, mid: -3, high: -4 } },
    { id: 'sfx-sat', category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 50, parameters: { drive: 45, frequency: 600 } },
    { id: 'sfx-comp', category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -6, ratio: 12, attack: 0.001, release: 0.03 } },
    { id: 'sfx-spring', category: 'wasm', type: 'SpringReverb', enabled: true, wet: 15, parameters: { decay: 0.35, damping: 0.5, tension: 0.55, mix: 0.2, drip: 0.3, diffusion: 0.5 } },
  ],
};

// =============================================================================
// CLEAN & PUNCHY — Enhance without adding much color
// =============================================================================

const CLEAN_PUNCH: SampleFxPreset = {
  name: 'Clean Punch',
  category: 'Clean & Punchy',
  effects: [
    { id: 'sfx-eq', category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 2, mid: 0.5, high: 0 } },
    { id: 'sfx-comp', category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -10, ratio: 6, attack: 0.002, release: 0.05 } },
    { id: 'sfx-sat', category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 25, parameters: { drive: 20, frequency: 2000 } },
  ],
};

const TIGHT_ROOM: SampleFxPreset = {
  name: 'Tight Room',
  category: 'Clean & Punchy',
  effects: [
    { id: 'sfx-spring', category: 'wasm', type: 'SpringReverb', enabled: true, wet: 15, parameters: { decay: 0.25, damping: 0.5, tension: 0.6, mix: 0.2, drip: 0.3, diffusion: 0.5 } },
    { id: 'sfx-comp', category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -12, ratio: 4, attack: 0.003, release: 0.06 } },
    { id: 'sfx-sat', category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 20, parameters: { drive: 15, frequency: 2400 } },
  ],
};

const NATURAL_VERB: SampleFxPreset = {
  name: 'Natural Verb',
  category: 'Clean & Punchy',
  effects: [
    { id: 'sfx-eq', category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 1, mid: 0, high: -0.5 } },
    { id: 'sfx-spring', category: 'wasm', type: 'SpringReverb', enabled: true, wet: 25, parameters: { decay: 0.5, damping: 0.35, tension: 0.5, mix: 0.3, drip: 0.45, diffusion: 0.65 } },
  ],
};

// =============================================================================
// EXTREME FX — Wild, creative, crowd-wrecking
// =============================================================================

const SOUND_CLASH: SampleFxPreset = {
  name: 'Sound Clash',
  category: 'Extreme FX',
  effects: [
    { id: 'sfx-eq', category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 5, mid: -2, high: 1 } },
    { id: 'sfx-sat', category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 70, parameters: { drive: 65, frequency: 1400 } },
    { id: 'sfx-comp', category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -6, ratio: 12, attack: 0.001, release: 0.03 } },
    { id: 'sfx-spring', category: 'wasm', type: 'SpringReverb', enabled: true, wet: 40, parameters: { decay: 0.7, damping: 0.2, tension: 0.35, mix: 0.45, drip: 0.7, diffusion: 0.8 } },
    { id: 'sfx-echo', category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 50, parameters: { mode: 4, rate: 350, intensity: 0.35, echoVolume: 0.3, reverbVolume: 0.25, bpmSync: 1, syncDivision: '1/4' } },
  ],
};

const EARTHQUAKE_BASS: SampleFxPreset = {
  name: 'Earthquake Bass',
  category: 'Extreme FX',
  effects: [
    { id: 'sfx-eq', category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 8, mid: -5, high: -6 } },
    { id: 'sfx-sat', category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 70, parameters: { drive: 60, frequency: 500 } },
    { id: 'sfx-comp', category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -4, ratio: 14, attack: 0.001, release: 0.02 } },
    { id: 'sfx-spring', category: 'wasm', type: 'SpringReverb', enabled: true, wet: 30, parameters: { decay: 0.6, damping: 0.3, tension: 0.4, mix: 0.35, drip: 0.5, diffusion: 0.7 } },
  ],
};

const DUB_DESTROYER: SampleFxPreset = {
  name: 'Dub Destroyer',
  category: 'Extreme FX',
  effects: [
    { id: 'sfx-sat', category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 80, parameters: { drive: 75, frequency: 1000 } },
    { id: 'sfx-spring', category: 'wasm', type: 'SpringReverb', enabled: true, wet: 50, parameters: { decay: 0.85, damping: 0.15, tension: 0.3, mix: 0.55, drip: 0.75, diffusion: 0.9 } },
    { id: 'sfx-echo', category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 60, parameters: { mode: 4, rate: 450, intensity: 0.35, echoVolume: 0.3, reverbVolume: 0.35, bpmSync: 1, syncDivision: '1/4' } },
    { id: 'sfx-comp', category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -6, ratio: 10, attack: 0.001, release: 0.04 } },
  ],
};

const REWIND_MADNESS: SampleFxPreset = {
  name: 'Rewind Madness',
  category: 'Extreme FX',
  effects: [
    { id: 'sfx-eq', category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 4, mid: -1, high: 2 } },
    { id: 'sfx-sat', category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 55, parameters: { drive: 50, frequency: 1800 } },
    { id: 'sfx-echo', category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 55, parameters: { mode: 3, rate: 150, intensity: 0.35, echoVolume: 0.3, reverbVolume: 0.2, bpmSync: 1, syncDivision: '1/8' } },
    { id: 'sfx-spring', category: 'wasm', type: 'SpringReverb', enabled: true, wet: 35, parameters: { decay: 0.55, damping: 0.3, tension: 0.45, mix: 0.4, drip: 0.6, diffusion: 0.7 } },
  ],
};

// =============================================================================
// EXPORT
// =============================================================================

export const SAMPLE_FX_PRESETS: SampleFxPreset[] = [
  // Dub Classics
  REGGAE_SOUNDSYSTEM,
  DUB_PLATE_SPECIAL,
  KING_TUBBYS,
  SCIENTIST_DUB,
  LEE_PERRY_BLACK_ARK,
  // Echo Chamber
  TAPE_ECHO_DUB,
  STEPPERS_DELAY,
  DUB_SIREN_ECHO,
  INFINITE_ECHO,
  // Lo-Fi Vibes
  VINYL_DUB,
  ROOTS_RIDDIM,
  DANCEHALL_CRUNCH,
  SOUND_SYSTEM_BASS,
  // Clean & Punchy
  CLEAN_PUNCH,
  TIGHT_ROOM,
  NATURAL_VERB,
  // Extreme FX
  SOUND_CLASH,
  EARTHQUAKE_BASS,
  DUB_DESTROYER,
  REWIND_MADNESS,
];
