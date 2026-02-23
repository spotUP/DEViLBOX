/**
 * DJ Scenario Presets - Optimized MIDI mappings for different DJ styles
 *
 * Each scenario provides a tailored parameter layout for specific DJ techniques.
 * Scenarios can be switched on-the-fly during performance without changing
 * the physical controller.
 *
 * Usage:
 *   1. Select hardware controller (e.g., Pioneer DDJ-SB3)
 *   2. Select DJ scenario (e.g., "Turntablism")
 *   3. System combines hardware layout + scenario priorities
 */

import type { DJControllerCCMapping, DJControllerNoteMapping } from './djControllerPresets';

// ============================================================================
// TYPES
// ============================================================================

export interface DJScenarioPreset {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: string;  // Emoji or icon identifier
  
  // Parameter priorities (high-priority params get prime real estate on generic controllers)
  highPriority: string[];
  mediumPriority: string[];
  lowPriority: string[];
  
  // Override CCs for generic controllers (8 knobs, 16 pads)
  knobMappings?: DJControllerCCMapping[];       // CC 70-77
  padMappings?: DJControllerNoteMapping[];      // Notes 36-51 (16 pads, channel 9)
  
  // Special behaviors
  jogWheelSensitivity?: number;                 // 0.5-2.0x multiplier
  crossfaderCurve?: 'linear' | 'cut' | 'smooth';
  autoSync?: boolean;                           // Auto-enable sync on track load
  keyLockDefault?: boolean;                     // Default key lock state
}

// ============================================================================
// SCENARIO PRESETS
// ============================================================================

/**
 * Club / House Mixing
 * Focus: Smooth EQ blends, filter sweeps, long harmonic transitions
 */
const CLUB_HOUSE: DJScenarioPreset = {
  id: 'club-house',
  name: 'Club / House Mixing',
  category: 'Mixing',
  description: 'Smooth EQ blends, filter sweeps, harmonic transitions. Perfect for house, techno, trance.',
  icon: '🏠',
  
  highPriority: [
    'dj.deckA.eqHi', 'dj.deckA.eqMid', 'dj.deckA.eqLow',
    'dj.deckB.eqHi', 'dj.deckB.eqMid', 'dj.deckB.eqLow',
    'dj.deckA.filter', 'dj.deckB.filter',
    'dj.crossfader',
  ],
  mediumPriority: [
    'dj.deckA.volume', 'dj.deckB.volume',
    'dj.deckA.pitch', 'dj.deckB.pitch',
    'dj.masterVolume',
  ],
  lowPriority: [
    'dj.deckA.scratchVelocity', 'dj.deckB.scratchVelocity',
  ],
  
  knobMappings: [
    { channel: 0, cc: 70, param: 'dj.deckA.eqHi' },
    { channel: 0, cc: 71, param: 'dj.deckA.eqMid' },
    { channel: 0, cc: 72, param: 'dj.deckA.eqLow' },
    { channel: 0, cc: 73, param: 'dj.deckA.filter' },
    { channel: 0, cc: 74, param: 'dj.deckB.eqHi' },
    { channel: 0, cc: 75, param: 'dj.deckB.eqMid' },
    { channel: 0, cc: 76, param: 'dj.deckB.eqLow' },
    { channel: 0, cc: 77, param: 'dj.deckB.filter' },
  ],
  
  padMappings: [
    // Deck A hot cues (pads 1-8)
    { channel: 9, note: 36, action: 'hotcue1_a' },
    { channel: 9, note: 37, action: 'hotcue2_a' },
    { channel: 9, note: 38, action: 'hotcue3_a' },
    { channel: 9, note: 39, action: 'hotcue4_a' },
    { channel: 9, note: 40, action: 'sync_a' },
    { channel: 9, note: 41, action: 'loop_a' },
    { channel: 9, note: 42, action: 'cue_a' },
    { channel: 9, note: 43, action: 'play_a' },
    // Deck B hot cues (pads 9-16)
    { channel: 9, note: 44, action: 'hotcue1_b' },
    { channel: 9, note: 45, action: 'hotcue2_b' },
    { channel: 9, note: 46, action: 'hotcue3_b' },
    { channel: 9, note: 47, action: 'hotcue4_b' },
    { channel: 9, note: 48, action: 'sync_b' },
    { channel: 9, note: 49, action: 'loop_b' },
    { channel: 9, note: 50, action: 'cue_b' },
    { channel: 9, note: 51, action: 'play_b' },
  ],
  
  jogWheelSensitivity: 0.7,    // Slower for precise beatmatching
  crossfaderCurve: 'smooth',
  autoSync: true,
  keyLockDefault: true,
};

