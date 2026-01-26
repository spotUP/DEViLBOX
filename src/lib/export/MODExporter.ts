/**
 * MOD Exporter - Export DEViLBOX patterns to ProTracker MOD format
 * Supports 4-31 channel MOD files with standard Amiga period tables
 */

import type { Pattern, TrackerCell, ImportMetadata } from '../../types/tracker';
import type { InstrumentConfig } from '../../types/instrument';
import { xmNoteToString } from '../xmConversions';

export interface MODExportOptions {
  channelCount?: number; // 4, 6, 8 channels (default: 4)
  moduleName?: string; // Module title (20 chars max)
  bakeSynthsToSamples?: boolean; // Render synth instruments as samples (default: true)
}

export interface MODExportResult {
  data: Blob;
  warnings: string[];
  filename: string;
}

/**
 * Format tags for different channel counts
 */
const FORMAT_TAGS: { [key: number]: string } = {
  4: 'M.K.', // Standard 4-channel ProTracker
  6: '6CHN', // FastTracker 6-channel
  8: '8CHN', // FastTracker 8-channel
};

/**
 * Export patterns and instruments to MOD format
 */
export async function exportAsMOD(
  patterns: Pattern[],
  instruments: InstrumentConfig[],
  options: MODExportOptions = {}
): Promise<MODExportResult> {
  const warnings: string[] = [];

  // Set defaults
  const channelCount = options.channelCount || 4;
  const moduleName = options.moduleName || 'DEViLBOX Export';
  const bakeSynthsToSamples = options.bakeSynthsToSamples ?? true;

  // Validate channel count
  if (![4, 6, 8].includes(channelCount)) {
    throw new Error(`MOD supports 4, 6, or 8 channels (got ${channelCount})`);
  }

  const formatTag = FORMAT_TAGS[channelCount];
  if (!formatTag) {
    throw new Error(`No format tag for ${channelCount} channels`);
  }

  // Check pattern channel counts
  const maxChannels = Math.max(...patterns.map(p => p.channels.length));
  if (maxChannels > channelCount) {
    warnings.push(
      `Patterns have ${maxChannels} channels but exporting as ${channelCount}-channel MOD. ` +
      `Extra channels will be truncated.`
    );
  }

  // Check if this was originally imported from MOD (can do lossless export)
  const importMetadata = patterns[0]?.importMetadata;
  // const isReexport = importMetadata?.sourceFormat === 'MOD'; // Future: use for optimized export path

  // Convert instruments (MOD supports max 31 samples)
  const modSamples: MODSampleData[] = [];
  for (let i = 0; i < Math.min(instruments.length, 31); i++) {
    const inst = instruments[i];

    if (!inst) {
      modSamples.push(createEmptySample());
      continue;
    }

    if (inst.synthType !== 'Sampler' && bakeSynthsToSamples) {
      warnings.push(`Synth instrument "${inst.name}" cannot be exported to MOD (synth rendering not supported).`);
      // Note: Rendering synths to samples would require:
      // 1. OfflineAudioContext to render synth audio
      // 2. Converting rendered audio to 8-bit signed PCM
      // 3. Properly handling loop points and sample length limits
      // This is complex and platform-dependent, so synths export as empty samples
      modSamples.push(createEmptySample());
    } else if (inst.synthType === 'Sampler') {
      const modSample = await convertSamplerToMODSample(inst, importMetadata);
      modSamples.push(modSample);
    } else {
      modSamples.push(createEmptySample());
    }

    // Check for instrument effects
    if (inst.effects && inst.effects.length > 0) {
      warnings.push(`Instrument "${inst.name}" has effects that will be lost (MOD doesn't support effect chains).`);
    }
  }

  // Fill up to 31 samples if needed
  while (modSamples.length < 31) {
    modSamples.push(createEmptySample());
  }

  // Convert patterns
  const modPatterns: MODPatternData[] = patterns.map((pattern, idx) =>
    convertPatternToMOD(pattern, channelCount, idx, warnings)
  );

  // Build pattern order table
  const patternOrderTable = Array.from({ length: 128 }, (_, i) => i < patterns.length ? i : 0);

  // Build MOD file
  const modData = buildMODFile({
    title: moduleName,
    samples: modSamples,
    patterns: modPatterns,
    songLength: patterns.length,
    formatTag,
    patternOrderTable,
  });

  const blob = new Blob([modData], { type: 'application/octet-stream' });
  
  // Prevent overwriting original file by appending _export
  let safeName = moduleName.replace(/[^a-zA-Z0-9]/g, '_');
  if (!safeName.toLowerCase().endsWith('_export')) {
    safeName += '_export';
  }
  const filename = `${safeName}.mod`;

  return {
    data: blob,
    warnings,
    filename,
  };
}

