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
}

// ─── Cell Offset Calculation ──────────────────────────────────────────────────

/**
 * Compute the file byte offset of a specific cell within the pattern data.
 * Assumes row-major layout: for each row, iterate all channels.
 */
export function getCellFileOffset(
  layout: UADEPatternLayout,
  pattern: number,
  row: number,
  channel: number,
): number {
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
