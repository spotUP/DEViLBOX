/**
 * MIDI Controller Profiles Database
 *
 * Pre-configured profiles for popular MIDI controllers.
 * Based on factory defaults - users can customize via MIDI Learn.
 *
 * Sources:
 * - Akai MPK Mini MK3: https://www.akaipro.com/mpk-mini-mk3
 * - Novation Launchkey: https://novationmusic.com/launchkey
 * - Arturia MiniLab: https://www.arturia.com/minilab-3
 * - Korg nanoKONTROL2: https://www.korg.com/nanokontrol2
 * - Behringer X-Touch Mini: https://www.behringer.com/x-touch-mini
 * - Behringer TD-3: https://www.behringer.com/td-3
 * - NKS SDK v2.0.2: NI controller parameter page spec (8 params/page)
 */

export interface ControllerKnob {
  cc: number;
  name: string;
  defaultMapping?: string;  // Parameter path to map by default
}

export interface ControllerPad {
  note?: number;
  cc?: number;
  name: string;
  defaultMapping?: string;  // Action to map by default
}

export interface ControllerProfile {
  id: string;
  name: string;
  manufacturer: string;
  /** Device name patterns to auto-detect (case insensitive) */
  detectPatterns: string[];
  knobs: ControllerKnob[];
  pads: ControllerPad[];
  /** Additional features like joystick, faders, etc. */
  extras?: {
    pitchBend?: boolean;
    modWheel?: { cc: number };
    sustain?: { cc: number };
    faders?: ControllerKnob[];
  };
  /** Suggested mappings for this controller */
  suggestedLayout?: {
    knobs?: Record<number, string>;  // CC -> parameter
    pads?: Record<number, string>;   // Note/CC -> action
    faders?: Record<number, string>; // CC -> parameter (for faders)
  };
}

/**
 * All mappable tracker actions (includes DJ actions)
 */
export const TRACKER_ACTIONS = {
  // Transport
  'transport.play': { label: 'Play', category: 'Transport' },
  'transport.stop': { label: 'Stop', category: 'Transport' },
  'transport.pause': { label: 'Pause', category: 'Transport' },
  'transport.record': { label: 'Record', category: 'Transport' },
  'transport.loop': { label: 'Toggle Loop', category: 'Transport' },

  // Navigation
  'nav.patternUp': { label: 'Pattern Up', category: 'Navigation' },
  'nav.patternDown': { label: 'Pattern Down', category: 'Navigation' },
  'nav.positionUp': { label: 'Song Position Up', category: 'Navigation' },
  'nav.positionDown': { label: 'Song Position Down', category: 'Navigation' },
  'nav.rowUp': { label: 'Row Up', category: 'Navigation' },
  'nav.rowDown': { label: 'Row Down', category: 'Navigation' },
  'nav.toStart': { label: 'Go to Start', category: 'Navigation' },
  'nav.toEnd': { label: 'Go to End', category: 'Navigation' },

  // Editing
  'edit.octaveUp': { label: 'Octave Up', category: 'Editing' },
  'edit.octaveDown': { label: 'Octave Down', category: 'Editing' },
  'edit.instrumentUp': { label: 'Instrument Up', category: 'Editing' },
  'edit.instrumentDown': { label: 'Instrument Down', category: 'Editing' },
  'edit.undo': { label: 'Undo', category: 'Editing' },
  'edit.redo': { label: 'Redo', category: 'Editing' },
  'edit.copy': { label: 'Copy', category: 'Editing' },
  'edit.paste': { label: 'Paste', category: 'Editing' },
  'edit.delete': { label: 'Delete', category: 'Editing' },
  'edit.insertRow': { label: 'Insert Row', category: 'Editing' },
  'edit.deleteRow': { label: 'Delete Row', category: 'Editing' },

  // Channels
  'channel.mute1': { label: 'Mute Ch 1', category: 'Channels' },
  'channel.mute2': { label: 'Mute Ch 2', category: 'Channels' },
  'channel.mute3': { label: 'Mute Ch 3', category: 'Channels' },
  'channel.mute4': { label: 'Mute Ch 4', category: 'Channels' },
  'channel.mute5': { label: 'Mute Ch 5', category: 'Channels' },
  'channel.mute6': { label: 'Mute Ch 6', category: 'Channels' },
  'channel.mute7': { label: 'Mute Ch 7', category: 'Channels' },
  'channel.mute8': { label: 'Mute Ch 8', category: 'Channels' },
  'channel.solo1': { label: 'Solo Ch 1', category: 'Channels' },
  'channel.solo2': { label: 'Solo Ch 2', category: 'Channels' },
  'channel.solo3': { label: 'Solo Ch 3', category: 'Channels' },
  'channel.solo4': { label: 'Solo Ch 4', category: 'Channels' },

  // Pattern
  'pattern.new': { label: 'New Pattern', category: 'Pattern' },
  'pattern.clone': { label: 'Clone Pattern', category: 'Pattern' },
  'pattern.delete': { label: 'Delete Pattern', category: 'Pattern' },

  // View
  'view.toggleEditor': { label: 'Toggle Editor', category: 'View' },
  'view.toggleMixer': { label: 'Toggle Mixer', category: 'View' },

  // DJ Transport
  'dj.deckA.play': { label: 'DJ Deck A Play', category: 'DJ Transport' },
  'dj.deckA.pause': { label: 'DJ Deck A Pause', category: 'DJ Transport' },
  'dj.deckA.stop': { label: 'DJ Deck A Stop', category: 'DJ Transport' },
  'dj.deckA.cue': { label: 'DJ Deck A Cue', category: 'DJ Transport' },
  'dj.deckB.play': { label: 'DJ Deck B Play', category: 'DJ Transport' },
  'dj.deckB.pause': { label: 'DJ Deck B Pause', category: 'DJ Transport' },
  'dj.deckB.stop': { label: 'DJ Deck B Stop', category: 'DJ Transport' },
  'dj.deckB.cue': { label: 'DJ Deck B Cue', category: 'DJ Transport' },
  'dj.sync': { label: 'DJ Sync B→A', category: 'DJ Transport' },
  'dj.killAll': { label: 'DJ Kill All', category: 'DJ Transport' },

  // DJ Navigation
  'dj.knobPage.next': { label: 'DJ Next Knob Page', category: 'DJ Navigation' },
  'dj.knobPage.prev': { label: 'DJ Prev Knob Page', category: 'DJ Navigation' },

  // DJ EQ Kill
  'dj.deckA.eqKillLow': { label: 'DJ Kill Lo A', category: 'DJ EQ Kill' },
  'dj.deckA.eqKillMid': { label: 'DJ Kill Mid A', category: 'DJ EQ Kill' },
  'dj.deckA.eqKillHi': { label: 'DJ Kill Hi A', category: 'DJ EQ Kill' },
  'dj.deckB.eqKillLow': { label: 'DJ Kill Lo B', category: 'DJ EQ Kill' },
  'dj.deckB.eqKillMid': { label: 'DJ Kill Mid B', category: 'DJ EQ Kill' },
  'dj.deckB.eqKillHi': { label: 'DJ Kill Hi B', category: 'DJ EQ Kill' },
} as const;

export type TrackerAction = keyof typeof TRACKER_ACTIONS;

/**
 * All mappable 303 parameters
 */
