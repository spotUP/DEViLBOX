/**
 * ModuleConverter - Converts libopenmpt raw song data to our Pattern format
 */

import type { Pattern, TrackerCell, ChannelData } from '@typedefs';
import type { RawSongData, RawPatternCell } from './ModuleLoader';

// Note names for conversion
const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

// Effect command letters (FT2/IT style)
const EFFECT_LETTERS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Convert libopenmpt note number to note string
 * libopenmpt notes: 0=empty, 1-120=C-0 to B-9, 254=note cut, 255=note off
 *
 * Note: libopenmpt reports Amiga MOD notes 2 octaves higher than traditional
 * tracker notation (C-4 in ProTracker = C-6 in libopenmpt), so we subtract 2.
 */
function convertNote(noteNum: number): string | null {
  if (noteNum === 0) return null; // No note
  if (noteNum === 254 || noteNum === 255) return '==='; // Note off/cut
  if (noteNum < 1 || noteNum > 120) return null; // Invalid

  // Note 1 = C-0, Note 13 = C-1, etc.
  const semitone = (noteNum - 1) % 12;
  let octave = Math.floor((noteNum - 1) / 12);

  // Adjust for Amiga MOD octave offset (libopenmpt reports 1 octave higher)
  octave = Math.max(0, octave - 1);

  return `${NOTE_NAMES[semitone]}${octave}`;
}

/**
 * Convert libopenmpt effect to effect string
 * Format: XYY where X is effect letter, YY is hex parameter
 */
function convertEffect(effectType: number, parameter: number): string | null {
  if (effectType === 0 && parameter === 0) return null; // No effect

  // Effect type 0-35 maps to 0-9, A-Z
  const effectLetter = effectType < EFFECT_LETTERS.length
    ? EFFECT_LETTERS[effectType]
    : '?';

  // Format parameter as 2-digit hex
  const paramHex = parameter.toString(16).toUpperCase().padStart(2, '0');

  return `${effectLetter}${paramHex}`;
}

/**
 * Convert a raw pattern cell to our TrackerCell format
 */
function convertCell(rawCell: RawPatternCell): TrackerCell {
  const [noteNum, instrument, _volumeEffect, effectType, volume, parameter] = rawCell;

  const cell: TrackerCell = {
    note: convertNote(noteNum),
    instrument: instrument > 0 ? instrument : null,
    volume: volume > 0 ? Math.min(volume, 64) : null, // Volume column (0-64)
    effect: convertEffect(effectType, parameter),
  };

  return cell;
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

          // Track last used instrument for this channel
          if (cell.instrument !== null) {
            lastInstrument = cell.instrument;
          }

          rows.push(cell);
        } else {
          rows.push({
            note: null,
            instrument: null,
            volume: null,
            effect: null,
          });
        }
      }

      // Find the first instrument used in this channel, or default to 1
      const defaultInstrument = lastInstrument !== null ? lastInstrument : 1;

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
