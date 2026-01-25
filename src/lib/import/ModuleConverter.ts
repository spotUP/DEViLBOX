/**
 * ModuleConverter - Converts MOD/XM/IT data to our Pattern format
 * Supports both libopenmpt (legacy) and native parsers (XM/MOD)
 */

import type { Pattern, TrackerCell, ChannelData, ImportMetadata } from '@typedefs';
import type { RawSongData, RawPatternCell } from './ModuleLoader';
import type { XMNote } from './formats/XMParser';
import type { MODNote } from './formats/MODParser';
import { convertMODEffect } from './formats/MODParser';
import { periodToXMNote, effectStringToXM } from '@/lib/xmConversions';

/**
 * Convert ArrayBuffer to base64 string
 * Uses chunked processing to avoid stack overflow on large files
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000; // 32KB chunks to avoid call stack issues
  const chunks: string[] = [];

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    chunks.push(String.fromCharCode.apply(null, chunk as unknown as number[]));
  }

  return btoa(chunks.join(''));
}

/**
 * Convert a raw pattern cell to our TrackerCell format (libopenmpt legacy)
 */
function convertCell(rawCell: RawPatternCell): TrackerCell {
  const [noteNum, instrument, _volumeEffect, effectType, volume, parameter] = rawCell;

  // Convert note number to XM format
  let xmNote = 0;
  if (noteNum > 0 && noteNum <= 120) {
    // Note 1 = C-0, Note 13 = C-1, etc.
    // libopenmpt reports 1 octave higher, so subtract 12
    xmNote = Math.max(1, noteNum - 12);
  } else if (noteNum === 254 || noteNum === 255) {
    xmNote = 97; // Note off
  }

  // Convert volume to XM format (0x10-0x50 = volume 0-64)
  const xmVolume = volume > 0 ? Math.min(0x10 + Math.min(volume, 64), 0x50) : 0;

  const cell: TrackerCell = {
    note: xmNote,
    instrument: instrument > 0 ? instrument : 0,
    volume: xmVolume,
    effTyp: effectType,
    eff: parameter,
  };

  return cell;
}

/**
 * Convert XM note to TrackerCell (native XM parser)
 * Direct 1:1 mapping - XM format is now our native format
 */
function convertXMNote(xmNote: XMNote): TrackerCell {
  // XM notes are already in the correct format (0 = empty, 1-96 = notes, 97 = note off)
  const note = xmNote.note;

  // XM effects are already in the correct format (effTyp 0-35, eff 0x00-0xFF)
  const effTyp = xmNote.effectType;
  const eff = xmNote.effectParam;

  // XM volume column is already in the correct format (0x00-0xFF)
  const volume = xmNote.volume;

  // XM instrument numbers are 1-indexed (0 = no instrument, 1-128 = valid)
  const instrument = xmNote.instrument;

  // Legacy effect2 field - can be used for volume column effects if needed
  let effect2: string | undefined = undefined;
  if (volume >= 0x60) {
    // Volume column effect - optionally store as effect2 string for compatibility
    const converted = convertVolumeColumnEffect(volume);
    effect2 = converted !== null ? converted : undefined;
  }

  return {
    note,
    instrument,
    volume,
    effTyp,
    eff,
    effect2,
  };
}

/**
 * Convert XM volume column to effect string
 */
function convertVolumeColumnEffect(volumeByte: number): string | null {
  const type = volumeByte >> 4;
  const param = volumeByte & 0x0F;

  switch (type) {
    case 0x6: // Volume slide down
      return `A0${param.toString(16).toUpperCase()}`;
    case 0x7: // Volume slide up
      return `A${param.toString(16).toUpperCase()}0`;
    case 0x8: // Fine volume down
      return `EB${param.toString(16).toUpperCase()}`;
    case 0x9: // Fine volume up
      return `EA${param.toString(16).toUpperCase()}`;
    case 0xB: // Vibrato (depth)
      return `40${param.toString(16).toUpperCase()}`;
    case 0xC: // Set panning
      return `8${(param * 17).toString(16).toUpperCase().padStart(2, '0')}`;
    case 0xD: // Panning slide left
      return `P0${param.toString(16).toUpperCase()}`; // Custom panning slide
    case 0xE: // Panning slide right
      return `P${param.toString(16).toUpperCase()}0`; // Custom panning slide
    case 0xF: // Tone portamento
      const speed = param > 0 ? param * 16 : 0;
      return `3${speed.toString(16).toUpperCase().padStart(2, '0')}`;
    default:
      return null;
  }
}

