/**
 * Format-agnostic pattern editor types.
 *
 * Provides a column-driven abstraction for pattern editing across different file formats.
 * Formats define their columns (note, hex, ctrl) and rendering behavior.
 */

import type { ColumnSpec, PatternSnapshot, ChannelSnapshot, CellSnapshot } from '@engine/renderer/worker-types';

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
  /** Pixi tint color when cell has a value (hex number, e.g. 0x60e060) */
  pixiColor?: number;
  /** Pixi tint color when cell is empty */
  pixiEmptyColor?: number;
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
  /** Native track index (e.g. Hively track pool index) for insert/delete row operations */
  trackIndex?: number;
  /** Per-channel column override — when set, this channel uses these columns instead of the global formatColumns */
  columns?: ColumnDef[];
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

/**
 * Per-channel playback row tracking.
 *
 * Some formats (e.g. MusicLine) play channels at independent speeds,
 * so each channel may be at a different row during playback.
 *
 * - `number[]` — per-channel rows (index = channel index)
 * - `number`   — single row applied to all channels (backward compat)
 *
 * When `FormatPatternEditor` receives a `number[]`, it highlights
 * each channel's current row independently during playback.
 */
export type CurrentRowSpec = number | number[];

/** Parse a CSS hex color to RGBA array. CSS vars/named colors fall back to neutral gray. */
function parseColorToRgba(css: string): [number, number, number, number] {
  const clean = css.trim().replace('#', '');
  if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    return [
      parseInt(clean.slice(0, 2), 16) / 255,
      parseInt(clean.slice(2, 4), 16) / 255,
      parseInt(clean.slice(4, 6), 16) / 255,
      1.0,
    ];
  }
  if (/^[0-9a-fA-F]{3}$/.test(clean)) {
    return [
      parseInt(clean[0] + clean[0], 16) / 255,
      parseInt(clean[1] + clean[1], 16) / 255,
      parseInt(clean[2] + clean[2], 16) / 255,
      1.0,
    ];
  }
  // CSS var, named color, or other — fall back to neutral gray
  return [0.6, 0.6, 0.6, 1.0];
}

/**
 * Convert a ColumnDef (main-thread, has formatter function) to a ColumnSpec
 * (serializable, safe to send to WebGL worker).
 */
export function toColumnSpec(col: ColumnDef): ColumnSpec {
  return {
    charWidth: col.charWidth,
    type: col.type === 'note' ? 'note' : 'hex',
    hexDigits: col.hexDigits ?? 2,
    emptyValue: col.emptyValue ?? 0,
    color: parseColorToRgba(col.color),
    emptyColor: parseColorToRgba(col.emptyColor),
  };
}

/**
 * Convert FormatChannel[] + ColumnDef[] to a PatternSnapshot for the WebGL worker.
 * Each cell's values are stored in CellSnapshot.params[] (index = column index).
 * The standard note/instrument fields are also populated from FormatCell keys
 * so the renderer can display them without a dedicated column-driven path.
 */
export function formatChannelsToSnapshot(
  channels: FormatChannel[],
  columns: ColumnDef[],
  patternId = 'fmt-0',
): PatternSnapshot {
  const length = channels.length > 0
    ? Math.max(...channels.map(c => c.patternLength))
    : 0;

  const channelSnapshots: ChannelSnapshot[] = channels.map((ch, chIdx) => {
    const chCols = ch.columns ?? columns;
    const rows: CellSnapshot[] = Array.from({ length }, (_, ri) => {
      const cell = ch.rows[ri];
      return {
        note: cell?.note ?? 0,
        instrument: cell?.instrument ?? 0,
        volume: cell?.volume ?? 0,
        effTyp: cell?.command ?? cell?.effTyp ?? 0,
        eff: cell?.data ?? cell?.eff ?? 0,
        effTyp2: 0, eff2: 0,
        params: chCols.map(col => {
          const v = cell?.[col.key];
          return v === undefined ? (col.emptyValue ?? 0) : v;
        }),
      };
    });
    return {
      id: `ch-${chIdx}`,
      name: ch.label,
      effectCols: 0,
      rows,
      columnSpecs: ch.columns ? ch.columns.map(toColumnSpec) : undefined,
    };
  });

  return {
    id: patternId,
    length,
    channels: channelSnapshots,
  };
}