export const TB303_PARAMETERS = {
  // Main controls
  'tb303.cutoff': { label: 'Cutoff', min: 200, max: 5000, category: '303 Main' },
  'tb303.resonance': { label: 'Resonance', min: 0, max: 100, category: '303 Main' },
  'tb303.envMod': { label: 'Env Mod', min: 0, max: 100, category: '303 Main' },
  'tb303.decay': { label: 'Decay', min: 200, max: 2000, category: '303 Main' },
  'tb303.accent': { label: 'Accent', min: 0, max: 100, category: '303 Main' },
  'tb303.slideTime': { label: 'Slide Time', min: 2, max: 360, category: '303 Main' },
  'tb303.overdrive': { label: 'Overdrive', min: 0, max: 100, category: '303 Main' },

  // Devil Fish
  'tb303.normalDecay': { label: 'Normal Decay', min: 30, max: 3000, category: 'Devil Fish' },
  'tb303.accentDecay': { label: 'Accent Decay', min: 30, max: 3000, category: 'Devil Fish' },
  'tb303.softAttack': { label: 'Soft Attack', min: 0.3, max: 30, category: 'Devil Fish' },
  'tb303.vegSustain': { label: 'VEG Sustain', min: 0, max: 100, category: 'Devil Fish' },
  'tb303.filterFM': { label: 'Filter FM', min: 0, max: 100, category: 'Devil Fish' },
  'tb303.filterTracking': { label: 'Key Track', min: 0, max: 200, category: 'Devil Fish' },
} as const;

export type TB303Parameter = keyof typeof TB303_PARAMETERS;

/**
 * Controller Profiles Database
 */
