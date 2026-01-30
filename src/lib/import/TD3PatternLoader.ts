/**
 * TD-3 Pattern Loader (.sqs format)
 * Parses Behringer Synthtribe pattern files for the TD-3 (303 clone)
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

// Note names for display
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Check if a file is a TD-3 .sqs pattern file
 */
export function isTD3File(filename: string): boolean {
  return filename.toLowerCase().endsWith('.sqs');
}

/**
 * Parse a TD-3 .sqs pattern file
 */
export async function parseTD3File(buffer: ArrayBuffer): Promise<TD3File> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // Check magic bytes
  const magic = view.getUint32(0, false);
  if (magic !== 0x87439102) {
    throw new Error('Invalid TD-3 file: bad magic bytes');
  }

  // Read device name (UTF-16LE at offset 8)
  let deviceName = '';
  for (let i = 8; i < 20; i += 2) {
    const char = view.getUint16(i, true);
    if (char === 0) break;
    deviceName += String.fromCharCode(char);
  }

  // Read version (UTF-16LE)
  let version = '';
  for (let i = 20; i < 32; i += 2) {
    const char = view.getUint16(i, true);
    if (char === 0) break;
    version += String.fromCharCode(char);
  }

  console.log(`[TD3Loader] Parsing ${deviceName} file, version ${version}`);

  // Parse patterns
  // Each pattern block is ~126 bytes
  // Pattern marker: XX XX 00 70 (where XX XX is pattern index, little-endian)
  const patterns: TD3Pattern[] = [];
  let offset = 32; // Start after header

  // Look for pattern markers
  while (offset < buffer.byteLength - 100) {
    // Look for the 0x70 0x00 pattern marker (little-endian 0x0070)
    if (bytes[offset + 2] === 0x00 && bytes[offset + 3] === 0x70) {
      const patternIndex = view.getUint16(offset, true);

      // Skip marker (4 bytes) and unknown (2 bytes)
      const noteDataOffset = offset + 6;

      const steps: TD3Step[] = [];

      // Read 16 note entries (2 bytes each)
      for (let step = 0; step < 16; step++) {
        const noteOffset = noteDataOffset + (step * 2);
        const flags = bytes[noteOffset];     // 0x00=rest, 0x01=note, 0x02=accent
        const noteVal = bytes[noteOffset + 1]; // 0x00-0x0B = C-B, 0x0F = rest

        const isRest = flags === 0x00 || noteVal === 0x0F || noteVal === 0x08; // 0x08 seems to be rest too
        const hasAccent = (flags & 0x02) !== 0;

        // Note value: lower nibble is note (0-11), but 0x08 is often used for rests
        // Notes seem to be: 0x00=C, 0x01=C#, 0x02=D, etc. up to 0x0B=B
        let note = noteVal & 0x0F;
        if (note > 11) note = 0; // Default to C for invalid values

        // Octave might be encoded in the upper nibble or flags
        // For now, assume middle octave
        const octave = 0;

        steps.push({
          note: isRest ? 0 : note,
          octave,
          accent: hasAccent,
          slide: false, // Will be filled from slide data
          tie: false,   // Will be filled from tie data
          rest: isRest,
        });
      }

      // Read slide flags (16 bytes after note data)
      const slideOffset = noteDataOffset + 32;
      for (let step = 0; step < 16; step++) {
        // Slide data appears to be in pairs, taking every other byte
        steps[step].slide = bytes[slideOffset + step * 2] !== 0;
      }

      // Read tie/other flags (next 16 bytes)
      const tieOffset = slideOffset + 32;
      for (let step = 0; step < 16; step++) {
        steps[step].tie = bytes[tieOffset + step * 2] !== 0;
      }

      // Calculate pattern length (number of active steps)
      let length = 16;
      for (let i = 15; i >= 0; i--) {
        if (!steps[i].rest) break;
        length = i;
      }
      if (length === 0) length = 16; // All rests = full pattern

      patterns.push({
        index: patternIndex,
        name: `Pattern ${patternIndex + 1}`,
        steps,
        length: 16, // TD-3 always uses 16 steps
        tempo: 120, // Default tempo
      });

      // Move to next pattern (patterns are ~126 bytes apart)
      offset += 126;
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
 * Convert a TD3Pattern to DEViLBOX format
 */
export function convertTD3PatternToDbox(
  td3Pattern: TD3Pattern,
  baseOctave: number = 2
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
    const noteStr = `${noteName}${octave}`;

    return {
      note: noteStr,
      instrument: 1, // TB-303 instrument
      volume: null,
      effect: null,
      accent: step.accent,
      slide: step.slide,
    };
  });

  return { rows };
}

/**
 * Convert entire TD3File to a DEViLBOX project
 */
export function convertTD3FileToDbox(td3File: TD3File, filename: string): object {
  const patterns = td3File.patterns.map((td3Pattern, idx) => {
    const converted = convertTD3PatternToDbox(td3Pattern);

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
      name: filename.replace('.sqs', '') || 'TD-3 Patterns',
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