/**
 * MOD Sample data structure
 */
interface MODSampleData {
  name: string; // 22 chars
  length: number; // In words (2 bytes)
  finetune: number; // 0-15 (represents -8 to +7)
  volume: number; // 0-64
  loopStart: number; // In words
  loopLength: number; // In words
  pcmData: Int8Array; // 8-bit signed PCM
}

/**
 * MOD Pattern data structure
 */
interface MODPatternData {
  rows: MODNoteData[][];
}

/**
 * MOD Note data structure
 */
interface MODNoteData {
  period: number; // Amiga period (0 = no note)
  instrument: number; // 1-31 (0 = no instrument)
  effect: number; // Effect command 0-F
  effectParam: number; // Effect parameter 0-FF
}

/**
 * Amiga period table for notes
 * Period = base period for C-2 / (2 ^ (note / 12))
 * Standard range: C-1 to B-3 (periods 856-113)
 * Extended range: C-0 to B-5 (periods 1712-28)
 */
const AMIGA_PERIODS: { [key: string]: number } = {
  // Octave 0
  'C-0': 1712, 'C#0': 1616, 'D-0': 1525, 'D#0': 1440, 'E-0': 1357, 'F-0': 1281,
  'F#0': 1209, 'G-0': 1141, 'G#0': 1077, 'A-0': 1017, 'A#0': 961, 'B-0': 907,
  // Octave 1
  'C-1': 856, 'C#1': 808, 'D-1': 762, 'D#1': 720, 'E-1': 678, 'F-1': 640,
  'F#1': 604, 'G-1': 570, 'G#1': 538, 'A-1': 508, 'A#1': 480, 'B-1': 453,
  // Octave 2
  'C-2': 428, 'C#2': 404, 'D-2': 381, 'D#2': 360, 'E-2': 339, 'F-2': 320,
  'F#2': 302, 'G-2': 285, 'G#2': 269, 'A-2': 254, 'A#2': 240, 'B-2': 226,
  // Octave 3
  'C-3': 214, 'C#3': 202, 'D-3': 190, 'D#3': 180, 'E-3': 170, 'F-3': 160,
  'F#3': 151, 'G-3': 143, 'G#3': 135, 'A-3': 127, 'A#3': 120, 'B-3': 113,
  // Octave 4 (Extended)
  'C-4': 107, 'C#4': 101, 'D-4': 95, 'D#4': 90, 'E-4': 85, 'F-4': 80,
  'F#4': 75, 'G-4': 71, 'G#4': 67, 'A-4': 63, 'A#4': 60, 'B-4': 56,
  // Octave 5 (Extended)
  'C-5': 53, 'C#5': 50, 'D-5': 47, 'D#5': 45, 'E-5': 42, 'F-5': 40,
  'F#5': 37, 'G-5': 35, 'G#5': 33, 'A-5': 31, 'A#5': 30, 'B-5': 28,
};

/**
 * Convert note name to Amiga period
 */
function noteToPeriod(noteName: string): number {
  return AMIGA_PERIODS[noteName] || 0;
}

/**
 * Convert DEViLBOX pattern to MOD pattern (64 rows fixed)
 */
function convertPatternToMOD(
  pattern: Pattern,
  channelCount: number,
  patternIndex: number,
  warnings: string[]
): MODPatternData {
  const rows: MODNoteData[][] = [];

  // MOD patterns are always 64 rows
  for (let row = 0; row < 64; row++) {
    const rowNotes: MODNoteData[] = [];

    for (let ch = 0; ch < channelCount; ch++) {
      const cell = pattern.channels[ch]?.rows[row];

      if (!cell || row >= pattern.length) {
        // Empty cell or beyond pattern length
        rowNotes.push({ period: 0, instrument: 0, effect: 0, effectParam: 0 });
        continue;
      }

      const modNote = convertCellToMODNote(cell, warnings);
      rowNotes.push(modNote);
    }

    rows.push(rowNotes);
  }

  // Warn if pattern is longer than 64 rows
  if (pattern.length > 64) {
    warnings.push(`Pattern ${patternIndex} has ${pattern.length} rows but MOD supports max 64. Extra rows truncated.`);
  }

  return { rows };
}

