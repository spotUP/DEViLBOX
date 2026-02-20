/**
 * DJ Controller Presets - MIDI mappings for popular Serato/DJ controllers
 *
 * Each preset defines CC-to-parameter and Note-to-action mappings
 * matching the controller's MIDI specification.
 *
 * Controllers use MIDI channels to distinguish decks:
 *   Channel 0 (1) = Deck A / Global
 *   Channel 1 (2) = Deck B
 *
 * CC values are 0-127, normalized to 0-1 before routing.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface DJControllerCCMapping {
  channel: number;  // MIDI channel (0-indexed: 0-15)
  cc: number;       // CC number (0-127)
  param: string;    // DJ parameter path (matches parameterRouter keys)
  invert?: boolean; // Some faders are physically inverted
}

export interface DJControllerNoteMapping {
  channel: number;  // MIDI channel (0-indexed)
  note: number;     // MIDI note number
  action: string;   // DJ action identifier
}

export interface DJControllerJogMapping {
  channel: number;
  cc: number;       // CC for jog wheel rotation
  touchNote?: number; // Note for jog wheel touch (platter touch sensor)
}

export interface DJControllerPreset {
  id: string;
  name: string;
  manufacturer: string;
  description: string;
  ccMappings: DJControllerCCMapping[];
  noteMappings: DJControllerNoteMapping[];
  jogMapping?: {
    deckA: DJControllerJogMapping;
    deckB: DJControllerJogMapping;
  };
}

// ============================================================================
// DJ ACTIONS (for note mappings)
// ============================================================================

/** Transport actions triggered by MIDI notes */
export type DJAction =
  | 'play_a' | 'play_b'
  | 'cue_a' | 'cue_b'
  | 'sync_a' | 'sync_b'
  | 'hotcue1_a' | 'hotcue2_a' | 'hotcue3_a' | 'hotcue4_a'
  | 'hotcue5_a' | 'hotcue6_a' | 'hotcue7_a' | 'hotcue8_a'
  | 'hotcue1_b' | 'hotcue2_b' | 'hotcue3_b' | 'hotcue4_b'
  | 'hotcue5_b' | 'hotcue6_b' | 'hotcue7_b' | 'hotcue8_b'
  | 'loop_a' | 'loop_b'
  | 'scratch_a' | 'scratch_b';

// ============================================================================
// CONTROLLER PRESETS
// ============================================================================

/**
 * Pioneer DDJ-SB3
 * Entry-level 2-channel Serato DJ controller
 * MIDI spec: Deck 1 = Ch 0, Deck 2 = Ch 1
 */
