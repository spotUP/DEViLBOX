/**
 * PixiGTTableEditor — Wave/Pulse/Filter/Speed table viewer (Pixi/GL).
 * Tab-based display of GoatTracker's 4 table types using MegaText.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '@/pixi/fonts';
import { MegaText, type GlyphLabel } from '@/pixi/utils/MegaText';
import { useGTUltraStore } from '@/stores/useGTUltraStore';

type TableType = 'wave' | 'pulse' | 'filter' | 'speed';
const TABLE_TYPES: TableType[] = ['wave', 'pulse', 'filter', 'speed'];

const TAB_H = 18;
const HEADER_H = 14;
const ROW_H = 13;
const FONT_SIZE = 10;

const C_BG      = 0x0d0d0d;
const C_TAB_BG  = 0x1a1a1a;
const C_WAVE    = 0x60e060;
const C_PULSE   = 0xff8866;
const C_FILTER  = 0xffcc00;
const C_SPEED   = 0x6699ff;
const C_DIM     = 0x333333;
const C_LABEL   = 0x666666;
const C_CURSOR  = 0xffffff;

const TABLE_COLORS: Record<TableType, number> = { wave: C_WAVE, pulse: C_PULSE, filter: C_FILTER, speed: C_SPEED };

interface Props { width: number; height: number }

export const PixiGTTableEditor: React.FC<Props> = ({ width, height }) => {
  const [activeTable, setActiveTable] = useState<TableType>('wave');
  const gridRef = useRef<GraphicsType>(null);
  const megaRef = useRef<MegaText | null>(null);
  const containerRef = useRef<any>(null);

  const tableData = useGTUltraStore((s) => s.tableData);
  const tableCursor = useGTUltraStore((s) => s.tableCursor);

  const contentH = height - TAB_H - HEADER_H;
  const visibleRows = Math.floor(contentH / ROW_H);

  useEffect(() => {
    const mega = new MegaText();
    megaRef.current = mega;
    if (containerRef.current) containerRef.current.addChild(mega);
    return () => { mega.destroy(); megaRef.current = null; };
  }, []);

  const redraw = useCallback(() => {
    const g = gridRef.current;
    const mega = megaRef.current;
    if (!g || !mega) return;

    g.clear();
    g.rect(0, 0, width, height).fill({ color: C_BG });

    const labels: GlyphLabel[] = [];
    const ff = PIXI_FONTS.MONO;
    const color = TABLE_COLORS[activeTable];

    // Tabs
    const tabW = width / 4;
    TABLE_TYPES.forEach((t, i) => {
      const tx = i * tabW;
      if (t === activeTable) {
        g.rect(tx, 0, tabW, TAB_H).fill({ color: C_BG });
        g.rect(tx, TAB_H - 2, tabW, 2).fill({ color: TABLE_COLORS[t] });
      } else {
        g.rect(tx, 0, tabW, TAB_H).fill({ color: C_TAB_BG });
      }
      labels.push({
        x: tx + tabW / 2 - 12,
        y: 3,
        text: t.toUpperCase(),
        color: t === activeTable ? TABLE_COLORS[t] : 0x555555,
        fontFamily: ff,
      });
    });

    // Column header
    const hY = TAB_H;
    labels.push({ x: 8, y: hY + 1, text: 'IDX', color: C_LABEL, fontFamily: ff });
    labels.push({ x: 40, y: hY + 1, text: 'LEFT', color: C_LABEL, fontFamily: ff });
    labels.push({ x: 80, y: hY + 1, text: 'RIGHT', color: C_LABEL, fontFamily: ff });

    // Data rows
    const table = tableData[activeTable];
    const scrollTop = Math.max(0, tableCursor - Math.floor(visibleRows / 2));

    for (let vi = 0; vi < visibleRows; vi++) {
      const idx = scrollTop + vi;
      if (idx >= 255) break;
      const y = TAB_H + HEADER_H + vi * ROW_H;
      const isCursor = idx === tableCursor;

      if (isCursor) {
        g.rect(0, y, width, ROW_H).fill({ color: 0x1a1a1a });
        g.rect(0, y, 2, ROW_H).fill({ color: C_CURSOR });
      }

      const hex = (v: number) => v.toString(16).toUpperCase().padStart(2, '0');

      labels.push({ x: 8, y: y + 1, text: hex(idx), color: C_DIM, fontFamily: ff });

      const left = table?.left[idx] ?? 0;
      labels.push({ x: 40, y: y + 1, text: hex(left), color: left === 0 ? C_DIM : color, fontFamily: ff });

      const right = table?.right[idx] ?? 0;
      labels.push({ x: 80, y: y + 1, text: hex(right), color: right === 0 ? C_DIM : color, fontFamily: ff });

      // Wave table annotations
      if (activeTable === 'wave' && left > 0) {
        let ann = '';
        if (left === 0xFF) ann = 'END';
        else if (left === 0xFE) ann = 'RST';
        else if (left === 0xE0) ann = 'INAUD';
        else if (left === 0xE1) ann = 'NOISE+';
        else if (left === 0x10) ann = 'DEL-GOFF';
        else if (left === 0x11) ann = 'DEL-GON';
        if (ann) labels.push({ x: 110, y: y + 1, text: ann, color: C_LABEL, fontFamily: ff });
      }

      // Visual bar for values
      if (right > 0 && (activeTable === 'pulse' || activeTable === 'filter')) {
        const barW = (right / 255) * (width - 120);
        g.rect(110, y + 2, barW, ROW_H - 4).fill({ color, alpha: 0.15 });
      }
    }

    mega.updateLabels(labels, FONT_SIZE);
  }, [width, height, activeTable, tableData, tableCursor, visibleRows]);

  useEffect(() => { redraw(); }, [redraw]);

  // Click handler for tabs and rows
  const handlePointerUp = useCallback((e: { global: { x: number; y: number } }) => {
    const cont = containerRef.current;
    if (!cont) return;
    const local = cont.toLocal(e.global);

    if (local.y < TAB_H) {
      // Tab click
      const tabIdx = Math.floor(local.x / (width / 4));
      if (tabIdx >= 0 && tabIdx < 4) setActiveTable(TABLE_TYPES[tabIdx]);
      return;
    }

    if (local.y < TAB_H + HEADER_H) return;

    const scrollTop = Math.max(0, tableCursor - Math.floor(visibleRows / 2));
    const idx = scrollTop + Math.floor((local.y - TAB_H - HEADER_H) / ROW_H);
    if (idx < 255) useGTUltraStore.getState().setTableCursor(idx);
  }, [width, tableCursor, visibleRows]);

  return (
    <pixiContainer ref={containerRef} eventMode="static" cursor="default" onPointerUp={handlePointerUp} layout={{ width, height }}>
      <pixiGraphics eventMode="none" ref={gridRef} draw={() => {}} />
    </pixiContainer>
  );
};
