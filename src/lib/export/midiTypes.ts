/**
 * MIDI Export Types - Standard MIDI File format definitions
 */

// MIDI File Format Constants
export const MIDI_TICKS_PER_QUARTER_NOTE = 480; // Standard resolution (PPQ)
export const ROWS_PER_BEAT = 4; // Tracker convention: 4 rows = 1 beat

// SMF (Standard MIDI File) Types
export type SMFType = 0 | 1; // Type 0: single track, Type 1: multi-track

// MIDI Export Options
export interface MIDIExportOptions {
  type: SMFType;                    // SMF Type 0 or Type 1
  includeAutomation: boolean;       // Convert automation curves to CC
  velocityScale: number;            // Scale velocity (0.5-2.0, default 1.0)
  exportMutedChannels: boolean;     // Include muted channels
}

// Default export options
export const DEFAULT_MIDI_EXPORT_OPTIONS: MIDIExportOptions = {
  type: 1,
  includeAutomation: true,
  velocityScale: 1.0,
  exportMutedChannels: false,
};

// Internal MIDI Event Representation
export interface MIDIEvent {
  tick: number;                     // Absolute tick position
  type: 'noteOn' | 'noteOff' | 'cc' | 'meta';
  channel: number;                  // MIDI channel 0-15
  data: number[];                   // Event data bytes
}

export interface MIDITrack {
  name: string;
  events: MIDIEvent[];
}

// Automation parameter to MIDI CC mapping
export const AUTOMATION_CC_MAP: Record<string, number> = {
  cutoff: 74,        // CC 74 - Brightness/Filter Cutoff
  resonance: 71,     // CC 71 - Filter Resonance
  volume: 7,         // CC 7 - Channel Volume
  pan: 10,           // CC 10 - Pan Position
  envMod: 78,        // CC 78 - Sound Control 9
  decay: 75,         // CC 75 - Sound Control 6
  overdrive: 76,     // CC 76 - Sound Control 7
  distortion: 76,    // Same as overdrive
  delay: 91,         // CC 91 - Effects Depth
  reverb: 91,        // CC 91 - Effects Depth
};

// MIDI Meta Event Types
export const META_EVENT = {
  SEQUENCE_NUMBER: 0x00,
  TEXT: 0x01,
  COPYRIGHT: 0x02,
  TRACK_NAME: 0x03,
  INSTRUMENT_NAME: 0x04,
  LYRIC: 0x05,
  MARKER: 0x06,
  CUE_POINT: 0x07,
  CHANNEL_PREFIX: 0x20,
  END_OF_TRACK: 0x2F,
  SET_TEMPO: 0x51,
  SMPTE_OFFSET: 0x54,
  TIME_SIGNATURE: 0x58,
  KEY_SIGNATURE: 0x59,
} as const;
