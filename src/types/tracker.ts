/**
 * Tracker Types - Pattern Editor Data Structures
 */

export type NoteValue = string | null; // "C-4", "D#5", "===", null
export type InstrumentValue = number | null; // 0x00-0xFF
export type VolumeValue = number | null; // 0x00-0x40
export type EffectValue = string | null; // "A0F", "486", null

export interface TrackerCell {
  note: NoteValue;
  instrument: InstrumentValue;
  volume: VolumeValue;
  effect: EffectValue;
  // TB-303 specific columns
  accent?: boolean;
  slide?: boolean;
  // Automation columns (optional)
  cutoff?: number; // 0x00-0xFF
  resonance?: number; // 0x00-0xFF
  envMod?: number; // 0x00-0xFF
  pan?: number; // 0x00-0xFF
}

export interface TrackerRow {
  cells: TrackerCell[];
}

export interface ChannelData {
  id: string;
  name: string;
  rows: TrackerCell[];
  muted: boolean;
  solo: boolean;
  volume: number; // 0-100
  pan: number; // -100 to 100
  instrumentId: number | null;
  color: string | null; // Channel background color (CSS color value)
}

// Channel color palette - muted colors that work on dark backgrounds
export const CHANNEL_COLORS = [
  null, // No color (default)
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#14b8a6', // Teal
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#6b7280', // Gray
] as const;

export interface Pattern {
  id: string;
  name: string;
  length: number; // 16, 32, 64, 128
  channels: ChannelData[];
  bpm?: number; // Optional override
}

export interface PatternSequence {
  patternId: string;
  repeat: number;
}

export interface CursorPosition {
  channelIndex: number;
  rowIndex: number;
  columnType: 'note' | 'instrument' | 'volume' | 'effect' | 'accent' | 'slide' | 'cutoff' | 'resonance' | 'envMod' | 'pan';
  digitIndex: number; // For hex input (0-2 depending on column)
}

export interface BlockSelection {
  startChannel: number;
  endChannel: number;
  startRow: number;
  endRow: number;
  columnTypes: CursorPosition['columnType'][];
}

export interface ClipboardData {
  channels: number;
  rows: number;
  data: TrackerCell[][];
}

export type ColumnVisibility = {
  note: boolean;
  instrument: boolean;
  volume: boolean;
  effect: boolean;
  accent: boolean;
  slide: boolean;
  cutoff: boolean;
  resonance: boolean;
  envMod: boolean;
  pan: boolean;
};

export interface TrackerState {
  patterns: Pattern[];
  sequence: PatternSequence[];
  currentPatternId: string;
  currentSequenceIndex: number;
  cursor: CursorPosition;
  selection: BlockSelection | null;
  clipboard: ClipboardData | null;
  followPlayback: boolean;
  columnVisibility: ColumnVisibility;
}

export const DEFAULT_COLUMN_VISIBILITY: ColumnVisibility = {
  note: true,
  instrument: true,
  volume: true,
  effect: true,
  accent: false,
  slide: false,
  cutoff: false,
  resonance: false,
  envMod: false,
  pan: false,
};

export const EMPTY_CELL: TrackerCell = {
  note: null,
  instrument: null,
  volume: null,
  effect: null,
};

export const NOTE_OFF: TrackerCell = {
  note: '===',
  instrument: null,
  volume: null,
  effect: null,
};
