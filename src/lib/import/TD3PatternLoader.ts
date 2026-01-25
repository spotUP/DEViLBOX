/**
 * TD-3 Pattern Loader (.sqs and .seq formats)
 * Parses Behringer Synthtribe pattern files for the TD-3 (303 clone)
 *
 * Supported formats:
 * - .sqs: Multi-pattern collection (magic: 0x87439102)
 * - .seq: Single pattern file (magic: 0x23985476)
 *
 * File format (reverse engineered):
 * - Header: Magic bytes + "TD-3" + version
 * - Patterns: 16-step sequences with note, accent, slide data
 */

export interface TD3Step {
  note: number;      // 0-11 (C-B), 15 = rest
  octave: number;    // -1, 0, +1 relative to base octave
  accent: boolean;
  slide: boolean;
  tie: boolean;
  rest: boolean;
}

export interface TD3Pattern {
  index: number;
  name: string;
  steps: TD3Step[];
  length: number;    // Active steps (1-16)
  tempo: number;     // BPM
}

export interface TD3File {
  name: string;
  version: string;
  patterns: TD3Pattern[];
}

// Note names for XM format (includes dash for natural notes, sharp for sharps)
const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

// Magic bytes for different TD-3 formats
const MAGIC_SQS = 0x87439102; // .sqs multi-pattern collection
const MAGIC_SEQ = 0x23985476; // .seq single pattern file

/**
 * Check if a file is a TD-3 pattern file (.sqs or .seq)
 */
export function isTD3File(filename: string): boolean {
  const lower = filename.toLowerCase();
  return lower.endsWith('.sqs') || lower.endsWith('.seq');
}

/**
 * Parse a single pattern from the byte array
 * @param bytes - The full file bytes
 * @param noteDataOffset - Offset where note data starts (after 00 70 00 00)
 * @param patternIndex - The pattern index/number
 */
function parsePattern(bytes: Uint8Array, noteDataOffset: number, patternIndex: number): TD3Pattern {
  const steps: TD3Step[] = [];

  // Read 16 note entries (2 bytes each)
  for (let step = 0; step < 16; step++) {
    const noteOffset = noteDataOffset + (step * 2);
    const flags = bytes[noteOffset];     // 0x00=rest, 0x01=note, 0x02=accent
    const noteVal = bytes[noteOffset + 1]; // 0x00-0x0B = C-B, 0x0F = rest

    const isRest = flags === 0x00 || noteVal === 0x0F || noteVal === 0x08;
    const hasAccent = (flags & 0x02) !== 0;

    // Note value: lower nibble is note (0-11)
    let note = noteVal & 0x0F;
    if (note > 11) note = 0; // Default to C for invalid values

    const octave = 0;

    steps.push({
      note: isRest ? 0 : note,
      octave,
      accent: hasAccent,
      slide: false,
      tie: false,
      rest: isRest,
    });
  }

  // Read slide flags (32 bytes after note data start, in pairs)
  // Slide is in the SECOND byte of each pair (like in .seq format)
  const slideOffset = noteDataOffset + 32;
  for (let step = 0; step < 16; step++) {
    steps[step].slide = (bytes[slideOffset + step * 2 + 1] & 0x01) !== 0;
  }

  // Read tie/other flags (next 32 bytes)
  // Tie is also in the SECOND byte of each pair
  const tieOffset = slideOffset + 32;
  for (let step = 0; step < 16; step++) {
    steps[step].tie = (bytes[tieOffset + step * 2 + 1] & 0x01) !== 0;
  }

  return {
    index: patternIndex,
    name: `Pattern ${patternIndex + 1}`,
    steps,
    length: 16,
    tempo: 120,
  };
}

/**
 * Parse a TD-3 pattern file (.sqs multi-pattern or .seq single-pattern)
 */
export async function parseTD3File(buffer: ArrayBuffer): Promise<TD3File> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // Check magic bytes to determine format
  const magic = view.getUint32(0, false);

  if (magic === MAGIC_SEQ) {
    // .seq format: Single pattern file
    return parseSeqFile(view, bytes);
  } else if (magic === MAGIC_SQS) {
    // .sqs format: Multi-pattern collection
    return parseSqsFile(view, bytes, buffer.byteLength);
  } else {
    throw new Error(`Invalid TD-3 file: unknown magic bytes 0x${magic.toString(16)}`);
  }
}

