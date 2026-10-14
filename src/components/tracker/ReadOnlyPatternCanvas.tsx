/**
 * ReadOnlyPatternCanvas — OffscreenCanvas WebGL2 pattern display (read-only)
 *
 * Renders via readonly-pattern.worker.ts on a background thread.
 * Accepts pattern data as props — no Zustand store reads.
 * Used in DJ deck views where data comes from per-deck engines.
 */

import { isChannelVisible } from '@/lib/tracker/visibleChannels';
import { effectCellWidth, type EffectNotation } from '@/lib/tracker/effectNotation';
import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import type { Pattern } from '@/types';
import { OffscreenBridge } from '@engine/renderer/OffscreenBridge';
import type {
  PatternSnapshot,
  ChannelSnapshot,
  CellSnapshot,
  ThemeSnapshot,
  ChannelLayoutSnapshot,
} from '@engine/renderer/worker-types';
import { useThemeStore } from '@stores';
import { useSettingsStore } from '@stores/useSettingsStore';
import { fitAndStretchChannelWidths } from './channelLayout';
import { ChannelVUMeters, type ChannelMeterFeed } from './ChannelVUMeters';
import ReadOnlyWorkerFactory from '@/workers/readonly-pattern.worker.ts?worker';

const LINE_NUMBER_WIDTH = 40;
const CHAR_WIDTH = 10;