export const CONTROLLER_PROFILES: ControllerProfile[] = [
  // ========================================
  // AKAI MPK Mini MK3
  // 8 knobs (CC 70-77), 8 pads (notes 36-43), joystick (PB + CC1)
  // OLED display (SysEx 0x47 0x49), NKS2 knob name updates
  // ========================================
  {
    id: 'akai-mpk-mini-mk3',
    name: 'MPK Mini MK3',
    manufacturer: 'Akai',
    detectPatterns: ['mpk mini', 'mpk mini mk3', 'mpkmini'],
    knobs: [
      { cc: 70, name: 'K1', defaultMapping: 'tb303.cutoff' },
      { cc: 71, name: 'K2', defaultMapping: 'tb303.resonance' },
      { cc: 72, name: 'K3', defaultMapping: 'tb303.envMod' },
      { cc: 73, name: 'K4', defaultMapping: 'tb303.decay' },
      { cc: 74, name: 'K5', defaultMapping: 'tb303.accent' },
      { cc: 75, name: 'K6', defaultMapping: 'tb303.overdrive' },
      { cc: 76, name: 'K7', defaultMapping: 'tb303.slideTime' },
      { cc: 77, name: 'K8', defaultMapping: 'tb303.normalDecay' },
    ],
    pads: [
      // Bank A (notes 36-43): Transport + Navigation
      { note: 36, name: 'Pad 1', defaultMapping: 'transport.play' },
      { note: 37, name: 'Pad 2', defaultMapping: 'transport.stop' },
      { note: 38, name: 'Pad 3', defaultMapping: 'transport.record' },
      { note: 39, name: 'Pad 4', defaultMapping: 'transport.loop' },
      { note: 40, name: 'Pad 5', defaultMapping: 'nav.patternDown' },
      { note: 41, name: 'Pad 6', defaultMapping: 'nav.patternUp' },
      { note: 42, name: 'Pad 7', defaultMapping: 'edit.octaveDown' },
      { note: 43, name: 'Pad 8', defaultMapping: 'edit.octaveUp' },
    ],
    extras: {
      pitchBend: true,
      modWheel: { cc: 1 },
    },
    suggestedLayout: {
      knobs: {
        70: 'tb303.cutoff',
        71: 'tb303.resonance',
        72: 'tb303.envMod',
        73: 'tb303.decay',
        74: 'tb303.accent',
        75: 'tb303.overdrive',
        76: 'tb303.slideTime',
        77: 'tb303.normalDecay',
      },
      pads: {
        36: 'transport.play',
        37: 'transport.stop',
        38: 'transport.record',
        39: 'transport.loop',
        40: 'nav.patternDown',
        41: 'nav.patternUp',
        42: 'edit.octaveDown',
        43: 'edit.octaveUp',
      },
    },
  },

  // ========================================
  // AKAI MPK Mini Plus
  // Same as MK3 but with additional features; same CC/note layout
  // ========================================
  {
    id: 'akai-mpk-mini-plus',
    name: 'MPK Mini Plus',
    manufacturer: 'Akai',
    detectPatterns: ['mpk mini plus', 'mpkminiplus'],
    knobs: [
      { cc: 70, name: 'K1', defaultMapping: 'tb303.cutoff' },
      { cc: 71, name: 'K2', defaultMapping: 'tb303.resonance' },
      { cc: 72, name: 'K3', defaultMapping: 'tb303.envMod' },
      { cc: 73, name: 'K4', defaultMapping: 'tb303.decay' },
      { cc: 74, name: 'K5', defaultMapping: 'tb303.accent' },
      { cc: 75, name: 'K6', defaultMapping: 'tb303.overdrive' },
      { cc: 76, name: 'K7', defaultMapping: 'tb303.slideTime' },
      { cc: 77, name: 'K8', defaultMapping: 'tb303.normalDecay' },
    ],
    pads: [
      // Mirror MK3 layout
      { note: 36, name: 'Pad 1', defaultMapping: 'transport.play' },
      { note: 37, name: 'Pad 2', defaultMapping: 'transport.stop' },
      { note: 38, name: 'Pad 3', defaultMapping: 'transport.record' },
      { note: 39, name: 'Pad 4', defaultMapping: 'transport.loop' },
      { note: 40, name: 'Pad 5', defaultMapping: 'nav.patternDown' },
      { note: 41, name: 'Pad 6', defaultMapping: 'nav.patternUp' },
      { note: 42, name: 'Pad 7', defaultMapping: 'edit.octaveDown' },
      { note: 43, name: 'Pad 8', defaultMapping: 'edit.octaveUp' },
    ],
    extras: {
      pitchBend: true,
      modWheel: { cc: 1 },
    },
    suggestedLayout: {
      knobs: {
        70: 'tb303.cutoff',
        71: 'tb303.resonance',
        72: 'tb303.envMod',
        73: 'tb303.decay',
        74: 'tb303.accent',
        75: 'tb303.overdrive',
        76: 'tb303.slideTime',
        77: 'tb303.normalDecay',
      },
      pads: {
        36: 'transport.play',
        37: 'transport.stop',
        38: 'transport.record',
        39: 'transport.loop',
        40: 'nav.patternDown',
        41: 'nav.patternUp',
        42: 'edit.octaveDown',
        43: 'edit.octaveUp',
      },
    },
  },

  // ========================================
  // Novation Launchkey Mini MK3
  // 8 knobs (CC 21-28), 16 pads (notes 36-51), keys, pitch/mod
  // 2 rows of 8 pads — row 1: transport/nav, row 2: editing/DJ
  // ========================================
  {
    id: 'novation-launchkey-mini-mk3',
    name: 'Launchkey Mini MK3',
    manufacturer: 'Novation',
    detectPatterns: ['launchkey mini', 'launchkey'],
    knobs: [
      { cc: 21, name: 'Knob 1', defaultMapping: 'tb303.cutoff' },
      { cc: 22, name: 'Knob 2', defaultMapping: 'tb303.resonance' },
      { cc: 23, name: 'Knob 3', defaultMapping: 'tb303.envMod' },
      { cc: 24, name: 'Knob 4', defaultMapping: 'tb303.decay' },
      { cc: 25, name: 'Knob 5', defaultMapping: 'tb303.accent' },
      { cc: 26, name: 'Knob 6', defaultMapping: 'tb303.overdrive' },
      { cc: 27, name: 'Knob 7', defaultMapping: 'tb303.slideTime' },
      { cc: 28, name: 'Knob 8', defaultMapping: 'tb303.normalDecay' },
    ],
    pads: [
      // Row 1 (pads 1-8): Transport + Navigation
      { note: 36, name: 'Pad 1', defaultMapping: 'transport.play' },
      { note: 37, name: 'Pad 2', defaultMapping: 'transport.stop' },
      { note: 38, name: 'Pad 3', defaultMapping: 'transport.record' },
      { note: 39, name: 'Pad 4', defaultMapping: 'transport.loop' },
      { note: 40, name: 'Pad 5', defaultMapping: 'nav.patternDown' },
      { note: 41, name: 'Pad 6', defaultMapping: 'nav.patternUp' },
      { note: 42, name: 'Pad 7', defaultMapping: 'edit.octaveDown' },
      { note: 43, name: 'Pad 8', defaultMapping: 'edit.octaveUp' },
      // Row 2 (pads 9-16): Editing + DJ
      { note: 44, name: 'Pad 9', defaultMapping: 'edit.undo' },
      { note: 45, name: 'Pad 10', defaultMapping: 'edit.redo' },
      { note: 46, name: 'Pad 11', defaultMapping: 'edit.copy' },
      { note: 47, name: 'Pad 12', defaultMapping: 'edit.paste' },
      { note: 48, name: 'Pad 13', defaultMapping: 'dj.deckA.play' },
      { note: 49, name: 'Pad 14', defaultMapping: 'dj.deckA.cue' },
      { note: 50, name: 'Pad 15', defaultMapping: 'dj.deckB.play' },
      { note: 51, name: 'Pad 16', defaultMapping: 'dj.deckB.cue' },
    ],
    extras: {
      pitchBend: true,
      modWheel: { cc: 1 },
      sustain: { cc: 64 },
    },
    suggestedLayout: {
      knobs: {
        21: 'tb303.cutoff',
        22: 'tb303.resonance',
        23: 'tb303.envMod',
        24: 'tb303.decay',
        25: 'tb303.accent',
        26: 'tb303.overdrive',
        27: 'tb303.slideTime',
        28: 'tb303.normalDecay',
      },
      pads: {
        36: 'transport.play',
        37: 'transport.stop',
        38: 'transport.record',
        39: 'transport.loop',
        40: 'nav.patternDown',
        41: 'nav.patternUp',
        42: 'edit.octaveDown',
        43: 'edit.octaveUp',
        44: 'edit.undo',
        45: 'edit.redo',
        46: 'edit.copy',
        47: 'edit.paste',
        48: 'dj.deckA.play',
        49: 'dj.deckA.cue',
        50: 'dj.deckB.play',
        51: 'dj.deckB.cue',
      },
    },
  },

  // ========================================
  // Arturia MiniLab 3
  // 8 knobs (non-sequential CCs), 8 pads (notes 36-43), 4 faders
  // Knob CCs: 74,71,76,77,93,73,75,114
  // Fader CCs: 85,86,87,88
  // ========================================
  {
    id: 'arturia-minilab-3',
    name: 'MiniLab 3',
    manufacturer: 'Arturia',
    detectPatterns: ['minilab', 'arturia minilab'],
    knobs: [
      { cc: 74, name: 'Knob 1', defaultMapping: 'tb303.cutoff' },
      { cc: 71, name: 'Knob 2', defaultMapping: 'tb303.resonance' },
      { cc: 76, name: 'Knob 3', defaultMapping: 'tb303.envMod' },
      { cc: 77, name: 'Knob 4', defaultMapping: 'tb303.decay' },
      { cc: 93, name: 'Knob 5', defaultMapping: 'tb303.accent' },
      { cc: 73, name: 'Knob 6', defaultMapping: 'tb303.overdrive' },
      { cc: 75, name: 'Knob 7', defaultMapping: 'tb303.slideTime' },
      { cc: 114, name: 'Knob 8', defaultMapping: 'tb303.normalDecay' },
    ],
    pads: [
      // Pads: Transport + Navigation
      { note: 36, name: 'Pad 1', defaultMapping: 'transport.play' },
      { note: 37, name: 'Pad 2', defaultMapping: 'transport.stop' },
      { note: 38, name: 'Pad 3', defaultMapping: 'transport.record' },
      { note: 39, name: 'Pad 4', defaultMapping: 'transport.loop' },
      { note: 40, name: 'Pad 5', defaultMapping: 'nav.patternDown' },
      { note: 41, name: 'Pad 6', defaultMapping: 'nav.patternUp' },
      { note: 42, name: 'Pad 7', defaultMapping: 'edit.octaveDown' },
      { note: 43, name: 'Pad 8', defaultMapping: 'edit.octaveUp' },
    ],
    extras: {
      pitchBend: true,
      modWheel: { cc: 1 },
      sustain: { cc: 64 },
      faders: [
        { cc: 85, name: 'Fader 1', defaultMapping: 'mixer.volume' },
        { cc: 86, name: 'Fader 2', defaultMapping: 'mixer.pan' },
        { cc: 87, name: 'Fader 3', defaultMapping: 'tb303.volume' },
        { cc: 88, name: 'Fader 4', defaultMapping: 'masterFx.masterVolume' },
      ],
    },
    suggestedLayout: {
      knobs: {
        74: 'tb303.cutoff',
        71: 'tb303.resonance',
        76: 'tb303.envMod',
        77: 'tb303.decay',
        93: 'tb303.accent',
        73: 'tb303.overdrive',
        75: 'tb303.slideTime',
        114: 'tb303.normalDecay',
      },
      pads: {
        36: 'transport.play',
        37: 'transport.stop',
        38: 'transport.record',
        39: 'transport.loop',
        40: 'nav.patternDown',
        41: 'nav.patternUp',
        42: 'edit.octaveDown',
        43: 'edit.octaveUp',
      },
      faders: {
        85: 'mixer.volume',
        86: 'mixer.pan',
        87: 'tb303.volume',
        88: 'masterFx.masterVolume',
      },
    },
  },

  // ========================================
  // Korg nanoKONTROL2
  // 8 knobs (CC 16-23), 8 faders (CC 0-7)
  // S/M/R buttons (CC 32-35, 48-51, 64-67), transport (CC 41-46)
  // Full mixer surface: faders = channel volume, knobs = synth params
  // ========================================
  {
    id: 'korg-nanokontrol2',
    name: 'nanoKONTROL2',
    manufacturer: 'Korg',
    detectPatterns: ['nanokontrol', 'nano kontrol', 'korg nano'],
    knobs: [
      { cc: 16, name: 'Knob 1', defaultMapping: 'tb303.cutoff' },
      { cc: 17, name: 'Knob 2', defaultMapping: 'tb303.resonance' },
      { cc: 18, name: 'Knob 3', defaultMapping: 'tb303.envMod' },
      { cc: 19, name: 'Knob 4', defaultMapping: 'tb303.decay' },
      { cc: 20, name: 'Knob 5', defaultMapping: 'tb303.accent' },
      { cc: 21, name: 'Knob 6', defaultMapping: 'tb303.overdrive' },
      { cc: 22, name: 'Knob 7', defaultMapping: 'tb303.slideTime' },
      { cc: 23, name: 'Knob 8', defaultMapping: 'tb303.normalDecay' },
    ],
    pads: [
      // S buttons (solo) — solo channels 1-4
      { cc: 32, name: 'S1', defaultMapping: 'channel.solo1' },
      { cc: 33, name: 'S2', defaultMapping: 'channel.solo2' },
      { cc: 34, name: 'S3', defaultMapping: 'channel.solo3' },
      { cc: 35, name: 'S4', defaultMapping: 'channel.solo4' },
      // S buttons 5-8 — extended solo
      { cc: 36, name: 'S5', defaultMapping: 'edit.undo' },
      { cc: 37, name: 'S6', defaultMapping: 'edit.redo' },
      { cc: 38, name: 'S7', defaultMapping: 'edit.octaveDown' },
      { cc: 39, name: 'S8', defaultMapping: 'edit.octaveUp' },
      // M buttons (mute) — mute channels 1-8
      { cc: 48, name: 'M1', defaultMapping: 'channel.mute1' },
      { cc: 49, name: 'M2', defaultMapping: 'channel.mute2' },
      { cc: 50, name: 'M3', defaultMapping: 'channel.mute3' },
      { cc: 51, name: 'M4', defaultMapping: 'channel.mute4' },
      { cc: 52, name: 'M5', defaultMapping: 'channel.mute5' },
      { cc: 53, name: 'M6', defaultMapping: 'channel.mute6' },
      { cc: 54, name: 'M7', defaultMapping: 'channel.mute7' },
      { cc: 55, name: 'M8', defaultMapping: 'channel.mute8' },
      // R buttons (record arm) — navigation + DJ
      { cc: 64, name: 'R1', defaultMapping: 'nav.patternDown' },
      { cc: 65, name: 'R2', defaultMapping: 'nav.patternUp' },
      { cc: 66, name: 'R3', defaultMapping: 'dj.knobPage.prev' },
      { cc: 67, name: 'R4', defaultMapping: 'dj.knobPage.next' },
      { cc: 68, name: 'R5', defaultMapping: 'dj.deckA.play' },
      { cc: 69, name: 'R6', defaultMapping: 'dj.deckA.cue' },
      { cc: 70, name: 'R7', defaultMapping: 'dj.deckB.play' },
      { cc: 71, name: 'R8', defaultMapping: 'dj.deckB.cue' },
      // Transport
      { cc: 41, name: 'Play', defaultMapping: 'transport.play' },
      { cc: 42, name: 'Stop', defaultMapping: 'transport.stop' },
      { cc: 43, name: 'Rewind', defaultMapping: 'nav.toStart' },
      { cc: 44, name: 'Forward', defaultMapping: 'nav.toEnd' },
      { cc: 45, name: 'Record', defaultMapping: 'transport.record' },
      { cc: 46, name: 'Cycle', defaultMapping: 'transport.loop' },
    ],
    extras: {
      faders: [
        { cc: 0, name: 'Fader 1', defaultMapping: 'mixer.volume' },
        { cc: 1, name: 'Fader 2', defaultMapping: 'mixer.volume' },
        { cc: 2, name: 'Fader 3', defaultMapping: 'mixer.volume' },
        { cc: 3, name: 'Fader 4', defaultMapping: 'mixer.volume' },
        { cc: 4, name: 'Fader 5', defaultMapping: 'mixer.volume' },
        { cc: 5, name: 'Fader 6', defaultMapping: 'mixer.volume' },
        { cc: 6, name: 'Fader 7', defaultMapping: 'mixer.volume' },
        { cc: 7, name: 'Fader 8', defaultMapping: 'masterFx.masterVolume' },
      ],
    },
    suggestedLayout: {
      knobs: {
        16: 'tb303.cutoff',
        17: 'tb303.resonance',
        18: 'tb303.envMod',
        19: 'tb303.decay',
        20: 'tb303.accent',
        21: 'tb303.overdrive',
        22: 'tb303.slideTime',
        23: 'tb303.normalDecay',
      },
      faders: {
        0: 'mixer.volume',
        1: 'mixer.volume',
        2: 'mixer.volume',
        3: 'mixer.volume',
        4: 'mixer.volume',
        5: 'mixer.volume',
        6: 'mixer.volume',
        7: 'masterFx.masterVolume',
      },
    },
  },

  // ========================================
  // Behringer X-Touch Mini
  // 8 encoders (CC 1-8), 16 buttons (notes 0-15), 1 fader (CC 9)
  // Layer A + B: 2x8 buttons per layer
  // Row 1: Transport + Pattern, Row 2: Editing + DJ
  // ========================================
  {
    id: 'behringer-xtouch-mini',
    name: 'X-Touch Mini',
    manufacturer: 'Behringer',
    detectPatterns: ['x-touch', 'xtouch', 'behringer x-touch'],
    knobs: [
      { cc: 1, name: 'Encoder 1', defaultMapping: 'tb303.cutoff' },
      { cc: 2, name: 'Encoder 2', defaultMapping: 'tb303.resonance' },
      { cc: 3, name: 'Encoder 3', defaultMapping: 'tb303.envMod' },
      { cc: 4, name: 'Encoder 4', defaultMapping: 'tb303.decay' },
      { cc: 5, name: 'Encoder 5', defaultMapping: 'tb303.accent' },
      { cc: 6, name: 'Encoder 6', defaultMapping: 'tb303.overdrive' },
      { cc: 7, name: 'Encoder 7', defaultMapping: 'tb303.slideTime' },
      { cc: 8, name: 'Encoder 8', defaultMapping: 'tb303.normalDecay' },
    ],
    pads: [
      // Row 1 (buttons 1-8): Transport + Navigation
      { note: 0, name: 'Button 1', defaultMapping: 'transport.play' },
      { note: 1, name: 'Button 2', defaultMapping: 'transport.stop' },
      { note: 2, name: 'Button 3', defaultMapping: 'transport.record' },
      { note: 3, name: 'Button 4', defaultMapping: 'transport.loop' },
      { note: 4, name: 'Button 5', defaultMapping: 'nav.patternDown' },
      { note: 5, name: 'Button 6', defaultMapping: 'nav.patternUp' },
      { note: 6, name: 'Button 7', defaultMapping: 'edit.octaveDown' },
      { note: 7, name: 'Button 8', defaultMapping: 'edit.octaveUp' },
      // Row 2 (buttons 9-16): Editing + DJ
      { note: 8, name: 'Button 9', defaultMapping: 'edit.undo' },
      { note: 9, name: 'Button 10', defaultMapping: 'edit.redo' },
      { note: 10, name: 'Button 11', defaultMapping: 'dj.knobPage.prev' },
      { note: 11, name: 'Button 12', defaultMapping: 'dj.knobPage.next' },
      { note: 12, name: 'Button 13', defaultMapping: 'dj.deckA.play' },
      { note: 13, name: 'Button 14', defaultMapping: 'dj.deckA.cue' },
      { note: 14, name: 'Button 15', defaultMapping: 'dj.deckB.play' },
      { note: 15, name: 'Button 16', defaultMapping: 'dj.deckB.cue' },
    ],
    extras: {
      faders: [
        { cc: 9, name: 'Fader', defaultMapping: 'masterFx.masterVolume' },
      ],
    },
    suggestedLayout: {
      knobs: {
        1: 'tb303.cutoff',
        2: 'tb303.resonance',
        3: 'tb303.envMod',
        4: 'tb303.decay',
        5: 'tb303.accent',
        6: 'tb303.overdrive',
        7: 'tb303.slideTime',
        8: 'tb303.normalDecay',
      },
      pads: {
        0: 'transport.play',
        1: 'transport.stop',
        2: 'transport.record',
        3: 'transport.loop',
        4: 'nav.patternDown',
        5: 'nav.patternUp',
        6: 'edit.octaveDown',
        7: 'edit.octaveUp',
        8: 'edit.undo',
        9: 'edit.redo',
        10: 'dj.knobPage.prev',
        11: 'dj.knobPage.next',
        12: 'dj.deckA.play',
        13: 'dj.deckA.cue',
        14: 'dj.deckB.play',
        15: 'dj.deckB.cue',
      },
      faders: {
        9: 'masterFx.masterVolume',
      },
    },
  },

  // ========================================
  // Behringer TD-3
  // Pure synth controller — 6 CCs for 303 parameters, no pads
  // Auto-detected by MIDIManager.isTD3Device()
  // CC assignments from TD3CCProfile.ts
  // ========================================
  {
    id: 'behringer-td3',
    name: 'TD-3',
    manufacturer: 'Behringer',
    detectPatterns: ['td-3', 'td3', 'behringer td'],
    knobs: [
      { cc: 74, name: 'Cutoff', defaultMapping: 'tb303.cutoff' },
      { cc: 71, name: 'Resonance', defaultMapping: 'tb303.resonance' },
      { cc: 10, name: 'Env Mod', defaultMapping: 'tb303.envMod' },
      { cc: 75, name: 'Decay', defaultMapping: 'tb303.decay' },
      { cc: 16, name: 'Accent', defaultMapping: 'tb303.accent' },
      { cc: 7, name: 'Volume', defaultMapping: 'tb303.volume' },
    ],
    pads: [],
    suggestedLayout: {
      knobs: {
        74: 'tb303.cutoff',
        71: 'tb303.resonance',
        10: 'tb303.envMod',
        75: 'tb303.decay',
        16: 'tb303.accent',
        7: 'tb303.volume',
      },
    },
  },

  // ========================================
  // Akai APC Mini MK2
  // 64 pad grid (notes 0-63), 9 faders (CC 48-56), 8 track buttons
  // Grid is 8x8, faders are channel strips + master
  // ========================================
  {
    id: 'akai-apc-mini-mk2',
    name: 'APC Mini MK2',
    manufacturer: 'Akai',
    detectPatterns: ['apc mini', 'apc mini mk2'],
    knobs: [],
    pads: [
      // Bottom row (row 1): Transport + Navigation
      { note: 0, name: 'Grid 1:1', defaultMapping: 'transport.play' },
      { note: 1, name: 'Grid 1:2', defaultMapping: 'transport.stop' },
      { note: 2, name: 'Grid 1:3', defaultMapping: 'transport.record' },
      { note: 3, name: 'Grid 1:4', defaultMapping: 'transport.loop' },
      { note: 4, name: 'Grid 1:5', defaultMapping: 'nav.patternDown' },
      { note: 5, name: 'Grid 1:6', defaultMapping: 'nav.patternUp' },
      { note: 6, name: 'Grid 1:7', defaultMapping: 'edit.octaveDown' },
      { note: 7, name: 'Grid 1:8', defaultMapping: 'edit.octaveUp' },
      // Row 2: DJ Transport
      { note: 8, name: 'Grid 2:1', defaultMapping: 'dj.deckA.play' },
      { note: 9, name: 'Grid 2:2', defaultMapping: 'dj.deckA.stop' },
      { note: 10, name: 'Grid 2:3', defaultMapping: 'dj.deckA.cue' },
      { note: 11, name: 'Grid 2:4', defaultMapping: 'dj.killAll' },
      { note: 12, name: 'Grid 2:5', defaultMapping: 'dj.deckB.play' },
      { note: 13, name: 'Grid 2:6', defaultMapping: 'dj.deckB.stop' },
      { note: 14, name: 'Grid 2:7', defaultMapping: 'dj.deckB.cue' },
      { note: 15, name: 'Grid 2:8', defaultMapping: 'dj.sync' },
      // Row 3: DJ EQ Kill
      { note: 16, name: 'Grid 3:1', defaultMapping: 'dj.deckA.eqKillLow' },
      { note: 17, name: 'Grid 3:2', defaultMapping: 'dj.deckA.eqKillMid' },
      { note: 18, name: 'Grid 3:3', defaultMapping: 'dj.deckA.eqKillHi' },
      { note: 19, name: 'Grid 3:4', defaultMapping: 'dj.knobPage.prev' },
      { note: 20, name: 'Grid 3:5', defaultMapping: 'dj.deckB.eqKillLow' },
      { note: 21, name: 'Grid 3:6', defaultMapping: 'dj.deckB.eqKillMid' },
      { note: 22, name: 'Grid 3:7', defaultMapping: 'dj.deckB.eqKillHi' },
      { note: 23, name: 'Grid 3:8', defaultMapping: 'dj.knobPage.next' },
      // Row 4: Editing
      { note: 24, name: 'Grid 4:1', defaultMapping: 'edit.undo' },
      { note: 25, name: 'Grid 4:2', defaultMapping: 'edit.redo' },
      { note: 26, name: 'Grid 4:3', defaultMapping: 'edit.copy' },
      { note: 27, name: 'Grid 4:4', defaultMapping: 'edit.paste' },
      { note: 28, name: 'Grid 4:5', defaultMapping: 'edit.delete' },
      { note: 29, name: 'Grid 4:6', defaultMapping: 'edit.insertRow' },
      { note: 30, name: 'Grid 4:7', defaultMapping: 'edit.deleteRow' },
      { note: 31, name: 'Grid 4:8', defaultMapping: 'pattern.clone' },
      // Row 5: Channel mutes 1-8
      { note: 32, name: 'Grid 5:1', defaultMapping: 'channel.mute1' },
      { note: 33, name: 'Grid 5:2', defaultMapping: 'channel.mute2' },
      { note: 34, name: 'Grid 5:3', defaultMapping: 'channel.mute3' },
      { note: 35, name: 'Grid 5:4', defaultMapping: 'channel.mute4' },
      { note: 36, name: 'Grid 5:5', defaultMapping: 'channel.mute5' },
      { note: 37, name: 'Grid 5:6', defaultMapping: 'channel.mute6' },
      { note: 38, name: 'Grid 5:7', defaultMapping: 'channel.mute7' },
      { note: 39, name: 'Grid 5:8', defaultMapping: 'channel.mute8' },
      // Rows 6-8 unmapped (available for user MIDI learn)
    ],
    extras: {
      faders: [
        { cc: 48, name: 'Fader 1', defaultMapping: 'mixer.volume' },
        { cc: 49, name: 'Fader 2', defaultMapping: 'mixer.volume' },
        { cc: 50, name: 'Fader 3', defaultMapping: 'mixer.volume' },
        { cc: 51, name: 'Fader 4', defaultMapping: 'mixer.volume' },
        { cc: 52, name: 'Fader 5', defaultMapping: 'mixer.volume' },
        { cc: 53, name: 'Fader 6', defaultMapping: 'mixer.volume' },
        { cc: 54, name: 'Fader 7', defaultMapping: 'mixer.volume' },
        { cc: 55, name: 'Fader 8', defaultMapping: 'mixer.volume' },
        { cc: 56, name: 'Master', defaultMapping: 'masterFx.masterVolume' },
      ],
    },
    suggestedLayout: {
      pads: {
        0: 'transport.play',
        1: 'transport.stop',
        2: 'transport.record',
        3: 'transport.loop',
        4: 'nav.patternDown',
        5: 'nav.patternUp',
        6: 'edit.octaveDown',
        7: 'edit.octaveUp',
        8: 'dj.deckA.play',
        9: 'dj.deckA.stop',
        10: 'dj.deckA.cue',
        11: 'dj.killAll',
        12: 'dj.deckB.play',
        13: 'dj.deckB.stop',
        14: 'dj.deckB.cue',
        15: 'dj.sync',
      },
      faders: {
        48: 'mixer.volume',
        49: 'mixer.volume',
        50: 'mixer.volume',
        51: 'mixer.volume',
        52: 'mixer.volume',
        53: 'mixer.volume',
        54: 'mixer.volume',
        55: 'mixer.volume',
        56: 'masterFx.masterVolume',
      },
    },
  },

  // ========================================
  // Novation Launch Control XL
  // 24 knobs (3 rows × 8), 8 faders, 16 buttons
  // Row 1: Send A (CC 13-20), Row 2: Send B (CC 29-36), Row 3: Pan (CC 49-56)
  // Faders CC 77-84, buttons CC 41-44 (focus), CC 73-76 (control)
  // ========================================
  {
    id: 'novation-launch-control-xl',
    name: 'Launch Control XL',
    manufacturer: 'Novation',
    detectPatterns: ['launch control xl', 'launchcontrol xl'],
    knobs: [
      // Row 1 (Send A): 303 Filter section
      { cc: 13, name: 'Send A1', defaultMapping: 'tb303.cutoff' },
      { cc: 14, name: 'Send A2', defaultMapping: 'tb303.resonance' },
      { cc: 15, name: 'Send A3', defaultMapping: 'tb303.envMod' },
      { cc: 16, name: 'Send A4', defaultMapping: 'tb303.decay' },
      { cc: 17, name: 'Send A5', defaultMapping: 'tb303.accent' },
      { cc: 18, name: 'Send A6', defaultMapping: 'tb303.overdrive' },
      { cc: 19, name: 'Send A7', defaultMapping: 'tb303.slideTime' },
      { cc: 20, name: 'Send A8', defaultMapping: 'tb303.normalDecay' },
      // Row 2 (Send B): Effects
      { cc: 29, name: 'Send B1', defaultMapping: 'delayTime' },
      { cc: 30, name: 'Send B2', defaultMapping: 'delayFeedback' },
      { cc: 31, name: 'Send B3', defaultMapping: 'delayMix' },
      { cc: 32, name: 'Send B4', defaultMapping: 'chorusMix' },
      { cc: 33, name: 'Send B5', defaultMapping: 'phaserRate' },
      { cc: 34, name: 'Send B6', defaultMapping: 'phaserMix' },
      { cc: 35, name: 'Send B7', defaultMapping: 'masterFx.slot0.wet' },
      { cc: 36, name: 'Send B8', defaultMapping: 'masterFx.slot1.wet' },
      // Row 3 (Pan): per-channel pan/mixer
      { cc: 49, name: 'Pan 1', defaultMapping: 'mixer.pan' },
      { cc: 50, name: 'Pan 2', defaultMapping: 'mixer.pan' },
      { cc: 51, name: 'Pan 3', defaultMapping: 'mixer.pan' },
      { cc: 52, name: 'Pan 4', defaultMapping: 'mixer.pan' },
      { cc: 53, name: 'Pan 5', defaultMapping: 'mixer.pan' },
      { cc: 54, name: 'Pan 6', defaultMapping: 'mixer.pan' },
      { cc: 55, name: 'Pan 7', defaultMapping: 'mixer.pan' },
      { cc: 56, name: 'Pan 8', defaultMapping: 'mixer.pan' },
    ],
    pads: [
      // Focus buttons (upper row)
      { cc: 41, name: 'Focus 1', defaultMapping: 'channel.solo1' },
      { cc: 42, name: 'Focus 2', defaultMapping: 'channel.solo2' },
      { cc: 43, name: 'Focus 3', defaultMapping: 'channel.solo3' },
      { cc: 44, name: 'Focus 4', defaultMapping: 'channel.solo4' },
      // Control buttons (lower row)
      { cc: 73, name: 'Control 1', defaultMapping: 'channel.mute1' },
      { cc: 74, name: 'Control 2', defaultMapping: 'channel.mute2' },
      { cc: 75, name: 'Control 3', defaultMapping: 'channel.mute3' },
      { cc: 76, name: 'Control 4', defaultMapping: 'channel.mute4' },
    ],
    extras: {
      faders: [
        { cc: 77, name: 'Fader 1', defaultMapping: 'mixer.volume' },
        { cc: 78, name: 'Fader 2', defaultMapping: 'mixer.volume' },
        { cc: 79, name: 'Fader 3', defaultMapping: 'mixer.volume' },
        { cc: 80, name: 'Fader 4', defaultMapping: 'mixer.volume' },
        { cc: 81, name: 'Fader 5', defaultMapping: 'mixer.volume' },
        { cc: 82, name: 'Fader 6', defaultMapping: 'mixer.volume' },
        { cc: 83, name: 'Fader 7', defaultMapping: 'mixer.volume' },
        { cc: 84, name: 'Fader 8', defaultMapping: 'masterFx.masterVolume' },
      ],
    },
    suggestedLayout: {
      knobs: {
        13: 'tb303.cutoff',
        14: 'tb303.resonance',
        15: 'tb303.envMod',
        16: 'tb303.decay',
        17: 'tb303.accent',
        18: 'tb303.overdrive',
        19: 'tb303.slideTime',
        20: 'tb303.normalDecay',
      },
      faders: {
        77: 'mixer.volume',
        78: 'mixer.volume',
        79: 'mixer.volume',
        80: 'mixer.volume',
        81: 'mixer.volume',
        82: 'mixer.volume',
        83: 'mixer.volume',
        84: 'masterFx.masterVolume',
      },
    },
  },

  // ========================================
  // Arturia KeyLab Essential 49/61
  // 9 encoders (CC 10,74,71,76,77,93,73,75,114), 9 faders (CC 73-80,7)
  // 16 pads (notes 36-51), transport buttons, DAW integration
  // ========================================
  {
    id: 'arturia-keylab-essential',
    name: 'KeyLab Essential',
    manufacturer: 'Arturia',
    detectPatterns: ['keylab essential', 'keylab 49', 'keylab 61', 'arturia keylab'],
    knobs: [
      { cc: 10, name: 'Encoder 1', defaultMapping: 'tb303.cutoff' },
      { cc: 74, name: 'Encoder 2', defaultMapping: 'tb303.resonance' },
      { cc: 71, name: 'Encoder 3', defaultMapping: 'tb303.envMod' },
      { cc: 76, name: 'Encoder 4', defaultMapping: 'tb303.decay' },
      { cc: 77, name: 'Encoder 5', defaultMapping: 'tb303.accent' },
      { cc: 93, name: 'Encoder 6', defaultMapping: 'tb303.overdrive' },
      { cc: 73, name: 'Encoder 7', defaultMapping: 'tb303.slideTime' },
      { cc: 75, name: 'Encoder 8', defaultMapping: 'tb303.normalDecay' },
      { cc: 114, name: 'Encoder 9', defaultMapping: 'tb303.accentDecay' },
    ],
    pads: [
      // Row 1: Transport + Navigation
      { note: 36, name: 'Pad 1', defaultMapping: 'transport.play' },
      { note: 37, name: 'Pad 2', defaultMapping: 'transport.stop' },
      { note: 38, name: 'Pad 3', defaultMapping: 'transport.record' },
      { note: 39, name: 'Pad 4', defaultMapping: 'transport.loop' },
      { note: 40, name: 'Pad 5', defaultMapping: 'nav.patternDown' },
      { note: 41, name: 'Pad 6', defaultMapping: 'nav.patternUp' },
      { note: 42, name: 'Pad 7', defaultMapping: 'edit.octaveDown' },
      { note: 43, name: 'Pad 8', defaultMapping: 'edit.octaveUp' },
      // Row 2: DJ + Editing
      { note: 44, name: 'Pad 9', defaultMapping: 'dj.deckA.play' },
      { note: 45, name: 'Pad 10', defaultMapping: 'dj.deckA.cue' },
      { note: 46, name: 'Pad 11', defaultMapping: 'dj.deckB.play' },
      { note: 47, name: 'Pad 12', defaultMapping: 'dj.deckB.cue' },
      { note: 48, name: 'Pad 13', defaultMapping: 'edit.undo' },
      { note: 49, name: 'Pad 14', defaultMapping: 'edit.redo' },
      { note: 50, name: 'Pad 15', defaultMapping: 'dj.knobPage.prev' },
      { note: 51, name: 'Pad 16', defaultMapping: 'dj.knobPage.next' },
    ],
    extras: {
      pitchBend: true,
      modWheel: { cc: 1 },
      sustain: { cc: 64 },
      faders: [
        { cc: 73, name: 'Fader 1', defaultMapping: 'mixer.volume' },
        { cc: 74, name: 'Fader 2', defaultMapping: 'mixer.volume' },
        { cc: 75, name: 'Fader 3', defaultMapping: 'mixer.volume' },
        { cc: 76, name: 'Fader 4', defaultMapping: 'mixer.volume' },
        { cc: 18, name: 'Fader 5', defaultMapping: 'mixer.volume' },
        { cc: 19, name: 'Fader 6', defaultMapping: 'mixer.volume' },
        { cc: 16, name: 'Fader 7', defaultMapping: 'mixer.volume' },
        { cc: 17, name: 'Fader 8', defaultMapping: 'mixer.volume' },
        { cc: 7, name: 'Fader 9', defaultMapping: 'masterFx.masterVolume' },
      ],
    },
    suggestedLayout: {
      knobs: {
        10: 'tb303.cutoff',
        74: 'tb303.resonance',
        71: 'tb303.envMod',
        76: 'tb303.decay',
        77: 'tb303.accent',
        93: 'tb303.overdrive',
        73: 'tb303.slideTime',
        75: 'tb303.normalDecay',
      },
      pads: {
        36: 'transport.play',
        37: 'transport.stop',
        38: 'transport.record',
        39: 'transport.loop',
        40: 'nav.patternDown',
        41: 'nav.patternUp',
        42: 'edit.octaveDown',
        43: 'edit.octaveUp',
      },
    },
  },

  // ========================================
  // Akai APC Key 25 MK2
  // 25 mini keys, 40 pad grid (5x8), 8 knobs (CC 48-55)
  // ========================================
  {
    id: 'akai-apc-key-25-mk2',
    name: 'APC Key 25 MK2',
    manufacturer: 'Akai',
    detectPatterns: ['apc key 25', 'apc key25', 'apckey25'],
    knobs: [
      { cc: 48, name: 'Knob 1', defaultMapping: 'tb303.cutoff' },
      { cc: 49, name: 'Knob 2', defaultMapping: 'tb303.resonance' },
      { cc: 50, name: 'Knob 3', defaultMapping: 'tb303.envMod' },
      { cc: 51, name: 'Knob 4', defaultMapping: 'tb303.decay' },
      { cc: 52, name: 'Knob 5', defaultMapping: 'tb303.accent' },
      { cc: 53, name: 'Knob 6', defaultMapping: 'tb303.overdrive' },
      { cc: 54, name: 'Knob 7', defaultMapping: 'tb303.slideTime' },
      { cc: 55, name: 'Knob 8', defaultMapping: 'tb303.normalDecay' },
    ],
    pads: [
      // Bottom row: Transport + Navigation
      { note: 0, name: 'Grid 1:1', defaultMapping: 'transport.play' },
      { note: 1, name: 'Grid 1:2', defaultMapping: 'transport.stop' },
      { note: 2, name: 'Grid 1:3', defaultMapping: 'transport.record' },
      { note: 3, name: 'Grid 1:4', defaultMapping: 'transport.loop' },
      { note: 4, name: 'Grid 1:5', defaultMapping: 'nav.patternDown' },
      { note: 5, name: 'Grid 1:6', defaultMapping: 'nav.patternUp' },
      { note: 6, name: 'Grid 1:7', defaultMapping: 'edit.octaveDown' },
      { note: 7, name: 'Grid 1:8', defaultMapping: 'edit.octaveUp' },
      // Row 2: DJ
      { note: 8, name: 'Grid 2:1', defaultMapping: 'dj.deckA.play' },
      { note: 9, name: 'Grid 2:2', defaultMapping: 'dj.deckA.cue' },
      { note: 10, name: 'Grid 2:3', defaultMapping: 'dj.deckB.play' },
      { note: 11, name: 'Grid 2:4', defaultMapping: 'dj.deckB.cue' },
      { note: 12, name: 'Grid 2:5', defaultMapping: 'dj.killAll' },
      { note: 13, name: 'Grid 2:6', defaultMapping: 'dj.sync' },
      { note: 14, name: 'Grid 2:7', defaultMapping: 'dj.knobPage.prev' },
      { note: 15, name: 'Grid 2:8', defaultMapping: 'dj.knobPage.next' },
    ],
    extras: {
      pitchBend: true,
      modWheel: { cc: 1 },
      sustain: { cc: 64 },
    },
    suggestedLayout: {
      knobs: {
        48: 'tb303.cutoff',
        49: 'tb303.resonance',
        50: 'tb303.envMod',
        51: 'tb303.decay',
        52: 'tb303.accent',
        53: 'tb303.overdrive',
        54: 'tb303.slideTime',
        55: 'tb303.normalDecay',
      },
      pads: {
        0: 'transport.play',
        1: 'transport.stop',
        2: 'transport.record',
        3: 'transport.loop',
        4: 'nav.patternDown',
        5: 'nav.patternUp',
        6: 'edit.octaveDown',
        7: 'edit.octaveUp',
      },
    },
  },

  // ========================================
  // Korg nanoKEY2
  // 25 mini keys, no knobs/pads/faders
  // Pure keyboard controller with pitch/mod
  // ========================================
  {
    id: 'korg-nanokey2',
    name: 'nanoKEY2',
    manufacturer: 'Korg',
    detectPatterns: ['nanokey', 'nano key'],
    knobs: [],
    pads: [],
    extras: {
      pitchBend: true,
      modWheel: { cc: 1 },
    },
  },

  // ========================================
  // Korg nanoPAD2
  // 16 pads (notes 36-51), X-Y pad (CC 1, CC 2)
  // ========================================
  {
    id: 'korg-nanopad2',
    name: 'nanoPAD2',
    manufacturer: 'Korg',
    detectPatterns: ['nanopad', 'nano pad'],
    knobs: [],
    pads: [
      // Row 1: Transport + Navigation
      { note: 36, name: 'Pad 1', defaultMapping: 'transport.play' },
      { note: 37, name: 'Pad 2', defaultMapping: 'transport.stop' },
      { note: 38, name: 'Pad 3', defaultMapping: 'transport.record' },
      { note: 39, name: 'Pad 4', defaultMapping: 'transport.loop' },
      { note: 40, name: 'Pad 5', defaultMapping: 'nav.patternDown' },
      { note: 41, name: 'Pad 6', defaultMapping: 'nav.patternUp' },
      { note: 42, name: 'Pad 7', defaultMapping: 'edit.octaveDown' },
      { note: 43, name: 'Pad 8', defaultMapping: 'edit.octaveUp' },
      // Row 2: Editing + DJ
      { note: 44, name: 'Pad 9', defaultMapping: 'edit.undo' },
      { note: 45, name: 'Pad 10', defaultMapping: 'edit.redo' },
      { note: 46, name: 'Pad 11', defaultMapping: 'dj.deckA.play' },
      { note: 47, name: 'Pad 12', defaultMapping: 'dj.deckA.cue' },
      { note: 48, name: 'Pad 13', defaultMapping: 'dj.deckB.play' },
      { note: 49, name: 'Pad 14', defaultMapping: 'dj.deckB.cue' },
      { note: 50, name: 'Pad 15', defaultMapping: 'dj.knobPage.prev' },
      { note: 51, name: 'Pad 16', defaultMapping: 'dj.knobPage.next' },
    ],
    extras: {
      modWheel: { cc: 1 },
    },
    suggestedLayout: {
      pads: {
        36: 'transport.play',
        37: 'transport.stop',
        38: 'transport.record',
        39: 'transport.loop',
        40: 'nav.patternDown',
        41: 'nav.patternUp',
        42: 'edit.octaveDown',
        43: 'edit.octaveUp',
        44: 'edit.undo',
        45: 'edit.redo',
        46: 'dj.deckA.play',
        47: 'dj.deckA.cue',
        48: 'dj.deckB.play',
        49: 'dj.deckB.cue',
        50: 'dj.knobPage.prev',
        51: 'dj.knobPage.next',
      },
    },
  },

  // ========================================
  // Novation Launchpad Mini MK3
  // 64 pad grid (notes 11-19, 21-29, ..., 81-89), no knobs/faders
  // ========================================
  {
    id: 'novation-launchpad-mini-mk3',
    name: 'Launchpad Mini MK3',
    manufacturer: 'Novation',
    detectPatterns: ['launchpad mini', 'launchpad mk3'],
    knobs: [],
    pads: [
      // Bottom row: Transport + Navigation
      { note: 11, name: 'Grid 1:1', defaultMapping: 'transport.play' },
      { note: 12, name: 'Grid 1:2', defaultMapping: 'transport.stop' },
      { note: 13, name: 'Grid 1:3', defaultMapping: 'transport.record' },
      { note: 14, name: 'Grid 1:4', defaultMapping: 'transport.loop' },
      { note: 15, name: 'Grid 1:5', defaultMapping: 'nav.patternDown' },
      { note: 16, name: 'Grid 1:6', defaultMapping: 'nav.patternUp' },
      { note: 17, name: 'Grid 1:7', defaultMapping: 'edit.octaveDown' },
      { note: 18, name: 'Grid 1:8', defaultMapping: 'edit.octaveUp' },
      // Row 2: DJ + Editing
      { note: 21, name: 'Grid 2:1', defaultMapping: 'dj.deckA.play' },
      { note: 22, name: 'Grid 2:2', defaultMapping: 'dj.deckA.cue' },
      { note: 23, name: 'Grid 2:3', defaultMapping: 'dj.deckB.play' },
      { note: 24, name: 'Grid 2:4', defaultMapping: 'dj.deckB.cue' },
      { note: 25, name: 'Grid 2:5', defaultMapping: 'dj.killAll' },
      { note: 26, name: 'Grid 2:6', defaultMapping: 'dj.sync' },
      { note: 27, name: 'Grid 2:7', defaultMapping: 'dj.knobPage.prev' },
      { note: 28, name: 'Grid 2:8', defaultMapping: 'dj.knobPage.next' },
      // Row 3: Channel mutes
      { note: 31, name: 'Grid 3:1', defaultMapping: 'channel.mute1' },
      { note: 32, name: 'Grid 3:2', defaultMapping: 'channel.mute2' },
      { note: 33, name: 'Grid 3:3', defaultMapping: 'channel.mute3' },
      { note: 34, name: 'Grid 3:4', defaultMapping: 'channel.mute4' },
      { note: 35, name: 'Grid 3:5', defaultMapping: 'channel.mute5' },
      { note: 36, name: 'Grid 3:6', defaultMapping: 'channel.mute6' },
      { note: 37, name: 'Grid 3:7', defaultMapping: 'channel.mute7' },
      { note: 38, name: 'Grid 3:8', defaultMapping: 'channel.mute8' },
    ],
    suggestedLayout: {
      pads: {
        11: 'transport.play',
        12: 'transport.stop',
        13: 'transport.record',
        14: 'transport.loop',
        15: 'nav.patternDown',
        16: 'nav.patternUp',
        17: 'edit.octaveDown',
        18: 'edit.octaveUp',
        21: 'dj.deckA.play',
        22: 'dj.deckA.cue',
        23: 'dj.deckB.play',
        24: 'dj.deckB.cue',
      },
    },
  },

  // ========================================
  // Generic (for unknown controllers)
  // Standard MIDI CCs with sensible defaults
  // ========================================
  {
    id: 'generic',
    name: 'Generic MIDI Controller',
    manufacturer: 'Unknown',
    detectPatterns: [],
    knobs: [
      { cc: 1, name: 'CC 1 (Mod)', defaultMapping: 'tb303.cutoff' },
      { cc: 7, name: 'CC 7 (Volume)', defaultMapping: 'tb303.volume' },
      { cc: 10, name: 'CC 10 (Pan)', defaultMapping: 'mixer.pan' },
      { cc: 11, name: 'CC 11 (Expression)', defaultMapping: 'tb303.envMod' },
      { cc: 74, name: 'CC 74 (Cutoff)', defaultMapping: 'tb303.cutoff' },
      { cc: 71, name: 'CC 71 (Resonance)', defaultMapping: 'tb303.resonance' },
    ],
    pads: [],
    extras: {
      pitchBend: true,
      modWheel: { cc: 1 },
      sustain: { cc: 64 },
    },
    suggestedLayout: {
      knobs: {
        74: 'tb303.cutoff',
        71: 'tb303.resonance',
        7: 'tb303.volume',
        11: 'tb303.envMod',
      },
    },
  },
];

/**
 * Auto-detect controller profile from device name
 */
export function detectControllerProfile(deviceName: string): ControllerProfile | null {
  const lowerName = deviceName.toLowerCase();

  for (const profile of CONTROLLER_PROFILES) {
    for (const pattern of profile.detectPatterns) {
      if (lowerName.includes(pattern.toLowerCase())) {
        return profile;
      }
    }
  }

  return null;
}

/**
 * Get profile by ID
 */
export function getControllerProfile(id: string): ControllerProfile | undefined {
  return CONTROLLER_PROFILES.find(p => p.id === id);
}

/**
 * Get all available profiles
 */
export function getAllControllerProfiles(): ControllerProfile[] {
  return CONTROLLER_PROFILES;
}
