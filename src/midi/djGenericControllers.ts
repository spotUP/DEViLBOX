/**
 * Generic DJ Controller Templates
 *
 * Standard MIDI layouts for controllers without official presets.
 * Use these when your hardware isn't in the hardware preset list.
 *
 * Each template defines a common CC/Note layout that can be adapted
 * by switching DJ scenarios (via djScenarioPresets.ts).
 */

import type { DJControllerPreset } from './djControllerPresets';

// ============================================================================
// GENERIC TEMPLATES
// ============================================================================

/**
 * 8-Knob + 8-Pad Generic Controller
 * Standard layout: 8 knobs (CC 70-77), 8 pads (notes 36-43, channel 9)
 * 
 * Examples: Korg nanoKONTROL2, Akai LPD8, Novation Launch Control
 */
export const GENERIC_8x8: DJControllerPreset = {
  id: 'generic-8x8',
  name: 'Generic 8-Knob + 8-Pad',
  manufacturer: 'Generic',
  description: 'Standard 8-knob (CC 70-77) + 8-pad (36-43) layout',
  
  ccMappings: [
    // Knobs 1-4: Deck A
    { channel: 0, cc: 70, param: 'dj.deckA.eqHi' },
    { channel: 0, cc: 71, param: 'dj.deckA.eqMid' },
    { channel: 0, cc: 72, param: 'dj.deckA.eqLow' },
    { channel: 0, cc: 73, param: 'dj.deckA.filter' },
    // Knobs 5-8: Deck B
    { channel: 0, cc: 74, param: 'dj.deckB.eqHi' },
    { channel: 0, cc: 75, param: 'dj.deckB.eqMid' },
    { channel: 0, cc: 76, param: 'dj.deckB.eqLow' },
    { channel: 0, cc: 77, param: 'dj.deckB.filter' },
    // Faders (if available)
    { channel: 0, cc: 0, param: 'dj.deckA.volume' },
    { channel: 0, cc: 1, param: 'dj.deckB.volume' },
    { channel: 0, cc: 2, param: 'dj.crossfader' },
    { channel: 0, cc: 3, param: 'dj.masterVolume' },
  ],
  
  noteMappings: [
    // Pads 1-4: Deck A controls
    { channel: 9, note: 36, action: 'play_a' },
    { channel: 9, note: 37, action: 'cue_a' },
    { channel: 9, note: 38, action: 'sync_a' },
    { channel: 9, note: 39, action: 'hotcue1_a' },
    // Pads 5-8: Deck B controls
    { channel: 9, note: 40, action: 'play_b' },
    { channel: 9, note: 41, action: 'cue_b' },
    { channel: 9, note: 42, action: 'sync_b' },
    { channel: 9, note: 43, action: 'hotcue1_b' },
  ],
  
  jogMapping: {
    deckA: { channel: 0, cc: 16, touchNote: 60 },
    deckB: { channel: 1, cc: 16, touchNote: 61 },
  },
};

/**
 * 4-Knob + 16-Pad Generic Controller
 * Pad-heavy layout for performance controllers
 * 
 * Examples: Akai MPD218, Novation Launchpad Mini, Native Instruments Maschine Mikro
 */
export const GENERIC_4x16: DJControllerPreset = {
  id: 'generic-4x16',
  name: 'Generic 4-Knob + 16-Pad',
  manufacturer: 'Generic',
  description: 'Pad-heavy layout: 4 knobs + 16 pads (36-51)',
  
  ccMappings: [
    // 4 essential knobs
    { channel: 0, cc: 70, param: 'dj.deckA.filter' },
    { channel: 0, cc: 71, param: 'dj.deckB.filter' },
    { channel: 0, cc: 72, param: 'dj.deckA.volume' },
    { channel: 0, cc: 73, param: 'dj.deckB.volume' },
    // Crossfader (if available)
    { channel: 0, cc: 2, param: 'dj.crossfader' },
  ],
  
  noteMappings: [
    // Pads 1-8: Deck A (hot cues + transport)
    { channel: 9, note: 36, action: 'hotcue1_a' },
    { channel: 9, note: 37, action: 'hotcue2_a' },
    { channel: 9, note: 38, action: 'hotcue3_a' },
    { channel: 9, note: 39, action: 'hotcue4_a' },
    { channel: 9, note: 40, action: 'play_a' },
    { channel: 9, note: 41, action: 'cue_a' },
    { channel: 9, note: 42, action: 'sync_a' },
    { channel: 9, note: 43, action: 'loop_a' },
    // Pads 9-16: Deck B (hot cues + transport)
    { channel: 9, note: 44, action: 'hotcue1_b' },
    { channel: 9, note: 45, action: 'hotcue2_b' },
    { channel: 9, note: 46, action: 'hotcue3_b' },
    { channel: 9, note: 47, action: 'hotcue4_b' },
    { channel: 9, note: 48, action: 'play_b' },
    { channel: 9, note: 49, action: 'cue_b' },
    { channel: 9, note: 50, action: 'sync_b' },
    { channel: 9, note: 51, action: 'loop_b' },
  ],
  
  jogMapping: {
    deckA: { channel: 0, cc: 16, touchNote: 60 },
    deckB: { channel: 1, cc: 16, touchNote: 61 },
  },
};