const PIONEER_DDJ_SB3: DJControllerPreset = {
  id: 'pioneer-ddj-sb3',
  name: 'DDJ-SB3',
  manufacturer: 'Pioneer DJ',
  description: '2-channel Serato DJ controller',
  ccMappings: [
    // Crossfader
    { channel: 0, cc: 63, param: 'dj.crossfader' },
    // Channel faders
    { channel: 0, cc: 19, param: 'dj.deckA.volume' },
    { channel: 1, cc: 19, param: 'dj.deckB.volume' },
    // Trim/Gain
    { channel: 0, cc: 4, param: 'dj.deckA.volume' },
    { channel: 1, cc: 4, param: 'dj.deckB.volume' },
    // EQ High
    { channel: 0, cc: 7, param: 'dj.deckA.eqHi' },
    { channel: 1, cc: 7, param: 'dj.deckB.eqHi' },
    // EQ Mid
    { channel: 0, cc: 11, param: 'dj.deckA.eqMid' },
    { channel: 1, cc: 11, param: 'dj.deckB.eqMid' },
    // EQ Low
    { channel: 0, cc: 15, param: 'dj.deckA.eqLow' },
    { channel: 1, cc: 15, param: 'dj.deckB.eqLow' },
    // Filter
    { channel: 0, cc: 23, param: 'dj.deckA.filter' },
    { channel: 1, cc: 23, param: 'dj.deckB.filter' },
    // Tempo slider
    { channel: 0, cc: 9, param: 'dj.deckA.pitch', invert: true },
    { channel: 1, cc: 9, param: 'dj.deckB.pitch', invert: true },
  ],
  noteMappings: [
    // Play/Pause
    { channel: 0, note: 11, action: 'play_a' },
    { channel: 1, note: 11, action: 'play_b' },
    // Cue
    { channel: 0, note: 12, action: 'cue_a' },
    { channel: 1, note: 12, action: 'cue_b' },
    // Sync
    { channel: 0, note: 88, action: 'sync_a' },
    { channel: 1, note: 88, action: 'sync_b' },
    // Hot Cues (Performance Pads in Hot Cue mode)
    { channel: 7, note: 0, action: 'hotcue1_a' },
    { channel: 7, note: 1, action: 'hotcue2_a' },
    { channel: 7, note: 2, action: 'hotcue3_a' },
    { channel: 7, note: 3, action: 'hotcue4_a' },
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
 * Pioneer DDJ-FLX4
 * Newer entry-level 2-channel controller (Serato/rekordbox compatible)
 */
const PIONEER_DDJ_FLX4: DJControllerPreset = {
  id: 'pioneer-ddj-flx4',
  name: 'DDJ-FLX4',
  manufacturer: 'Pioneer DJ',
  description: '2-channel DJ controller (Serato/rekordbox)',
  ccMappings: [
    { channel: 0, cc: 31, param: 'dj.crossfader' },
    { channel: 0, cc: 19, param: 'dj.deckA.volume' },
    { channel: 1, cc: 19, param: 'dj.deckB.volume' },
    { channel: 0, cc: 7, param: 'dj.deckA.eqHi' },
    { channel: 1, cc: 7, param: 'dj.deckB.eqHi' },
    { channel: 0, cc: 11, param: 'dj.deckA.eqMid' },
    { channel: 1, cc: 11, param: 'dj.deckB.eqMid' },
    { channel: 0, cc: 15, param: 'dj.deckA.eqLow' },
    { channel: 1, cc: 15, param: 'dj.deckB.eqLow' },
    { channel: 0, cc: 23, param: 'dj.deckA.filter' },
    { channel: 1, cc: 23, param: 'dj.deckB.filter' },
    { channel: 0, cc: 9, param: 'dj.deckA.pitch', invert: true },
    { channel: 1, cc: 9, param: 'dj.deckB.pitch', invert: true },
  ],
  noteMappings: [
    { channel: 0, note: 11, action: 'play_a' },
    { channel: 1, note: 11, action: 'play_b' },
    { channel: 0, note: 12, action: 'cue_a' },
    { channel: 1, note: 12, action: 'cue_b' },
    { channel: 0, note: 88, action: 'sync_a' },
    { channel: 1, note: 88, action: 'sync_b' },
    { channel: 7, note: 0, action: 'hotcue1_a' },
    { channel: 7, note: 1, action: 'hotcue2_a' },
    { channel: 7, note: 2, action: 'hotcue3_a' },
    { channel: 7, note: 3, action: 'hotcue4_a' },
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
 * Pioneer DDJ-1000
 * Professional 4-channel Serato DJ controller
 * Uses channels 0-3 for decks 1-4 (we map decks 1+2)
 */
const PIONEER_DDJ_1000: DJControllerPreset = {
  id: 'pioneer-ddj-1000',
  name: 'DDJ-1000',
  manufacturer: 'Pioneer DJ',
  description: '4-channel professional DJ controller',
  ccMappings: [
    { channel: 0, cc: 63, param: 'dj.crossfader' },
    { channel: 0, cc: 19, param: 'dj.deckA.volume' },
    { channel: 1, cc: 19, param: 'dj.deckB.volume' },
    { channel: 0, cc: 4, param: 'dj.deckA.volume' },
    { channel: 1, cc: 4, param: 'dj.deckB.volume' },
    { channel: 0, cc: 7, param: 'dj.deckA.eqHi' },
    { channel: 1, cc: 7, param: 'dj.deckB.eqHi' },
    { channel: 0, cc: 11, param: 'dj.deckA.eqMid' },
    { channel: 1, cc: 11, param: 'dj.deckB.eqMid' },
    { channel: 0, cc: 15, param: 'dj.deckA.eqLow' },
    { channel: 1, cc: 15, param: 'dj.deckB.eqLow' },
    { channel: 0, cc: 23, param: 'dj.deckA.filter' },
    { channel: 1, cc: 23, param: 'dj.deckB.filter' },
    { channel: 0, cc: 9, param: 'dj.deckA.pitch', invert: true },
    { channel: 1, cc: 9, param: 'dj.deckB.pitch', invert: true },
    // Master level
    { channel: 0, cc: 25, param: 'dj.masterVolume' },
  ],
  noteMappings: [
    { channel: 0, note: 11, action: 'play_a' },
    { channel: 1, note: 11, action: 'play_b' },
    { channel: 0, note: 12, action: 'cue_a' },
    { channel: 1, note: 12, action: 'cue_b' },
    { channel: 0, note: 88, action: 'sync_a' },
    { channel: 1, note: 88, action: 'sync_b' },
    // Hot Cues
    { channel: 7, note: 0, action: 'hotcue1_a' },
    { channel: 7, note: 1, action: 'hotcue2_a' },
    { channel: 7, note: 2, action: 'hotcue3_a' },
    { channel: 7, note: 3, action: 'hotcue4_a' },
    { channel: 7, note: 4, action: 'hotcue5_a' },
    { channel: 7, note: 5, action: 'hotcue6_a' },
    { channel: 7, note: 6, action: 'hotcue7_a' },
    { channel: 7, note: 7, action: 'hotcue8_a' },
    { channel: 7, note: 8, action: 'hotcue1_b' },
    { channel: 7, note: 9, action: 'hotcue2_b' },
    { channel: 7, note: 10, action: 'hotcue3_b' },
    { channel: 7, note: 11, action: 'hotcue4_b' },
    { channel: 7, note: 12, action: 'hotcue5_b' },
    { channel: 7, note: 13, action: 'hotcue6_b' },
    { channel: 7, note: 14, action: 'hotcue7_b' },
    { channel: 7, note: 15, action: 'hotcue8_b' },
  ],
  jogMapping: {
    deckA: { channel: 0, cc: 33, touchNote: 54 },
    deckB: { channel: 1, cc: 33, touchNote: 54 },
  },
};

/**
 * Numark Mixtrack Pro FX
 * 2-channel Serato DJ controller
 */
const NUMARK_MIXTRACK_PRO_FX: DJControllerPreset = {
  id: 'numark-mixtrack-pro-fx',
  name: 'Mixtrack Pro FX',
  manufacturer: 'Numark',
  description: '2-channel Serato DJ controller',
  ccMappings: [
    { channel: 0, cc: 26, param: 'dj.crossfader' },
    { channel: 0, cc: 23, param: 'dj.deckA.volume' },
    { channel: 1, cc: 23, param: 'dj.deckB.volume' },
    { channel: 0, cc: 7, param: 'dj.deckA.eqHi' },
    { channel: 1, cc: 7, param: 'dj.deckB.eqHi' },
    { channel: 0, cc: 11, param: 'dj.deckA.eqMid' },
    { channel: 1, cc: 11, param: 'dj.deckB.eqMid' },
    { channel: 0, cc: 15, param: 'dj.deckA.eqLow' },
    { channel: 1, cc: 15, param: 'dj.deckB.eqLow' },
    { channel: 0, cc: 27, param: 'dj.deckA.filter' },
    { channel: 1, cc: 27, param: 'dj.deckB.filter' },
    { channel: 0, cc: 9, param: 'dj.deckA.pitch', invert: true },
    { channel: 1, cc: 9, param: 'dj.deckB.pitch', invert: true },
  ],
  noteMappings: [
    { channel: 0, note: 0, action: 'play_a' },
    { channel: 1, note: 0, action: 'play_b' },
    { channel: 0, note: 1, action: 'cue_a' },
    { channel: 1, note: 1, action: 'cue_b' },
    { channel: 0, note: 2, action: 'sync_a' },
    { channel: 1, note: 2, action: 'sync_b' },
    // Pads
    { channel: 0, note: 20, action: 'hotcue1_a' },
    { channel: 0, note: 21, action: 'hotcue2_a' },
    { channel: 0, note: 22, action: 'hotcue3_a' },
    { channel: 0, note: 23, action: 'hotcue4_a' },
    { channel: 1, note: 20, action: 'hotcue1_b' },
    { channel: 1, note: 21, action: 'hotcue2_b' },
    { channel: 1, note: 22, action: 'hotcue3_b' },
    { channel: 1, note: 23, action: 'hotcue4_b' },
  ],
  jogMapping: {
    deckA: { channel: 0, cc: 22, touchNote: 10 },
    deckB: { channel: 1, cc: 22, touchNote: 10 },
  },
};

/**
 * Numark DJ2GO2 Touch
 * Ultra-portable 2-channel Serato DJ controller
 */
const NUMARK_DJ2GO2: DJControllerPreset = {
  id: 'numark-dj2go2',
  name: 'DJ2GO2 Touch',
  manufacturer: 'Numark',
  description: 'Portable 2-channel Serato DJ controller',
  ccMappings: [
    { channel: 0, cc: 8, param: 'dj.crossfader' },
    { channel: 0, cc: 9, param: 'dj.deckA.pitch', invert: true },
    { channel: 1, cc: 9, param: 'dj.deckB.pitch', invert: true },
    { channel: 0, cc: 19, param: 'dj.deckA.volume' },
    { channel: 1, cc: 19, param: 'dj.deckB.volume' },
  ],
  noteMappings: [
    { channel: 0, note: 7, action: 'play_a' },
    { channel: 1, note: 11, action: 'play_b' },
    { channel: 0, note: 6, action: 'cue_a' },
    { channel: 1, note: 10, action: 'cue_b' },
    { channel: 0, note: 5, action: 'sync_a' },
    { channel: 1, note: 9, action: 'sync_b' },
  ],
  jogMapping: {
    deckA: { channel: 0, cc: 22, touchNote: 16 },
    deckB: { channel: 1, cc: 22, touchNote: 16 },
  },
};

/**
 * Roland DJ-202
 * 2-channel Serato DJ controller with drum machine
 */
const ROLAND_DJ_202: DJControllerPreset = {
  id: 'roland-dj-202',
  name: 'DJ-202',
  manufacturer: 'Roland',
  description: '2-channel Serato DJ controller with TR drum machine',
  ccMappings: [
    { channel: 0, cc: 63, param: 'dj.crossfader' },
    { channel: 0, cc: 19, param: 'dj.deckA.volume' },
    { channel: 1, cc: 19, param: 'dj.deckB.volume' },
    { channel: 0, cc: 7, param: 'dj.deckA.eqHi' },
    { channel: 1, cc: 7, param: 'dj.deckB.eqHi' },
    { channel: 0, cc: 11, param: 'dj.deckA.eqMid' },
    { channel: 1, cc: 11, param: 'dj.deckB.eqMid' },
    { channel: 0, cc: 15, param: 'dj.deckA.eqLow' },
    { channel: 1, cc: 15, param: 'dj.deckB.eqLow' },
    { channel: 0, cc: 23, param: 'dj.deckA.filter' },
    { channel: 1, cc: 23, param: 'dj.deckB.filter' },
    { channel: 0, cc: 9, param: 'dj.deckA.pitch', invert: true },
    { channel: 1, cc: 9, param: 'dj.deckB.pitch', invert: true },
  ],
  noteMappings: [
    { channel: 0, note: 11, action: 'play_a' },
    { channel: 1, note: 11, action: 'play_b' },
    { channel: 0, note: 12, action: 'cue_a' },
    { channel: 1, note: 12, action: 'cue_b' },
    { channel: 0, note: 88, action: 'sync_a' },
    { channel: 1, note: 88, action: 'sync_b' },
  ],
  jogMapping: {
    deckA: { channel: 0, cc: 33, touchNote: 54 },
    deckB: { channel: 1, cc: 33, touchNote: 54 },
  },
};

// ============================================================================
// PRESET REGISTRY
// ============================================================================

export const DJ_CONTROLLER_PRESETS: DJControllerPreset[] = [
  PIONEER_DDJ_SB3,
  PIONEER_DDJ_FLX4,
  PIONEER_DDJ_1000,
  NUMARK_MIXTRACK_PRO_FX,
  NUMARK_DJ2GO2,
  ROLAND_DJ_202,
];

export function getPresetById(id: string): DJControllerPreset | null {
  return DJ_CONTROLLER_PRESETS.find(p => p.id === id) ?? null;
}

export function getPresetsByManufacturer(): Record<string, DJControllerPreset[]> {
  const grouped: Record<string, DJControllerPreset[]> = {};
  for (const preset of DJ_CONTROLLER_PRESETS) {
    if (!grouped[preset.manufacturer]) grouped[preset.manufacturer] = [];
    grouped[preset.manufacturer].push(preset);
  }
  return grouped;
}
