/**
 * Tracker Render Worker — OffscreenCanvas rendering thread
 *
 * Tries WebGL2 first (TrackerGLRenderer); falls back to Canvas2D
 * (TrackerCanvas2DRenderer) when WebGL2 is unavailable (e.g. Safari < 17.4,
 * Chrome with hardware acceleration disabled).
 *
 * Owns the RAF loop. Receives state snapshots via postMessage from the main
 * thread. Main thread is never in the critical rendering path.
 *
 * Click hit-testing is performed here (worker knows exact cell geometry)
 * and results are posted back to the main thread.
 */

import { TrackerGLRenderer } from '../engine/renderer/TrackerGLRenderer';
import { TrackerCanvas2DRenderer } from '../engine/renderer/TrackerCanvas2DRenderer';
import { LayoutHold } from '../engine/renderer/layoutHold';
import { LayoutTween } from '../engine/renderer/layoutTween';
import type {
  TrackerWorkerMsg,
  TrackerWorkerReply,
  PatternSnapshot,
  PatternPreviewSnapshot,
  CursorSnapshot,
  SelectionSnapshot,
  ThemeSnapshot,
  UIStateSnapshot,
  ChannelLayoutSnapshot,
} from '../engine/renderer/worker-types';

// Constants (must match PatternEditorCanvas.tsx)
const ROW_HEIGHT   = 24;
const CHAR_WIDTH   = 10;
const LINE_NUMBER_WIDTH = 40;

// ─── Worker state ─────────────────────────────────────────────────────────────

let renderer: TrackerGLRenderer | TrackerCanvas2DRenderer | null = null;
let width  = 800;
let height = 600;
let dpr    = 1;
/** Pattern scale (fit all channels): the renderer draws in canvas px / scale at dpr * scale. */
let scale  = 1;
/** `prefers-reduced-motion: reduce`, from init; layout changes snap instead of tweening. */
let reducedMotion = false;

let patterns: PatternSnapshot[] = [];
let currentPatternIndex = 0;
let scrollX = 0;
let cursor: CursorSnapshot = { rowIndex: 0, channelIndex: 0, columnType: 'note', digitIndex: 0 };
let selection: SelectionSnapshot | null = null;
let theme: ThemeSnapshot | null = null;
let ui: UIStateSnapshot = {
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
};
let layout: ChannelLayoutSnapshot = { offsets: [], widths: [], totalWidth: 0 };
let playback = { row: 0, smoothOffset: 0, patternIndex: 0, isPlaying: false };
let dragOver: { channelIndex: number; rowIndex: number } | null = null;
let preview: PatternPreviewSnapshot | null = null;
const tween = new LayoutTween({ rowHeight: ui.rowHeight, layout });
let drawVersion = 0; // bumps whenever tween.current is rewritten, keys the scaled* memos
const layoutHold = new LayoutHold(); // new patterns wait for their channel layout
let dirty = true; // Dirty flag — skip GPU draws when nothing changed
// Reusable playback object for render calls (avoids per-frame allocation)
const workerPlayback = { row: 0, smoothOffset: 0, patternIndex: 0, isPlaying: false };

// ─── Boot heartbeat ─────────────────────────────────────────────────────────
// Posted the instant the worker module finishes loading (all imports — including
// the heavy TrackerGLRenderer/shader graph — resolved) and top-level executes.
// This proves the worker THREAD came up, independent of main-thread jank. The
// main-thread watchdog uses it to tell "worker never loaded" (real failure) from
// "worker alive but GL init is slow under startup contention" (false alarm).
(self as unknown as Worker).postMessage({ type: 'booting' } satisfies TrackerWorkerReply);

// ─── Message handler ──────────────────────────────────────────────────────────

