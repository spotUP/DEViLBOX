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
import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell } from '@/types';
import type { InstrumentConfig } from '@/types/instrument';
import { convertToInstrument } from '../InstrumentConverter';

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

  // Scan patterns for initial speed/tempo (Fxx effect)
  // MOD files typically set speed/tempo in the first rows of the song
  const { initialSpeed, initialBPM } = scanForInitialTempo(patterns, header.patternOrderTable);

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

    // Convert loop points from words to sample units (1 word = 2 bytes for 8-bit samples)
    const loopStartSamples = sampleHeader.loopStart * 2;
    const loopLengthSamples = sampleHeader.loopLength * 2;
    console.log(`[MODParser] Sample ${i+1} "${sampleHeader.name}": loopStart=${loopStartSamples} loopLength=${loopLengthSamples} length=${sampleHeader.length * 2}`);

    // MOD instruments are 1-indexed (1-31) in pattern data
    const instrumentId = i + 1;

    const sample: ParsedSample = {
      id: instrumentId,
      name: sampleHeader.name,
      pcmData: sampleData,
      loopStart: loopStartSamples,
      loopLength: loopLengthSamples,
      loopType: sampleHeader.loopLength > 1 ? 'forward' : 'none',
      volume: sampleHeader.volume,
      finetune: sampleHeader.finetune,
      relativeNote: 0, // MOD doesn't have relative note
      panning: 128, // Center (MOD doesn't have per-sample panning)
      bitDepth: 8,
      sampleRate: 8363, // Amiga C-2 sample rate (8363 Hz)
      length: sampleHeader.length * 2, // Convert words to bytes
    };

    instruments.push({
      id: instrumentId,
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
      initialSpeed, // Scanned from pattern data (Fxx effect)
      initialBPM,   // Scanned from pattern data (Fxx effect)
      amigaPeriods: true, // MOD always uses Amiga periods
      channelNames: Array.from({ length: header.channelCount }, (_, i) => `Channel ${i + 1}`),
      songLength: header.songLength,
      restartPosition: header.restartPosition,
      patternOrderTable: header.patternOrderTable,
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
 * Scan pattern data for initial speed/tempo (Fxx effect)
 * MOD files typically set speed in the first few rows of the song.
 * 
 * In ProTracker:
 * - Fxx where xx < 0x20 (32) sets speed (ticks per row)
 * - Fxx where xx >= 0x20 sets BPM directly
 * 
 * This scans the first pattern in song order to find these commands.
 */
function scanForInitialTempo(
  patterns: MODNote[][][],
  patternOrderTable: number[]
): { initialSpeed: number; initialBPM: number } {
  // Defaults (classic ProTracker)
  let speed = 6;
  let bpm = 125;
  let foundSpeed = false;
  let foundBPM = false;
  
  // Collect all Fxx effects for debugging
  const allFxxEffects: Array<{pat: number, row: number, ch: number, param: number}> = [];
  
  // Scan ALL patterns to find Fxx effects for debugging
  for (let patIdx = 0; patIdx < patterns.length; patIdx++) {
    const pattern = patterns[patIdx];
    if (!pattern) continue;
    
    for (let row = 0; row < pattern.length; row++) {
      const rowData = pattern[row];
      if (!rowData) continue;
      
      for (let ch = 0; ch < rowData.length; ch++) {
        const note = rowData[ch];
        if (note.effect === 0x0F && note.effectParam !== 0) {
          allFxxEffects.push({ pat: patIdx, row, ch, param: note.effectParam });
        }
      }
    }
  }
  
  // Log all Fxx effects found
  if (allFxxEffects.length > 0) {
    console.log(`[MODParser] Found ${allFxxEffects.length} Fxx effects:`, 
      allFxxEffects.slice(0, 10).map(f => 
        `Pat${f.pat} Row${f.row} Ch${f.ch}: F${f.param.toString(16).padStart(2, '0').toUpperCase()}`
      )
    );
  } else {
    console.log('[MODParser] No Fxx effects found in any pattern - using defaults');
  }
  
  // Get the first pattern in the song order
  const firstPatternIndex = patternOrderTable[0];
  const firstPattern = patterns[firstPatternIndex];
  
  if (!firstPattern) {
    console.log(`[MODParser] First pattern (${firstPatternIndex}) not found!`);
    return { initialSpeed: speed, initialBPM: bpm };
  }
  
  // Scan the first few rows for Fxx commands
  // Check up to 16 rows as some MODs set tempo later
  const rowsToScan = Math.min(16, firstPattern.length);
  
  for (let row = 0; row < rowsToScan && !(foundSpeed && foundBPM); row++) {
    const rowData = firstPattern[row];
    if (!rowData) continue;
    
    for (const note of rowData) {
      // Effect F = Set Speed/Tempo
      if (note.effect === 0x0F) {
        const param = note.effectParam;
        
        if (param === 0) {
          // F00 = stop song, ignore
          continue;
        } else if (param < 0x20) {
          // Fxx < 32 = set speed (ticks per row)
          if (!foundSpeed) {
            speed = param;
            foundSpeed = true;
            console.log(`[MODParser] Found speed ${speed} at row ${row}`);
          }
        } else {
          // Fxx >= 32 = set BPM
          if (!foundBPM) {
            bpm = param;
            foundBPM = true;
            console.log(`[MODParser] Found BPM ${bpm} at row ${row}`);
          }
        }
      }
    }
  }
  
  console.log(`[MODParser] Initial tempo: speed=${speed}, BPM=${bpm} (foundSpeed=${foundSpeed}, foundBPM=${foundBPM})`);
  
  return { initialSpeed: speed, initialBPM: bpm };
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
      // Instrument: upper 4 bits from byte0[4-7], lower 4 bits from byte2[4-7]
      const instrument = (byte0 & 0xF0) | ((byte2 & 0xF0) >> 4);
      const effect = byte2 & 0x0F;
      const effectParam = byte3;

      rowNotes.push({
        period,
        instrument, // Already in 1-31 range (0 = no instrument)
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
 */
function readMODSampleData(
  view: DataView,
  offset: number,
  header: MODSampleHeader
): ArrayBuffer {
  const length = header.length * 2; // Convert words to bytes
  const samples = new Int8Array(length);

  for (let i = 0; i < length; i++) {
    samples[i] = view.getInt8(offset + i);
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
 * Amiga period table (C-1 to B-3)
 */
export function periodToNote(period: number): string | null {
  if (period === 0) return null;

  // Amiga period table (linearized for accuracy)
  const PERIOD_TABLE: { [key: number]: string } = {
    1712: 'C-0', 1616: 'C#0', 1525: 'D-0', 1440: 'D#0', 1357: 'E-0', 1281: 'F-0',
    1209: 'F#0', 1141: 'G-0', 1077: 'G#0', 1017: 'A-0', 960: 'A#0', 907: 'B-0',
    856: 'C-1', 808: 'C#1', 762: 'D-1', 720: 'D#1', 678: 'E-1', 640: 'F-1',
    604: 'F#1', 570: 'G-1', 538: 'G#1', 508: 'A-1', 480: 'A#1', 453: 'B-1',
    428: 'C-2', 404: 'C#2', 381: 'D-2', 360: 'D#2', 339: 'E-2', 320: 'F-2',
    302: 'F#2', 285: 'G-2', 269: 'G#2', 254: 'A-2', 240: 'A#2', 226: 'B-2',
    214: 'C-3', 202: 'C#3', 190: 'D-3', 180: 'D#3', 170: 'E-3', 160: 'F-3',
    151: 'F#3', 143: 'G-3', 135: 'G#3', 127: 'A-3', 120: 'A#3', 113: 'B-3',
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

  // Reject wildly invalid periods (threshold: 100 semitones off nearest)
  if (minDiff > 100) return null;

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

// ── TrackerSong wrapper ───────────────────────────────────────────────────────

const MOD_FORMAT_TAGS = new Set([
  'M.K.', 'M!K!', 'FLT4', 'FLT8', '4CHN', '6CHN', '8CHN',
  'OCTA', 'CD81', '2CHN', 'TDZ1', 'TDZ2', 'TDZ3',
]);

/** Detect MOD by format tag at byte offset 1080 (4 bytes). */
export function isMODFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 1084) return false;
  const bytes = new Uint8Array(buffer, 1080, 4);
  const tag = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  return MOD_FORMAT_TAGS.has(tag);
}

const NOTE_SEMITONES: Record<string, number> = {
  'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5,
  'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11,
};

function noteNameToIndex(name: string): number {
  // Matches "C-3", "C#3", "A#2", etc.
  const match = name.match(/^([A-G]#?)[-]?(\d)$/);
  if (!match) return 0;
  const semitone = NOTE_SEMITONES[match[1]] ?? 0;
  const octave = parseInt(match[2]);
  return octave * 12 + semitone + 1; // 1-based, C-0 = 1
}

/** Parse a MOD file and return a TrackerSong with real PCM instruments. */
export async function parseMODFile(buffer: ArrayBuffer, filename: string): Promise<TrackerSong> {
  const { header, patterns: modPatterns, instruments: parsedInstruments, metadata } = await parseMOD(buffer);

  const emptyInst = (id: number, name: string): InstrumentConfig => ({
    id,
    name: name || `Sample ${id}`,
    type:      'sample' as const,
    synthType: 'Sampler' as const,
    effects:   [],
    volume:    -60,
    pan:       0,
  } as InstrumentConfig);

  const instruments: InstrumentConfig[] = parsedInstruments.map((inst) => {
    const id = inst.id;
    const converted = convertToInstrument(inst, id, 'S3M'); // MOD has no envelopes
    return converted.length > 0 ? { ...converted[0], id } : emptyInst(id, inst.name);
  });

  const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

  const patterns: Pattern[] = modPatterns.map((modPat, patIdx) => ({
    id:     `pattern-${patIdx}`,
    name:   `Pattern ${patIdx}`,
    length: modPat.length, // 64 rows
    channels: Array.from({ length: header.channelCount }, (_, ch): ChannelData => ({
      id:           `channel-${ch}`,
      name:         `Channel ${ch + 1}`,
      muted:        false,
      solo:         false,
      collapsed:    false,
      volume:       100,
      pan:          0,
      instrumentId: null,
      color:        null,
      rows: modPat.map((row): TrackerCell => {
        const n = row[ch];
        if (!n || (n.period === 0 && n.instrument === 0 && n.effect === 0 && n.effectParam === 0)) {
          return emptyCell();
        }
        const noteName = periodToNote(n.period);
        const noteIdx  = noteName ? noteNameToIndex(noteName) : 0;
        return {
          note:       noteIdx,
          instrument: n.instrument,
          volume:     0, // MOD has no per-note volume column
          effTyp:     n.effect,
          eff:        n.effectParam,
          effTyp2:    0,
          eff2:       0,
        };
      }),
    })),
  }));

  const songPositions = header.patternOrderTable.slice(0, header.songLength);
  const initialSpeed  = metadata.modData?.initialSpeed ?? 6;
  const initialBPM    = metadata.modData?.initialBPM ?? 125;

  return {
    name:            header.title.replace(/\0/g, '').trim() || filename.replace(/\.[^/.]+$/, ''),
    format:          'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength:      header.songLength,
    restartPosition: header.restartPosition,
    numChannels:     header.channelCount,
    initialSpeed,
    initialBPM,
    linearPeriods:   false, // MOD always uses Amiga periods
  };
}
