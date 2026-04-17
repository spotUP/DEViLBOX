/**
 * ReadOnly Pattern Render Worker — OffscreenCanvas rendering for DJ decks
 *
 * Simplified version of tracker-render.worker.ts:
 *   - No cursor, no selection, no editing
 *   - Layout is provided by the main thread (equal-width channels)
 *   - Accepts pattern and playback state only
 */

import { TrackerCanvas2DRenderer } from '../engine/renderer/TrackerCanvas2DRenderer';
import type {
  PatternSnapshot,
  ThemeSnapshot,
  ChannelLayoutSnapshot,
} from '../engine/renderer/worker-types';

// ─── Worker message types ─────────────────────────────────────────────────────

interface InitMsg {
  type: 'init';
  canvas: OffscreenCanvas;
  dpr: number;
  width: number;
  height: number;
  theme: ThemeSnapshot;
  pattern: PatternSnapshot | null;
  currentRow: number;
  numChannels: number;
  isPlaying: boolean;
  layout: ChannelLayoutSnapshot;
}

interface PatternMsg {
  type: 'pattern';
  pattern: PatternSnapshot | null;
  numChannels: number;
  layout: ChannelLayoutSnapshot;
}

interface PlaybackMsg {
  type: 'playback';
  currentRow: number;
  isPlaying: boolean;
}

interface ResizeMsg {
  type: 'resize';
  w: number;
  h: number;
  dpr: number;
}

type WorkerMsg = InitMsg | PatternMsg | PlaybackMsg | ResizeMsg;

// ─── Worker state ─────────────────────────────────────────────────────────────

let renderer: TrackerCanvas2DRenderer | null = null;

let pattern: PatternSnapshot | null = null;
let currentRow = 0;
let isPlaying = false;
let layout: ChannelLayoutSnapshot = { offsets: [], widths: [], totalWidth: 0 };

const DEFAULT_THEME: ThemeSnapshot = {
  accent: '#00e5ff',
  accentSecondary: '#7c3aed',
  accentGlow: 'rgba(0,229,255,0.08)',
  rowCurrent: '#1a2a25',
  bg: '#0a0a0b',
  rowNormal: '#0d0d0e',
  rowHighlight: '#111113',
  rowSecondaryHighlight: 'rgba(96,165,250,0.2)',
  border: '#252530',
  trackerBorder: '#252530',
  textNote: '#909090',
  textNoteActive: '#ffffff',
  textMuted: '#505050',
  textInstrument: '#4ade80',
  textVolume: '#60a5fa',
  textEffect: '#f97316',
  lineNumber: '#707070',
  lineNumberHighlight: '#f97316',
  selection: 'rgba(59,130,246,0.3)',
  bookmark: '#f59e0b',
};

let theme: ThemeSnapshot = DEFAULT_THEME;
let dirty = true;

// ─── Message handler ──────────────────────────────────────────────────────────

self.onmessage = (e: MessageEvent<WorkerMsg>) => {
  const msg = e.data;

  switch (msg.type) {
    case 'init': {
      theme      = msg.theme;
      pattern    = msg.pattern;
      currentRow = msg.currentRow;
      isPlaying  = msg.isPlaying;
      layout     = msg.layout;
      try {
        renderer = new TrackerCanvas2DRenderer(msg.canvas);
        renderer.resize(msg.width, msg.height, msg.dpr);
      } catch (err) {
        console.error('[ReadOnlyPatternWorker] Canvas2D init failed:', err);
        return;
      }
      startRAF();
      (self as unknown as Worker).postMessage({ type: 'ready' });
      break;
    }
    case 'pattern':
      pattern = msg.pattern;
      layout  = msg.layout;
      dirty = true;
      break;
    case 'playback':
      currentRow = msg.currentRow;
      isPlaying  = msg.isPlaying;
      dirty = true;
      break;
    case 'resize':
      renderer?.resize(msg.w, msg.h, msg.dpr);
      dirty = true;
      break;
  }
};

// ─── RAF loop ─────────────────────────────────────────────────────────────────

function startRAF(): void {
  const tick = () => {
    renderFrame();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function renderFrame(): void {
  if (!renderer || !dirty) return;
  dirty = false;
  const patterns = pattern ? [pattern] : [];
  renderer.render({
    patterns,
    currentPatternIndex: 0,
    scrollX: 0,
    cursor:    { rowIndex: currentRow, channelIndex: 0, columnType: 'note', digitIndex: 0 },
    selection: null,
    playback:  { row: currentRow, smoothOffset: 0, patternIndex: 0, isPlaying },
    theme,
    ui: {
      useHex: true,
      blankEmpty: false,
      showGhostPatterns: false,
      columnVisibility: { flag1: false, flag2: false, probability: false },
      trackerVisualBg: false,
      recordMode: false,
      rowHeight: 24,
      rowHighlightInterval: 4,
      rowSecondaryHighlightInterval: 16,
      showBeatLabels: false,
      noteDisplayOffset: 0,
      bookmarks: [],
    },
    layout,
    dragOver: null,
  });
}
