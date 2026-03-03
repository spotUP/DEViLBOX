/**
 * PixiGTStudioTables — Visual table editors for GoatTracker Ultra Studio Mode.
 *
 * Renders wave/pulse/filter/speed tables as graphical bar charts.
 * Users can click bars to set values, drag to draw, and click tab buttons
 * to switch between table types.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
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
  const [drawing, setDrawing] = useState(false);

  const activeTable = useGTUltraStore((s) => s.activeTable);
  const tableData = useGTUltraStore((s) => s.tableData);
  const tableCursor = useGTUltraStore((s) => s.tableCursor);
  const engine = useGTUltraStore((s) => s.engine);

  const tableName = TABLE_NAMES[activeTable] || 'Wave';
  const tableKey = tableName.toLowerCase();
  const data = tableData[tableKey];
  const barColor = TABLE_COLORS[activeTable] || C_BAR_WAVE;

  // Layout
  const pad = 6;
  const headerH = 28;
  const chartY = headerH;
  const chartH = height - headerH - 20;
  const chartW = width - pad * 2;

  // Init MegaText
  useEffect(() => {
    const mega = new MegaText();
    megaRef.current = mega;
    if (containerRef.current) containerRef.current.addChild(mega);
    return () => { mega.destroy(); megaRef.current = null; };
  }, []);

  // ── Pointer event helpers ──
  const getBarInfo = useCallback(() => {
    if (!data) return { displayLen: 16, barW: 4 };
    let lastNonZero = 0;
    for (let i = 0; i < data.left.length; i++) {
      if (data.left[i] !== 0 || data.right[i] !== 0) lastNonZero = i;
    }
    const displayLen = Math.min(Math.max(lastNonZero + 2, 16), 64);
    const barW = Math.max(2, (chartW - displayLen) / displayLen);
    return { displayLen, barW };
  }, [data, chartW]);

  const pointerToCell = useCallback((e: FederatedPointerEvent): { index: number; value: number } | null => {
    if (!data) return null;
    const local = e.getLocalPosition(containerRef.current);
    const { displayLen, barW } = getBarInfo();
    const barGap = 1;
    const index = Math.floor((local.x - pad) / (barW + barGap));
    if (index < 0 || index >= displayLen) return null;
    const yFrac = 1 - Math.max(0, Math.min(1, (local.y - chartY) / chartH));
    const value = Math.round(yFrac * 255);
    return { index, value };
  }, [data, getBarInfo, chartY, chartH]);

  const applyValue = useCallback((index: number, value: number) => {
    if (!engine) return;
    // Table type 0=wave, 1=pulse, 2=filter, 3=speed
    engine.setTableEntry(activeTable, 0, index, value); // left column
    // Update store locally for immediate feedback
    if (data) {
      const newLeft = [...data.left];
      newLeft[index] = value;
      const newTableData = { ...useGTUltraStore.getState().tableData };
      newTableData[tableKey] = { ...data, left: newLeft };
      useGTUltraStore.setState({ tableData: newTableData });
    }
  }, [engine, activeTable, data, tableKey]);

  const handlePointerDown = useCallback((e: FederatedPointerEvent) => {
    const local = e.getLocalPosition(containerRef.current);

    // Check tab button clicks
    for (let i = 0; i < 4; i++) {
      const tx = width - 4 * 40 + i * 40;
      if (local.x >= tx && local.x <= tx + 36 && local.y >= 2 && local.y <= 20) {
        useGTUltraStore.setState({ activeTable: i });
        return;
      }
    }

    // Bar chart drawing
    const cell = pointerToCell(e);
    if (cell) {
      setDrawing(true);
      useGTUltraStore.setState({ tableCursor: cell.index });
      applyValue(cell.index, cell.value);
    }
  }, [width, pointerToCell, applyValue]);

  const handlePointerMove = useCallback((e: FederatedPointerEvent) => {
    if (!drawing) return;
    const cell = pointerToCell(e);
    if (cell) {
      useGTUltraStore.setState({ tableCursor: cell.index });
      applyValue(cell.index, cell.value);
    }
  }, [drawing, pointerToCell, applyValue]);

  const handlePointerUp = useCallback(() => {
    setDrawing(false);
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
    const { displayLen, barW } = getBarInfo();
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
  }, [width, height, activeTable, data, tableCursor, tableName, barColor, getBarInfo, chartY, chartH, chartW]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  return (
    <pixiContainer
      ref={containerRef}
      layout={{ width, height }}
      eventMode="static"
      cursor={drawing ? 'crosshair' : 'pointer'}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerUpOutside={handlePointerUp}
    >
      <pixiGraphics ref={bgRef} />
      <pixiGraphics ref={barsRef} />
    </pixiContainer>
  );
};
