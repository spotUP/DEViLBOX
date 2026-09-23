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

export interface DJControllerPitchBendMapping {
  channel: number;  // MIDI channel (0-indexed: 0-15)
  param: string;    // Parameter path (matches parameterRouter keys)
  invert?: boolean;
}

export interface DJControllerNoteActionMapping {
  channel: number;  // MIDI channel (0-indexed)
  note: number;     // MIDI note number
  action: string;   // DJ action identifier
}

export interface DJControllerNoteParamMapping {
  channel: number;      // MIDI channel (0-indexed)
  note: number;         // MIDI note number
  param: string;        // Parameter path (matches routeParameterToEngine keys)
  onValue?: number;     // Normalized 0-1 value sent on noteOn (default = 1)
  offValue?: number | null; // Value sent on noteOff (default = 0, null = ignore noteOff)
}

export type DJControllerNoteMapping = DJControllerNoteActionMapping | DJControllerNoteParamMapping;

export interface DJControllerJogMapping {
  channel: number;
  cc: number;       // CC for jog wheel rotation
  touchNote?: number; // Note for jog wheel touch (platter touch sensor)
}

export interface DJControllerFeedbackMapping {
  channel: number;
  note?: number;
  cc?: number;
  action?: string;
  param?: string;
}

export interface DJControllerPreset {
  id: string;
  name: string;
  manufacturer: string;
  description: string;
  /** Device name patterns for auto-detection (case insensitive substring match) */
  detectPatterns?: string[];
  ccMappings: DJControllerCCMapping[];
  pitchBendMappings?: DJControllerPitchBendMapping[];
  noteMappings: DJControllerNoteMapping[];
  feedbackMappings?: DJControllerFeedbackMapping[];
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
  // Basic transport
  | 'play_a' | 'play_b'
  | 'cue_a' | 'cue_b'
  | 'sync_a' | 'sync_b'
  // Hot cues (8 per deck)
  | 'hotcue1_a' | 'hotcue2_a' | 'hotcue3_a' | 'hotcue4_a'
  | 'hotcue5_a' | 'hotcue6_a' | 'hotcue7_a' | 'hotcue8_a'
  | 'hotcue1_b' | 'hotcue2_b' | 'hotcue3_b' | 'hotcue4_b'
  | 'hotcue5_b' | 'hotcue6_b' | 'hotcue7_b' | 'hotcue8_b'
  // Loop controls
  | 'loop_a' | 'loop_b'
  | 'loop_roll_4_a' | 'loop_roll_8_a' | 'loop_roll_16_a' | 'loop_roll_32_a'
  | 'loop_roll_4_b' | 'loop_roll_8_b' | 'loop_roll_16_b' | 'loop_roll_32_b'
  // Beat jump
  | 'beatjump_back_a' | 'beatjump_fwd_a'
  | 'beatjump_back_b' | 'beatjump_fwd_b'
  // PFL (headphone cue)
  | 'pfl_a' | 'pfl_b'
  // Quantized FX
  | 'fx_echo_a' | 'fx_reverb_a' | 'fx_delay_a' | 'fx_flanger_a'
  | 'fx_echo_b' | 'fx_reverb_b' | 'fx_delay_b' | 'fx_flanger_b'
  // Deck modes
  | 'reverse_a' | 'reverse_b'
  | 'flux_a' | 'flux_b'
  // Scratch controls
  | 'scratch_a' | 'scratch_b'
  // Tracker scratch patterns (work without DJ engine)
  | 'tracker_fader_cut' | 'tracker_fader_cut_on' | 'tracker_fader_cut_off'
  | 'tracker_fader_gain'
  | 'tracker_scratch_trans' | 'tracker_scratch_crab' | 'tracker_scratch_flare'
  | 'tracker_scratch_chirp' | 'tracker_scratch_stab' | 'tracker_scratch_8crab'
  | 'tracker_scratch_twdl' | 'tracker_scratch_stop'
  // Vocoder push-to-talk
  | 'ptt'
  // Channel mute/solo (1-indexed, for hardware mixer surfaces)
  | 'channel_mute_1' | 'channel_mute_2' | 'channel_mute_3' | 'channel_mute_4'
  | 'channel_mute_5' | 'channel_mute_6' | 'channel_mute_7' | 'channel_mute_8'
  | 'channel_solo_1' | 'channel_solo_2' | 'channel_solo_3' | 'channel_solo_4'
  | 'channel_solo_5' | 'channel_solo_6' | 'channel_solo_7' | 'channel_solo_8';

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
  detectPatterns: ['ddj-sb3', 'ddj sb3', 'ddjsb3'],
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
  detectPatterns: ['ddj-flx4', 'ddj flx4', 'ddjflx4'],
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
  detectPatterns: ['ddj-1000', 'ddj 1000', 'ddj1000'],
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
  detectPatterns: ['mixtrack pro', 'mixtrack platinum', 'numark mixtrack'],
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
  detectPatterns: ['dj2go2', 'dj2go', 'numark dj2'],
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
  detectPatterns: ['dj-202', 'dj 202', 'roland dj'],
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

/**
 * Behringer X-Touch Compact
 * 8 motor faders + main fader (CC), 16 encoders, 39 buttons.
 *
 * Runs best in the controller's standard MIDI mode where faders, encoders, and
 * buttons expose direct CC/note messages we can map for DJ + dub use.
 */
const BEHRINGER_X_TOUCH_COMPACT: DJControllerPreset = {
  id: 'behringer-xtouch-compact',
  name: 'X-Touch Compact',
  manufacturer: 'Behringer',
  description: 'Dub mixer surface — faders=channel sends, encoders=FX params, buttons=performance',
  detectPatterns: ['x-touch compact', 'xtouch compact', 'x touch compact'],
  ccMappings: [
    // Faders 1-8 (Layer A) and 28-35 (Layer B) are intercepted in
    // `DJControllerMapper.handleCC` while the dub bus is on, so a touched
    // fader writes the send directly and motor echo is ignored. These entries
    // are the same destination by the generic route: they make the faders
    // visible in the mapper diagram, and they carry the assignment when the
    // bus is off and the special case does not fire.
    { channel: 0, cc: 1, param: 'dub.channelSend.ch0' },
    { channel: 0, cc: 2, param: 'dub.channelSend.ch1' },
    { channel: 0, cc: 3, param: 'dub.channelSend.ch2' },
    { channel: 0, cc: 4, param: 'dub.channelSend.ch3' },
    { channel: 0, cc: 5, param: 'dub.channelSend.ch4' },
    { channel: 0, cc: 6, param: 'dub.channelSend.ch5' },
    { channel: 0, cc: 7, param: 'dub.channelSend.ch6' },
    { channel: 0, cc: 8, param: 'dub.channelSend.ch7' },
    // MAIN fader
    // The ninth fader is the MASTER: it scales every channel send, exactly as
    // the deck's own master card does. It pointed at `dj.masterVolume` — a DJ
    // parameter that does nothing in this view — so the fader under the
    // performer's right hand was dead (2026-09-23).
    { channel: 0, cc: 9, param: 'dub.masterSend' },
    // Fader TOUCH — the X-Touch's faders are touch-sensitive and send these
    // the instant a hand lands, before the fader moves. That is the moment a
    // desk decides which channel you mean, so they aim the deck's shared op
    // panel at that channel. Riding the fader is the CC above; touching it is
    // this, and touching alone must be able to aim without moving the send.
    { channel: 0, cc: 101, param: 'dub.channelTouch.ch0' },
    { channel: 0, cc: 102, param: 'dub.channelTouch.ch1' },
    { channel: 0, cc: 103, param: 'dub.channelTouch.ch2' },
    { channel: 0, cc: 104, param: 'dub.channelTouch.ch3' },
    { channel: 0, cc: 105, param: 'dub.channelTouch.ch4' },
    { channel: 0, cc: 106, param: 'dub.channelTouch.ch5' },
    { channel: 0, cc: 107, param: 'dub.channelTouch.ch6' },
    { channel: 0, cc: 108, param: 'dub.channelTouch.ch7' },

    // Top encoder row (CC 10-17) — the bus tone and FX controls, in the order
    // the deck shows them. Continuous params on continuous controls: this row
    // used to carry a duplicate master volume, and the BUS tab's own
    // controls (bass, mid, width) were not routable at all.
    { channel: 0, cc: 10, param: 'dub.returnGain' },
    { channel: 0, cc: 11, param: 'dub.echoIntensity' },
    { channel: 0, cc: 12, param: 'dub.echoRateMs' },
    { channel: 0, cc: 13, param: 'dub.springWet' },
    { channel: 0, cc: 14, param: 'dub.bassShelfGainDb' },
    { channel: 0, cc: 15, param: 'dub.midScoopGainDb' },
    { channel: 0, cc: 16, param: 'dub.stereoWidth' },
    { channel: 0, cc: 17, param: 'dub.hpfCutoff' },

    // Right encoder column (CC 18-25) — second tier of bus colour, then the
    // DJ controls for anyone using this surface on the decks.
    { channel: 0, cc: 18, param: 'dub.sweepAmount' },
    { channel: 0, cc: 19, param: 'dub.sweepRateHz' },
    { channel: 0, cc: 20, param: 'dub.plateStageMix' },
    { channel: 0, cc: 21, param: 'dub.sidechainAmount' },
    { channel: 0, cc: 22, param: 'dub.echoWet' },
    { channel: 0, cc: 23, param: 'dj.crossfader' },
    { channel: 0, cc: 24, param: 'dj.deckA.filter' },
    { channel: 0, cc: 25, param: 'dj.deckB.filter' },

    // ── Layer B ──────────────────────────────────────────────────────────
    // Faders 28-35 address the SECOND bank of channels (9-16); the encoders
    // are deliberately left unassigned as user space.
    { channel: 0, cc: 28, param: 'dub.channelSend.ch8' },
    { channel: 0, cc: 29, param: 'dub.channelSend.ch9' },
    { channel: 0, cc: 30, param: 'dub.channelSend.ch10' },
    { channel: 0, cc: 31, param: 'dub.channelSend.ch11' },
    { channel: 0, cc: 32, param: 'dub.channelSend.ch12' },
    { channel: 0, cc: 33, param: 'dub.channelSend.ch13' },
    { channel: 0, cc: 34, param: 'dub.channelSend.ch14' },
    { channel: 0, cc: 35, param: 'dub.channelSend.ch15' },
    // Fader touch on Layer B, continuing into the second bank the same way the
    // sends do.
    { channel: 0, cc: 111, param: 'dub.channelTouch.ch8' },
    { channel: 0, cc: 112, param: 'dub.channelTouch.ch9' },
    { channel: 0, cc: 113, param: 'dub.channelTouch.ch10' },
    { channel: 0, cc: 114, param: 'dub.channelTouch.ch11' },
    { channel: 0, cc: 115, param: 'dub.channelTouch.ch12' },
    { channel: 0, cc: 116, param: 'dub.channelTouch.ch13' },
    { channel: 0, cc: 117, param: 'dub.channelTouch.ch14' },
    { channel: 0, cc: 118, param: 'dub.channelTouch.ch15' },
    // The ENCODERS MIRROR Layer A. "there is no reason to not mirror
    // everything but the buttons to bank b" — switching layer should not move
    // your hands off the bus tone. The faders are the exception, and
    // deliberately so: they CONTINUE into channels 9-16, because a second bank
    // of faders is more useful than a second copy of the first eight.
    { channel: 0, cc: 37, param: 'dub.returnGain' },
    { channel: 0, cc: 38, param: 'dub.echoIntensity' },
    { channel: 0, cc: 39, param: 'dub.echoRateMs' },
    { channel: 0, cc: 40, param: 'dub.springWet' },
    { channel: 0, cc: 41, param: 'dub.bassShelfGainDb' },
    { channel: 0, cc: 42, param: 'dub.midScoopGainDb' },
    { channel: 0, cc: 43, param: 'dub.stereoWidth' },
    { channel: 0, cc: 44, param: 'dub.hpfCutoff' },
    { channel: 0, cc: 45, param: 'dub.sweepAmount' },
    { channel: 0, cc: 46, param: 'dub.sweepRateHz' },
    { channel: 0, cc: 47, param: 'dub.plateStageMix' },
    { channel: 0, cc: 48, param: 'dub.sidechainAmount' },
    { channel: 0, cc: 49, param: 'dub.echoWet' },
  ],
  noteMappings: [
    // ── Button row 1 (notes 16-23): the eight TOGGLES ────────────────────
    // All eight of the deck's toggle moves, in deck order, on one row. They
    // latch, so the button LED tells the truth about what is on — which is
    // the whole reason to group them rather than scatter them across rows.
    { channel: 0, note: 16, param: 'dub.stereoDoubler' },
    { channel: 0, note: 17, param: 'dub.tapeWobble' },
    { channel: 0, note: 18, param: 'dub.subHarmonic' },
    { channel: 0, note: 19, param: 'dub.combSweep' },
    { channel: 0, note: 20, param: 'dub.eqSweep' },
    { channel: 0, note: 21, param: 'dub.ringMod' },
    { channel: 0, note: 22, param: 'dub.voltageStarve' },
    { channel: 0, note: 23, param: 'dub.madProfPingPong' },

    // ── Button row 2 (notes 24-31): press-and-hold moves ─────────────────
    { channel: 0, note: 24, param: 'dub.filterDrop' },
    { channel: 0, note: 25, param: 'dub.masterDrop' },
    { channel: 0, note: 26, param: 'dub.versionDrop' },
    { channel: 0, note: 27, param: 'dub.riddimSection' },
    { channel: 0, note: 28, param: 'dub.dubSiren' },
    { channel: 0, note: 29, param: 'dub.tubbyScream' },
    { channel: 0, note: 30, param: 'dub.ghostReverb' },
    { channel: 0, note: 31, param: 'dub.tapeStop' },

    // ── Button row 3 (notes 32-39): one-shots ────────────────────────────
    { channel: 0, note: 32, param: 'dub.echoThrow' },
    { channel: 0, note: 33, param: 'dub.dubStab' },
    { channel: 0, note: 34, param: 'dub.springSlam' },
    { channel: 0, note: 35, param: 'dub.springKick' },
    { channel: 0, note: 36, param: 'dub.snareCrack' },
    { channel: 0, note: 37, param: 'dub.sonarPing' },
    { channel: 0, note: 38, param: 'dub.radioRiser' },
    { channel: 0, note: 39, param: 'dub.subSwell' },

    // ── Encoder pushes (notes 0-7): echo rate presets ────────────────────
    // A push is a momentary switch, so it carries a preset or a one-shot,
    // never a move you want to hold.
    { channel: 0, note: 0, param: 'dub.delayPresetQuarter' },
    { channel: 0, note: 1, param: 'dub.delayPresetDotted' },
    { channel: 0, note: 2, param: 'dub.delayPresetTriplet' },
    { channel: 0, note: 3, param: 'dub.delayPreset8th' },
    { channel: 0, note: 4, param: 'dub.delayPreset16th' },
    { channel: 0, note: 5, param: 'dub.delayPreset380' },
    { channel: 0, note: 6, param: 'dub.delayPresetDoubler' },
    { channel: 0, note: 7, param: 'dub.echoBuildUp' },

    // ── Right encoder pushes (notes 8-15): the remaining moves ───────────
    { channel: 0, note: 8, param: 'dub.reverseEcho' },
    { channel: 0, note: 9, param: 'dub.backwardReverb' },
    { channel: 0, note: 10, param: 'dub.delayTimeThrow' },
    { channel: 0, note: 11, param: 'dub.crushBass' },
    { channel: 0, note: 12, param: 'dub.oscBass' },
    { channel: 0, note: 13, param: 'dub.hpfRise' },
    { channel: 0, note: 14, param: 'dub.toast' },
    { channel: 0, note: 15, param: 'dub.bassEmphasis' },

    // ── Select row (notes 40-48): each button under its own fader ────────
    // The dub-bus channel mute, so the button below a fader acts on the same
    // channel that fader sends. Note 48 sits under MAIN and arms recording,
    // which is where the hand already is when a take starts.
    { channel: 0, note: 40, param: 'dub.channelMute.ch0' },
    { channel: 0, note: 41, param: 'dub.channelMute.ch1' },
    { channel: 0, note: 42, param: 'dub.channelMute.ch2' },
    { channel: 0, note: 43, param: 'dub.channelMute.ch3' },
    { channel: 0, note: 44, param: 'dub.channelMute.ch4' },
    { channel: 0, note: 45, param: 'dub.channelMute.ch5' },
    { channel: 0, note: 46, param: 'dub.channelMute.ch6' },
    { channel: 0, note: 47, param: 'dub.channelMute.ch7' },
    { channel: 0, note: 48, param: 'dub.armed' },

    // ── Transport (notes 49-54) ──────────────────────────────────────────
    { channel: 0, note: 49, action: 'play_a' },
    { channel: 0, note: 50, action: 'play_b' },
    { channel: 0, note: 51, action: 'cue_a' },
    { channel: 0, note: 52, action: 'cue_b' },
    { channel: 0, note: 53, action: 'sync_a' },
    { channel: 0, note: 54, action: 'sync_b' },

    // ── Layer B ──────────────────────────────────────────────────────────
    // Row 1 (71-78): the moves Layer A had no room for.
    // Layer B button row 1: THE PER-CHANNEL OPS, acting on the channel your
    // hand is on. This is the one thing that does not mirror Layer A, and it
    // is what the layer switch is FOR — Layer A plays the global moves, Layer
    // B plays the channel moves. Eight ops, eight buttons; Mute is not among
    // them because the row at the bottom of the device already is the mutes.
    { channel: 0, note: 71, param: 'dub.channelThrow' },
    { channel: 0, note: 72, param: 'dub.echoThrow' },
    { channel: 0, note: 73, param: 'dub.skankEchoThrow' },
    { channel: 0, note: 74, param: 'dub.skankFloatThrow' },
    { channel: 0, note: 75, param: 'dub.dubStab' },
    { channel: 0, note: 76, param: 'dub.echoBuildUp' },
    { channel: 0, note: 77, param: 'dub.bassEmphasis' },
    { channel: 0, note: 78, param: 'dub.transportTapeStop' },

    // Row 2 (79-86): mixer solos.
    { channel: 0, note: 79, action: 'channel_solo_1' },
    { channel: 0, note: 80, action: 'channel_solo_2' },
    { channel: 0, note: 81, action: 'channel_solo_3' },
    { channel: 0, note: 82, action: 'channel_solo_4' },
    { channel: 0, note: 83, action: 'channel_solo_5' },
    { channel: 0, note: 84, action: 'channel_solo_6' },
    { channel: 0, note: 85, action: 'channel_solo_7' },
    { channel: 0, note: 86, action: 'channel_solo_8' },

    // Row 3 (87-94): mixer mutes — the main mix, not the dub send.
    { channel: 0, note: 87, action: 'channel_mute_1' },
    { channel: 0, note: 88, action: 'channel_mute_2' },
    { channel: 0, note: 89, action: 'channel_mute_3' },
    { channel: 0, note: 90, action: 'channel_mute_4' },
    { channel: 0, note: 91, action: 'channel_mute_5' },
    { channel: 0, note: 92, action: 'channel_mute_6' },
    { channel: 0, note: 93, action: 'channel_mute_7' },
    { channel: 0, note: 94, action: 'channel_mute_8' },

    // Layer B's select row mutes the SECOND bank, matching its faders.
    { channel: 0, note: 95, param: 'dub.channelMute.ch8' },
    { channel: 0, note: 96, param: 'dub.channelMute.ch9' },
    { channel: 0, note: 97, param: 'dub.channelMute.ch10' },
    { channel: 0, note: 98, param: 'dub.channelMute.ch11' },
    { channel: 0, note: 99, param: 'dub.channelMute.ch12' },
    { channel: 0, note: 100, param: 'dub.channelMute.ch13' },
    { channel: 0, note: 101, param: 'dub.channelMute.ch14' },
    { channel: 0, note: 102, param: 'dub.channelMute.ch15' },
    // Notes 103-109 (Layer B transport) are deliberately left
    // unassigned as user space. Nothing is put on notes 63/64 either: the
    // factory documentation calls CC63 and CC64 the foot switch and
    // expression pedal jacks, which collides with reading them as the push
    // buttons of right encoders 9 and 10 — unresolved until a pedal is
    // pressed and we watch what actually arrives.
  ],
};

/**
 * Behringer X-Touch
 * Mackie Control style surface with pitch-bend motor faders and note-driven buttons.
 */
const BEHRINGER_X_TOUCH: DJControllerPreset = {
  id: 'behringer-xtouch',
  name: 'X-Touch',
  manufacturer: 'Behringer',
  description: 'Mackie-style 9-fader DJ/dub surface',
  detectPatterns: ['x-touch', 'xtouch', 'x touch'],
  ccMappings: [
    { channel: 0, cc: 16, param: 'dj.deckA.filter' },
    { channel: 0, cc: 17, param: 'dj.deckA.filterQ' },
    { channel: 0, cc: 18, param: 'dj.deckA.pitch' },
    { channel: 0, cc: 19, param: 'dub.echoWet' },
    { channel: 0, cc: 20, param: 'dj.deckB.filter' },
    { channel: 0, cc: 21, param: 'dj.deckB.filterQ' },
    { channel: 0, cc: 22, param: 'dj.deckB.pitch' },
    { channel: 0, cc: 23, param: 'dub.echoIntensity' },
  ],
  pitchBendMappings: [
    { channel: 0, param: 'dj.deckA.volume' },
    { channel: 1, param: 'dj.deckA.eqHi' },
    { channel: 2, param: 'dj.deckA.eqMid' },
    { channel: 3, param: 'dj.deckA.eqLow' },
    { channel: 4, param: 'dj.deckB.volume' },
    { channel: 5, param: 'dj.deckB.eqHi' },
    { channel: 6, param: 'dj.deckB.eqMid' },
    { channel: 7, param: 'dj.deckB.eqLow' },
    { channel: 8, param: 'dj.crossfader' },
  ],
  noteMappings: [
    { channel: 0, note: 0, action: 'play_a' },
    { channel: 0, note: 8, action: 'pfl_a' },
    { channel: 0, note: 16, action: 'loop_a' },
    { channel: 0, note: 24, action: 'cue_a' },
    { channel: 0, note: 4, action: 'play_b' },
    { channel: 0, note: 12, action: 'pfl_b' },
    { channel: 0, note: 20, action: 'loop_b' },
    { channel: 0, note: 28, action: 'cue_b' },

    { channel: 0, note: 91, param: 'dub.echoThrow' },
    { channel: 0, note: 92, param: 'dub.reverseEcho' },
    { channel: 0, note: 93, param: 'dub.tapeStop' },
    { channel: 0, note: 94, param: 'dub.springSlam' },
    { channel: 0, note: 95, param: 'dub.tubbyScream' },
  ],
};

/**
 * Behringer X-Touch One
 * Single-fader MCU surface. Best used here as a compact transport + crossfader station.
 */
const BEHRINGER_X_TOUCH_ONE: DJControllerPreset = {
  id: 'behringer-xtouch-one',
  name: 'X-Touch One',
  manufacturer: 'Behringer',
  description: 'Single-fader transport and crossfader surface',
  detectPatterns: ['x-touch one', 'xtouch one', 'x touch one'],
  ccMappings: [
    { channel: 0, cc: 16, param: 'dj.masterVolume' },
  ],
  pitchBendMappings: [
    { channel: 0, param: 'dj.crossfader' },
  ],
  noteMappings: [
    { channel: 0, note: 91, action: 'cue_a' },
    { channel: 0, note: 92, action: 'cue_b' },
    { channel: 0, note: 93, action: 'loop_a' },
    { channel: 0, note: 94, action: 'play_a' },
    { channel: 0, note: 95, action: 'play_b' },
    { channel: 0, note: 84, param: 'dub.echoThrow' },
    { channel: 0, note: 85, param: 'dub.reverseEcho' },
    { channel: 0, note: 86, param: 'dub.tapeStop' },
    { channel: 0, note: 87, param: 'dub.springSlam' },
  ],
};

// ============================================================================
// PRESET REGISTRY
// ============================================================================

export const DJ_HARDWARE_PRESETS: DJControllerPreset[] = [
  BEHRINGER_X_TOUCH_COMPACT,
  BEHRINGER_X_TOUCH_ONE,
  BEHRINGER_X_TOUCH,
  PIONEER_DDJ_SB3,
  PIONEER_DDJ_FLX4,
  PIONEER_DDJ_1000,
  NUMARK_MIXTRACK_PRO_FX,
  NUMARK_DJ2GO2,
  ROLAND_DJ_202,
];

// Import generic controllers
import { DJ_GENERIC_CONTROLLERS } from './djGenericControllers';

// Combined registry (hardware + generic)
export const DJ_CONTROLLER_PRESETS: DJControllerPreset[] = [
  ...DJ_HARDWARE_PRESETS,
  ...DJ_GENERIC_CONTROLLERS,
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

/**
 * Auto-detect the best DJ controller preset from a MIDI device name.
 * Returns the first matching preset, or the Generic 8x8 as fallback
 * for any unrecognized device (every MIDI controller can use 8-knob mapping).
 */
export function detectDJPreset(deviceName: string): DJControllerPreset | null {
  if (!deviceName) return null;
  const lower = deviceName.toLowerCase();

  // Try exact preset matches first (hardware presets have priority)
  for (const preset of DJ_CONTROLLER_PRESETS) {
    if (!preset.detectPatterns) continue;
    for (const pattern of preset.detectPatterns) {
      if (lower.includes(pattern.toLowerCase())) {
        return preset;
      }
    }
  }

  // Fallback: any connected MIDI device gets the Generic 8x8 preset
  // (every controller with knobs sends CC messages that the generic layout can use)
  return DJ_CONTROLLER_PRESETS.find(p => p.id === 'generic-8x8') ?? null;
}
