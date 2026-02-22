/**
 * PixiPatternMinimap — 16px-wide density sidebar showing note activity per row.
 * Click to jump to row, selection highlight, playback position indicator.
 */

import { useCallback, useMemo } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { usePixiTheme } from '../../theme';
import { useTrackerStore, useTransportStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';

const MINIMAP_WIDTH = 16;

// Colors (Pixi hex)
const COLOR_BEAT = 0x3b82f6;    // Blue for beat rows
const COLOR_OTHER = 0x6366f1;   // Indigo for other rows
const COLOR_SELECTION = 0xfacc15; // Yellow
const COLOR_PLAYING = 0x22c55e;  // Green
const COLOR_STOPPED = 0xef4444;  // Red

interface PixiPatternMinimapProps {
  height: number;
}

export const PixiPatternMinimap: React.FC<PixiPatternMinimapProps> = ({ height }) => {
  const theme = usePixiTheme();
  const { patterns, currentPatternIndex, cursor, selection } = useTrackerStore(
    useShallow(s => ({
      patterns: s.patterns,
      currentPatternIndex: s.currentPatternIndex,
      cursor: s.cursor,
      selection: s.selection,
    }))
  );
  const { isPlaying, currentRow } = useTransportStore(
    useShallow(s => ({ isPlaying: s.isPlaying, currentRow: s.currentRow }))
  );

  const pattern = patterns[currentPatternIndex];
  const patternLength = pattern?.length ?? 64;
  const rowHeight = height / patternLength;
  const activeRow = Math.min(
    isPlaying ? currentRow : cursor.rowIndex,
    patternLength - 1
  );

  // Calculate note density per row
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

  // Click to jump to row
  const handleClick = useCallback((e: FederatedPointerEvent) => {
    const localY = e.getLocalPosition(e.currentTarget).y;
    const row = Math.floor((localY / height) * patternLength);
    const clampedRow = Math.max(0, Math.min(patternLength - 1, row));
    useTrackerStore.getState().moveCursorToRow(clampedRow);
  }, [height, patternLength]);

  // Draw callback
  const draw = useCallback((g: GraphicsType) => {
    g.clear();

    // Background
    g.rect(0, 0, MINIMAP_WIDTH, height);
    g.fill({ color: theme.bg.color });
    // Left border
    g.rect(0, 0, 1, height);
    g.fill({ color: theme.border.color, alpha: theme.border.alpha });

    if (!pattern || density.length === 0) return;

    // Max density for normalization
    let maxDensity = 1;
    for (let i = 0; i < density.length; i++) {
      if (density[i] > maxDensity) maxDensity = density[i];
    }

    // Density bars
    for (let row = 0; row < patternLength; row++) {
      const d = density[row];
      if (d === 0) continue;
      const y = row * rowHeight;
      const w = (d / maxDensity) * 14;
      const color = row % 4 === 0 ? COLOR_BEAT : COLOR_OTHER;
      g.rect(1, y, w, Math.max(1, rowHeight - 0.5));
      g.fill({ color, alpha: 0.5 });
    }

    // Selection highlight
    if (selection) {
      const minRow = Math.min(selection.startRow, selection.endRow);
      const maxRow = Math.max(selection.startRow, selection.endRow);
      g.rect(0, minRow * rowHeight, MINIMAP_WIDTH, (maxRow - minRow + 1) * rowHeight);
      g.fill({ color: COLOR_SELECTION, alpha: 0.2 });
    }

    // Active row indicator
    const indicatorColor = isPlaying ? COLOR_PLAYING : COLOR_STOPPED;
    g.rect(0, activeRow * rowHeight, MINIMAP_WIDTH, Math.max(2, rowHeight));
    g.fill({ color: indicatorColor, alpha: 0.8 });
  }, [height, theme, pattern, density, patternLength, rowHeight, selection, isPlaying, activeRow]);

  if (!pattern) return null;

  return (
    <pixiGraphics
      draw={draw}
      eventMode="static"
      cursor="pointer"
      onPointerDown={handleClick}
      layout={{ width: MINIMAP_WIDTH, height }}
    />
  );
};