/**
 * Parse .seq single-pattern file
 * Two known formats:
 * 1. Simple format (v1.3.7+): 32 bytes of (flag, note) pairs at offset 36
 *    - flag: 0x00=rest, 0x01=note, 0x02=accent, 0x03=note+slide
 *    - note: 0x00-0x0B = C-B, 0x0F = rest
 * 2. Compact format: Uses tie/rest bitfields with packed note arrays
 */
function parseSeqFile(view: DataView, bytes: Uint8Array): TD3File {
  // Read device name (UTF-16BE at offset 8)
  let deviceName = '';
  for (let i = 8; i < 20; i += 2) {
    const char = view.getUint16(i, false);
    if (char === 0) break;
    deviceName += String.fromCharCode(char);
  }

  // Read version (UTF-16BE starting at offset 22)
  let version = '';
  for (let i = 22; i < 32; i += 2) {
    const char = view.getUint16(i, false);
    if (char === 0) break;
    version += String.fromCharCode(char);
  }

  console.log(`[TD3Loader] Parsing ${deviceName} .seq file, version ${version}`);

  // Detect format by checking if the data at offset 36 looks like MSB/LSB encoding
  // MSB/LSB format: MSB is 0x00-0x03 (pitch upper + accent flag), LSB is 0x00-0x0F
  const NOTES_OFFSET = 36;
  let looksLikeSimpleFormat = true;

  for (let i = 0; i < 16 && looksLikeSimpleFormat; i++) {
    const msb = bytes[NOTES_OFFSET + i * 2];
    const lsb = bytes[NOTES_OFFSET + i * 2 + 1];
    // Valid format: MSB is 0x00-0x03 (includes accent flag), LSB is 0x00-0x0F
    if (msb > 0x03 || lsb > 0x0F) {
      looksLikeSimpleFormat = false;
    }
  }

  if (looksLikeSimpleFormat) {
    return parseSeqFileSimple(bytes, deviceName, version);
  } else {
    return parseSeqFileCompact(bytes, deviceName, version);
  }
}

/**
 * Parse .seq format based on TD-3 sysex specification
 *
 * Note encoding: 2 bytes per step where pitch = (MSB << 4) | LSB
 * - MSB (byte 0): Upper 4 bits of pitch (encodes octave)
 * - LSB (byte 1): Lower 4 bits of pitch (encodes note)
 * - Combined pitch value 0x18 (24) = null/rest
 * - Pitch maps to MIDI: midiNote = pitchValue + 12
 *
 * Separate sections for accents and slides at offsets 68 and 100
 */
