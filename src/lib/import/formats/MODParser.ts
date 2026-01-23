/**
 * ProTracker MOD Format Parser
 * Native binary parser for .MOD files with full sample extraction
 *
 * Based on ProTracker format specification and Amiga MOD format
 */

import type {
  ParsedInstrument,
  ParsedSample,
  ImportMetadata,
} from '../../../types/tracker';

/**
 * MOD File Header
 */
interface MODHeader {
  title: string; // 20 bytes
  samples: MODSampleHeader[]; // 31 samples
  songLength: number; // 1-128
  restartPosition: number; // Usually 127 (unused in most MODs)
  patternOrderTable: number[]; // 128 bytes
  formatTag: string; // "M.K.", "FLT4", "6CHN", "8CHN", etc.
  channelCount: number; // Derived from format tag
  patternCount: number; // Derived from pattern order table
}

/**
 * MOD Sample Header (30 bytes per sample)
 */
interface MODSampleHeader {
  name: string; // 22 bytes
  length: number; // Length in words (multiply by 2 for bytes)
  finetune: number; // -8 to +7 (stored as 0-15)
  volume: number; // 0-64
  loopStart: number; // Loop start in words
  loopLength: number; // Loop length in words
}

/**
 * MOD Pattern Note (4 bytes per note)
 */
export interface MODNote {
  period: number; // Amiga period (0 = no note)
  instrument: number; // 1-31 (0 = no instrument)
  effect: number; // Effect command (0-F)
  effectParam: number; // Effect parameter (0-FF)
}

/**
 * Format tag to channel count mapping
 */
const FORMAT_CHANNELS: { [key: string]: number } = {
  'M.K.': 4, // ProTracker 1.x (most common)
  'M!K!': 4, // ProTracker (>64 patterns)
  'FLT4': 4, // StarTrekker 4-channel
  'FLT8': 8, // StarTrekker 8-channel
  '4CHN': 4, // FastTracker 4-channel
  '6CHN': 6, // FastTracker 6-channel
  '8CHN': 8, // FastTracker/TakeTracker 8-channel
  'OCTA': 8, // Octalyser
  'CD81': 8, // Octalyser/Atari
  '2CHN': 2, // FastTracker 2-channel
  'TDZ1': 1, // TakeTracker 1-channel
  'TDZ2': 2, // TakeTracker 2-channel
  'TDZ3': 3, // TakeTracker 3-channel
};

/**
 * Parse MOD file from ArrayBuffer
 */
export async function parseMOD(buffer: ArrayBuffer): Promise<{
  header: MODHeader;
  patterns: MODNote[][][]; // [pattern][row][channel]
  instruments: ParsedInstrument[];
  metadata: ImportMetadata;
}> {
  const view = new DataView(buffer);
  let offset = 0;

  // Read header
  const header = readMODHeader(view);
  offset = 1084; // Fixed offset after header

  // Read patterns (64 rows × channels × 4 bytes per note)
  const patterns: MODNote[][][] = [];
  for (let i = 0; i < header.patternCount; i++) {
    const pattern = readMODPattern(view, offset, header.channelCount);
    patterns.push(pattern);
    offset += 64 * header.channelCount * 4;
  }

  // Read sample data
  const instruments: ParsedInstrument[] = [];
  for (let i = 0; i < 31; i++) {
    const sampleHeader = header.samples[i];

    // Skip empty samples
    if (sampleHeader.length === 0) {
      continue;
    }

    const sampleData = readMODSampleData(view, offset, sampleHeader);
    offset += sampleHeader.length * 2; // Length is in words

    const sample: ParsedSample = {
      id: i + 1, // MOD instruments are 1-31 (1-indexed)
      name: sampleHeader.name,
      pcmData: sampleData,
      loopStart: sampleHeader.loopStart,
      loopLength: sampleHeader.loopLength,
      // ProTracker spec: loop enabled when length > 2 (not > 1)
      // This prevents short loop glitches
      loopType: sampleHeader.loopLength > 2 ? 'forward' : 'none',
      volume: sampleHeader.volume,
      finetune: sampleHeader.finetune,
      relativeNote: 0, // MOD doesn't have relative note
      panning: 128, // Center (MOD doesn't have per-sample panning)
      bitDepth: 8,
      sampleRate: 8363, // Amiga C-2 sample rate (8363 Hz)
      length: sampleHeader.length,
    };

    instruments.push({
      id: i + 1, // MOD instruments are 1-31 (1-indexed, matching pattern cell references)
      name: sampleHeader.name,
      samples: [sample],
      fadeout: 0,
      volumeType: 'none',
      panningType: 'none',
    });
  }

  // Build metadata
  const metadata: ImportMetadata = {
    sourceFormat: 'MOD',
    sourceFile: header.title,
    importedAt: new Date().toISOString(),
    originalChannelCount: header.channelCount,
    originalPatternCount: header.patternCount,
    originalInstrumentCount: instruments.length,
    modData: {
      moduleType: header.formatTag,
      initialSpeed: 6, // Classic ProTracker speed
      initialBPM: 125, // Classic ProTracker BPM
      amigaPeriods: true, // MOD always uses Amiga periods
      channelNames: Array.from({ length: header.channelCount }, (_, i) => `Channel ${i + 1}`),
      songLength: header.songLength,
      restartPosition: header.restartPosition,
      patternOrderTable: header.patternOrderTable.slice(0, header.songLength),
    },
    originalSamples: {},
    envelopes: {},
  };

  // Store samples in metadata
  instruments.forEach((inst) => {
    inst.samples.forEach((sample) => {
      metadata.originalSamples![sample.id] = sample;
    });
  });

  return { header, patterns, instruments, metadata };
}

