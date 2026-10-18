/**
 * Shared types for OffscreenCanvas worker communication.
 * These are pure data types (no React, no Zustand) that can be used in both
 * the main thread and worker threads.
 */

import type { EffectNotation } from '@/lib/tracker/effectNotation';
import type { ClockAnchor } from '../audioLatency';

// ─── Theme snapshot ──────────────────────────────────────────────────────────

export interface ThemeSnapshot {
  accent: string;
  accentSecondary: string;
  accentGlow: string;
  rowCurrent: string;
  bg: string;
  rowNormal: string;
  rowHighlight: string;
  rowSecondaryHighlight: string;
  border: string;
  trackerBorder: string;
  textNote: string;
  textNoteActive: string;
  textMuted: string;
  textInstrument: string;
  textVolume: string;
  textEffect: string;
  lineNumber: string;
  lineNumberHighlight: string;
  selection: string;
  bookmark: string;
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
  effTyp3?: number;  eff3?: number;
  effTyp4?: number;  eff4?: number;
  effTyp5?: number;  eff5?: number;
  effTyp6?: number;  eff6?: number;
  effTyp7?: number;  eff7?: number;
  effTyp8?: number;  eff8?: number;
  note2?: number; instrument2?: number; volume2?: number;
  note3?: number; instrument3?: number; volume3?: number;
  note4?: number; instrument4?: number; volume4?: number;
  flag1?: number;
  flag2?: number;
  probability?: number;
  params?: number[];
}

export interface ChannelSnapshot {
  id: string;
  name?: string;
  color?: string;
  muted?: boolean;
  solo?: boolean;
  collapsed?: boolean;
  effectCols: number; // from channelMeta.effectCols, default 2
  /** from channelMeta.effectNotation: 'furnace' draws each effect as 4 hex chars (code + value). */
  effectNotation?: EffectNotation;
  noteCols?: number;  // from channelMeta.noteCols, default 1
  rows: CellSnapshot[];
  /** Per-channel column specs — overrides global ui.columns when present */
  columnSpecs?: ColumnSpec[];
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
  noteColumnIndex?: number;
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
  rowHeight: number;           // Derived from trackerZoom (80-200%)
  rowHighlightInterval: number; // Every N rows gets a highlight color
  rowSecondaryHighlightInterval: number; // Every M rows gets a stronger highlight (bar lines)
  showBeatLabels: boolean;     // Show beat.tick format in line number gutter
  noteDisplayOffset: number;   // Semitones to add to note for display (e.g. -12 for MOD)
  columns?: ColumnSpec[];      // When present, renderer uses column-driven path instead of fixed Note/Inst/Vol/Eff
  bookmarks: number[];         // Sorted bookmarked row indices
}

// ─── Column specification ────────────────────────────────────────────────────

export interface ColumnSpec {
  charWidth: number;
  type: 'note' | 'hex';
  hexDigits: number;
  emptyValue: number;
  color: [number, number, number, number];
  emptyColor: [number, number, number, number];
}

// ─── Channel layout ───────────────────────────────────────────────────────────

export interface ChannelLayoutSnapshot {
  offsets: number[]; // X offset for each channel (logical pixels)
  widths: number[];  // Width of each channel (logical pixels)
  totalWidth: number;
}

// ─── Worker messages (main thread → worker) ───────────────────────────────────

/**
 * Everything that shapes the grid, posted once per React commit so the worker
 * tweens toward one settled target (see layoutTween.ts). Sizes in canvas (CSS)
 * px; `scale` is the fit-all-channels pattern scale (<= 1).
 */
export interface LayoutMsg {
  type: 'layout';
  w: number;
  h: number;
  dpr: number;
  scale: number;
  uiState: UIStateSnapshot;
  channelLayout: ChannelLayoutSnapshot;
}

export type TrackerWorkerMsg =
  | {
      type: 'cover';
      /** A song-load overlay sits over the editor: a channel-count fade waits at 0 until this is false. */
      covered: boolean;
    }
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
      /** Pattern scale at init (see the 'layout' message); 1 when absent. */
      scale?: number;
      /** `prefers-reduced-motion: reduce` at mount: layout changes snap instead of tweening. */
      reducedMotion?: boolean;
    }
  | {
      type: 'patterns';
      patterns: PatternSnapshot[];
      currentPatternIndex: number;
      /** The channel layout of these patterns follows: keep the old picture until it arrives (layoutHold.ts). */
      awaitLayout?: boolean;
    }
  | { type: 'scroll'; x: number }
  | { type: 'cursor'; cursor: CursorSnapshot }
  | { type: 'selection'; selection: SelectionSnapshot | null }
  | {
      type: 'playback';
      row: number;
      smoothOffset: number;
      patternIndex: number;
      isPlaying: boolean;
      /** Song order position (0-based). Updates on D00/Bxx even when patternIndex stays the same. */
      songPosition?: number;
    }
  | LayoutMsg
  | { type: 'theme'; theme: ThemeSnapshot }
  | { type: 'dragOver'; cell: { channelIndex: number; rowIndex: number } | null }
  | { type: 'previewCells'; preview: PatternPreviewSnapshot | null }
  | { type: 'hitTest'; id: number; relX: number; relY: number };