function parseSeqFileSimple(bytes: Uint8Array, deviceName: string, version: string): TD3File {
  console.log(`[TD3Loader] Parsing ${deviceName} v${version} using MSB/LSB format`);

  // Offsets in .seq file (based on TD-3 sysex format)
  const NOTES_OFFSET = 36;       // 32 bytes (16 × 2): MSB + LSB pairs
  const ACCENTS_OFFSET = 68;     // 32 bytes (16 × 2): accent flags (array format)
  const SLIDES_OFFSET = 100;     // 32 bytes (16 × 2): slide flags (array format)
  // const LENGTH_OFFSET = 134;     // 2 bytes: sequence length (unused for now)
  const ACCENT_BITS_OFFSET = 138; // 4 bytes: accent bitfield (alternative format)
  const SLIDE_BITS_OFFSET = 142;  // 4 bytes: slide bitfield (alternative format)

  const NULL_PITCH = 0x18; // 24 = inactive/rest pitch

  // Read accent bitfield at offset 138 (4 bytes = 32 bits, use lower 16 for 16 steps)
  // Format: each byte contains bits for 4 steps, LSB = lowest step number
  let accentBitfield = 0;
  if (bytes.length > ACCENT_BITS_OFFSET + 3) {
    // Read as 4 separate bytes, each covering 4 steps
    for (let i = 0; i < 4; i++) {
      const byte = bytes[ACCENT_BITS_OFFSET + i];
      // Each byte's bits map to 4 consecutive steps
      for (let bit = 0; bit < 4; bit++) {
        if ((byte >> bit) & 0x01) {
          accentBitfield |= (1 << (i * 4 + bit));
        }
      }
    }
  }

  // Read slide bitfield at offset 142
  let slideBitfield = 0;
  if (bytes.length > SLIDE_BITS_OFFSET + 3) {
    for (let i = 0; i < 4; i++) {
      const byte = bytes[SLIDE_BITS_OFFSET + i];
      for (let bit = 0; bit < 4; bit++) {
        if ((byte >> bit) & 0x01) {
          slideBitfield |= (1 << (i * 4 + bit));
        }
      }
    }
  }

  console.log(`[TD3Loader] Accent bitfield: 0x${accentBitfield.toString(16)} (binary: ${accentBitfield.toString(2).padStart(16, '0')})`);
  console.log(`[TD3Loader] Slide bitfield: 0x${slideBitfield.toString(16)} (binary: ${slideBitfield.toString(2).padStart(16, '0')})`);

  const steps: TD3Step[] = [];

  for (let step = 0; step < 16; step++) {
    const noteOffset = NOTES_OFFSET + step * 2;
    const msb = bytes[noteOffset];      // MSB: upper 4 bits of pitch
    const lsb = bytes[noteOffset + 1];  // LSB: lower 4 bits of pitch

    // Combine to get pitch value: (MSB << 4) | LSB
    const pitchValue = (msb << 4) | lsb;

    // Check for null/rest pitch (0x18 = 24)
    const isRest = pitchValue === NULL_PITCH;

    // Convert to MIDI note (add 12 since TD-3 is one octave lower)
    const midiNote = pitchValue + 12;

    // Extract note (0-11) and octave from MIDI note
    const note = midiNote % 12;
    // Adjust octave: -3 to match common acid bass notation (g2 = G2, not G3)
    const octave = Math.floor(midiNote / 12) - 3;

    // Check accent from bitfield first, then fall back to array format
    let hasAccent = (accentBitfield >> step) & 0x01 ? true : false;
    if (!hasAccent && bytes.length > ACCENTS_OFFSET + step * 2 + 1) {
      // Fall back to array format
      hasAccent = (bytes[ACCENTS_OFFSET + step * 2] & 0x01) !== 0 ||
                  (bytes[ACCENTS_OFFSET + step * 2 + 1] & 0x01) !== 0;
    }

    // Check slide from bitfield first, then fall back to array format
    let hasSlide = (slideBitfield >> step) & 0x01 ? true : false;
    if (!hasSlide && bytes.length > SLIDES_OFFSET + step * 2 + 1) {
      // Also check array format at offset 100
      hasSlide = (bytes[SLIDES_OFFSET + step * 2] & 0x01) !== 0 ||
                 (bytes[SLIDES_OFFSET + step * 2 + 1] & 0x01) !== 0;
    }

    steps.push({
      note: isRest ? 0 : note,
      octave: isRest ? 0 : octave,
      accent: hasAccent && !isRest,
      slide: hasSlide && !isRest,
      tie: false,
      rest: isRest,
    });
  }

  // Count for logging
  const noteCount = steps.filter(s => !s.rest).length;
  const accentCount = steps.filter(s => s.accent).length;
  const slideCount = steps.filter(s => s.slide).length;
  console.log(`[TD3Loader] Parsed ${noteCount} notes, ${accentCount} accents, ${slideCount} slides`);

  // Debug: show raw bytes from various offsets
  const accentArrayBytes = Array.from(bytes.slice(ACCENTS_OFFSET, ACCENTS_OFFSET + 32))
    .map(b => b.toString(16).padStart(2, '0')).join(' ');
  const slideArrayBytes = Array.from(bytes.slice(SLIDES_OFFSET, SLIDES_OFFSET + 32))
    .map(b => b.toString(16).padStart(2, '0')).join(' ');
  const bitfieldBytes = Array.from(bytes.slice(ACCENT_BITS_OFFSET, ACCENT_BITS_OFFSET + 8))
    .map(b => b.toString(16).padStart(2, '0')).join(' ');
  console.log(`[TD3Loader] Accent array (offset ${ACCENTS_OFFSET}): ${accentArrayBytes}`);
  console.log(`[TD3Loader] Slide array (offset ${SLIDES_OFFSET}): ${slideArrayBytes}`);
  console.log(`[TD3Loader] Bitfield bytes (offset ${ACCENT_BITS_OFFSET}): ${bitfieldBytes}`);

  // Log the pattern for debugging
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const patternStr = steps.map((s) => {
    if (s.rest) return '---';
    const octaveStr = s.octave >= 0 ? `${s.octave + 2}` : `${s.octave + 2}`;
    return `${noteNames[s.note]}${octaveStr}${s.accent ? '*' : ''}${s.slide ? '~' : ''}`;
  }).join(' ');
  console.log(`[TD3Loader] Pattern: ${patternStr}`);

  const pattern: TD3Pattern = {
    index: 0,
    name: 'Pattern 1',
    steps,
    length: 16,
    tempo: 120,
  };

  return {
    name: deviceName,
    version,
    patterns: [pattern],
  };
}