/**
 * Read MOD header (first 1084 bytes)
 */
function readMODHeader(view: DataView): MODHeader {
  let offset = 0;

  // Read title (20 bytes)
  const title = readString(view, offset, 20).trim();
  offset += 20;

  // Read 31 sample headers (30 bytes each)
  const samples: MODSampleHeader[] = [];
  for (let i = 0; i < 31; i++) {
    const name = readString(view, offset, 22).trim();
    const length = view.getUint16(offset + 22, false); // Big-endian!
    const finetune = view.getUint8(offset + 24) & 0x0F;
    const volume = Math.min(view.getUint8(offset + 25), 64);
    const loopStart = view.getUint16(offset + 26, false);
    const loopLength = view.getUint16(offset + 28, false);

    samples.push({
      name,
      length,
      finetune: finetune > 7 ? finetune - 16 : finetune, // Convert to signed
      volume,
      loopStart,
      loopLength,
    });

    offset += 30;
  }

  // Read song length
  const songLength = view.getUint8(offset);
  offset += 1;

  // Read restart position (historically unused, usually 127)
  const restartPosition = view.getUint8(offset);
  offset += 1;

  // Read pattern order table (128 bytes)
  const patternOrderTable: number[] = [];
  let maxPattern = 0;
  for (let i = 0; i < 128; i++) {
    const pattern = view.getUint8(offset + i);
    patternOrderTable.push(pattern);
    if (i < songLength && pattern > maxPattern) {
      maxPattern = pattern;
    }
  }
  offset += 128;

  // Read format tag (4 bytes)
  const formatTag = readString(view, offset, 4);
  const channelCount = FORMAT_CHANNELS[formatTag] || 4; // Default to 4 if unknown

  return {
    title,
    samples,
    songLength,
    restartPosition,
    patternOrderTable,
    formatTag,
    channelCount,
    patternCount: maxPattern + 1,
  };
}

/**
 * Read MOD pattern (64 rows)
 */