/**
 * Hip-Hop / Turntablism
 * Focus: Scratch patterns, fader cuts, beat juggling, cue point manipulation
 */
const TURNTABLISM: DJScenarioPreset = {
  id: 'turntablism',
  name: 'Hip-Hop / Turntablism',
  category: 'Scratching',
  description: 'Scratch patterns, fader cuts, beat juggling. Optimized for battle scratches.',
  icon: '🎧',
  
  highPriority: [
    'dj.deckA.scratchVelocity', 'dj.deckB.scratchVelocity',
    'dj.deckA.volume', 'dj.deckB.volume',  // Fader control critical
    'dj.crossfader',
  ],
  mediumPriority: [
    'dj.deckA.pitch', 'dj.deckB.pitch',
    'dj.deckA.eqLow', 'dj.deckB.eqLow',    // Bass control for punch
  ],
  lowPriority: [
    'dj.deckA.filter', 'dj.deckB.filter',
    'dj.deckA.eqHi', 'dj.deckA.eqMid',
    'dj.deckB.eqHi', 'dj.deckB.eqMid',
  ],
  
  knobMappings: [
    { channel: 0, cc: 70, param: 'dj.deckA.scratchVelocity' },
    { channel: 0, cc: 71, param: 'dj.deckB.scratchVelocity' },
    { channel: 0, cc: 72, param: 'dj.deckA.volume' },
    { channel: 0, cc: 73, param: 'dj.deckB.volume' },
    { channel: 0, cc: 74, param: 'dj.deckA.pitch' },
    { channel: 0, cc: 75, param: 'dj.deckB.pitch' },
    { channel: 0, cc: 76, param: 'dj.deckA.eqLow' },
    { channel: 0, cc: 77, param: 'dj.deckB.eqLow' },
  ],
  
  padMappings: [
    // Deck A: Scratch patterns (pads 1-8)
    { channel: 9, note: 36, action: 'tracker_scratch_trans' },   // Transformer
    { channel: 9, note: 37, action: 'tracker_scratch_crab' },    // Crab
    { channel: 9, note: 38, action: 'tracker_scratch_flare' },   // Flare
    { channel: 9, note: 39, action: 'tracker_scratch_chirp' },   // Chirp
    { channel: 9, note: 40, action: 'hotcue1_a' },
    { channel: 9, note: 41, action: 'hotcue2_a' },
    { channel: 9, note: 42, action: 'cue_a' },
    { channel: 9, note: 43, action: 'play_a' },
    // Deck B: Scratch patterns (pads 9-16)
    { channel: 9, note: 44, action: 'tracker_scratch_stab' },    // Stab
    { channel: 9, note: 45, action: 'tracker_scratch_8crab' },   // 8-Finger Crab
    { channel: 9, note: 46, action: 'tracker_scratch_twdl' },    // Twiddle
    { channel: 9, note: 47, action: 'tracker_scratch_stop' },    // Stop pattern
    { channel: 9, note: 48, action: 'hotcue1_b' },
    { channel: 9, note: 49, action: 'hotcue2_b' },
    { channel: 9, note: 50, action: 'cue_b' },
    { channel: 9, note: 51, action: 'play_b' },
  ],
  
  jogWheelSensitivity: 1.5,     // More aggressive for scratching
  crossfaderCurve: 'cut',
  autoSync: false,              // Manual beatmatching preferred
  keyLockDefault: false,
};

/**
 * Battle DJ
 * Focus: Fast transformer cuts, complex patterns, precision cues
 */