/**
 * Convert TrackerCell to MOD note
 */
function convertCellToMODNote(cell: TrackerCell, warnings: string[]): MODNoteData {
  // Convert note to period
  let period = 0;
  // Skip empty (0) and note-off (97)
  if (cell.note && cell.note !== 0 && cell.note !== 97) {
    // Convert XM note to string for period lookup
    const noteStr = xmNoteToString(cell.note);
    period = noteToPeriod(noteStr);
    if (period === 0) {
      // Note out of range for Amiga period table
      warnings.push(`Note ${noteStr} is out of range for MOD format (C-0 to B-5 supported).`);
    }
  }

  // Note off (97) in MOD is done with EC0 effect (note cut at tick 0)
  if (cell.note === 97) {
    return { period: 0, instrument: 0, effect: 0xC, effectParam: 0x00 };
  }

  // Instrument (1-31)
  const instrument = cell.instrument || 0;

  // Get effect (already in numeric XM format)
  let effect = cell.effTyp || 0;
  let effectParam = cell.eff || 0;

  // MOD only supports effects 0-F
  if (effect > 0xF && effect !== 0) {
    warnings.push(`Effect ${effect.toString(16).toUpperCase()}${effectParam.toString(16).padStart(2, '0')} is not supported in MOD format (only 0-F).`);
    effect = 0;
    effectParam = 0;
  }

  // MOD doesn't support effect2 or volume column
  if (cell.effect2) {
    warnings.push(`Effect2 column not supported in MOD format (will be lost).`);
  }

  // XM volume column: 0x00-0x0F = nothing, 0x10-0x50 = set volume 0-64, 0x60+ = effects
  if (cell.volume > 0x0F) {
    // Volume must be set via Cxx command in MOD
    // If we have a volume but no effect, use Cxx
    if (effect === 0 && effectParam === 0) {
      // Convert XM volume (0x10-0x50) to MOD volume (0-64)
      const modVolume = cell.volume >= 0x10 && cell.volume <= 0x50
        ? cell.volume - 0x10
        : Math.min(cell.volume, 0x40);
      effect = 0xC;
      effectParam = modVolume;
    } else {
      warnings.push(`Volume column not supported in MOD (use Cxx effect).`);
    }
  }

  return {
    period,
    instrument,
    effect,
    effectParam,
  };
}


/**
 * Convert Sampler instrument to MOD sample
 */
async function convertSamplerToMODSample(
  inst: InstrumentConfig,
  importMetadata?: ImportMetadata
): Promise<MODSampleData> {
  // Check if we have preserved original sample from MOD import
  const originalSample = importMetadata?.originalSamples?.[inst.id];

  if (originalSample && originalSample.bitDepth === 8) {
    // Use preserved original 8-bit sample (lossless)
    return {
      name: originalSample.name.substring(0, 22),
      length: Math.floor(originalSample.length / 2), // Convert frames to words
      finetune: (originalSample.finetune + 8) & 0x0F, // Convert -8 to +7 → 0 to 15
      volume: originalSample.volume,
      loopStart: Math.floor(originalSample.loopStart / 2),
      loopLength: originalSample.loopType === 'none' ? 1 : Math.floor(originalSample.loopLength / 2),
      pcmData: new Int8Array(originalSample.pcmData),
    };
  }

  // No preserved 8-bit sample available
  return createEmptySample(inst.name);
}

/**
 * Create empty MOD sample
 */
function createEmptySample(name: string = ''): MODSampleData {
  return {
    name: name.substring(0, 22),
    length: 0,
    finetune: 0,
    volume: 64,
    loopStart: 0,
    loopLength: 1, // MOD spec: minimum loop length is 1 word
    pcmData: new Int8Array(0),
  };
}

/**
 * Build MOD file from components
 */
