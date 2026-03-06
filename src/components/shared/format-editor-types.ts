/**
 * Format-agnostic pattern editor types.
 *
 * Provides a column-driven abstraction for pattern editing across different file formats.
 * Formats define their columns (note, hex, ctrl) and rendering behavior.
 */

export type ColumnType = 'note' | 'hex' | 'ctrl';

/**
 * Definition for a single column in the pattern editor.
 * Drives rendering, keyboard input, and value formatting.
 */
export interface ColumnDef {
  /** Unique key matching properties in FormatCell */
  key: string;
  /** Display label in header (e.g. "Note", "Ins", "Cmd") */
  label: string;
  /** Width in monospace characters (e.g. 3 for "C-4") */
  charWidth: number;
  /** Text color when cell has a value */
  color: string;
  /** Text color when cell is empty */
  emptyColor: string;
  /** Sentinel value marking "empty" (0xFF, 0, etc.) */
  emptyValue: number | undefined;
  /** Column type drives keyboard entry behavior */
  type: ColumnType;
  /** For type='hex': number of hex digits (1, 2, or 4) */
  hexDigits?: number;
  /** Function to format a value for display */
  formatter: (value: number) => string;
}

/**
 * A single cell in the pattern editor.
 * Maps column keys to their values.
 * Values should match the column's emptyValue when empty.
 */
export type FormatCell = Record<string, number>;

/**
 * A channel (track) of pattern data.
 * Contains sequence of cells (rows) and metadata.
 */
export interface FormatChannel {
  /** Display label (e.g. "CH01:P003" for klystrack) */
  label: string;
  /** Number of rows in this pattern */
  patternLength: number;
  /** Rows of pattern data, indexed by step number */
  rows: FormatCell[];
}

/**
 * Change callback for the pattern editor.
 * Called when user modifies a cell.
 */
export type OnCellChange = (
  channelIdx: number,
  rowIdx: number,
  columnKey: string,
  value: number
) => void;