/**
 * Convert MOD note to TrackerCell (native MOD parser)
 * MOD instruments are 1-31, mapped directly to XM range (1-31)
 */
function convertMODNote(modNote: MODNote): TrackerCell {
  // Convert Amiga period to XM note number (0 = empty, 1-96 = notes)
  const note = periodToXMNote(modNote.period);

  // MOD instrument numbers are 1-31 (1-indexed, like XM)
  // 0 = no instrument
  const instrument = modNote.instrument;

  // MOD doesn't have volume column
  const volume = 0;

  // Convert MOD effect to XM effect format
  const effectStr = convertMODEffect(modNote.effect, modNote.effectParam);
  const [effTyp, eff] = effectStr ? effectStringToXM(effectStr) : [0, 0];

  return {
    note,
    instrument,
    volume,
    effTyp,
    eff,
    period: modNote.period, // Store raw period for accurate playback
  };
}

/**
 * Convert raw song data to our Pattern[] format
 */
export function convertSongToPatterns(song: RawSongData): Pattern[] {
  if (!song.patterns || song.patterns.length === 0) {
    return [];
  }

  const patterns: Pattern[] = [];
  const numChannels = song.channels.length;

  // Convert each pattern
  for (let patIdx = 0; patIdx < song.patterns.length; patIdx++) {
    const rawPattern = song.patterns[patIdx];
    const numRows = rawPattern.rows.length;

    if (numRows === 0) continue;

    // Create channel data structures
    const channels: ChannelData[] = [];

    for (let chIdx = 0; chIdx < numChannels; chIdx++) {
      const channelName = song.channels[chIdx] || `Channel ${chIdx + 1}`;

      // Extract rows for this channel
      const rows: TrackerCell[] = [];

      // Track the most recently used instrument in this channel
      let lastInstrument: number | null = null;

      for (let rowIdx = 0; rowIdx < numRows; rowIdx++) {
        const rawRow = rawPattern.rows[rowIdx];
        if (rawRow && rawRow[chIdx]) {
          const cell = convertCell(rawRow[chIdx] as RawPatternCell);

          // Track last used instrument for this channel (0 = no instrument in XM format)
          if (cell.instrument !== 0) {
            lastInstrument = cell.instrument;
          }

          rows.push(cell);
        } else {
          // Empty cell (XM format)
          rows.push({
            note: 0,
            instrument: 0,
            volume: 0,
            effTyp: 0,
            eff: 0,
          });
        }
      }

      // Find the first instrument used in this channel, or default to 1
      // Default to instrument 1 if none was used in this channel (0 = no instrument)
      const defaultInstrument = lastInstrument !== null && lastInstrument !== 0 ? lastInstrument : 1;

      channels.push({
        id: `import-ch-${patIdx}-${chIdx}-${Date.now()}`,
        name: channelName || `Ch ${chIdx + 1}`,
        rows,
        muted: false,
        solo: false,
        volume: 80,
        pan: 0,
        instrumentId: defaultInstrument,
        color: null,
      });
    }

    const patternName = rawPattern.name || `Pattern ${patIdx}`;

    patterns.push({
      id: `import-pat-${patIdx}-${Date.now()}`,
      name: patternName,
      length: numRows,
      channels,
    });
  }

  return patterns;
}

/**
 * Get the order sequence (which patterns to play in which order)
 */
export function getPatternOrder(song: RawSongData): number[] {
  if (!song.orders) return [];
  return song.orders.map((order) => order.pat);
}

/**
 * Get instrument names for display
 */
export function getInstrumentNames(song: RawSongData): string[] {
  return song.instruments || [];
}

/**
 * Get sample names for display
 */