const BATTLE: DJScenarioPreset = {
  id: 'battle-dj',
  name: 'Battle DJ',
  category: 'Scratching',
  description: 'Fast transformer cuts, complex fader patterns, competition-ready. Maximum precision.',
  icon: '⚔️',
  
  highPriority: [
    'dj.deckA.scratchVelocity', 'dj.deckB.scratchVelocity',
    'dj.crossfader',
    'dj.deckA.volume', 'dj.deckB.volume',
  ],
  mediumPriority: [
    'dj.deckA.pitch', 'dj.deckB.pitch',
  ],
  lowPriority: [
    'dj.deckA.eqHi', 'dj.deckA.eqMid', 'dj.deckA.eqLow',
    'dj.deckB.eqHi', 'dj.deckB.eqMid', 'dj.deckB.eqLow',
    'dj.deckA.filter', 'dj.deckB.filter',
  ],
  
  knobMappings: [
    { channel: 0, cc: 70, param: 'dj.deckA.scratchVelocity' },
    { channel: 0, cc: 71, param: 'dj.deckB.scratchVelocity' },
    { channel: 0, cc: 72, param: 'dj.deckA.volume' },
    { channel: 0, cc: 73, param: 'dj.deckB.volume' },
    { channel: 0, cc: 74, param: 'dj.deckA.pitch' },
    { channel: 0, cc: 75, param: 'dj.deckB.pitch' },
    { channel: 0, cc: 76, param: 'dj.masterVolume' },
    { channel: 0, cc: 77, param: 'dj.crossfader' },
  ],
  
  padMappings: [
    // All 16 pads: Scratch patterns + quick cues
    { channel: 9, note: 36, action: 'tracker_fader_cut' },       // Instant cut
    { channel: 9, note: 37, action: 'tracker_scratch_trans' },   // Transformer
    { channel: 9, note: 38, action: 'tracker_scratch_crab' },    // Crab
    { channel: 9, note: 39, action: 'tracker_scratch_flare' },   // Flare
    { channel: 9, note: 40, action: 'hotcue1_a' },
    { channel: 9, note: 41, action: 'hotcue2_a' },
    { channel: 9, note: 42, action: 'hotcue3_a' },
    { channel: 9, note: 43, action: 'hotcue4_a' },
    { channel: 9, note: 44, action: 'tracker_scratch_stab' },
    { channel: 9, note: 45, action: 'tracker_scratch_8crab' },
    { channel: 9, note: 46, action: 'tracker_scratch_chirp' },
    { channel: 9, note: 47, action: 'tracker_scratch_twdl' },
    { channel: 9, note: 48, action: 'hotcue1_b' },
    { channel: 9, note: 49, action: 'hotcue2_b' },
    { channel: 9, note: 50, action: 'hotcue3_b' },
    { channel: 9, note: 51, action: 'hotcue4_b' },
  ],
  
  jogWheelSensitivity: 2.0,     // Maximum aggression
  crossfaderCurve: 'cut',
  autoSync: false,
  keyLockDefault: false,
};

/**
 * Harmonic Mixing
 * Focus: Key detection, compatible track selection, musical blending
 */
const HARMONIC: DJScenarioPreset = {
  id: 'harmonic-mixing',
  name: 'Harmonic Mixing',
  category: 'Mixing',
  description: 'Key-aware mixing, compatible track selection, musical transitions. Uses Camelot wheel.',
  icon: '🎵',
  
  highPriority: [
    'dj.deckA.pitch', 'dj.deckB.pitch',     // Key shifting
    'dj.deckA.eqHi', 'dj.deckA.eqMid', 'dj.deckA.eqLow',
    'dj.deckB.eqHi', 'dj.deckB.eqMid', 'dj.deckB.eqLow',
    'dj.crossfader',
  ],
  mediumPriority: [
    'dj.deckA.volume', 'dj.deckB.volume',
    'dj.deckA.filter', 'dj.deckB.filter',
  ],
  lowPriority: [
    'dj.deckA.scratchVelocity', 'dj.deckB.scratchVelocity',
  ],
  
  knobMappings: [
    { channel: 0, cc: 70, param: 'dj.deckA.pitch' },
    { channel: 0, cc: 71, param: 'dj.deckB.pitch' },
    { channel: 0, cc: 72, param: 'dj.deckA.eqHi' },
    { channel: 0, cc: 73, param: 'dj.deckA.eqMid' },
    { channel: 0, cc: 74, param: 'dj.deckA.eqLow' },
    { channel: 0, cc: 75, param: 'dj.deckB.eqHi' },
    { channel: 0, cc: 76, param: 'dj.deckB.eqMid' },
    { channel: 0, cc: 77, param: 'dj.deckB.eqLow' },
  ],
  
  padMappings: [
    // Pads 1-8: Deck A hot cues + key shift presets
    { channel: 9, note: 36, action: 'hotcue1_a' },
    { channel: 9, note: 37, action: 'hotcue2_a' },
    { channel: 9, note: 38, action: 'hotcue3_a' },
    { channel: 9, note: 39, action: 'hotcue4_a' },
    { channel: 9, note: 40, action: 'sync_a' },
    { channel: 9, note: 41, action: 'cue_a' },
    { channel: 9, note: 42, action: 'play_a' },
    { channel: 9, note: 43, action: 'loop_a' },
    // Pads 9-16: Deck B hot cues + key shift presets
    { channel: 9, note: 44, action: 'hotcue1_b' },
    { channel: 9, note: 45, action: 'hotcue2_b' },
    { channel: 9, note: 46, action: 'hotcue3_b' },
    { channel: 9, note: 47, action: 'hotcue4_b' },
    { channel: 9, note: 48, action: 'sync_b' },
    { channel: 9, note: 49, action: 'cue_b' },
    { channel: 9, note: 50, action: 'play_b' },
    { channel: 9, note: 51, action: 'loop_b' },
  ],
  
  jogWheelSensitivity: 0.8,
  crossfaderCurve: 'smooth',
  autoSync: true,
  keyLockDefault: true,         // Key lock enabled by default
};

