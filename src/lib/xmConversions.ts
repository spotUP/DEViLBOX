/**
 * XM Format Conversion Utilities
 *
 * Conversion between DEViLBOX formats and XM binary formats
 */

/**
 * Note names for XM encoding
 */
const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

/**
 * Convert string note to XM note number
 *
 * @param note String note ("C-4", "D#5", "===", null)
 * @returns XM note number (0 = empty, 1-96 = notes, 97 = note off)
 *
 * XM note encoding: (octave * 12) + semitone + 1
 * Example: C-4 = (4 * 12) + 0 + 1 = 49
 */
export function stringNoteToXM(note: string | null): number {
  if (note === null || note === '' || note === '...') {
    return 0; // No note
  }

  if (note === '===' || note === 'OFF') {
    return 97; // Note off
  }

  // Parse note string like "C-4" or "C#5"
  const match = note.match(/^([A-G])([#-])(\d)$/);
  if (!match) {
    console.warn(`Invalid note format: ${note}`);
    return 0;
  }

  const [, noteLetter, sharp, octaveStr] = match;
  const octave = parseInt(octaveStr, 10);

  // Find semitone (0-11)
  const noteStr = noteLetter + sharp;
  const semitone = NOTE_NAMES.indexOf(noteStr);

  if (semitone === -1) {
    console.warn(`Invalid note name: ${noteStr}`);
    return 0;
  }

  // XM encoding: (octave * 12) + semitone + 1
  // Valid range: 1-96 (C-0 to B-7)
  const xmNote = (octave * 12) + semitone + 1;

  if (xmNote < 1 || xmNote > 96) {
    console.warn(`Note out of XM range: ${note} (${xmNote})`);
    return 0;
  }

  return xmNote;
}

/**
 * Convert XM note number to string note
 *
 * @param xmNote XM note number (0 = empty, 1-96 = notes, 97 = note off)
 * @returns String note ("C-4", "D#5", "===", "...")
 */
export function xmNoteToString(xmNote: number): string {
  if (xmNote === 0) {
    return '...'; // Empty
  }

  if (xmNote === 97) {
    return '==='; // Note off
  }

  if (xmNote < 1 || xmNote > 96) {
    console.warn(`Invalid XM note: ${xmNote}`);
    return '...';
  }

  // Decode: note = (octave * 12) + semitone + 1
  const noteIndex = xmNote - 1; // 0-95
  const octave = Math.floor(noteIndex / 12); // 0-7
  const semitone = noteIndex % 12; // 0-11

  return `${NOTE_NAMES[semitone]}${octave}`;
}

/**
 * XM Effect type mapping
 * Maps effect character to effect type number
 */
const EFFECT_TYPE_MAP: Record<string, number> = {
  '0': 0,   // Arpeggio
  '1': 1,   // Portamento up
  '2': 2,   // Portamento down
  '3': 3,   // Tone portamento
  '4': 4,   // Vibrato
  '5': 5,   // Tone portamento + Volume slide
  '6': 6,   // Vibrato + Volume slide
  '7': 7,   // Tremolo
  '8': 8,   // Set panning
  '9': 9,   // Sample offset
  'A': 10,  // Volume slide
  'B': 11,  // Position jump
  'C': 12,  // Set volume
  'D': 13,  // Pattern break
  'E': 14,  // Extended effects
  'F': 15,  // Set speed/BPM
  'G': 16,  // Set global volume
  'H': 17,  // Global volume slide
  'K': 20,  // Key off
  'L': 21,  // Set envelope position
  'P': 25,  // Panning slide
  'R': 27,  // Multi retrig note
  'T': 29,  // Tremor
  'X': 33,  // Extra fine portamento
};

/**
 * Reverse effect type map for display
 */
const EFFECT_CHAR_MAP: Record<number, string> = Object.fromEntries(
  Object.entries(EFFECT_TYPE_MAP).map(([char, type]) => [type, char])
);

/**
 * Convert effect string to XM effect type and parameter
 *
 * @param effectStr Effect string ("A05", "E31", null)
 * @returns [effTyp, eff] tuple (e.g., [10, 0x05])
 */
export function effectStringToXM(effectStr: string | null): [number, number] {
  if (!effectStr || effectStr === '...' || effectStr === '000') {
    return [0, 0]; // No effect
  }

  // Parse effect string like "A05" or "E31"
  const match = effectStr.match(/^([0-9A-Z])([0-9A-F]{2})$/i);
  if (!match) {
    console.warn(`Invalid effect format: ${effectStr}`);
    return [0, 0];
  }

  const [, typeChar, paramHex] = match;
  const effTyp = EFFECT_TYPE_MAP[typeChar.toUpperCase()] ?? 0;
  const eff = parseInt(paramHex, 16);

  return [effTyp, eff];
}

/**
 * Convert XM effect type and parameter to effect string
 *
 * @param effTyp Effect type (0-35)
 * @param eff Effect parameter (0x00-0xFF)
 * @returns Effect string ("A05", "E31", "...")
 */
export function xmEffectToString(effTyp: number, eff: number): string {
  if (effTyp === 0 && eff === 0) {
    return '...'; // No effect
  }

  const typeChar = EFFECT_CHAR_MAP[effTyp] ?? '0';
  const paramHex = eff.toString(16).toUpperCase().padStart(2, '0');

  return `${typeChar}${paramHex}`;
}

/**
 * Format instrument number for display
 *
 * @param instrument Instrument number (0-128, where 0 = no instrument)
 * @param format Display format ('hex' | 'decimal')
 * @returns Formatted string ("00", "0C", "128", etc.)
 */
export function formatInstrument(instrument: number, format: 'hex' | 'decimal' = 'hex'): string {
  if (instrument === 0) {
    return '..'; // No instrument
  }

  if (format === 'hex') {
    return instrument.toString(16).toUpperCase().padStart(2, '0');
  } else {
    return instrument.toString(10).padStart(2, '0');
  }
}

/**
 * Parse instrument from string input
 *
 * @param input String input (hex or decimal)
 * @returns Instrument number (0-128)
 */
export function parseInstrument(input: string): number {
  if (input === '..' || input === '') {
    return 0;
  }

  // Try hex first (0-9A-F)
  if (/^[0-9A-F]{1,2}$/i.test(input)) {
    const value = parseInt(input, 16);
    return Math.min(128, Math.max(0, value));
  }

  // Try decimal
  const value = parseInt(input, 10);
  if (isNaN(value)) {
    return 0;
  }

  return Math.min(128, Math.max(0, value));
}

/**
 * Format volume column for display
 *
 * @param volume Volume column value (0x00-0xFF)
 * @returns Formatted string ("40", "v↓5", "p←3", etc.)
 */
export function formatVolumeColumn(volume: number): string {
  if (volume < 0x10) {
    return '..'; // Nothing
  }

  if (volume >= 0x10 && volume <= 0x50) {
    // Set volume 0-64
    const vol = volume - 0x10;
    return vol.toString(16).toUpperCase().padStart(2, '0');
  }

  const effectType = (volume >> 4) & 0x0F;
  const param = volume & 0x0F;

  const volumeEffectSymbols: Record<number, string> = {
    0x6: 'v↓', // Volume slide down
    0x7: 'v↑', // Volume slide up
    0x8: 'f↓', // Fine volume down
    0x9: 'f↑', // Fine volume up
    0xA: 'vs', // Set vibrato speed
    0xB: 'vb', // Vibrato
    0xC: 'p=', // Set panning
    0xD: 'p←', // Pan slide left
    0xE: 'p→', // Pan slide right
    0xF: 'tp', // Tone portamento
  };

  const symbol = volumeEffectSymbols[effectType];
  if (symbol) {
    return symbol + param.toString(16).toUpperCase();
  }

  return '..';
}

/**
 * Convert Amiga period to XM note number
 * Used for accurate MOD import
 *
 * @param period Amiga period (113-856)
 * @param finetune Finetune value (-8 to +7)
 * @returns XM note number (1-96)
 */
export function periodToXMNote(period: number, _finetune: number = 0): number {
  // Period 0 = empty cell (no note)
  if (period === 0) {
    return 0;
  }

  // ProTracker period table for C-1 to B-3 (finetune 0)
  const PT_PERIODS = [
    1712, 1616, 1525, 1440, 1357, 1281, 1209, 1141, 1077, 1017, 961, 907,  // Octave 1
    856,  808,  762,  720,  678,  640,  604,  570,  538,  508,  480, 453,   // Octave 2
    428,  404,  381,  360,  339,  320,  302,  285,  269,  254,  240, 226,   // Octave 3
    214,  202,  190,  180,  170,  160,  151,  143,  135,  127,  120, 113,   // Octave 4
  ];

  // Find closest period
  let closestNote = 0;
  let closestDiff = Infinity;

  for (let i = 0; i < PT_PERIODS.length; i++) {
    const diff = Math.abs(PT_PERIODS[i] - period);
    if (diff < closestDiff) {
      closestDiff = diff;
      closestNote = i + 1; // 1-indexed
    }
  }

  // Convert to XM note (C-1 = note 13, B-3 = note 48)
  const xmNote = closestNote + 12; // Offset by 1 octave (C-1 starts at index 12)

  return Math.min(96, Math.max(1, xmNote));
}

/**
 * Convert XM note to Amiga period
 * Used for accurate MOD export
 *
 * @param xmNote XM note number (1-96)
 * @param finetune Finetune value (-8 to +7)
 * @returns Amiga period (113-856)
 */
export function xmNoteToPeriod(xmNote: number, _finetune: number = 0): number {
  if (xmNote === 0 || xmNote === 97) {
    return 0; // No note or note off
  }

  // Calculate period using Amiga formula
  // period = (428 * 8363 * 2^((4*12+1-note)/12)) / sampleRate
  // Simplified for 8363 Hz (finetune 0):
  const noteIndex = xmNote - 1; // 0-95
  const period = 7680 - (noteIndex * 64);

  return Math.max(113, Math.min(856, period));
}

/**
 * Convert XM note number to Tone.js note format
 *
 * @param xmNote XM note number (0 = empty, 1-96 = notes, 97 = note off)
 * @returns Tone.js note string ("C4", "D#5", etc.) or null
 */
export function xmNoteToToneJS(xmNote: number): string | null {
  if (xmNote === 0) {
    return null; // No note
  }

  if (xmNote === 97) {
    return null; // Note off (handled separately)
  }

  if (xmNote < 1 || xmNote > 96) {
    console.warn(`Invalid XM note: ${xmNote}`);
    return null;
  }

  // Decode: note = (octave * 12) + semitone + 1
  const noteIndex = xmNote - 1; // 0-95
  const octave = Math.floor(noteIndex / 12); // 0-7
  const semitone = noteIndex % 12; // 0-11

  // Tone.js uses format like "C4", "D#5" (no dash)
  const noteName = NOTE_NAMES[semitone].replace('-', '');
  return `${noteName}${octave}`;
}

/**
 * Convert XM note number to MIDI note number
 *
 * @param xmNote XM note number (0 = empty, 1-96 = notes, 97 = note off)
 * @returns MIDI note number (12-107) or null for empty/note-off
 */
export function xmNoteToMidi(xmNote: number): number | null {
  if (xmNote === 0 || xmNote === 97) {
    return null; // Empty or note off
  }

  if (xmNote < 1 || xmNote > 96) {
    console.warn(`Invalid XM note: ${xmNote}`);
    return null;
  }

  // XM note 1 = C-0 = MIDI note 12
  // XM note 49 = C-4 = MIDI note 60 (middle C)
  return xmNote + 11;
}

/**
 * Convert MIDI note number to XM note number
 *
 * @param midiNote MIDI note number (0-127)
 * @returns XM note number (1-96, clamped)
 */
export function midiToXMNote(midiNote: number): number {
  // MIDI note 12 = C-0 = XM note 1
  // MIDI note 60 = C-4 = XM note 49
  const xmNote = midiNote - 11;

  // Clamp to valid XM range (1-96)
  return Math.min(96, Math.max(1, xmNote));
}
