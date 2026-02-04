/**
 * MIDI Types - Core type definitions for MIDI integration
 */

// ============================================================================
// Device Types
// ============================================================================

export interface MIDIDeviceInfo {
  id: string;
  name: string;
  manufacturer: string;
  type: 'input' | 'output';
  isConnected: boolean;
  isTD3: boolean;
}

// ============================================================================
// CC Mapping Types
// ============================================================================

export type TB303Parameter =
  | 'cutoff'
  | 'resonance'
  | 'envMod'
  | 'decay'
  | 'accent'
  | 'overdrive'
  | 'slideTime'
  | 'normalDecay'
  | 'accentDecay'
  | 'vegDecay'
  | 'vegSustain'
  | 'softAttack'
  | 'filterTracking'
  | 'filterFM';

export type KnobBankMode = '303' | 'Siren' | 'FX' | 'Mixer';

export type MappableParameter =
  | TB303Parameter
  // Dub Siren
  | 'siren.osc.frequency'
  | 'siren.lfo.rate'
  | 'siren.lfo.depth'
  | 'siren.delay.time'
  | 'siren.delay.feedback'
  | 'siren.delay.wet'
  | 'siren.filter.frequency'
  | 'siren.reverb.wet'
  // Space Echo
  | 'echo.rate'
  | 'echo.intensity'
  | 'echo.echoVolume'
  | 'echo.reverbVolume'
  | 'echo.mode'
  | 'echo.bass'
  | 'echo.treble'
  // Bi-Phase
  | 'biphase.rateA'
  | 'biphase.depthA'
  | 'biphase.rateB'
  | 'biphase.depthB'
  | 'biphase.feedback'
  | 'biphase.routing'
  // Mixer
  | 'mixer.volume'
  | 'mixer.pan';

export interface CCMapping {
  ccNumber: number;
  parameter: MappableParameter;
  min: number;
  max: number;
  curve: 'linear' | 'logarithmic';
  channel?: number; // Optional channel filter (1-16, undefined = any)
}

// Grid sequencer MIDI CC mapping types
export type GridMappableParameter =
  | 'baseOctave'
  | 'velocity'
  | 'cutoff'
  | 'resonance'
  | 'envMod'
  | 'decay'
  | 'accent'
  | 'slideTime'
  | 'overdrive'
  | 'normalDecay'
  | 'accentDecay'
  | 'softAttack'
  | 'vegSustain'
  | 'filterFM'
  | 'filterTracking';

export interface GridMIDIMapping {
  channel: number;
  controller: number;
  parameter: GridMappableParameter;
  min: number;
  max: number;
  curve?: 'linear' | 'exponential' | 'logarithmic';
}

// ============================================================================
// TD-3 Pattern Types
// ============================================================================

export interface TD3Note {
  value: number;      // 0-11 (C, C#, D, D#, E, F, F#, G, G#, A, A#, B)
  octave: number;     // 0-2 (transpose offset)
  upperC: boolean;    // True if upper octave C (sets bit 0x80)
}

export interface TD3Step {
  note: TD3Note | null;  // null = rest
  accent: boolean;
  slide: boolean;
  tie: boolean;
}

export interface TD3PatternData {
  group: number;        // 0-3 (A, B, C, D)
  pattern: number;      // 0-15 (patterns within group)
  steps: TD3Step[];     // 16 steps
  triplet: boolean;     // Triplet timing mode
  activeSteps: number;  // Number of active steps (1-16)
}

// ============================================================================
// MIDI Message Types
// ============================================================================

export type MIDIMessageType =
  | 'noteOn'
  | 'noteOff'
  | 'cc'
  | 'pitchBend'
  | 'programChange'
  | 'sysex'
  | 'clock'
  | 'start'
  | 'stop'
  | 'continue'
  | 'other';

export interface MIDIMessage {
  type: MIDIMessageType;
  channel: number;      // 0-15, -1 for system messages
  data: Uint8Array;
  timestamp: number;
  // Parsed data for common message types
  note?: number;        // For noteOn/noteOff
  velocity?: number;    // For noteOn/noteOff
  cc?: number;          // For CC messages
  value?: number;       // For CC messages
  pitchBend?: number;   // For pitchBend (-8192 to 8191)
  program?: number;     // For programChange (0-127)
}

export type MIDIMessageHandler = (message: MIDIMessage, deviceId: string) => void;

// ============================================================================
// SysEx Constants
// ============================================================================

export const TD3_SYSEX = {
  // Behringer TD-3 manufacturer ID
  HEADER: new Uint8Array([0xF0, 0x00, 0x20, 0x32, 0x00, 0x01, 0x0A]),
  FOOTER: 0xF7,

  // Commands
  CMD_REQUEST_PATTERN: 0x77,
  CMD_SEND_PATTERN: 0x78,

  // Message sizes
  PATTERN_PAYLOAD_SIZE: 115,  // Bytes after header
  STEPS_PER_PATTERN: 16,

  // Byte offsets in pattern payload (after command byte)
  OFFSET_GROUP: 0,
  OFFSET_PATTERN: 1,
  OFFSET_HEADER_BYTES: 2,     // 00 01
  OFFSET_NOTES: 4,            // 32 bytes (16 steps * 2)
  OFFSET_ACCENTS: 36,         // 32 bytes
  OFFSET_SLIDES: 68,          // 32 bytes
  OFFSET_TRIPLET: 100,        // 2 bytes
  OFFSET_ACTIVE_STEPS: 102,   // 2 bytes (nibbled)
  OFFSET_RESERVED: 104,       // 2 bytes
  OFFSET_TIE_BITS: 106,       // 4 bytes (u16 as nibbles)
  OFFSET_REST_BITS: 110,      // 4 bytes (u16 as nibbles)
} as const;

// ============================================================================
// Note Conversion Helpers
// ============================================================================

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export type NoteName = typeof NOTE_NAMES[number];

// MIDI note number to note name and octave
export function midiNoteToNoteName(midiNote: number): { name: NoteName; octave: number } {
  const octave = Math.floor(midiNote / 12) - 1; // MIDI octave convention
  const noteIndex = midiNote % 12;
  return { name: NOTE_NAMES[noteIndex], octave };
}

// Tracker note string (e.g., "C-4", "F#3") to MIDI note number
export function trackerNoteToMidi(trackerNote: string): number | null {
  if (!trackerNote || trackerNote === '===' || trackerNote === '---') {
    return null;
  }

  // Parse note like "C-4", "F#3", "D#5"
  const match = trackerNote.match(/^([A-G])(#?)(-?\d)$/);
  if (!match) return null;

  const [, noteLetter, sharp, octaveStr] = match;
  const octave = parseInt(octaveStr, 10);

  // Find note index
  const noteWithSharp = noteLetter + (sharp || '');
  const noteIndex = NOTE_NAMES.indexOf(noteWithSharp as NoteName);
  if (noteIndex === -1) return null;

  // Convert to MIDI note number
  return (octave + 1) * 12 + noteIndex;
}

// MIDI note number to tracker note string
export function midiToTrackerNote(midiNote: number): string {
  const { name, octave } = midiNoteToNoteName(midiNote);
  // Format: note + octave, using "-" separator for naturals, no separator for sharps
  if (name.includes('#')) {
    return `${name}${octave}`;
  }
  return `${name}-${octave}`;
}