/**
 * Loop / Remix Performance
 * Focus: Beat repeat, loop rolls, live remixing, quantized FX
 */
const LOOP_REMIX: DJScenarioPreset = {
  id: 'loop-remix',
  name: 'Loop / Remix Performance',
  category: 'Performance',
  description: 'Beat repeat, loop rolls, live remixing. Perfect for EDM, trap, future bass.',
  icon: '🔁',
  
  highPriority: [
    'dj.deckA.filter', 'dj.deckB.filter',
    'dj.deckA.eqLow', 'dj.deckB.eqLow',
    'dj.deckA.volume', 'dj.deckB.volume',
  ],
  mediumPriority: [
    'dj.deckA.eqHi', 'dj.deckA.eqMid',
    'dj.deckB.eqHi', 'dj.deckB.eqMid',
    'dj.crossfader',
  ],
  lowPriority: [
    'dj.deckA.pitch', 'dj.deckB.pitch',
    'dj.deckA.scratchVelocity', 'dj.deckB.scratchVelocity',
  ],
  
  knobMappings: [
    { channel: 0, cc: 70, param: 'dj.deckA.filter' },
    { channel: 0, cc: 71, param: 'dj.deckB.filter' },
    { channel: 0, cc: 72, param: 'dj.deckA.eqLow' },
    { channel: 0, cc: 73, param: 'dj.deckB.eqLow' },
    { channel: 0, cc: 74, param: 'dj.deckA.volume' },
    { channel: 0, cc: 75, param: 'dj.deckB.volume' },
    { channel: 0, cc: 76, param: 'dj.masterVolume' },
    { channel: 0, cc: 77, param: 'dj.crossfader' },
  ],
  
  padMappings: [
    // Pads 1-8: Loop rolls (1/4, 1/8, 1/16, 1/32)
    { channel: 9, note: 36, action: 'loop_roll_4_a' },
    { channel: 9, note: 37, action: 'loop_roll_8_a' },
    { channel: 9, note: 38, action: 'loop_roll_16_a' },
    { channel: 9, note: 39, action: 'loop_roll_32_a' },
    { channel: 9, note: 40, action: 'loop_a' },
    { channel: 9, note: 41, action: 'beatjump_back_a' },
    { channel: 9, note: 42, action: 'beatjump_fwd_a' },
    { channel: 9, note: 43, action: 'play_a' },
    // Pads 9-16: Loop rolls (Deck B)
    { channel: 9, note: 44, action: 'loop_roll_4_b' },
    { channel: 9, note: 45, action: 'loop_roll_8_b' },
    { channel: 9, note: 46, action: 'loop_roll_16_b' },
    { channel: 9, note: 47, action: 'loop_roll_32_b' },
    { channel: 9, note: 48, action: 'loop_b' },
    { channel: 9, note: 49, action: 'beatjump_back_b' },
    { channel: 9, note: 50, action: 'beatjump_fwd_b' },
    { channel: 9, note: 51, action: 'play_b' },
  ],
  
  jogWheelSensitivity: 1.0,
  crossfaderCurve: 'linear',
  autoSync: true,
  keyLockDefault: true,
};

