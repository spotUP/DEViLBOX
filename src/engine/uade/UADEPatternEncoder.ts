/**
 * UADEPatternEncoder — Generic interface for encoding pattern cells back to
 * native binary format, enabling live pattern editing via chip RAM patching.
 *
 * Each format provides an encoder that reverses its parser's cell decoding.
 * The encoder is registered by format name and attached to TrackerSong as
 * `uadePatternLayout` so the pattern editor can write edits back to chip RAM.
 *
 * Architecture:
 *   User edits cell → encodeCell(cell) → binary bytes
 *   → compute chip RAM address: moduleBase + patternDataFileOffset + cellOffset
 *   → UADEChipEditor.writeBytes(addr, bytes)
 *   → 68k replayer reads modified data on next tick
 *   → exportModule() captures all edits automatically
 */

import type { TrackerCell } from '@/types';

// ─── Pattern Layout Descriptor ────────────────────────────────────────────────

export interface UADEPatternLayout {
  /** Format identifier (e.g., 'chuckBiscuits', 'soundfx', 'dsm') */
  formatId: string;

  /** File byte offset where pattern data section begins */
  patternDataFileOffset: number;

  /** Bytes per pattern cell (e.g., 5 for ChuckBiscuits, 4 for SoundFX) */
  bytesPerCell: number;

  /** Rows per pattern (usually 64) */
  rowsPerPattern: number;

  /** Number of channels in the module */
  numChannels: number;

  /** Total number of patterns */
  numPatterns: number;

  /** Size of module binary in bytes (for export) */
  moduleSize: number;

  /**
   * Encode a TrackerCell back to native binary bytes.
   * Returns a Uint8Array of exactly `bytesPerCell` length.
   */
  encodeCell: (cell: TrackerCell) => Uint8Array;

  /**
   * Decode native binary bytes back to a TrackerCell.
   * Inverse of encodeCell. Used by the chip RAM pattern reader to populate
   * pattern display after UADE loads a packed/compiled module.
   * If not provided, the format's parser is responsible for populating patterns.
   */
  decodeCell?: (bytes: Uint8Array) => TrackerCell;

  /**
   * Optional custom offset calculation for formats with non-standard layouts
   * (e.g., track indirection, IFF chunks with per-pattern offsets).
   * If provided, overrides the default row-major offset calculation.
   * Returns the file byte offset for the given cell.
   */
  getCellFileOffset?: (pattern: number, row: number, channel: number) => number;
}

// ─── Cell Offset Calculation ──────────────────────────────────────────────────

/**
 * Compute the file byte offset of a specific cell within the pattern data.
 * Uses custom offset function if provided, otherwise assumes row-major layout.
 */
export function getCellFileOffset(
  layout: UADEPatternLayout,
  pattern: number,
  row: number,
  channel: number,
): number {
  if (layout.getCellFileOffset) {
    return layout.getCellFileOffset(pattern, row, channel);
  }
  const patternByteSize = layout.rowsPerPattern * layout.numChannels * layout.bytesPerCell;
  return layout.patternDataFileOffset
    + pattern * patternByteSize
    + row * layout.numChannels * layout.bytesPerCell
    + channel * layout.bytesPerCell;
}

/**
 * Compute the chip RAM address of a specific cell.
 * moduleBase is read from chip RAM at address 0x100 (SCORE_MODULE_ADDR).
 */
export function getCellChipRamAddr(
  layout: UADEPatternLayout,
  moduleBase: number,
  pattern: number,
  row: number,
  channel: number,
): number {
  return moduleBase + getCellFileOffset(layout, pattern, row, channel);
}

// ─── Standard MOD Cell Decoder ────────────────────────────────────────────────

/** Amiga period table for standard MOD note decoding (C-1 to B-3, finetune 0) */
const MOD_PERIODS = [
  856,808,762,720,678,640,604,570,538,508,480,453,  // C-1..B-1
  428,404,381,360,339,320,302,285,269,254,240,226,  // C-2..B-2
  214,202,190,180,170,160,151,143,135,127,120,113,  // C-3..B-3
];

/** Convert Amiga period to tracker note (1-based, C-1=1). Returns 0 if no match. */
function periodToNote(period: number): number {
  if (period === 0) return 0;
  // Find closest period
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < MOD_PERIODS.length; i++) {
    const dist = Math.abs(MOD_PERIODS[i] - period);
    if (dist < bestDist) { bestDist = dist; best = i + 1; }
  }
  return bestDist <= 4 ? best : 0; // Allow ±4 tolerance for finetune
}