self.onmessage = (e: MessageEvent<TrackerWorkerMsg>) => {
  const msg = e.data;

  switch (msg.type) {
    case 'init': {
      width   = msg.width;
      height  = msg.height;
      dpr     = msg.dpr;
      theme   = msg.theme;
      ui      = msg.uiState;
      patterns = msg.patterns;
      currentPatternIndex = msg.currentPatternIndex;
      cursor   = msg.cursor;
      selection = msg.selection;
      layout   = msg.channelLayout;
      scale    = msg.scale ?? 1;
      reducedMotion = msg.reducedMotion ?? false;
      tween.retarget({ rowHeight: ui.rowHeight, layout }, performance.now(), true);
      drawVersion++;

      let glErr: unknown = null;
      try {
        renderer = new TrackerGLRenderer(msg.canvas);
        renderer.resize(width / scale, height / scale, dpr * scale);
      } catch (err) {
        glErr = err;
      }

      if (!renderer) {
        try {
          renderer = new TrackerCanvas2DRenderer(msg.canvas);
          renderer.resize(width / scale, height / scale, dpr * scale);
        } catch (c2dErr) {
          console.error('[TrackerWorker] Canvas2D init also failed:', c2dErr);
          (self as unknown as Worker).postMessage({
            type: 'error',
            message: `Renderer init failed — WebGL2: ${String(glErr)}; Canvas2D: ${String(c2dErr)}`,
          } satisfies TrackerWorkerReply);
          (self as unknown as Worker).postMessage({ type: 'webgl-unsupported' } satisfies TrackerWorkerReply);
          return;
        }
      }

      startRAF();
      (self as unknown as Worker).postMessage({ type: 'ready' } satisfies TrackerWorkerReply);
      break;
    }

    case 'patterns':
      patterns = msg.patterns;
      currentPatternIndex = msg.currentPatternIndex;
      layoutHold.patterns(msg.awaitLayout, performance.now());
      dirty = true;
      break;

    case 'scroll':
      scrollX = msg.x;
      dirty = true;
      break;

    case 'cursor':
      cursor = msg.cursor;
      dirty = true;
      break;

    case 'selection':
      selection = msg.selection;
      dirty = true;
      break;

    case 'playback': {
      playback = {
        row: msg.row,
        smoothOffset: msg.smoothOffset,
        patternIndex: msg.patternIndex,
        isPlaying: msg.isPlaying,
      };
      dirty = true;
      break;
    }

    case 'layout': {
      if (msg.w !== width || msg.h !== height || msg.dpr !== dpr || msg.scale !== scale) {
        width = msg.w; height = msg.h; dpr = msg.dpr; scale = msg.scale;
        renderer?.resize(width / scale, height / scale, dpr * scale);
      }
      ui = msg.uiState;
      layout = msg.channelLayout;
      layoutHold.layout();
      tween.retarget({ rowHeight: ui.rowHeight, layout }, performance.now(), reducedMotion || !renderer);
      drawVersion++;
      dirty = true;
      break;
    }

    case 'theme':
      theme = msg.theme;
      dirty = true;
      break;

    case 'dragOver':
      dragOver = msg.cell;
      dirty = true;
      break;

    case 'previewCells':
      preview = msg.preview;
      dirty = true;
      break;

    case 'hitTest': {
      const result = hitTest(msg.relX, msg.relY);
      if (result) {
        const reply: TrackerWorkerReply = {
          type: 'hitTestResult',
          id: msg.id,
          row: result.row,
          channel: result.channel,
          columnType: result.columnType,
        };
        (self as unknown as Worker).postMessage(reply);
      } else {
        const reply: TrackerWorkerReply = { type: 'hitTestMiss', id: msg.id };
        (self as unknown as Worker).postMessage(reply);
      }
      break;
    }
  }
};

// ─── RAF loop ─────────────────────────────────────────────────────────────────

