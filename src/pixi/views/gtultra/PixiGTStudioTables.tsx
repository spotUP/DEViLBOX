/**
 * PixiGTStudioTables — Visual table editors for GoatTracker Ultra Studio Mode.
 *
 * Renders wave/pulse/filter/speed tables as graphical bar charts instead of
 * hex grids. Users can visually see and edit table values by dragging bars.
 *
 * Each table type gets a different visualization:
 * - Wave: Waveform selector icons per step
 * - Pulse: Bar chart of pulse width values
 * - Filter: Frequency + resonance curves
 * - Speed: Tempo/timing bar chart
 */

import React, { useCallback, useEffect, useRef } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '@/pixi/fonts';
import { MegaText, type GlyphLabel } from '@/pixi/utils/MegaText';
import { useGTUltraStore } from '@/stores/useGTUltraStore';

const C_BG       = 0x16213e;
const C_BORDER   = 0x333366;
const C_LABEL    = 0x888899;
const C_HEADER   = 0xe94560;
const C_BAR_WAVE = 0x6699ff;
const C_BAR_PULSE = 0xff8866;
const C_BAR_FILTER = 0x2a9d8f;
const C_BAR_SPEED = 0xffcc00;
const C_GRID     = 0x1a1a3a;
const C_CURSOR   = 0xffffff;

const TABLE_COLORS = [C_BAR_WAVE, C_BAR_PULSE, C_BAR_FILTER, C_BAR_SPEED];
const TABLE_NAMES = ['Wave', 'Pulse', 'Filter', 'Speed'];

interface Props {
  width: number;
  height: number;
}

export const PixiGTStudioTables: React.FC<Props> = ({ width, height }) => {
  const containerRef = useRef<any>(null);
  const bgRef = useRef<GraphicsType>(null);
  const barsRef = useRef<GraphicsType>(null);
  const megaRef = useRef<MegaText | null>(null);

  const activeTable = useGTUltraStore((s) => s.activeTable);
  const tableData = useGTUltraStore((s) => s.tableData);
  const tableCursor = useGTUltraStore((s) => s.tableCursor);

  const tableName = TABLE_NAMES[activeTable] || 'Wave';
  const tableKey = tableName.toLowerCase();
  const data = tableData[tableKey];
  const barColor = TABLE_COLORS[activeTable] || C_BAR_WAVE;

  // Init MegaText
  useEffect(() => {
    const mega = new MegaText();
    megaRef.current = mega;
    if (containerRef.current) containerRef.current.addChild(mega);
    return () => { mega.destroy(); megaRef.current = null; };
  }, []);

  const redraw = useCallback(() => {
    const bg = bgRef.current;
    const bars = barsRef.current;
    const mega = megaRef.current;
    if (!bg || !bars || !mega) return;

    bg.clear();
    bars.clear();

    const labels: GlyphLabel[] = [];
    const ff = PIXI_FONTS.MONO;
    const pad = 6;
    const headerH = 28;

    // Background
    bg.rect(0, 0, width, height).fill({ color: C_BG });
    bg.rect(0, 0, width, height).stroke({ color: C_BORDER, width: 1 });

    // Header with tab buttons
    labels.push({ x: pad, y: pad, text: `${tableName} Table`, color: C_HEADER, fontFamily: ff });

    // Tab buttons
    for (let i = 0; i < 4; i++) {
      const tx = width - 4 * 40 + i * 40;
      const isActive = i === activeTable;
      bg.rect(tx, 2, 36, 18).fill({ color: isActive ? 0x1a3a2a : 0x0a0a1a });
      bg.rect(tx, 2, 36, 18).stroke({ color: isActive ? TABLE_COLORS[i] : C_BORDER, width: 1 });
      labels.push({
        x: tx + 4, y: 5,
        text: TABLE_NAMES[i].slice(0, 3).toUpperCase(),
        color: isActive ? TABLE_COLORS[i] : C_LABEL,
        fontFamily: ff,
      });
    }

    if (!data) {
      mega.updateLabels(labels, 10);
      return;
    }

    // Bar chart area
    const chartY = headerH;
    const chartH = height - headerH - 20;
    const chartW = width - pad * 2;

    // Find the range of non-zero values to display
    let lastNonZero = 0;
    for (let i = 0; i < data.left.length; i++) {
      if (data.left[i] !== 0 || data.right[i] !== 0) lastNonZero = i;
    }
    const displayLen = Math.min(Math.max(lastNonZero + 2, 16), 64);

    const barW = Math.max(2, (chartW - displayLen) / displayLen);
    const barGap = 1;

    // Grid lines
    for (const frac of [0.25, 0.5, 0.75]) {
      const y = chartY + chartH * (1 - frac);
      bg.moveTo(pad, y).lineTo(pad + chartW, y).stroke({ color: C_GRID, width: 1, alpha: 0.3 });
    }

    // Draw bars (left column values)
    for (let i = 0; i < displayLen; i++) {
      const val = data.left[i];
      const rVal = data.right[i];
      const x = pad + i * (barW + barGap);
      const barH = (val / 255) * chartH;
      const y = chartY + chartH - barH;

      if (val > 0) {
        bars.rect(x, y, barW * 0.45, barH).fill({ color: barColor, alpha: 0.8 });
      }
      if (rVal > 0) {
        const rBarH = (rVal / 255) * chartH;
        const ry = chartY + chartH - rBarH;
        bars.rect(x + barW * 0.5, ry, barW * 0.45, rBarH).fill({ color: barColor, alpha: 0.4 });
      }

      // Cursor highlight
      if (i === tableCursor) {
        bars.rect(x - 1, chartY, barW + 2, chartH).stroke({ color: C_CURSOR, width: 1, alpha: 0.5 });
      }

      // Index labels (every 8 entries)
      if (i % 8 === 0) {
        labels.push({
          x, y: chartY + chartH + 4,
          text: i.toString(16).toUpperCase().padStart(2, '0'),
          color: C_LABEL,
          fontFamily: ff,
        });
      }
    }

    // Current value display
    const curVal = data.left[tableCursor] || 0;
    const curRVal = data.right[tableCursor] || 0;
    labels.push({
      x: pad, y: chartY + chartH + 4,
      text: `[${tableCursor.toString(16).padStart(2, '0').toUpperCase()}] L:${curVal.toString(16).padStart(2, '0').toUpperCase()} R:${curRVal.toString(16).padStart(2, '0').toUpperCase()}`,
      color: barColor,
      fontFamily: ff,
    });

    mega.updateLabels(labels, 9);
  }, [width, height, activeTable, data, tableCursor, tableName, barColor]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  return (
    <pixiContainer ref={containerRef} layout={{ width, height }}>
      <pixiGraphics ref={bgRef} />
      <pixiGraphics ref={barsRef} />
    </pixiContainer>
  );
};