/** Add a flat amount to each RGB channel of a hex color */
function lightenHex(hex: string, add: number): string {
  const h = hex.replace('#', '');
  const r = Math.min(255, parseInt(h.substring(0, 2), 16) + add);
  const g = Math.min(255, parseInt(h.substring(2, 4), 16) + add);
  const b = Math.min(255, parseInt(h.substring(4, 6), 16) + add);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

// Worker message types
interface ReadOnlyInitMsg {
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

interface ReadOnlyPatternMsg {
  type: 'pattern';
  pattern: PatternSnapshot | null;
  numChannels: number;
  layout: ChannelLayoutSnapshot;
}

interface ReadOnlyPlaybackMsg {
  type: 'playback';
  currentRow: number;
  isPlaying: boolean;
}

interface ReadOnlyResizeMsg {
  type: 'resize';
  w: number;
  h: number;
  dpr: number;
}

type ReadOnlyWorkerMsg =
  | ReadOnlyInitMsg
  | ReadOnlyPatternMsg
  | ReadOnlyPlaybackMsg
  | ReadOnlyResizeMsg;

// ─── Component ───────────────────────────────────────────────────────────────

interface ReadOnlyPatternCanvasProps {
  /** Pattern data to render */
  pattern: Pattern | null;
  /** Currently active row (highlighted center line) */
  currentRow: number;
  /** Number of channels */
  numChannels: number;
  /** Whether the deck is actively playing (enables active-row note flash) */
  isPlaying?: boolean;
  /** Optional height override (default: fills parent) */
  height?: number;
  /** Which channels are shown (visibleChannels.ts); a hidden channel is width 0. All shown when absent. */
  channelMask?: readonly boolean[];
  /** Per-channel VU meters over the columns, metered from this source (a DJ deck's channel scopes). */
  vuFeed?: ChannelMeterFeed;
}

export const ReadOnlyPatternCanvas: React.FC<ReadOnlyPatternCanvasProps> = React.memo(({
  pattern,
  currentRow,
  numChannels,
  isPlaying = false,
  height: heightProp,
  vuFeed,
  channelMask,
}) => {
  // Mutable ref — set imperatively when canvas is created in useEffect
  const canvasRef    = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const bridgeRef    = useRef<OffscreenBridge<ReadOnlyWorkerMsg, { type: string }> | null>(null);
  const [dimensions, setDimensions] = useState({ width: 400, height: heightProp ?? 300 });

  const getCurrentTheme = useThemeStore((s) => s.getCurrentTheme);

  // ── Snapshot helpers ─────────────────────────────────────────────────────

  const snapshotTheme = useCallback((): ThemeSnapshot => {
    const t = getCurrentTheme();
    return {
      accent:              t.colors.accent,
      accentSecondary:     t.colors.accentSecondary,
      accentGlow:          t.colors.accentGlow,
      rowCurrent:          t.colors.trackerRowCurrent,
      bg:                  t.colors.trackerRowEven,
      rowNormal:           t.colors.trackerRowOdd,
      rowHighlight:        t.colors.trackerRowHighlight,
      rowSecondaryHighlight: lightenHex(t.colors.trackerRowHighlight, 20),
      border:              t.colors.border,
      trackerBorder:       t.colors.trackerBorder,
      textNote:            t.colors.textSecondary,
      textNoteActive:      t.colors.text,
      textMuted:           t.colors.cellEmpty,
      textInstrument:      t.colors.cellInstrument,
      textVolume:          t.colors.cellVolume,
      textEffect:          t.colors.cellEffect,
      lineNumber:          t.colors.textMuted,
      lineNumberHighlight: t.colors.accentSecondary,
      selection:           t.colors.accentGlow,
      bookmark:            t.colors.warning,
    };
  }, [getCurrentTheme]);

  const snapshotPattern = useCallback((p: Pattern | null, nc: number): PatternSnapshot | null => {
    if (!p) return null;
    return {
      id:       p.id,
      length:   p.length,
      channels: p.channels.slice(0, nc).map((ch): ChannelSnapshot => ({
        id:         ch.id,
        effectCols: ch.channelMeta?.effectCols ?? 2,
        effectNotation: ch.channelMeta?.effectNotation,
        color:      ch.color ?? undefined,
        rows: ch.rows.map((cell): CellSnapshot => ({
          note:       cell.note ?? 0,
          instrument: cell.instrument ?? 0,
          volume:     cell.volume ?? 0,
          effTyp:     cell.effTyp ?? 0,
          eff:        cell.eff ?? 0,
          effTyp2:    cell.effTyp2 ?? 0,
          eff2:       cell.eff2 ?? 0,
        })),
      })),
    };
  }, []);

  // Fit all channels (deck setting): the pattern is drawn at `scale` so every
  // channel is on screen. The layout is in canvas (CSS) px for the DOM; the
  // worker draws at scale 1 into a canvas 1/scale as large, so it gets
  // `toWorker`'s layout and resize (px / scale, dpr * scale).
  const fitDeck = useSettingsStore((s) => s.fitAllChannelsDeck);
  const fitDeckRef = useRef(fitDeck);
  fitDeckRef.current = fitDeck;

  const maskRef = useRef(channelMask);
  maskRef.current = channelMask;
  const maskKey = channelMask ? channelMask.map((v) => (v ? '1' : '0')).join('') : '';

  // Each channel's effect notation (Furnace songs draw 4-char effects): read through a ref like the mask.
  const notationsRef = useRef<readonly (EffectNotation | undefined)[]>([]);
  notationsRef.current = pattern?.channels.map((ch) => ch.channelMeta?.effectNotation) ?? [];
  const notationKey = notationsRef.current.join(',');

  const buildLayout = useCallback((w: number, nc: number): ChannelLayoutSnapshot & { scale: number } => {
    const noteWidth   = CHAR_WIDTH * 3 + 4;
    const contentWidth = (i: number) =>
      noteWidth + 4 + CHAR_WIDTH * 4 + 8 + 2 * effectCellWidth(CHAR_WIDTH, notationsRef.current[i]);
    const minWidths   = Array.from({ length: nc }, (_, i) => (isChannelVisible(maskRef.current, i) ? contentWidth(i) + 16 : 0));
    const fitted      = fitAndStretchChannelWidths(minWidths, LINE_NUMBER_WIDTH, w, fitDeckRef.current);
    const offsets: number[] = [];
    let x = fitted.leftEdge;
    for (const cw of fitted.widths) { offsets.push(x); x += cw; }
    return { offsets, widths: fitted.widths, totalWidth: x - fitted.leftEdge, scale: fitted.scale };
  }, []);

  const toWorker = useCallback((l: ChannelLayoutSnapshot & { scale: number }): ChannelLayoutSnapshot => ({
    offsets: l.offsets.map((v) => v / l.scale),
    widths: l.widths.map((v) => v / l.scale),
    totalWidth: l.totalWidth / l.scale,
  }), []);

  // ── Bridge initialisation ────────────────────────────────────────────────
  // Canvas is created imperatively so React StrictMode's double-invoke doesn't
  // reuse the same element after transferControlToOffscreen() has been called.

  useEffect(() => {
    const container = containerRef.current;
    // Skip on iOS — WebGL2 on OffscreenCanvas in Worker hangs
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
    if (!container || isIOS || !('transferControlToOffscreen' in HTMLCanvasElement.prototype)) return;

    // Fresh canvas element every time — safe to transfer control
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'display:block;width:100%;height:100%';
    container.appendChild(canvas);
    canvasRef.current = canvas;

    const bridge = new OffscreenBridge<ReadOnlyWorkerMsg, { type: string }>(
      ReadOnlyWorkerFactory,
      { onReady: () => {} },
    );
    bridgeRef.current = bridge;

    const dpr = window.devicePixelRatio || 1;
    const w   = Math.max(1, container.clientWidth);
    const h   = Math.max(1, heightProp ?? container.clientHeight);
    const offscreen = canvas.transferControlToOffscreen();
    const initLayout = buildLayout(w, numChannels);

    bridge.post(
      {
        type:       'init',
        canvas:     offscreen,
        dpr:        dpr * initLayout.scale,
        width:      w / initLayout.scale,
        height:     h / initLayout.scale,
        theme:      snapshotTheme(),
        pattern:    snapshotPattern(pattern, numChannels),
        currentRow,
        numChannels,
        isPlaying,
        layout:     toWorker(initLayout),
      },
      [offscreen],
    );

    return () => {
      bridge.dispose();
      bridgeRef.current = null;
      canvas.remove();
      canvasRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // only on mount

  // ── Observe container size ────────────────────────────────────────────────

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = Math.floor(entry.contentRect.width);
      const h = heightProp ?? Math.floor(entry.contentRect.height);
      if (w > 0 && h > 0) {
        setDimensions({ width: w, height: h });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [heightProp]);

  const layoutNow = useMemo(
    () => buildLayout(dimensions.width, numChannels),
    // fitDeck, the mask and the effect notations are read through refs inside buildLayout; they are dependencies here so a change relays out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [buildLayout, dimensions.width, numChannels, fitDeck, maskKey, notationKey],
  );

  // The worker owns the canvas size: tell it the canvas at the fitted scale.
  useEffect(() => {
    const dpr = window.devicePixelRatio || 1;
    const sc = layoutNow.scale;
    bridgeRef.current?.post({ type: 'resize', w: dimensions.width / sc, h: dimensions.height / sc, dpr: dpr * sc });
  }, [dimensions.width, dimensions.height, layoutNow.scale]);

  // ── Forward pattern / layout changes ─────────────────────────────────────

  useEffect(() => {
    bridgeRef.current?.post({
      type:       'pattern',
      pattern:    snapshotPattern(pattern, numChannels),
      numChannels,
      layout:     toWorker(layoutNow),
    });
  }, [pattern, numChannels, layoutNow, snapshotPattern, toWorker]);

  // ── Forward playback state ────────────────────────────────────────────────

  useEffect(() => {
    bridgeRef.current?.post({ type: 'playback', currentRow, isPlaying });
  }, [currentRow, isPlaying]);

  const vuLayout = vuFeed ? layoutNow : null;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full"
      style={heightProp ? { height: heightProp } : undefined}
    >
      {vuFeed && vuLayout && (
        // The tracker's meters (PatternEditorCanvas), over this view's columns and its centre row.
        <div className="absolute right-0 pointer-events-none overflow-hidden" style={{ top: 0, bottom: 0, left: layoutNow.offsets[0] ?? LINE_NUMBER_WIDTH, zIndex: 1 }}>
          <ChannelVUMeters
            channelOffsets={vuLayout.offsets}
            channelWidths={vuLayout.widths}
            editRowY={dimensions.height / 2}
            channelCount={numChannels}
            feed={vuFeed}
            scale={vuLayout.scale}
          />
        </div>
      )}
    </div>
  );
});

export default ReadOnlyPatternCanvas;
