/**
 * Shared types for OffscreenCanvas worker communication.
 * These are pure data types (no React, no Zustand) that can be used in both
 * the main thread and worker threads.
 */

// ─── Theme snapshot ──────────────────────────────────────────────────────────

export interface ThemeSnapshot {
  accent: string;
  accentSecondary: string;
  accentGlow: string;
  bg: string;
  rowNormal: string;
  rowHighlight: string;
  border: string;
  textNote: string;
  textNoteActive: string;
  textMuted: string;
  textInstrument: string;
  textVolume: string;
  textEffect: string;
  lineNumber: string;
  lineNumberHighlight: string;
  selection: string;
}

// ─── Pattern data snapshot (serializable) ────────────────────────────────────

export interface CellSnapshot {
  note: number;
  instrument: number;
  volume: number;
  effTyp: number;
  eff: number;
  effTyp2: number;
  eff2: number;
  flag1?: number;
  flag2?: number;
  probability?: number;
}

export interface ChannelSnapshot {
  id: string;
  name?: string;
  color?: string;
  muted?: boolean;
  solo?: boolean;
  collapsed?: boolean;
  effectCols: number; // from channelMeta.effectCols, default 2
  rows: CellSnapshot[];
}

export interface PatternSnapshot {
  id: string;
  length: number;
  channels: ChannelSnapshot[];
}

// ─── Cursor / selection ───────────────────────────────────────────────────────

export interface CursorSnapshot {
  rowIndex: number;
  channelIndex: number;
  columnType: string;
  digitIndex: number;
}

export interface SelectionSnapshot {
  startChannel: number;
  endChannel: number;
  startRow: number;
  endRow: number;
  columnTypes?: string[];
}

// ─── UI state ─────────────────────────────────────────────────────────────────

export interface ColumnVisibility {
  flag1: boolean;
  flag2: boolean;
  probability: boolean;
}

export interface UIStateSnapshot {
  useHex: boolean;
  blankEmpty: boolean;
  showGhostPatterns: boolean;
  columnVisibility: ColumnVisibility;
  trackerVisualBg: boolean;
  recordMode: boolean;
}

// ─── Channel layout ───────────────────────────────────────────────────────────

export interface ChannelLayoutSnapshot {
  offsets: number[]; // X offset for each channel (logical pixels)
  widths: number[];  // Width of each channel (logical pixels)
  totalWidth: number;
}

// ─── Worker messages (main thread → worker) ───────────────────────────────────

export type TrackerWorkerMsg =
  | {
      type: 'init';
      canvas: OffscreenCanvas;
      dpr: number;
      width: number;
      height: number;
      theme: ThemeSnapshot;
      uiState: UIStateSnapshot;
      patterns: PatternSnapshot[];
      currentPatternIndex: number;
      cursor: CursorSnapshot;
      selection: SelectionSnapshot | null;
      channelLayout: ChannelLayoutSnapshot;
    }
  | { type: 'patterns'; patterns: PatternSnapshot[]; currentPatternIndex: number }
  | { type: 'scroll'; x: number }
  | { type: 'cursor'; cursor: CursorSnapshot }
  | { type: 'selection'; selection: SelectionSnapshot | null }
  | {
      type: 'playback';
      row: number;
      smoothOffset: number;
      patternIndex: number;
      isPlaying: boolean;
    }
  | { type: 'resize'; w: number; h: number; dpr: number }
  | { type: 'theme'; theme: ThemeSnapshot }
  | { type: 'uiState'; uiState: UIStateSnapshot }
  | { type: 'channelLayout'; channelLayout: ChannelLayoutSnapshot }
  | { type: 'dragOver'; cell: { channelIndex: number; rowIndex: number } | null };

// ─── Worker replies (worker → main thread) ────────────────────────────────────

export type TrackerWorkerReply =
  | { type: 'ready' }
  | {
      type: 'click';
      row: number;
      channel: number;
      columnType: string;
      screenX: number;
      screenY: number;
    };