function buildMODFile(config: {
  title: string;
  samples: MODSampleData[];
  patterns: MODPatternData[];
  songLength: number;
  formatTag: string;
  patternOrderTable: number[];
}): ArrayBuffer {
  // Calculate total size
  const headerSize = 1084; // Title + 31 samples + length + restart + order + tag
  const patternSize = config.patterns.length * 1024; // 64 rows * 4 channels * 4 bytes
  const sampleDataSize = config.samples.reduce((sum, s) => sum + s.pcmData.length, 0);

  const buffer = new Uint8Array(headerSize + patternSize + sampleDataSize);
  // const view = new DataView(buffer.buffer); // Reserved for future use
  let offset = 0;

  // Write title (20 bytes)
  writeString(buffer, offset, config.title, 20);
  offset += 20;

  // Write 31 sample headers (30 bytes each)
  for (const sample of config.samples) {
    writeSampleHeader(buffer, offset, sample);
    offset += 30;
  }

  // Write song length (1 byte)
  buffer[offset++] = Math.min(config.songLength, 128);

  // Write restart position (1 byte) - usually 127 (unused)
  buffer[offset++] = 127;

  // Write pattern order table (128 bytes)
  for (let i = 0; i < 128; i++) {
    buffer[offset++] = config.patternOrderTable[i];
  }

  // Write format tag (4 bytes)
  writeString(buffer, offset, config.formatTag, 4);
  offset += 4;

  // Write patterns
  for (const pattern of config.patterns) {
    writePattern(buffer, offset, pattern);
    offset += 1024; // Each pattern is 1024 bytes (64 rows * 4 channels * 4 bytes)
  }

  // Write sample data
  for (const sample of config.samples) {
    if (sample.pcmData.length > 0) {
      buffer.set(new Uint8Array(sample.pcmData.buffer), offset);
      offset += sample.pcmData.length;
    }
  }

  return buffer.buffer;
}

/**
 * Write MOD sample header (30 bytes)
 */
function writeSampleHeader(buffer: Uint8Array, offset: number, sample: MODSampleData): void {
  const view = new DataView(buffer.buffer);

  // Sample name (22 bytes)
  writeString(buffer, offset, sample.name, 22);
  offset += 22;

  // Sample length in words (2 bytes, big-endian!)
  view.setUint16(offset, sample.length, false);
  offset += 2;

  // Finetune (1 byte, 0-15)
  buffer[offset++] = sample.finetune & 0x0F;

  // Volume (1 byte, 0-64)
  buffer[offset++] = Math.min(sample.volume, 64);

  // Loop start in words (2 bytes, big-endian!)
  view.setUint16(offset, sample.loopStart, false);
  offset += 2;

  // Loop length in words (2 bytes, big-endian!)
  view.setUint16(offset, Math.max(sample.loopLength, 1), false);
}

/**
 * Write MOD pattern (1024 bytes = 64 rows * 4 channels * 4 bytes/note)
 */
function writePattern(buffer: Uint8Array, offset: number, pattern: MODPatternData): void {
  // const view = new DataView(buffer.buffer); // Reserved for future use

  for (const row of pattern.rows) {
    for (const note of row) {
      // Pack note into 4 bytes
      // Byte 0: aaaaBBBB (upper 4 bits of period + upper 4 bits of instrument)
      // Byte 1: CCCCCCCC (lower 8 bits of period)
      // Byte 2: DDDDeeee (lower 4 bits of instrument + effect)
      // Byte 3: ffffffff (effect parameter)

      const periodHigh = (note.period >> 8) & 0x0F;
      const periodLow = note.period & 0xFF;
      const instHigh = (note.instrument >> 4) & 0x0F;
      const instLow = note.instrument & 0x0F;

      buffer[offset++] = (periodHigh << 4) | instHigh;
      buffer[offset++] = periodLow;
      buffer[offset++] = (instLow << 4) | (note.effect & 0x0F);
      buffer[offset++] = note.effectParam & 0xFF;
    }
  }
}

/**
 * Write string to buffer (space-padded or null-padded)
 */
function writeString(buffer: Uint8Array, offset: number, str: string, maxLength: number): void {
  for (let i = 0; i < maxLength; i++) {
    buffer[offset + i] = i < str.length ? str.charCodeAt(i) : 0;
  }
}