export function getSampleNames(song: RawSongData): string[] {
  return song.samples || [];
}

export interface ConversionResult {
  patterns: Pattern[];
  order: number[];
  instrumentNames: string[];
  sampleNames: string[];
  channelCount: number;
  metadata?: ImportMetadata;
  // Original module data for libopenmpt playback (sample-accurate effects)
  originalModuleData?: {
    base64: string;             // Base64-encoded original file
    format: 'MOD' | 'XM' | 'IT' | 'S3M' | 'UNKNOWN';
    sourceFile?: string;        // Original filename
  };
}

/**
 * Full conversion of raw song data
 * Expands patterns according to song order (each song position becomes a pattern)
 */
export function convertModule(song: RawSongData): ConversionResult {
  const uniquePatterns = convertSongToPatterns(song);
  const order = getPatternOrder(song);

  // Expand patterns according to song order
  // Each song position references a pattern - we create a copy for each position
  let expandedPatterns: Pattern[];

  if (order.length > 0) {
    expandedPatterns = order.map((patternIndex, songPos) => {
      const sourcePattern = uniquePatterns[patternIndex];
      if (!sourcePattern) {
        console.warn(`[ModuleConverter] Order references missing pattern ${patternIndex}`);
        return uniquePatterns[0]; // Fallback to first pattern
      }

      // Create a copy with unique ID and position-based name
      return {
        ...sourcePattern,
        id: `import-pos-${songPos}-pat-${patternIndex}-${Date.now()}`,
        name: `${String(songPos).padStart(2, '0')}: ${sourcePattern.name}`,
        // Deep copy channels to avoid shared references
        channels: sourcePattern.channels.map(ch => ({
          ...ch,
          id: `${ch.id}-pos-${songPos}`,
          rows: [...ch.rows],
        })),
      };
    });
  } else {
    // No order defined, use patterns as-is
    expandedPatterns = uniquePatterns;
  }

  return {
    patterns: expandedPatterns,
    order: order,
    instrumentNames: getInstrumentNames(song),
    sampleNames: getSampleNames(song),
    channelCount: song.channels?.length || 4,
  };
}

/**
 * Convert XM file using native parser
 */
export function convertXMModule(
  patterns: XMNote[][][],
  channelCount: number,
  metadata: ImportMetadata,
  instrumentNames: string[],
  originalBuffer?: ArrayBuffer
): ConversionResult {
  const convertedPatterns: Pattern[] = [];

  // Convert each pattern
  for (let patIdx = 0; patIdx < patterns.length; patIdx++) {
    const xmPattern = patterns[patIdx];
    const numRows = xmPattern.length;

    // Create channel data structures
    const channels: ChannelData[] = [];

    for (let chIdx = 0; chIdx < channelCount; chIdx++) {
      const rows: TrackerCell[] = [];

      // Track last used instrument
      let lastInstrument: number | null = null;

      for (let rowIdx = 0; rowIdx < numRows; rowIdx++) {
        const xmNote = xmPattern[rowIdx]?.[chIdx];
        if (xmNote) {
          const cell = convertXMNote(xmNote);
          if (cell.instrument !== null) {
            lastInstrument = cell.instrument;
          }
          rows.push(cell);
        } else {
          rows.push({
            note: 0,
            instrument: 0,
            volume: 0,
            effTyp: 0,
            eff: 0,
          });
        }
      }

      // Default to first instrument (ID 0) if none was used in this channel
      const defaultInstrument = lastInstrument !== null ? lastInstrument : 0;

      channels.push({
        id: `xm-ch-${patIdx}-${chIdx}-${Date.now()}`,
        name: metadata.modData?.channelNames[chIdx] || `Channel ${chIdx + 1}`,
        rows,
        muted: false,
        solo: false,
        volume: 80,
        pan: 0,
        instrumentId: defaultInstrument,
        color: null,
        channelMeta: {
          importedFromMOD: true,
          originalIndex: chIdx,
          channelType: 'sample',
        },
      });
    }

    convertedPatterns.push({
      id: `xm-pat-${patIdx}-${Date.now()}`,
      name: `Pattern ${patIdx}`,
      length: numRows,
      channels,
      importMetadata: metadata,
    });
  }

  // Build pattern order from metadata (NOT sequential!)
  // XM files use a pattern order table - patterns can repeat
  // e.g., patternOrderTable = [0, 1, 0, 2] means pattern 0 plays twice
  const order = metadata.modData?.patternOrderTable ||
    Array.from({ length: convertedPatterns.length }, (_, i) => i);

  // Store original module data for libopenmpt playback if provided
  let originalModuleData: ConversionResult['originalModuleData'];
  if (originalBuffer) {
    originalModuleData = {
      base64: arrayBufferToBase64(originalBuffer),
      format: 'XM',
      sourceFile: metadata.sourceFile,
    };
  }

  return {
    patterns: convertedPatterns,
    order,
    instrumentNames,
    sampleNames: instrumentNames,
    channelCount,
    metadata,
    originalModuleData,
  };
}

