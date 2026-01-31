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
  };
}

/**
 * All mappable tracker actions
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
} as const;

export type TrackerAction = keyof typeof TRACKER_ACTIONS;

/**
 * All mappable 303 parameters
 */
export const TB303_PARAMETERS = {
  // Main controls
  'tb303.cutoff': { label: 'Cutoff', min: 50, max: 18000, category: '303 Main' },
  'tb303.resonance': { label: 'Resonance', min: 0, max: 100, category: '303 Main' },
  'tb303.envMod': { label: 'Env Mod', min: 0, max: 100, category: '303 Main' },
  'tb303.decay': { label: 'Decay', min: 30, max: 3000, category: '303 Main' },
  'tb303.accent': { label: 'Accent', min: 0, max: 100, category: '303 Main' },
  'tb303.slideTime': { label: 'Slide Time', min: 10, max: 500, category: '303 Main' },
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
      { cc: 77, name: 'K8' },
    ],
    pads: [
      // Bank A (Pads 1-8, typically notes 36-43)
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
      },
    },
  },

  // ========================================
  // AKAI MPK Mini Plus
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
      { cc: 77, name: 'K8' },
    ],
    pads: [
      { note: 36, name: 'Pad 1' },
      { note: 37, name: 'Pad 2' },
      { note: 38, name: 'Pad 3' },
      { note: 39, name: 'Pad 4' },
      { note: 40, name: 'Pad 5' },
      { note: 41, name: 'Pad 6' },
      { note: 42, name: 'Pad 7' },
      { note: 43, name: 'Pad 8' },
    ],
    extras: {
      pitchBend: true,
      modWheel: { cc: 1 },
    },
  },

  // ========================================
  // Novation Launchkey Mini MK3
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
      { cc: 28, name: 'Knob 8' },
    ],
    pads: [
      { note: 36, name: 'Pad 1' },
      { note: 37, name: 'Pad 2' },
      { note: 38, name: 'Pad 3' },
      { note: 39, name: 'Pad 4' },
      { note: 40, name: 'Pad 5' },
      { note: 41, name: 'Pad 6' },
      { note: 42, name: 'Pad 7' },
      { note: 43, name: 'Pad 8' },
      { note: 44, name: 'Pad 9' },
      { note: 45, name: 'Pad 10' },
      { note: 46, name: 'Pad 11' },
      { note: 47, name: 'Pad 12' },
      { note: 48, name: 'Pad 13' },
      { note: 49, name: 'Pad 14' },
      { note: 50, name: 'Pad 15' },
      { note: 51, name: 'Pad 16' },
    ],
    extras: {
      pitchBend: true,
      modWheel: { cc: 1 },
      sustain: { cc: 64 },
    },
  },

  // ========================================
  // Arturia MiniLab 3
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
      { cc: 114, name: 'Knob 8' },
    ],
    pads: [
      { note: 36, name: 'Pad 1' },
      { note: 37, name: 'Pad 2' },
      { note: 38, name: 'Pad 3' },
      { note: 39, name: 'Pad 4' },
      { note: 40, name: 'Pad 5' },
      { note: 41, name: 'Pad 6' },
      { note: 42, name: 'Pad 7' },
      { note: 43, name: 'Pad 8' },
    ],
    extras: {
      pitchBend: true,
      modWheel: { cc: 1 },
      sustain: { cc: 64 },
      faders: [
        { cc: 85, name: 'Fader 1' },
        { cc: 86, name: 'Fader 2' },
        { cc: 87, name: 'Fader 3' },
        { cc: 88, name: 'Fader 4' },
      ],
    },
  },

  // ========================================
  // Korg nanoKONTROL2
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
      { cc: 23, name: 'Knob 8' },
    ],
    pads: [
      // S buttons (solo)
      { cc: 32, name: 'S1', defaultMapping: 'channel.solo1' },
      { cc: 33, name: 'S2', defaultMapping: 'channel.solo2' },
      { cc: 34, name: 'S3', defaultMapping: 'channel.solo3' },
      { cc: 35, name: 'S4', defaultMapping: 'channel.solo4' },
      // M buttons (mute)
      { cc: 48, name: 'M1', defaultMapping: 'channel.mute1' },
      { cc: 49, name: 'M2', defaultMapping: 'channel.mute2' },
      { cc: 50, name: 'M3', defaultMapping: 'channel.mute3' },
      { cc: 51, name: 'M4', defaultMapping: 'channel.mute4' },
      // R buttons (record arm)
      { cc: 64, name: 'R1' },
      { cc: 65, name: 'R2' },
      { cc: 66, name: 'R3' },
      { cc: 67, name: 'R4' },
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
        { cc: 0, name: 'Fader 1' },
        { cc: 1, name: 'Fader 2' },
        { cc: 2, name: 'Fader 3' },
        { cc: 3, name: 'Fader 4' },
        { cc: 4, name: 'Fader 5' },
        { cc: 5, name: 'Fader 6' },
        { cc: 6, name: 'Fader 7' },
        { cc: 7, name: 'Fader 8' },
      ],
    },
  },

  // ========================================
  // Behringer X-Touch Mini
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
      { cc: 8, name: 'Encoder 8' },
    ],
    pads: [
      { note: 0, name: 'Button 1', defaultMapping: 'transport.play' },
      { note: 1, name: 'Button 2', defaultMapping: 'transport.stop' },
      { note: 2, name: 'Button 3', defaultMapping: 'transport.record' },
      { note: 3, name: 'Button 4', defaultMapping: 'transport.loop' },
      { note: 4, name: 'Button 5' },
      { note: 5, name: 'Button 6' },
      { note: 6, name: 'Button 7' },
      { note: 7, name: 'Button 8' },
      { note: 8, name: 'Button 9' },
      { note: 9, name: 'Button 10' },
      { note: 10, name: 'Button 11' },
      { note: 11, name: 'Button 12' },
      { note: 12, name: 'Button 13' },
      { note: 13, name: 'Button 14' },
      { note: 14, name: 'Button 15' },
      { note: 15, name: 'Button 16' },
    ],
    extras: {
      faders: [
        { cc: 9, name: 'Fader' },
      ],
    },
  },

  // ========================================
  // Generic (for unknown controllers)
  // ========================================
  {
    id: 'generic',
    name: 'Generic MIDI Controller',
    manufacturer: 'Unknown',
    detectPatterns: [],
    knobs: [
      { cc: 1, name: 'CC 1' },
      { cc: 7, name: 'CC 7 (Volume)' },
      { cc: 10, name: 'CC 10 (Pan)' },
      { cc: 11, name: 'CC 11 (Expression)' },
      { cc: 74, name: 'CC 74 (Cutoff)' },
      { cc: 71, name: 'CC 71 (Resonance)' },
    ],
    pads: [],
    extras: {
      pitchBend: true,
      modWheel: { cc: 1 },
      sustain: { cc: 64 },
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
