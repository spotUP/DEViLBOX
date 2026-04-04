/**
 * PixiPatternMinimap — 16px-wide density sidebar showing note activity per row.
 * Click to jump to row, selection highlight, playback position indicator.
 *
 * Split into two Graphics layers:
 *  - Static: background + density bars (redrawn only when pattern data changes)
 *  - Cursor overlay: cursor indicator + selection (redrawn on cursor move — just 1-2 rects)
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { usePixiTheme } from '../../theme';
import { useTrackerStore, useTransportStore, useCursorStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';

const MINIMAP_WIDTH = 16;

// Dynamic color constants — resolved from theme inside the component.
// COLOR_OTHER remains a static derived value (no direct theme equivalent).
const COLOR_OTHER = 0x6366f1;

interface PixiPatternMinimapProps {
  height: number;
}

export const PixiPatternMinimap: React.FC<PixiPatternMinimapProps> = ({ height }) => {
  const theme = usePixiTheme();
  const { patterns, currentPatternIndex } = useTrackerStore(
    useShallow(s => ({
      patterns: s.patterns,
      currentPatternIndex: s.currentPatternIndex,
    }))
  );
  const { isPlaying, currentRow } = useTransportStore(
    useShallow(s => ({ isPlaying: s.isPlaying, currentRow: s.currentRow }))
  );

  const cursorRef = useRef(useCursorStore.getState().cursor);
  const selectionRef = useRef(useCursorStore.getState().selection);
  const staticRef = useRef<GraphicsType | null>(null);
  const cursorGfxRef = useRef<GraphicsType | null>(null);

  const pattern = patterns[currentPatternIndex];
  const patternLength = pattern?.length ?? 64;
  const rowHeight = height / patternLength;

  const density = useMemo(() => {
    if (!pattern) return new Uint8Array(0);
    const d = new Uint8Array(patternLength);
    for (let row = 0; row < patternLength; row++) {
      let count = 0;
      for (let ch = 0; ch < pattern.channels.length; ch++) {
        const cell = pattern.channels[ch].rows[row];
        if (cell && (cell.note > 0 || cell.effTyp > 0 || cell.volume >= 0x10)) {
          count++;
        }
      }
      d[row] = count;
    }
    return d;
  }, [pattern, patternLength]);

  const renderRef = useRef({ height, theme, pattern, density, patternLength, rowHeight, isPlaying, currentRow });
  renderRef.current = { height, theme, pattern, density, patternLength, rowHeight, isPlaying, currentRow };

  // Static layer: background + density bars — only when pattern data changes
  const drawStatic = useCallback(() => {
    const g = staticRef.current;
    if (!g) return;
    const r = renderRef.current;

    g.clear();
    g.rect(0, 0, MINIMAP_WIDTH, r.height);
    g.fill({ color: r.theme.bg.color });
    g.rect(0, 0, 1, r.height);
    g.fill({ color: r.theme.border.color, alpha: r.theme.border.alpha });

    if (!r.pattern || r.density.length === 0) return;

    let maxDensity = 1;
    for (let i = 0; i < r.density.length; i++) {
      if (r.density[i] > maxDensity) maxDensity = r.density[i];
    }
    for (let row = 0; row < r.patternLength; row++) {
      const d = r.density[row];
      if (d === 0) continue;
      const y = row * r.rowHeight;
      const w = (d / maxDensity) * 14;
      const color = row % 4 === 0 ? r.theme.accent.color : COLOR_OTHER;
      g.rect(1, y, w, Math.max(1, r.rowHeight - 0.5));
      g.fill({ color, alpha: 0.5 });
    }
  }, []);

  // Cursor overlay: just the indicator + selection — lightweight, ~2 rects
  const drawCursorOverlay = useCallback(() => {
    const g = cursorGfxRef.current;
    if (!g) return;
    const r = renderRef.current;
    const sel = selectionRef.current;
    const activeRow = Math.min(
      r.isPlaying ? r.currentRow : cursorRef.current.rowIndex,
      r.patternLength - 1
    );

    g.clear();

    if (sel) {
      const minRow = Math.min(sel.startRow, sel.endRow);
      const maxRow = Math.max(sel.startRow, sel.endRow);
      g.rect(0, minRow * r.rowHeight, MINIMAP_WIDTH, (maxRow - minRow + 1) * r.rowHeight);
      g.fill({ color: r.theme.warning.color, alpha: 0.2 });
    }

    const indicatorColor = r.isPlaying ? r.theme.success.color : r.theme.error.color;
    g.rect(0, activeRow * r.rowHeight, MINIMAP_WIDTH, Math.max(2, r.rowHeight));
    g.fill({ color: indicatorColor, alpha: 0.8 });
  }, []);

  // Cursor subscription — only redraws the lightweight cursor overlay
  const minimapRafRef = useRef(0);
  useEffect(() => {
    const unsub = useCursorStore.subscribe((state, prev) => {
      if (state.cursor !== prev.cursor || state.selection !== prev.selection) {
        cursorRef.current = state.cursor;
        selectionRef.current = state.selection;
        if (!minimapRafRef.current) {
          minimapRafRef.current = requestAnimationFrame(() => {
            minimapRafRef.current = 0;
            drawCursorOverlay();
          });
        }
      }
    });
    return () => { unsub(); if (minimapRafRef.current) cancelAnimationFrame(minimapRafRef.current); };
  }, [drawCursorOverlay]);

  // Full redraw when pattern data or layout changes
  useEffect(() => {
    drawStatic();
    drawCursorOverlay();
  }, [height, theme, pattern, density, patternLength, rowHeight, isPlaying, currentRow, drawStatic, drawCursorOverlay]);

  const handleClick = useCallback((e: FederatedPointerEvent) => {
    const localY = e.getLocalPosition(e.currentTarget).y;
    const row = Math.floor((localY / height) * patternLength);
    const clampedRow = Math.max(0, Math.min(patternLength - 1, row));
    useCursorStore.getState().moveCursorToRow(clampedRow);
  }, [height, patternLength]);

  if (!pattern) return null;

  return (
    <pixiContainer
      eventMode="static"
      cursor="pointer"
      onPointerDown={handleClick}
      layout={{ width: MINIMAP_WIDTH, height }}
    >
      <pixiGraphics ref={staticRef} draw={() => {}} />
      <pixiGraphics ref={cursorGfxRef} draw={() => {}} />
    </pixiContainer>
  );
};