/**
 * Effects Performance
 * Focus: Quantized FX, filter sweeps, echo throws, reverb drops
 */
const EFFECTS: DJScenarioPreset = {
  id: 'effects-performance',
  name: 'Effects Performance',
  category: 'Performance',
  description: 'Quantized FX, filter sweeps, echo throws. Show-stopping transitions.',
  icon: '✨',
  
  highPriority: [
    'dj.deckA.filter', 'dj.deckB.filter',
    'dj.deckA.filterQ', 'dj.deckB.filterQ',
    'dj.deckA.eqHi', 'dj.deckB.eqHi',
  ],
  mediumPriority: [
    'dj.deckA.volume', 'dj.deckB.volume',
    'dj.crossfader',
  ],
  lowPriority: [
    'dj.deckA.pitch', 'dj.deckB.pitch',
    'dj.deckA.scratchVelocity', 'dj.deckB.scratchVelocity',
  ],
  
  knobMappings: [
    { channel: 0, cc: 70, param: 'dj.deckA.filter' },
    { channel: 0, cc: 71, param: 'dj.deckB.filter' },
    { channel: 0, cc: 72, param: 'dj.deckA.filterQ' },
    { channel: 0, cc: 73, param: 'dj.deckB.filterQ' },
    { channel: 0, cc: 74, param: 'dj.deckA.eqHi' },
    { channel: 0, cc: 75, param: 'dj.deckB.eqHi' },
    { channel: 0, cc: 76, param: 'dj.masterVolume' },
    { channel: 0, cc: 77, param: 'dj.crossfader' },
  ],
  
  padMappings: [
    // Pads 1-8: FX on Deck A
    { channel: 9, note: 36, action: 'fx_echo_a' },
    { channel: 9, note: 37, action: 'fx_reverb_a' },
    { channel: 9, note: 38, action: 'fx_delay_a' },
    { channel: 9, note: 39, action: 'fx_flanger_a' },
    { channel: 9, note: 40, action: 'cue_a' },
    { channel: 9, note: 41, action: 'sync_a' },
    { channel: 9, note: 42, action: 'loop_a' },
    { channel: 9, note: 43, action: 'play_a' },
    // Pads 9-16: FX on Deck B
    { channel: 9, note: 44, action: 'fx_echo_b' },
    { channel: 9, note: 45, action: 'fx_reverb_b' },
    { channel: 9, note: 46, action: 'fx_delay_b' },
    { channel: 9, note: 47, action: 'fx_flanger_b' },
    { channel: 9, note: 48, action: 'cue_b' },
    { channel: 9, note: 49, action: 'sync_b' },
    { channel: 9, note: 50, action: 'loop_b' },
    { channel: 9, note: 51, action: 'play_b' },
  ],
  
  jogWheelSensitivity: 1.0,
  crossfaderCurve: 'smooth',
  autoSync: true,
  keyLockDefault: true,
};

/**
 * Beatmatching / Transition Focus
 * Focus: Precision tempo control, sync, cueing, monitoring
 */