/**
 * Convert MOD file using native parser
 */
export function convertMODModule(
  patterns: MODNote[][][],
  channelCount: number,
  metadata: ImportMetadata,
  instrumentNames: string[],
  originalBuffer?: ArrayBuffer
): ConversionResult {
  const convertedPatterns: Pattern[] = [];

  // Convert each pattern
  for (let patIdx = 0; patIdx < patterns.length; patIdx++) {
    const modPattern = patterns[patIdx];

    // Create channel data structures
    const channels: ChannelData[] = [];

    for (let chIdx = 0; chIdx < channelCount; chIdx++) {
      const rows: TrackerCell[] = [];

      // Track last used instrument
      let lastInstrument: number | null = null;

      for (let rowIdx = 0; rowIdx < 64; rowIdx++) {
        const modNote = modPattern[rowIdx]?.[chIdx];
        if (modNote) {
          const cell = convertMODNote(modNote);
          if (cell.instrument !== null) {
            lastInstrument = cell.instrument;
          }
          rows.push(cell);
        } else {
          rows.push({
            note: 0,
            instrument: 0,
            volume: 0,
            effTyp: 0,
            eff: 0,
          });
        }
      }

      // Default to first instrument (ID 0) if none was used in this channel
      const defaultInstrument = lastInstrument !== null ? lastInstrument : 0;

      channels.push({
        id: `mod-ch-${patIdx}-${chIdx}-${Date.now()}`,
        name: metadata.modData?.channelNames[chIdx] || `Channel ${chIdx + 1}`,
        rows,
        muted: false,
        solo: false,
        volume: 80,
        pan: 0,
        instrumentId: defaultInstrument,
        color: null,
        channelMeta: {
          importedFromMOD: true,
          originalIndex: chIdx,
          channelType: 'sample',
        },
      });
    }

    convertedPatterns.push({
      id: `mod-pat-${patIdx}-${Date.now()}`,
      name: `Pattern ${patIdx}`,
      length: 64, // MOD patterns are always 64 rows
      channels,
      importMetadata: metadata,
    });
  }

  // Build pattern order from metadata (NOT sequential!)
  // MOD files use a pattern order table - patterns can repeat
  // e.g., patternOrderTable = [0, 1, 0, 2] means pattern 0 plays twice
  const order = metadata.modData?.patternOrderTable ||
    Array.from({ length: convertedPatterns.length }, (_, i) => i);

  console.log('[ModuleConverter] Pattern order from metadata:', {
    hasModData: !!metadata.modData,
    patternOrderTable: metadata.modData?.patternOrderTable,
    songLength: metadata.modData?.songLength,
    resultOrder: order,
  });

  // Store original module data for libopenmpt playback if provided
  let originalModuleData: ConversionResult['originalModuleData'];
  if (originalBuffer) {
    originalModuleData = {
      base64: arrayBufferToBase64(originalBuffer),
      format: 'MOD',
      sourceFile: metadata.sourceFile,
    };
  }

  return {
    patterns: convertedPatterns,
    order,
    instrumentNames,
    sampleNames: instrumentNames,
    channelCount,
    metadata,
    originalModuleData,
  };
}