function startRAF(): void {
  const tick = () => {
    // During playback, always render (smooth scrolling needs continuous updates)
    if (playback.isPlaying) dirty = true;
    if (tween.active && tween.sample(performance.now())) { drawVersion++; dirty = true; }

    // Only call renderFrame if dirty (skip GPU calls when nothing changed)
    if (dirty && layoutHold.canDraw(performance.now())) {
      renderFrame();
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function renderFrame(): void {
  if (!renderer || !theme) return;
  dirty = false;

  // Use smoothOffset directly from main thread
  // Main thread has accurate replayer state, no need to recompute
  const smoothOffset = playback.smoothOffset;

  // Reuse workerPlayback object to avoid per-frame allocation
  workerPlayback.row = playback.row;
  workerPlayback.smoothOffset = smoothOffset / scale;
  workerPlayback.patternIndex = playback.patternIndex;
  workerPlayback.isPlaying = playback.isPlaying;

  renderer.render({
    patterns,
    currentPatternIndex,
    scrollX: scrollX / scale,
    cursor,
    selection,
    playback: workerPlayback,
    theme,
    ui: scaledUi(),
    layout: scaledLayout(),
    dragOver,
    preview,
    fade: tween.fade,
  });
}

// ─── Pattern scale ────────────────────────────────────────────────────────────
// The main thread speaks canvas px; the renderer draws at scale 1 into a canvas
// 1/scale as large, so px quantities it receives are divided by scale here.

let scaledLayoutAtVersion = -1;
let scaledLayoutAt = 1;
let scaledLayoutOut: ChannelLayoutSnapshot = layout;
function scaledLayout(): ChannelLayoutSnapshot {
  const src = tween.current.layout;
  if (scale === 1 && !tween.active) return src;
  if (scaledLayoutAtVersion !== drawVersion || scaledLayoutAt !== scale) {
    scaledLayoutAtVersion = drawVersion;
    scaledLayoutAt = scale;
    scaledLayoutOut = {
      ...src,
      offsets: src.offsets.map(v => v / scale),
      widths: src.widths.map(v => v / scale),
      totalWidth: src.totalWidth / scale,
    };
  }
  return scaledLayoutOut;
}

let scaledUiAtVersion = -1;
let scaledUiAt = 1;
let scaledUiOut: UIStateSnapshot = ui;
function scaledUi(): UIStateSnapshot {
  const rowHeight = tween.current.rowHeight;
  if (scale === 1 && !tween.active && rowHeight === ui.rowHeight) return ui;
  if (scaledUiAtVersion !== drawVersion || scaledUiAt !== scale) {
    scaledUiAtVersion = drawVersion;
    scaledUiAt = scale;
    scaledUiOut = { ...ui, rowHeight: rowHeight / scale };
  }
  return scaledUiOut;
}

// ─── Hit testing (worker → main) ──────────────────────────────────────────────

/**
 * Compute which cell was clicked from coordinates relative to the container.
 * scrollX is applied here since the worker owns it.
 */
function hitTest(
  relX: number,
  relY: number,
): { row: number; channel: number; columnType: string } | null {
  const adjX = relX + scrollX;

  const pattern = patterns[currentPatternIndex];
  if (!pattern) return null;

  const centerLineTop = Math.floor(height / 2) - ROW_HEIGHT / 2;
  const rowOffset = Math.floor((relY - centerLineTop) / ROW_HEIGHT);
  const row = (playback.isPlaying ? playback.row : cursor.rowIndex) + rowOffset;
  const rowIndex = Math.max(0, Math.min(row, pattern.length - 1));

  let channelIndex = 0;
  let localX = -1;
  let found = false;

  for (let ch = 0; ch < layout.offsets.length; ch++) {
    const off = layout.offsets[ch];
    const w   = layout.widths[ch];
    if (adjX >= off && adjX < off + w) {
      channelIndex = ch;
      localX = adjX - off - 8;
      found = true;
      break;
    }
  }

  if (!found) {
    if (adjX < LINE_NUMBER_WIDTH) {
      channelIndex = 0;
      localX = -1;
    } else {
      return null;
    }
  }

  const noteWidth = CHAR_WIDTH * 3 + 4;
  let columnType = 'note';

  if (localX >= noteWidth + 4) {
    const xInParams = localX - (noteWidth + 8);
    const cell = pattern.channels[channelIndex]?.rows[0];
    const hasAcid = cell?.flag1 !== undefined || cell?.flag2 !== undefined;

    if (xInParams < CHAR_WIDTH * 2 + 4) columnType = 'instrument';
    else if (xInParams < CHAR_WIDTH * 4 + 8) columnType = 'volume';
    else if (xInParams < CHAR_WIDTH * 7 + 12) columnType = 'effTyp';
    else if (xInParams < CHAR_WIDTH * 10 + 16) columnType = 'effTyp2';
    else if (hasAcid && xInParams < CHAR_WIDTH * 12 + 24) {
      columnType = xInParams < CHAR_WIDTH * 11 + 20 ? 'flag1' : 'flag2';
    } else {
      columnType = 'probability';
    }
  }

  return { row: rowIndex, channel: channelIndex, columnType };
}

// Export hitTest for potential direct use
export { hitTest };