/**
 * Simple 2-Channel Mixer
 * Minimal controls for basic mixing
 * 
 * Examples: Behringer CMD MICRO, Reloop Mixtour, basic MIDI mixers
 */
export const GENERIC_MIXER: DJControllerPreset = {
  id: 'generic-mixer',
  name: 'Generic 2-Channel Mixer',
  manufacturer: 'Generic',
  description: 'Simple mixer: faders, EQ, crossfader only',
  
  ccMappings: [
    // Channel faders
    { channel: 0, cc: 7, param: 'dj.deckA.volume' },
    { channel: 1, cc: 7, param: 'dj.deckB.volume' },
    // EQ Deck A
    { channel: 0, cc: 16, param: 'dj.deckA.eqHi' },
    { channel: 0, cc: 17, param: 'dj.deckA.eqMid' },
    { channel: 0, cc: 18, param: 'dj.deckA.eqLow' },
    // EQ Deck B
    { channel: 1, cc: 16, param: 'dj.deckB.eqHi' },
    { channel: 1, cc: 17, param: 'dj.deckB.eqMid' },
    { channel: 1, cc: 18, param: 'dj.deckB.eqLow' },
    // Crossfader
    { channel: 0, cc: 8, param: 'dj.crossfader' },
    // Master
    { channel: 0, cc: 10, param: 'dj.masterVolume' },
    // Pitch
    { channel: 0, cc: 9, param: 'dj.deckA.pitch', invert: true },
    { channel: 1, cc: 9, param: 'dj.deckB.pitch', invert: true },
  ],
  
  noteMappings: [
    // Transport (if buttons available)
    { channel: 0, note: 0, action: 'play_a' },
    { channel: 1, note: 0, action: 'play_b' },
    { channel: 0, note: 1, action: 'cue_a' },
    { channel: 1, note: 1, action: 'cue_b' },
    { channel: 0, note: 2, action: 'sync_a' },
    { channel: 1, note: 2, action: 'sync_b' },
  ],
  
  jogMapping: {
    deckA: { channel: 0, cc: 22, touchNote: 16 },
    deckB: { channel: 1, cc: 22, touchNote: 16 },
  },
};

/**
 * Full 4-Deck Controller
 * Advanced layout for 4-deck mixing (maps only A+B by default)
 * 
 * Examples: Pioneer DDJ-1000, Denon MCX8000, Traktor S4
 */
