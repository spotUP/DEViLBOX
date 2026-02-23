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
  | { type: 'dragOver'; cell: { channelIndex: number; rowIndex: number } | null }
  | { type: 'hitTest'; id: number; relX: number; relY: number };

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
    }
  | {
      type: 'hitTestResult';
      id: number;
      row: number;
      channel: number;
      columnType: string;
    }
  | { type: 'hitTestMiss'; id: number };

// ═══════════════════════════════════════════════════════════════════════════════
// DJ Worker Types
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Shared DJ color snapshots ───────────────────────────────────────────────

export interface DeckColors {
  bg: string;
  bgSecondary: string;
  bgTertiary: string;
  border: string;
}

export interface DeckColorsExt extends DeckColors {
  borderLight: string;
}

// ─── Turntable ───────────────────────────────────────────────────────────────

export type TurntableMsg =
  | { type: 'init'; canvas: OffscreenCanvas; dpr: number; width: number; height: number; colors: DeckColorsExt; deckId: 'A' | 'B' | 'C'; isPlaying: boolean; effectiveBPM: number }
  | { type: 'playback'; isPlaying: boolean; effectiveBPM: number }
  | { type: 'velocity'; v: number }
  | { type: 'scratchActive'; active: boolean }
  | { type: 'resize'; w: number; h: number; dpr: number }
  | { type: 'colors'; colors: DeckColorsExt };

// ─── Track Overview ──────────────────────────────────────────────────────────

export interface OverviewState {
  playbackMode: string;
  songPos: number;
  totalPositions: number;
  cuePoint: number;
  loopActive: boolean;
  patternLoopStart: number;
  patternLoopEnd: number;
  audioPosition: number;
  durationMs: number;
  waveformPeaks: number[] | null;
}

export type OverviewMsg =
  | { type: 'init'; canvas: OffscreenCanvas; dpr: number; width: number; height: number; colors: DeckColors } & OverviewState
  | { type: 'state' } & OverviewState
  | { type: 'resize'; w: number; h: number; dpr: number }
  | { type: 'colors'; colors: DeckColors };

// ─── Audio Waveform ──────────────────────────────────────────────────────────

export interface SerializedCuePoint {
  index: number;
  position: number;
  color: string;
  name: string;
}

export type WaveformMsg =
  | { type: 'init'; canvas: OffscreenCanvas; dpr: number; width: number; height: number; waveformPeaks: number[] | null; durationMs: number; audioPosition: number; cuePoints: SerializedCuePoint[] }
  | { type: 'waveformPeaks'; peaks: number[] | null; durationMs: number }
  | { type: 'position'; audioPosition: number }
  | { type: 'cuePoints'; cuePoints: SerializedCuePoint[] }
  | { type: 'resize'; w: number; h: number; dpr: number };

// ─── Beat Grid ───────────────────────────────────────────────────────────────

export interface BeatMarker {
  position: number;
  beatsUntilNextMarker: number;
}

export type BeatGridMsg =
  | { type: 'init'; canvas: OffscreenCanvas; dpr: number; width: number; height: number; beatGrid: BeatMarker[]; durationMs: number; audioPosition: number }
  | { type: 'beatGrid'; beatGrid: BeatMarker[]; durationMs: number }
  | { type: 'position'; audioPosition: number }
  | { type: 'resize'; w: number; h: number; dpr: number };

// ─── Piano Keyboard ──────────────────────────────────────────────────────────

export interface KeyboardColors {
  bg: string;
  whiteKey: string;
  blackKey: string;
  whiteKeyDimmed: string;
  blackKeyDimmed: string;
  activeKey: string;
  divider: string;
  dividerLight: string;
  labelDark: string;
  labelLight: string;
}

export interface KeyboardState {
  verticalZoom: number;
  scrollY: number;
  containerHeight: number;
  activeNotes: number[];
  scaleNotes: number[] | null;
  dragTargetMidi: number | null;
}

export type KeyboardMsg =
  | { type: 'init'; canvas: OffscreenCanvas; dpr: number; state: KeyboardState }
  | { type: 'state'; state: KeyboardState }
  | { type: 'hover'; midi: number | null }
  | { type: 'resize'; h: number; dpr: number }
  | { type: 'colors'; colors: KeyboardColors };

// ─── Velocity Lane ───────────────────────────────────────────────────────────

export interface SerializedNote {
  id: string;
  startRow: number;
  endRow: number;
  velocity: number;
  instrument: number | null;
}

export interface VelocityState {
  notes: SerializedNote[];
  horizontalZoom: number;
  scrollX: number;
  selectedNotes: string[];
  containerWidth: number;
}

export type VelocityMsg =
  | { type: 'init'; canvas: OffscreenCanvas; dpr: number; state: VelocityState }
  | { type: 'state'; state: VelocityState }
  | { type: 'hover'; noteId: string | null }
  | { type: 'resize'; w: number; dpr: number };