/** Cells a pending Voice to Notes take writes on one channel of the current pattern; drawn as ghost notes. note 0 = empty row of the span, 97 = note-off. */
export interface PatternPreviewSnapshot { channelIndex: number; startRow: number; notes: number[] }

// ─── Worker replies (worker → main thread) ────────────────────────────────────

export type TrackerWorkerReply =
  | { type: 'ready' }
  | { type: 'booting' }
  | { type: 'webgl-unsupported' }
  | { type: 'error'; message: string }
  | { type: 'diag'; stage: string }
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
  /** The deck's identity colour (src/lib/deckIdentity.ts), resolved on the main thread. */
  deckAccent: string;
}

export interface DeckColorsExt extends DeckColors {
  borderLight: string;
  /** The record-label surface under the platter, tinted with the deck colour. */
  deckLabel: string;
}

// ─── Turntable ───────────────────────────────────────────────────────────────

export type TurntableMsg =
  | { type: 'init'; canvas: OffscreenCanvas; dpr: number; width: number; height: number; colors: DeckColorsExt; deckId: 'A' | 'B' | 'C'; isPlaying: boolean; effectiveBPM: number }
  | { type: 'playback'; isPlaying: boolean; effectiveBPM: number }
  | { type: 'position'; posSec: number }
  /** The platter angle set from outside (Deck C's strokes, D1); null hands it back to the deck's own clock. */
  | { type: 'angle'; rad: number | null }
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
  /** Heard-position clock; the worker extrapolates it to each frame (positionAtFrame). */
  anchor: ClockAnchor;
  durationMs: number;
  waveformPeaks: number[] | null;
  /** 3-band frequency peaks: [low[], mid[], high[]] — null until analysis completes */
  frequencyPeaks: number[][] | null;
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

/** Overview state embedded in the combined waveform display */
export interface WaveformOverviewState {
  frequencyPeaks: number[][] | null;
  loopActive: boolean;
  patternLoopStart: number;
  patternLoopEnd: number;
  cuePoint: number;
  totalPositions: number;
  colors: DeckColors;
  /** Beat positions in seconds (from analysis) for waveform grid overlay */
  beats: number[] | null;
  /** Downbeat (bar start) positions in seconds */
  downbeats: number[] | null;
}

export type WaveformMsg =
  | { type: 'init'; canvas: OffscreenCanvas; dpr: number; width: number; height: number; waveformPeaks: number[] | null; durationMs: number; anchor: ClockAnchor; cuePoints: SerializedCuePoint[]; overview: WaveformOverviewState }
  | { type: 'waveformPeaks'; peaks: number[] | null; durationMs: number }
  | { type: 'position'; anchor: ClockAnchor }
  | { type: 'cuePoints'; cuePoints: SerializedCuePoint[] }
  | { type: 'overview'; overview: WaveformOverviewState }
  | { type: 'otherDeck'; peaks: number[] | null; durationMs: number; anchor: ClockAnchor }
  | { type: 'resize'; w: number; h: number; dpr: number }
  | { type: 'stemPeaks'; stems: Record<string, number[]> | null };

// ─── Beat Grid ───────────────────────────────────────────────────────────────

export interface BeatMarker {
  position: number;
  beatsUntilNextMarker: number;
}

/** Analysis-derived beat grid (from essentia.js) */
export interface AnalysisBeatGrid {
  beats: number[];      // Beat positions in seconds
  downbeats: number[];  // Downbeat/bar-start positions in seconds
  bpm: number;
  timeSignature: number;
}

export type BeatGridMsg =
  | { type: 'init'; canvas: OffscreenCanvas; dpr: number; width: number; height: number; beatGrid: BeatMarker[]; analysisBeatGrid: AnalysisBeatGrid | null; durationMs: number; anchor: ClockAnchor; positionFraction: number }
  | { type: 'beatGrid'; beatGrid: BeatMarker[]; analysisBeatGrid: AnalysisBeatGrid | null; durationMs: number }
  | { type: 'position'; anchor: ClockAnchor; positionFraction: number }
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
  // Per-chromatic-note colors (0=C..11=B). When present, overrides whiteKey/blackKey.
  noteColors?: string[];
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

/** Everything a renderer's `render` needs for one frame. */
export interface TrackerRenderInput {
  patterns: PatternSnapshot[];
  currentPatternIndex: number;
  scrollX: number;
  cursor: CursorSnapshot;
  selection: SelectionSnapshot | null;
  playback: { row: number; smoothOffset: number; patternIndex: number; isPlaying: boolean; songPosition?: number };
  theme: ThemeSnapshot;
  ui: UIStateSnapshot;
  layout: ChannelLayoutSnapshot;
  dragOver: { channelIndex: number; rowIndex: number } | null;
  preview?: PatternPreviewSnapshot | null;
  /** 0..1 opacity of the drawn frame over the background; omitted = 1. */
  fade?: number;
}