/**
 * Parse compact .seq format with tie/rest bitfields
 */
function parseSeqFileCompact(bytes: Uint8Array, deviceName: string, version: string): TD3File {
  console.log(`[TD3Loader] Using compact format parser`);

  // .seq structure offsets:
  const NOTES_OFFSET = 36;    // 32 bytes (16 notes * 2)
  const ACCENTS_OFFSET = 68;  // 32 bytes (16 accents * 2)
  const SLIDES_OFFSET = 100;  // 32 bytes (16 slides * 2)
  const LENGTH_OFFSET = 134;  // 2 bytes
  const TIE_OFFSET = 138;     // 4 bytes bitfield
  const REST_OFFSET = 142;    // 4 bytes bitfield

  // Read sequence length
  const seqLength = bytes[LENGTH_OFFSET] * 16 + bytes[LENGTH_OFFSET + 1];

  // Read rest bitfield (4 bytes -> 16 bits used)
  const restBits = bytes[REST_OFFSET + 1] + (bytes[REST_OFFSET] << 4) +
                   (bytes[REST_OFFSET + 3] << 8) + (bytes[REST_OFFSET + 2] << 12);

  // Read tie bitfield (1 = new note, 0 = sustain previous)
  let tieBits = bytes[TIE_OFFSET + 1] + (bytes[TIE_OFFSET] << 4) +
                (bytes[TIE_OFFSET + 3] << 8) + (bytes[TIE_OFFSET + 2] << 12);

  // Add guard bit for iteration
  tieBits |= (1 << seqLength);

  const steps: TD3Step[] = [];
  let arrayIndex = 0; // Index into the compact note/accent/slide arrays
  let lastStep: TD3Step | null = null;

  for (let step = 0; step < 16; step++) {
    const isNewNote = (tieBits & 0x01) !== 0;
    const isRest = ((restBits >> step) & 0x01) !== 0;

    if (isNewNote) {
      // Read from arrays at current arrayIndex
      const noteOffset = NOTES_OFFSET + arrayIndex;
      const accentOffset = ACCENTS_OFFSET + arrayIndex;
      const slideOffset = SLIDES_OFFSET + arrayIndex;

      // Note value: MSB * 16 + LSB
      const noteval = bytes[noteOffset] * 16 + bytes[noteOffset + 1];
      const octave = Math.floor(noteval / 12);
      const note = noteval % 12;

      // Accent and slide are in the SECOND byte of each pair
      const hasAccent = (bytes[accentOffset + 1] & 0x01) !== 0;
      const hasSlide = (bytes[slideOffset + 1] & 0x01) !== 0;

      lastStep = {
        note: note,
        octave: octave - 2, // Adjust octave relative to base
        accent: hasAccent,
        slide: hasSlide,
        tie: false,
        rest: isRest,
      };

      steps.push({ ...lastStep });
      arrayIndex += 2; // Move to next entry in compact arrays
    } else {
      // Sustain: copy from previous note
      if (lastStep) {
        steps.push({
          ...lastStep,
          tie: true, // Mark as tied/sustained
          rest: isRest,
        });
      } else {
        // No previous note, create empty
        steps.push({
          note: 0,
          octave: 0,
          accent: false,
          slide: false,
          tie: true,
          rest: true,
        });
      }
    }

    tieBits >>= 1;
  }

  const pattern: TD3Pattern = {
    index: 0,
    name: 'Pattern 1',
    steps,
    length: seqLength || 16,
    tempo: 120,
  };

  console.log(`[TD3Loader] Loaded single pattern with ${seqLength} steps`);

  return {
    name: deviceName,
    version,
    patterns: [pattern],
  };
}

/**
 * Parse .sqs multi-pattern collection file
 */
