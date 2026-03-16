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

  /** Total number of patterns */
  numPatterns: number;

  /** Rows per pattern (usually 64, but may vary per pattern) */
  rowsPerPattern: number | number[];

  /** Size of module binary in bytes (for export) */
  moduleSize: number;

  /** The variable-length encoder */
  encoder: VariableLengthEncoder;

  /**
   * Per-pattern, per-channel chip RAM addresses where each channel's
   * pattern data starts.  patternAddrs[patIdx][chIdx] = file byte offset.
   * Used to write re-encoded data back to the correct location.
   */
  patternAddrs: number[][];

  /**
   * Per-pattern, per-channel original byte sizes.
   * originalSizes[patIdx][chIdx] = byte count of the original encoded data.
   * Used for overflow detection: re-encoded data must fit within this limit.
   */
  originalSizes: number[][];
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