const BEATMATCH: DJScenarioPreset = {
  id: 'beatmatching',
  name: 'Beatmatching / Transition',
  category: 'Mixing',
  description: 'Traditional DJ beatmatching. Tempo control, cueing, headphone monitoring.',
  icon: '🎛️',
  
  highPriority: [
    'dj.deckA.pitch', 'dj.deckB.pitch',
    'dj.deckA.volume', 'dj.deckB.volume',
    'dj.crossfader',
  ],
  mediumPriority: [
    'dj.deckA.eqLow', 'dj.deckB.eqLow',
    'dj.deckA.eqMid', 'dj.deckB.eqMid',
    'dj.deckA.eqHi', 'dj.deckB.eqHi',
  ],
  lowPriority: [
    'dj.deckA.filter', 'dj.deckB.filter',
    'dj.deckA.scratchVelocity', 'dj.deckB.scratchVelocity',
  ],
  
  knobMappings: [
    { channel: 0, cc: 70, param: 'dj.deckA.pitch' },
    { channel: 0, cc: 71, param: 'dj.deckB.pitch' },
    { channel: 0, cc: 72, param: 'dj.deckA.volume' },
    { channel: 0, cc: 73, param: 'dj.deckB.volume' },
    { channel: 0, cc: 74, param: 'dj.deckA.eqLow' },
    { channel: 0, cc: 75, param: 'dj.deckB.eqLow' },
    { channel: 0, cc: 76, param: 'dj.masterVolume' },
    { channel: 0, cc: 77, param: 'dj.crossfader' },
  ],
  
  padMappings: [
    // Classic transport controls
    { channel: 9, note: 36, action: 'cue_a' },
    { channel: 9, note: 37, action: 'play_a' },
    { channel: 9, note: 38, action: 'sync_a' },
    { channel: 9, note: 39, action: 'pfl_a' },          // Headphone cue
    { channel: 9, note: 40, action: 'hotcue1_a' },
    { channel: 9, note: 41, action: 'hotcue2_a' },
    { channel: 9, note: 42, action: 'beatjump_back_a' },
    { channel: 9, note: 43, action: 'beatjump_fwd_a' },
    { channel: 9, note: 44, action: 'cue_b' },
    { channel: 9, note: 45, action: 'play_b' },
    { channel: 9, note: 46, action: 'sync_b' },
    { channel: 9, note: 47, action: 'pfl_b' },          // Headphone cue
    { channel: 9, note: 48, action: 'hotcue1_b' },
    { channel: 9, note: 49, action: 'hotcue2_b' },
    { channel: 9, note: 50, action: 'beatjump_back_b' },
    { channel: 9, note: 51, action: 'beatjump_fwd_b' },
  ],
  
  jogWheelSensitivity: 0.7,     // Precise for manual sync
  crossfaderCurve: 'linear',
  autoSync: false,              // Manual beatmatching
  keyLockDefault: false,
};

/**
 * Mobile / Wedding DJ
 * Focus: Simple controls, safety features, quick access to essentials
 */
const MOBILE_WEDDING: DJScenarioPreset = {
  id: 'mobile-wedding',
  name: 'Mobile / Wedding DJ',
  category: 'Professional',
  description: 'Simple, safe controls for events. Auto-sync, fade presets, backup-friendly.',
  icon: '💍',
  
  highPriority: [
    'dj.deckA.volume', 'dj.deckB.volume',
    'dj.crossfader',
    'dj.masterVolume',
  ],
  mediumPriority: [
    'dj.deckA.eqHi', 'dj.deckA.eqMid', 'dj.deckA.eqLow',
    'dj.deckB.eqHi', 'dj.deckB.eqMid', 'dj.deckB.eqLow',
  ],
  lowPriority: [
    'dj.deckA.filter', 'dj.deckB.filter',
    'dj.deckA.pitch', 'dj.deckB.pitch',
    'dj.deckA.scratchVelocity', 'dj.deckB.scratchVelocity',
  ],
  
  knobMappings: [
    { channel: 0, cc: 70, param: 'dj.deckA.volume' },
    { channel: 0, cc: 71, param: 'dj.deckB.volume' },
    { channel: 0, cc: 72, param: 'dj.masterVolume' },
    { channel: 0, cc: 73, param: 'dj.crossfader' },
    { channel: 0, cc: 74, param: 'dj.deckA.eqHi' },
    { channel: 0, cc: 75, param: 'dj.deckA.eqMid' },
    { channel: 0, cc: 76, param: 'dj.deckA.eqLow' },
    { channel: 0, cc: 77, param: 'dj.deckB.eqHi' },
  ],
  
  padMappings: [
    // Simple transport + hot cues
    { channel: 9, note: 36, action: 'play_a' },
    { channel: 9, note: 37, action: 'cue_a' },
    { channel: 9, note: 38, action: 'sync_a' },
    { channel: 9, note: 39, action: 'hotcue1_a' },
    { channel: 9, note: 40, action: 'hotcue2_a' },
    { channel: 9, note: 41, action: 'hotcue3_a' },
    { channel: 9, note: 42, action: 'hotcue4_a' },
    { channel: 9, note: 43, action: 'loop_a' },
    { channel: 9, note: 44, action: 'play_b' },
    { channel: 9, note: 45, action: 'cue_b' },
    { channel: 9, note: 46, action: 'sync_b' },
    { channel: 9, note: 47, action: 'hotcue1_b' },
    { channel: 9, note: 48, action: 'hotcue2_b' },
    { channel: 9, note: 49, action: 'hotcue3_b' },
    { channel: 9, note: 50, action: 'hotcue4_b' },
    { channel: 9, note: 51, action: 'loop_b' },
  ],
  
  jogWheelSensitivity: 0.6,     // Conservative
  crossfaderCurve: 'smooth',
  autoSync: true,               // Safety first
  keyLockDefault: true,
};

