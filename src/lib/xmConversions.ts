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

  // Parse note string like "C-4", "C#5", or "C#-4"
  const match = note.match(/^([A-G])([#-])[-]?(\d)$/);
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

// Pre-computed XM note → display string lookup (avoids template literal per call)
// Index 0 = '...', 1-96 = note strings, 97 = '==='
const XM_NOTE_STRING_LOOKUP: string[] = new Array(98);
XM_NOTE_STRING_LOOKUP[0] = '...';
XM_NOTE_STRING_LOOKUP[97] = '===';
for (let i = 1; i <= 96; i++) {
  const noteIndex = i - 1;
  const octave = Math.floor(noteIndex / 12);
  const semitone = noteIndex % 12;
  XM_NOTE_STRING_LOOKUP[i] = `${NOTE_NAMES[semitone]}${octave}`;
}

/**
 * Convert XM note number to string note
 *
 * @param xmNote XM note number (0 = empty, 1-96 = notes, 97 = note off)
 * @returns String note ("C-4", "D#5", "===", "...")
 */
export function xmNoteToString(xmNote: number): string {
  return XM_NOTE_STRING_LOOKUP[xmNote] || '...';
}

/**
 * Convert string note to MIDI note number
 *
 * @param note String note ("C-4", "D#5", etc.) or XM note number
 * @returns MIDI note number (0-127)
 *
 * MIDI: C-4 = 60, C-0 = 12
 */
export function noteToMidi(note: string | number | null | undefined): number {
  if (typeof note === 'number') {
    // XM format: 1 = C-0, add 11 to get MIDI (C-0 = 12)
    return note + 11;
  }

  // Handle null, undefined, empty, or special note values
  if (note === null || note === undefined || note === '' || note === '...' || note === '===') {
    return 60; // Default to C-4
  }

  // Parse note string like "C4", "C-4", "C#5", or "Cb4"
  // Supports formats: C4, C-4, C#4, Cb4, C#-4, Cb-4
  const match = note.match(/^([A-G])([#b])?-?(\d)$/i);
  if (!match) {
    return 60; // Default
  }

  const [, noteLetter, accidental, octaveStr] = match;
  const octave = parseInt(octaveStr, 10);

  // Find semitone (0-11)
  const upperNote = noteLetter.toUpperCase();
  const noteStr = accidental ? upperNote + accidental : upperNote + '-';
  const semitone = NOTE_NAMES.indexOf(noteStr);

  if (semitone === -1) {
    return 60;
  }

  // MIDI: C-0 = 12, so (octave + 1) * 12 + semitone
  return (octave + 1) * 12 + semitone;
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

// Pre-computed hex strings for effect parameters (avoids toString+toUpperCase+padStart per call)
const HEX_BYTE: string[] = new Array(256);
for (let i = 0; i < 256; i++) {
  HEX_BYTE[i] = i.toString(16).toUpperCase().padStart(2, '0');
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
  return `${typeChar}${HEX_BYTE[eff] ?? '00'}`;
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
    return HEX_BYTE[instrument] ?? instrument.toString(16).toUpperCase().padStart(2, '0');
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
 * @param period Amiga period (28-1712)
 * @param finetune Finetune value (-8 to +7)
 * @returns XM note number (1-96)
 */
export function periodToXMNote(period: number, finetune: number = 0): number {
  void finetune;
  // Period 0 = empty cell (no note)
  if (period === 0) {
    return 0;
  }

  // ProTracker period table (Extended range C-0 to B-5)
  // Maps to DEViLBOX C-2 to B-7 (2 octaves up) to align with standard trackers
  // 1712 = C-2 (Note 25), 428 = C-4 (Note 49)
  const PT_PERIODS = [
    // Octave 0 (Extended)
    1712, 1616, 1525, 1440, 1357, 1281, 1209, 1141, 1077, 1017, 961, 907,
    // Octave 1
    856,  808,  762,  720,  678,  640,  604,  570,  538,  508,  480, 453,
    // Octave 2
    428,  404,  381,  360,  339,  320,  302,  285,  269,  254,  240, 226,
    // Octave 3
    214,  202,  190,  180,  170,  160,  151,  143,  135,  127,  120, 113,
    // Octave 4 (Extended)
    107,  101,  95,   90,   85,   80,   75,   71,   67,   63,   60,   56,
    // Octave 5 (Extended)
    53,   50,   47,   45,   42,   40,   37,   35,   33,   31,   30,   28
  ];

  // Find closest period
  let closestNote = 0;
  let closestDiff = Infinity;

  for (let i = 0; i < PT_PERIODS.length; i++) {
    const diff = Math.abs(PT_PERIODS[i] - period);
    if (diff < closestDiff) {
      closestDiff = diff;
      closestNote = i + 1; // 1-indexed in this array
    }
  }

  // Convert to XM note
  // Index 1 (1712) corresponds to XM Note 25 (C-2)
  // Index 25 (428) corresponds to XM Note 49 (C-4)
  const xmNote = closestNote + 24; 

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
export function xmNoteToPeriod(xmNote: number, finetune: number = 0): number {
  void finetune;
  if (xmNote === 0 || xmNote === 97) {
    return 0; // No note or note off
  }

  // Calculate period using Amiga formula
  // Aligned to: C-4 (Note 49) = 428
  // Formula: period = 428 * 2 ^ ((49 - note) / 12)
  // For integer math: 428 corresponds to Note 49
  // Note 1 (C-0) -> Period 6848 (approx)
  
  // Note 49 (C-4) is 428
  // Note 25 (C-2) is 1712
  
  // Period table base (C-2 = 1712)
  // Note 25 = 1712
  // We need to calculate how many semitones away from C-2 we are
  
  const semitonesFromC2 = xmNote - 25;
  const period = 1712 * Math.pow(2, -semitonesFromC2 / 12);

  return Math.max(28, Math.min(1712, Math.round(period)));
}

// Pre-computed XM note → Tone.js note string lookup (avoids string alloc + replace per call)
// Index 0 = null (no note), 1-96 = note strings, 97 = null (note off)
const TONE_NOTE_LOOKUP: (string | null)[] = new Array(98).fill(null);
for (let i = 1; i <= 96; i++) {
  const noteIndex = i - 1;
  const octave = Math.floor(noteIndex / 12);
  const semitone = noteIndex % 12;
  TONE_NOTE_LOOKUP[i] = `${NOTE_NAMES[semitone].replace('-', '')}${octave}`;
}

/**
 * Convert XM note number to Tone.js note format
 *
 * @param xmNote XM note number (0 = empty, 1-96 = notes, 97 = note off)
 * @returns Tone.js note string ("C4", "D#5", etc.) or null
 */
export function xmNoteToToneJS(xmNote: number): string | null {
  if (xmNote < 1 || xmNote > 96) return null;
  return TONE_NOTE_LOOKUP[xmNote];
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