/**
 * Decode a standard 4-byte MOD cell from chip RAM bytes.
 * Format: [sample_hi:4|period_hi:12] [sample_lo:4|effect:4|param:8]
 * This covers: ProTracker, NoiseTracker, SoundTracker, and all MOD-compatible packers.
 */
export function decodeModCell(bytes: Uint8Array): TrackerCell {
  const b0 = bytes[0], b1 = bytes[1], b2 = bytes[2], b3 = bytes[3];
  const period = ((b0 & 0x0F) << 8) | b1;
  const instrument = (b0 & 0xF0) | ((b2 >> 4) & 0x0F);
  const effect = b2 & 0x0F;
  const param = b3;
  return {
    note: periodToNote(period) as TrackerCell['note'],
    instrument: (instrument || 0) as TrackerCell['instrument'],
    volume: 0 as TrackerCell['volume'],
    effTyp: effect as TrackerCell['effTyp'],
    eff: param as TrackerCell['eff'],
    effTyp2: 0 as TrackerCell['effTyp2'],
    eff2: 0 as TrackerCell['eff2'],
  };
}

// ─── Encoder Registry ─────────────────────────────────────────────────────────

type EncoderFactory = () => (cell: TrackerCell) => Uint8Array;

const encoderRegistry = new Map<string, EncoderFactory>();

/** Register a cell encoder for a format */
export function registerPatternEncoder(formatId: string, factory: EncoderFactory): void {
  encoderRegistry.set(formatId, factory);
}

/** Get a cell encoder for a format (returns undefined if not registered) */
export function getPatternEncoder(formatId: string): ((cell: TrackerCell) => Uint8Array) | undefined {
  const factory = encoderRegistry.get(formatId);
  return factory?.();
}

// ─── Variable-Length Encoder ──────────────────────────────────────────────────
// For formats where cell byte size varies (RLE, duration packing, optional fields).
// Instead of encoding one cell at a time, these encode an entire channel's pattern
// at once because byte boundaries depend on adjacent rows.

export interface VariableLengthEncoder {
  /** Format identifier */
  formatId: string;

  /**
   * Encode all rows of one channel's pattern into a native binary byte stream.
   * @param rows  All TrackerCells for this channel in the pattern
   * @param channel  Channel index (0-based)
   * @returns Encoded byte stream (variable length)
   */
  encodePattern(rows: TrackerCell[], channel: number): Uint8Array;
}

/**
 * Extended pattern layout for variable-length formats.
 * Uses `variableEncoder` for full-pattern re-serialization instead of
 * per-cell `encodeCell`.  Stores original per-pattern byte sizes for
 * overflow detection during edits.
 */
export interface UADEVariablePatternLayout {
  /** Format identifier */
  formatId: string;

  /** Number of channels in the module */
  numChannels: number;

  /** Total number of file-level patterns/tracks (NOT TrackerSong patterns) */
  numFilePatterns: number;

  /** Rows per pattern (usually 64, but may vary per pattern) */
  rowsPerPattern: number | number[];

  /** Size of module binary in bytes (for export) */
  moduleSize: number;

  /** The variable-length encoder */
  encoder: VariableLengthEncoder;

  /**
   * File byte offset where each file-level pattern's data starts.
   * filePatternAddrs[filePatIdx] = byte offset from file start.
   * These formats store single-channel patterns, so no per-channel dimension.
   */
  filePatternAddrs: number[];

  /**
   * Original byte sizes of each file-level pattern's encoded data.
   * filePatternSizes[filePatIdx] = byte count.
   * Re-encoded data must fit within this limit (overflow = reject edit).
   */
  filePatternSizes: number[];

  /**
   * Map from (TrackerSong patternIdx, channelIdx) → file-level pattern index.
   * trackMap[trackerPatIdx][chIdx] = filePatIdx.
   * Multiple tracker patterns may reference the same file pattern (shared tracks).
   * -1 means no track assigned (empty channel).
   */
  trackMap: number[][];
}

const variableEncoderRegistry = new Map<string, VariableLengthEncoder>();

/** Register a variable-length encoder for a format */
export function registerVariableEncoder(encoder: VariableLengthEncoder): void {
  variableEncoderRegistry.set(encoder.formatId, encoder);
}

/** Get a variable-length encoder for a format */
export function getVariableEncoder(formatId: string): VariableLengthEncoder | undefined {
  return variableEncoderRegistry.get(formatId);
}