/**
 * Open Format
 * Focus: Hybrid approach, flexible mapping for all genres
 */
const OPEN_FORMAT: DJScenarioPreset = {
  id: 'open-format',
  name: 'Open Format',
  category: 'Professional',
  description: 'Hybrid mapping for all genres. Balanced controls for any DJ style.',
  icon: '🌐',
  
  highPriority: [
    'dj.deckA.eqHi', 'dj.deckA.eqMid', 'dj.deckA.eqLow',
    'dj.deckB.eqHi', 'dj.deckB.eqMid', 'dj.deckB.eqLow',
    'dj.deckA.volume', 'dj.deckB.volume',
    'dj.crossfader',
  ],
  mediumPriority: [
    'dj.deckA.filter', 'dj.deckB.filter',
    'dj.deckA.pitch', 'dj.deckB.pitch',
  ],
  lowPriority: [
    'dj.deckA.scratchVelocity', 'dj.deckB.scratchVelocity',
  ],
  
  knobMappings: [
    { channel: 0, cc: 70, param: 'dj.deckA.eqHi' },
    { channel: 0, cc: 71, param: 'dj.deckA.eqMid' },
    { channel: 0, cc: 72, param: 'dj.deckA.eqLow' },
    { channel: 0, cc: 73, param: 'dj.deckA.filter' },
    { channel: 0, cc: 74, param: 'dj.deckB.eqHi' },
    { channel: 0, cc: 75, param: 'dj.deckB.eqMid' },
    { channel: 0, cc: 76, param: 'dj.deckB.eqLow' },
    { channel: 0, cc: 77, param: 'dj.deckB.filter' },
  ],
  
  padMappings: [
    // Balanced mix of hot cues + transport
    { channel: 9, note: 36, action: 'hotcue1_a' },
    { channel: 9, note: 37, action: 'hotcue2_a' },
    { channel: 9, note: 38, action: 'hotcue3_a' },
    { channel: 9, note: 39, action: 'hotcue4_a' },
    { channel: 9, note: 40, action: 'play_a' },
    { channel: 9, note: 41, action: 'cue_a' },
    { channel: 9, note: 42, action: 'sync_a' },
    { channel: 9, note: 43, action: 'loop_a' },
    { channel: 9, note: 44, action: 'hotcue1_b' },
    { channel: 9, note: 45, action: 'hotcue2_b' },
    { channel: 9, note: 46, action: 'hotcue3_b' },
    { channel: 9, note: 47, action: 'hotcue4_b' },
    { channel: 9, note: 48, action: 'play_b' },
    { channel: 9, note: 49, action: 'cue_b' },
    { channel: 9, note: 50, action: 'sync_b' },
    { channel: 9, note: 51, action: 'loop_b' },
  ],
  
  jogWheelSensitivity: 1.0,
  crossfaderCurve: 'linear',
  autoSync: true,
  keyLockDefault: false,
};

// ============================================================================
// PRESET REGISTRY
// ============================================================================

export const DJ_SCENARIO_PRESETS: DJScenarioPreset[] = [
  CLUB_HOUSE,
  TURNTABLISM,
  BATTLE,
  HARMONIC,
  LOOP_REMIX,
  EFFECTS,
  BEATMATCH,
  MOBILE_WEDDING,
  OPEN_FORMAT,
];

export function getScenarioById(id: string): DJScenarioPreset | null {
  return DJ_SCENARIO_PRESETS.find(p => p.id === id) ?? null;
}

export function getScenariosByCategory(): Record<string, DJScenarioPreset[]> {
  const grouped: Record<string, DJScenarioPreset[]> = {};
  for (const preset of DJ_SCENARIO_PRESETS) {
    if (!grouped[preset.category]) grouped[preset.category] = [];
    grouped[preset.category].push(preset);
  }
  return grouped;
}