function readMODPattern(
  view: DataView,
  offset: number,
  channelCount: number
): MODNote[][] {
  const pattern: MODNote[][] = [];

  for (let row = 0; row < 64; row++) {
    const rowNotes: MODNote[] = [];

    for (let ch = 0; ch < channelCount; ch++) {
      // Each note is 4 bytes
      const byte0 = view.getUint8(offset++);
      const byte1 = view.getUint8(offset++);
      const byte2 = view.getUint8(offset++);
      const byte3 = view.getUint8(offset++);

      // Decode note data
      // Byte 0: aaaaBBBB - aaaa = upper 4 bits of period, BBBB = upper 4 bits of instrument
      // Byte 1: CCCCCCCC - lower 8 bits of period
      // Byte 2: DDDDeeee - DDDD = lower 4 bits of instrument, eeee = effect
      // Byte 3: ffffffff - effect parameter

      const period = ((byte0 & 0x0F) << 8) | byte1;
      // Byte 0 bits 7-4: upper nibble of instrument (bits 4-7)
      // Byte 2 bits 7-4: lower nibble of instrument (bits 0-3)
      // Combined: ((byte0 & 0xF0) | (byte2 & 0xF0) >> 4) gives 0-31
      const instrument = (byte0 & 0xF0) | ((byte2 & 0xF0) >> 4);
      const effect = byte2 & 0x0F;
      const effectParam = byte3;

      rowNotes.push({
        period,
        instrument, // Already in 0-31 range (or 0-15 for some formats)
        effect,
        effectParam,
      });
    }

    pattern.push(rowNotes);
  }

  return pattern;
}

/**
 * Read MOD sample data (8-bit signed PCM)
 * Returns Int8Array for proper type detection downstream
 * Note: We normalize later in InstrumentConverter to avoid data corruption
 */
function readMODSampleData(
  view: DataView,
  offset: number,
  header: MODSampleHeader
): ArrayBuffer {
  const length = header.length * 2; // Convert words to bytes
  const samples = new Int8Array(length);

  for (let i = 0; i < length; i++) {
    const byte = view.getInt8(offset + i);
    // ProTracker quirk: first 2 bytes often contain clicks, zero them out
    samples[i] = i < 2 ? 0 : byte;
  }

  return samples.buffer;
}

/**
 * Read string from DataView
 */
function readString(view: DataView, offset: number, maxLength: number): string {
  const bytes: number[] = [];
  for (let i = 0; i < maxLength; i++) {
    const byte = view.getUint8(offset + i);
    if (byte === 0) break;
    bytes.push(byte);
  }
  return String.fromCharCode(...bytes);
}

/**
 * Convert Amiga period to note name
 * Amiga period table with modern MIDI octave numbering
 * MOD C-2 (period 428) = MIDI C4 (middle C)
 */
export function periodToNote(period: number): string | null {
  if (period === 0) return null;

  // Amiga period table converted to Tone.js format (no dashes)
  // Octaves shifted +2 (MOD C-1 = modern C3, MOD C-2 = modern C4, etc.)
  const PERIOD_TABLE: { [key: number]: string } = {
    856: 'C3', 808: 'C#3', 762: 'D3', 720: 'D#3', 678: 'E3', 640: 'F3',
    604: 'F#3', 570: 'G3', 538: 'G#3', 508: 'A3', 480: 'A#3', 453: 'B3',
    428: 'C4', 404: 'C#4', 381: 'D4', 360: 'D#4', 339: 'E4', 320: 'F4',
    302: 'F#4', 285: 'G4', 269: 'G#4', 254: 'A4', 240: 'A#4', 226: 'B4',
    214: 'C5', 202: 'C#5', 190: 'D5', 180: 'D#5', 170: 'E5', 160: 'F5',
    151: 'F#5', 143: 'G5', 135: 'G#5', 127: 'A5', 120: 'A#5', 113: 'B5',
  };

  // Find closest period
  let closest = null;
  let minDiff = Infinity;

  for (const [periodStr, note] of Object.entries(PERIOD_TABLE)) {
    const tablePeriod = parseInt(periodStr);
    const diff = Math.abs(tablePeriod - period);
    if (diff < minDiff) {
      minDiff = diff;
      closest = note;
    }
  }

  return closest;
}

/**
 * Convert MOD effect to FT2 effect command string
 */
export function convertMODEffect(effect: number, param: number): string {
  // MOD effects are compatible with FT2 (0-F format)
  const effectChar = effect.toString(16).toUpperCase();
  const paramHex = param.toString(16).padStart(2, '0').toUpperCase();
  return `${effectChar}${paramHex}`;
}
