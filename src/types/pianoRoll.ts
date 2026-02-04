/**
 * Piano Roll Types - Horizontal timeline note editor
 */

/**
 * Represents a note in the piano roll view
 */
export interface PianoRollNote {
  id: string;                // Unique identifier
  channelIndex: number;      // Source channel in pattern
  startRow: number;          // Start position (rows)
  endRow: number;            // End position (rows)
  midiNote: number;          // MIDI note number (0-127)
  velocity: number;          // Velocity (0-127)
  instrument: number | null; // Instrument number

  // TB-303 specific properties
  slide?: boolean;           // Slide/legato - pitch glides from previous note without retriggering
  accent?: boolean;          // Accent - boosts filter cutoff and volume
}

/**
 * Selection state for piano roll
 */
export interface PianoRollSelection {
  notes: Set<string>;        // Selected note IDs
  startRow: number | null;   // Selection box start
  endRow: number | null;     // Selection box end
  startNote: number | null;  // Selection box note range start
  endNote: number | null;    // Selection box note range end
}

/**
 * View state for piano roll
 */
export interface PianoRollViewState {
  horizontalZoom: number;    // Pixels per row (4-64)
  verticalZoom: number;      // Pixels per semitone (8-32)
  scrollX: number;           // Horizontal scroll offset (rows)
  scrollY: number;           // Vertical scroll offset (semitones from C0)
  snapToGrid: boolean;       // Snap note positions to grid
  gridDivision: number;      // Grid subdivision (1, 2, 4, 8, 16)
  showVelocity: boolean;     // Show velocity bars on notes
  channelIndex: number;      // Currently edited channel
}

/**
 * Piano roll edit operation types
 */
export type PianoRollEditOperation =
  | { type: 'add'; note: PianoRollNote }
  | { type: 'delete'; noteIds: string[] }
  | { type: 'move'; noteIds: string[]; deltaRow: number; deltaPitch: number }
  | { type: 'resize'; noteId: string; newEndRow: number }
  | { type: 'velocity'; noteIds: string[]; newVelocity: number }
  | { type: 'slide'; noteIds: string[]; slide: boolean }      // TB-303: Toggle slide
  | { type: 'accent'; noteIds: string[]; accent: boolean };   // TB-303: Toggle accent

/**
 * Mouse drag state for note editing
 */
export interface DragState {
  isDragging: boolean;
  mode: 'none' | 'move' | 'resize-start' | 'resize-end' | 'select-box' | 'draw';
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  noteId: string | null;     // Note being dragged (for move/resize)
  originalNotes: PianoRollNote[]; // Notes state before drag
}

/**
 * Default piano roll view state
 */
export const DEFAULT_PIANO_ROLL_VIEW: PianoRollViewState = {
  horizontalZoom: 16,        // 16 pixels per row
  verticalZoom: 12,          // 12 pixels per semitone
  scrollX: 0,
  scrollY: 48,               // Start around C4
  snapToGrid: true,
  gridDivision: 4,           // Quarter note grid
  showVelocity: true,
  channelIndex: 0,
};

/**
 * Default selection state
 */
export const DEFAULT_SELECTION: PianoRollSelection = {
  notes: new Set(),
  startRow: null,
  endRow: null,
  startNote: null,
  endNote: null,
};

/**
 * Piano keyboard note names for display
 */
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Get note name from MIDI note number
 */
export function getNoteNameFromMidi(midiNote: number): string {
  const octave = Math.floor(midiNote / 12) - 1;
  const noteName = NOTE_NAMES[midiNote % 12];
  return `${noteName}${octave}`;
}

/**
 * Check if a MIDI note is a black key
 */
export function isBlackKey(midiNote: number): boolean {
  const noteInOctave = midiNote % 12;
  return [1, 3, 6, 8, 10].includes(noteInOctave);
}
