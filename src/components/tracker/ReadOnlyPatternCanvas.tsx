/**
 * ReadOnlyPatternCanvas — OffscreenCanvas WebGL2 pattern display (read-only)
 *
 * Renders via readonly-pattern.worker.ts on a background thread.
 * Accepts pattern data as props — no Zustand store reads.
 * Used in DJ deck views where data comes from per-deck engines.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
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
import ReadOnlyWorkerFactory from '@/workers/readonly-pattern.worker.ts?worker';

const LINE_NUMBER_WIDTH = 40;
const CHAR_WIDTH = 10;

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
}

export const ReadOnlyPatternCanvas: React.FC<ReadOnlyPatternCanvasProps> = React.memo(({
  pattern,
  currentRow,
  numChannels,
  isPlaying = false,
  height: heightProp,
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
      bg:                  '#0a0a0b',
      rowNormal:           '#0d0d0e',
      rowHighlight:        '#111113',
      border:              '#252530',
      textNote:            '#909090',
      textNoteActive:      '#ffffff',
      textMuted:           '#505050',
      textInstrument:      '#4ade80',
      textVolume:          '#60a5fa',
      textEffect:          '#f97316',
      lineNumber:          '#707070',
      lineNumberHighlight: '#f97316',
      selection:           'rgba(59,130,246,0.3)',
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

  const buildLayout = useCallback((w: number, nc: number): ChannelLayoutSnapshot => {
    const noteWidth   = CHAR_WIDTH * 3 + 4;
    const paramWidth  = CHAR_WIDTH * 4 + 8 + 2 * (CHAR_WIDTH * 3 + 4);
    const contentWidth = noteWidth + 4 + paramWidth;
    const usable      = w - LINE_NUMBER_WIDTH;
    const chW         = Math.max(contentWidth + 16, Math.floor(usable / Math.max(1, nc)));
    const offsets     = Array.from({ length: nc }, (_, i) => LINE_NUMBER_WIDTH + i * chW);
    const widths      = Array.from({ length: nc }, () => chW);
    return { offsets, widths, totalWidth: chW * nc };
  }, []);

  // ── Bridge initialisation ────────────────────────────────────────────────
  // Canvas is created imperatively so React StrictMode's double-invoke doesn't
  // reuse the same element after transferControlToOffscreen() has been called.

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !('transferControlToOffscreen' in HTMLCanvasElement.prototype)) return;

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

    bridge.post(
      {
        type:       'init',
        canvas:     offscreen,
        dpr,
        width:      w,
        height:     h,
        theme:      snapshotTheme(),
        pattern:    snapshotPattern(pattern, numChannels),
        currentRow,
        numChannels,
        isPlaying,
        layout:     buildLayout(w, numChannels),
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
        const dpr = window.devicePixelRatio || 1;
        bridgeRef.current?.post({ type: 'resize', w, h, dpr });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [heightProp]);

  // ── Forward pattern / layout changes ─────────────────────────────────────

  useEffect(() => {
    bridgeRef.current?.post({
      type:       'pattern',
      pattern:    snapshotPattern(pattern, numChannels),
      numChannels,
      layout:     buildLayout(dimensions.width, numChannels),
    });
  }, [pattern, numChannels, dimensions.width, snapshotPattern, buildLayout]);

  // ── Forward playback state ────────────────────────────────────────────────

  useEffect(() => {
    bridgeRef.current?.post({ type: 'playback', currentRow, isPlaying });
  }, [currentRow, isPlaying]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={heightProp ? { height: heightProp } : undefined}
    />
  );
});

export default ReadOnlyPatternCanvas;