function parseSqsFile(view: DataView, bytes: Uint8Array, fileLength: number): TD3File {
  // Read device name (UTF-16BE at offset 8)
  let deviceName = '';
  for (let i = 8; i < 20; i += 2) {
    const char = view.getUint16(i, false);
    if (char === 0) break;
    deviceName += String.fromCharCode(char);
  }

  // Read version (UTF-16BE starting at offset 22)
  let version = '';
  for (let i = 22; i < 32; i += 2) {
    const char = view.getUint16(i, false);
    if (char === 0) break;
    version += String.fromCharCode(char);
  }

  console.log(`[TD3Loader] Parsing ${deviceName} .sqs file, version ${version}`);

  // Parse patterns by looking for 00 70 markers
  const patterns: TD3Pattern[] = [];
  let offset = 32;

  while (offset < fileLength - 100) {
    if (bytes[offset] === 0x00 && bytes[offset + 1] === 0x70) {
      // Index is a single byte at offset-3 before the marker
      const patternIndex = bytes[offset - 3];

      // Note data starts 4 bytes after marker (skip 00 00 padding)
      const pattern = parsePattern(bytes, offset + 4, patternIndex);
      patterns.push(pattern);

      // Move to next pattern (~124 bytes apart)
      offset += 124;
    } else {
      offset++;
    }
  }

  console.log(`[TD3Loader] Found ${patterns.length} patterns`);

  return {
    name: deviceName,
    version,
    patterns,
  };
}

/**
 * Options for TD-3 import
 */
export interface TD3ImportOptions {
  autoAccent?: boolean;  // Add accent to all notes (default: true for acid patterns)
  baseOctave?: number;   // Base octave (default: 2)
}

/**
 * Convert a TD3Pattern to DEViLBOX format
 */
export function convertTD3PatternToDbox(
  td3Pattern: TD3Pattern,
  options: TD3ImportOptions = {}
): {
  rows: Array<{
    note: string | null;
    instrument: number;
    volume: number | null;
    effect: string | null;
    accent: boolean;
    slide: boolean;
  }>;
} {
  const { autoAccent = true, baseOctave = 2 } = options;

  const rows = td3Pattern.steps.map((step) => {
    if (step.rest) {
      return {
        note: null,
        instrument: 1,
        volume: null,
        effect: null,
        accent: false,
        slide: false,
      };
    }

    const noteName = NOTE_NAMES[step.note];
    const octave = baseOctave + step.octave;
    // XM format: "C-4" for natural notes, "C#4" for sharps (dash/sharp already in NOTE_NAMES)
    const noteStr = `${noteName}${octave}`;

    return {
      note: noteStr,
      instrument: 1, // TB-303 instrument
      volume: null,
      effect: null,
      // Use file's accent if present, otherwise use autoAccent setting
      accent: step.accent || autoAccent,
      slide: step.slide,
    };
  });

  return { rows };
}

/**
 * Convert entire TD3File to a DEViLBOX project
 */
export function convertTD3FileToDbox(
  td3File: TD3File,
  filename: string,
  options: TD3ImportOptions = {}
): object {
  const patterns = td3File.patterns.map((td3Pattern, idx) => {
    const converted = convertTD3PatternToDbox(td3Pattern, options);

    return {
      id: `td3-pattern-${idx}`,
      name: td3Pattern.name,
      length: 16,
      channels: [
        {
          id: `ch-303-${idx}`,
          name: 'TB-303',
          muted: false,
          solo: false,
          volume: 80,
          pan: 0,
          instrumentId: 1,
          color: '#ec4899',
          rows: converted.rows,
        },
      ],
    };
  });

  // Create TB-303 instrument
  const instruments = [
    {
      id: 1,
      name: 'TB-303',
      synthType: 'TB303',
      tb303: {
        oscillator: { type: 'sawtooth' },
        filter: { cutoff: 800, resonance: 70 },
        filterEnvelope: { envMod: 80, decay: 200 },
        accent: { amount: 85 },
        slide: { time: 50, mode: 'exponential' },
        overdrive: { amount: 25 },
      },
      effects: [],
      volume: -6,
      pan: 0,
    },
  ];

  return {
    format: 'devilbox-dbox',
    version: '1.0.0',
    metadata: {
      id: `td3-${Date.now()}`,
      name: filename.replace(/\.(sqs|seq)$/i, '') || 'TD-3 Pattern',
      author: 'TD-3 Import',
      description: `Imported from ${td3File.name} v${td3File.version}`,
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
    },
    bpm: 125,
    instruments,
    patterns,
    sequence: patterns.map(p => p.id),
    masterVolume: 0,
    masterEffects: [],
  };
}