export const GENERIC_4DECK: DJControllerPreset = {
  id: 'generic-4deck',
  name: 'Generic 4-Deck Controller',
  manufacturer: 'Generic',
  description: 'Full 4-deck layout (A+B mapped, C+D reserved)',
  
  ccMappings: [
    // Deck A (Channel 0)
    { channel: 0, cc: 19, param: 'dj.deckA.volume' },
    { channel: 0, cc: 7, param: 'dj.deckA.eqHi' },
    { channel: 0, cc: 11, param: 'dj.deckA.eqMid' },
    { channel: 0, cc: 15, param: 'dj.deckA.eqLow' },
    { channel: 0, cc: 23, param: 'dj.deckA.filter' },
    { channel: 0, cc: 9, param: 'dj.deckA.pitch', invert: true },
    { channel: 0, cc: 4, param: 'dj.deckA.trimGain' },
    // Deck B (Channel 1)
    { channel: 1, cc: 19, param: 'dj.deckB.volume' },
    { channel: 1, cc: 7, param: 'dj.deckB.eqHi' },
    { channel: 1, cc: 11, param: 'dj.deckB.eqMid' },
    { channel: 1, cc: 15, param: 'dj.deckB.eqLow' },
    { channel: 1, cc: 23, param: 'dj.deckB.filter' },
    { channel: 1, cc: 9, param: 'dj.deckB.pitch', invert: true },
    { channel: 1, cc: 4, param: 'dj.deckB.trimGain' },
    // Master
    { channel: 0, cc: 63, param: 'dj.crossfader' },
    { channel: 0, cc: 25, param: 'dj.masterVolume' },
  ],
  
  noteMappings: [
    // Deck A
    { channel: 0, note: 11, action: 'play_a' },
    { channel: 0, note: 12, action: 'cue_a' },
    { channel: 0, note: 88, action: 'sync_a' },
    { channel: 7, note: 0, action: 'hotcue1_a' },
    { channel: 7, note: 1, action: 'hotcue2_a' },
    { channel: 7, note: 2, action: 'hotcue3_a' },
    { channel: 7, note: 3, action: 'hotcue4_a' },
    // Deck B
    { channel: 1, note: 11, action: 'play_b' },
    { channel: 1, note: 12, action: 'cue_b' },
    { channel: 1, note: 88, action: 'sync_b' },
    { channel: 7, note: 4, action: 'hotcue1_b' },
    { channel: 7, note: 5, action: 'hotcue2_b' },
    { channel: 7, note: 6, action: 'hotcue3_b' },
    { channel: 7, note: 7, action: 'hotcue4_b' },
  ],
  
  jogMapping: {
    deckA: { channel: 0, cc: 33, touchNote: 54 },
    deckB: { channel: 1, cc: 33, touchNote: 54 },
  },
};

/**
 * MIDI Fighter Twister / Rotation Controller
 * 16 encoder knobs (CC 0-15)
 * 
 * Example: DJ Tech Tools MIDI Fighter Twister
 */
export const GENERIC_TWISTER: DJControllerPreset = {
  id: 'generic-twister',
  name: 'Generic Rotation Controller',
  manufacturer: 'Generic',
  description: '16-encoder layout (e.g., MIDI Fighter Twister)',
  
  ccMappings: [
    // Bank 1: Deck A (knobs 1-8)
    { channel: 0, cc: 0, param: 'dj.deckA.volume' },
    { channel: 0, cc: 1, param: 'dj.deckA.filter' },
    { channel: 0, cc: 2, param: 'dj.deckA.eqHi' },
    { channel: 0, cc: 3, param: 'dj.deckA.eqMid' },
    { channel: 0, cc: 4, param: 'dj.deckA.eqLow' },
    { channel: 0, cc: 5, param: 'dj.deckA.pitch' },
    { channel: 0, cc: 6, param: 'dj.deckA.filterQ' },
    { channel: 0, cc: 7, param: 'dj.deckA.trimGain' },
    // Bank 2: Deck B (knobs 9-16)
    { channel: 0, cc: 8, param: 'dj.deckB.volume' },
    { channel: 0, cc: 9, param: 'dj.deckB.filter' },
    { channel: 0, cc: 10, param: 'dj.deckB.eqHi' },
    { channel: 0, cc: 11, param: 'dj.deckB.eqMid' },
    { channel: 0, cc: 12, param: 'dj.deckB.eqLow' },
    { channel: 0, cc: 13, param: 'dj.deckB.pitch' },
    { channel: 0, cc: 14, param: 'dj.deckB.filterQ' },
    { channel: 0, cc: 15, param: 'dj.crossfader' },
  ],
  
  noteMappings: [
    // Encoder push buttons (if available)
    { channel: 0, note: 0, action: 'play_a' },
    { channel: 0, note: 1, action: 'cue_a' },
    { channel: 0, note: 2, action: 'sync_a' },
    { channel: 0, note: 8, action: 'play_b' },
    { channel: 0, note: 9, action: 'cue_b' },
    { channel: 0, note: 10, action: 'sync_b' },
  ],
};

// ============================================================================
// PRESET REGISTRY
// ============================================================================

export const DJ_GENERIC_CONTROLLERS: DJControllerPreset[] = [
  GENERIC_8x8,
  GENERIC_4x16,
  GENERIC_MIXER,
  GENERIC_4DECK,
  GENERIC_TWISTER,
];

export function getGenericControllerById(id: string): DJControllerPreset | null {
  return DJ_GENERIC_CONTROLLERS.find(c => c.id === id) ?? null;
}
