/**
 * GTTableEditor — Wave/Pulse/Filter/Speed table editor for GoatTracker Ultra.
 *
 * GoatTracker tables are 255 entries each with left+right column (ltable/rtable).
 * The user switches between 4 table types via tabs.
 *
 * Keyboard:
 *   Up/Down — navigate rows
 *   Left/Right — switch between left/right columns
 *   0-9, A-F — hex entry
 *   Tab — cycle table tabs
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useGTUltraStore } from '../../stores/useGTUltraStore';

type TableType = 'wave' | 'pulse' | 'filter' | 'speed';
const TABLE_TYPES: TableType[] = ['wave', 'pulse', 'filter', 'speed'];
const TABLE_TYPE_INDEX: Record<TableType, number> = { wave: 0, pulse: 1, filter: 2, speed: 3 };

const TABLE_COLORS: Record<TableType, string> = {
  wave: '#60e060',
  pulse: '#ff8866',
  filter: '#ffcc00',
  speed: '#6699ff',
};

// Wave table left-column special value annotations
const WAVE_LEFT_ANNOTATIONS: Record<number, string> = {
  0x00: 'nop', 0x01: 'set', 0x10: 'del+gateoff', 0x11: 'del+gateon',
  0xE0: 'inaudible', 0xE1: 'noise+', 0xFE: 'rst', 0xFF: 'end',
};

const ROW_H = 14;

export const GTTableEditor: React.FC<{ width: number; height: number }> = ({ width, height }) => {
  const [activeTable, setActiveTable] = useState<TableType>('wave');
  const [activeCol, setActiveCol] = useState<0 | 1>(0); // 0=left, 1=right
  const [hexDigit, setHexDigit] = useState<number | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [hoverInfo, setHoverInfo] = useState<{ idx: number; x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tableData = useGTUltraStore((s) => s.tableData);
  const tableCursor = useGTUltraStore((s) => s.tableCursor);
  const setTableCursor = useGTUltraStore((s) => s.setTableCursor);
  const engine = useGTUltraStore((s) => s.engine);

  const tabHeight = 22;
  const headerHeight = 16;
  const contentHeight = height - tabHeight - headerHeight;
  const visibleRows = Math.floor(contentHeight / ROW_H);

  const table = tableData[activeTable] ?? { left: new Uint8Array(255), right: new Uint8Array(255) };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = contentHeight * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, 0, width, contentHeight);

    ctx.font = `11px "JetBrains Mono", monospace`;
    ctx.textBaseline = 'top';

    // Header
    ctx.fillStyle = 'var(--color-bg-tertiary)';
    ctx.fillRect(0, 0, width, headerHeight);
    ctx.fillStyle = '#888';
    ctx.fillText(' IDX', 4, 2);
    ctx.fillStyle = activeCol === 0 ? '#e0e0e0' : '#555';
    ctx.fillText('LEFT', 40, 2);
    ctx.fillStyle = activeCol === 1 ? '#e0e0e0' : '#555';
    ctx.fillText('RIGHT', 80, 2);
    if (activeTable === 'wave') {
      ctx.fillStyle = '#444';
      ctx.fillText('INFO', 126, 2);
    }

    const scrollTop = Math.max(0, tableCursor - Math.floor(visibleRows / 2));
    const color = TABLE_COLORS[activeTable];

    for (let vi = 0; vi < visibleRows; vi++) {
      const idx = scrollTop + vi;
      if (idx >= 255) break;
      const y = headerHeight + vi * ROW_H;
      const isCursor = idx === tableCursor;

      if (isCursor) {
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(0, y, width, ROW_H);
        // Highlight active column
        const colX = activeCol === 0 ? 36 : 76;
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(colX, y, 32, ROW_H);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, y + 0.5, width - 1, ROW_H - 1);
      }

      // Index
      ctx.fillStyle = '#555';
      ctx.fillText(idx.toString(16).toUpperCase().padStart(2, '0'), 8, y + 1);

      // Left value
      const left = table.left[idx];
      ctx.fillStyle = left === 0 ? 'var(--color-border-light)' : color;
      ctx.fillText(left.toString(16).toUpperCase().padStart(2, '0'), 40, y + 1);

      // Right value
      const right = table.right[idx];
      ctx.fillStyle = right === 0 ? 'var(--color-border-light)' : color;
      ctx.fillText(right.toString(16).toUpperCase().padStart(2, '0'), 80, y + 1);

      // Annotations for wave table left column
      if (activeTable === 'wave' && left !== 0) {
        const anno = WAVE_LEFT_ANNOTATIONS[left];
        if (anno) {
          ctx.fillStyle = '#555';
          ctx.fillText(anno, 126, y + 1);
        }
      }

      // Visual bar for pulse/filter right value
      if (right > 0 && (activeTable === 'pulse' || activeTable === 'filter')) {
        const barW = (right / 255) * (width - 170);
        ctx.fillStyle = color + '22';
        ctx.fillRect(126, y + 2, barW, ROW_H - 4);
      }
    }
  }, [width, contentHeight, activeTable, table, tableCursor, visibleRows, headerHeight, activeCol]);

  // Convert pointer position to table index
  const pointerToIdx = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const y = e.clientY - rect.top;
    if (y < headerHeight) return -1;
    const scrollTop = Math.max(0, tableCursor - Math.floor(visibleRows / 2));
    return Math.min(254, Math.max(0, scrollTop + Math.floor((y - headerHeight) / ROW_H)));
  }, [tableCursor, visibleRows, headerHeight]);

  // Draw mode: paint value based on X position within the bar area
  const applyDrawValue = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!engine) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const idx = pointerToIdx(e);
    if (idx < 0) return;

    // If clicking in the bar area (right side), use X position to set value
    const barAreaStart = 130;
    const barAreaEnd = width - 10;
    if (x >= barAreaStart && (activeTable === 'pulse' || activeTable === 'filter' || activeTable === 'speed')) {
      const frac = Math.max(0, Math.min(1, (x - barAreaStart) / (barAreaEnd - barAreaStart)));
      const value = Math.round(frac * 255);
      const typeIdx = TABLE_TYPE_INDEX[activeTable];
      engine.setTableEntry(typeIdx, 1, idx, value); // write to right column
      useGTUltraStore.getState().refreshAllTables();
    }
  }, [engine, activeTable, width, pointerToIdx]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (y < headerHeight) return;
    const scrollTop = Math.max(0, tableCursor - Math.floor(visibleRows / 2));
    const idx = scrollTop + Math.floor((y - headerHeight) / ROW_H);
    if (idx < 255) setTableCursor(idx);
    // Detect column click
    setActiveCol(x >= 66 && x < 120 ? 1 : 0);
    setHexDigit(null);
    canvasRef.current?.focus();
  }, [tableCursor, visibleRows, headerHeight, setTableCursor]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    setDrawing(true);
    applyDrawValue(e as unknown as React.MouseEvent<HTMLCanvasElement>);
  }, [applyDrawValue]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    // Hover tooltip
    const idx = pointerToIdx(e as unknown as React.MouseEvent<HTMLCanvasElement>);
    if (idx >= 0) {
      const rect = canvasRef.current!.getBoundingClientRect();
      setHoverInfo({ idx, x: e.clientX - rect.left, y: e.clientY - rect.top });
    } else {
      setHoverInfo(null);
    }

    // Draw mode
    if (drawing) {
      applyDrawValue(e as unknown as React.MouseEvent<HTMLCanvasElement>);
    }
  }, [drawing, pointerToIdx, applyDrawValue]);

  const handlePointerUp = useCallback(() => {
    setDrawing(false);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const { key } = e;
    e.stopPropagation();

    // Navigation
    if (key === 'ArrowUp') { e.preventDefault(); setTableCursor(Math.max(0, tableCursor - 1)); setHexDigit(null); return; }
    if (key === 'ArrowDown') { e.preventDefault(); setTableCursor(Math.min(254, tableCursor + 1)); setHexDigit(null); return; }
    if (key === 'ArrowLeft') { e.preventDefault(); setActiveCol(0); setHexDigit(null); return; }
    if (key === 'ArrowRight') { e.preventDefault(); setActiveCol(1); setHexDigit(null); return; }

    // Tab — cycle table type
    if (key === 'Tab') {
      e.preventDefault();
      const curIdx = TABLE_TYPES.indexOf(activeTable);
      const next = e.shiftKey
        ? TABLE_TYPES[(curIdx - 1 + 4) % 4]
        : TABLE_TYPES[(curIdx + 1) % 4];
      setActiveTable(next);
      setHexDigit(null);
      return;
    }

    // Page up/down
    if (key === 'PageUp') { e.preventDefault(); setTableCursor(Math.max(0, tableCursor - visibleRows)); setHexDigit(null); return; }
    if (key === 'PageDown') { e.preventDefault(); setTableCursor(Math.min(254, tableCursor + visibleRows)); setHexDigit(null); return; }
    if (key === 'Home') { e.preventDefault(); setTableCursor(0); setHexDigit(null); return; }
    if (key === 'End') { e.preventDefault(); setTableCursor(254); setHexDigit(null); return; }

    // Hex entry (0-9, A-F)
    const hexChar = key.toUpperCase();
    if (/^[0-9A-F]$/.test(hexChar)) {
      e.preventDefault();
      const nibble = parseInt(hexChar, 16);
      if (hexDigit === null) {
        setHexDigit(nibble);
      } else {
        const value = (hexDigit << 4) | nibble;
        if (engine) {
          const typeIdx = TABLE_TYPE_INDEX[activeTable];
          engine.setTableEntry(typeIdx, activeCol, tableCursor, value);
          useGTUltraStore.getState().refreshAllTables();
        }
        setHexDigit(null);
        setTableCursor(Math.min(254, tableCursor + 1));
      }
      return;
    }

    // Delete — clear current cell
    if (key === 'Delete') {
      e.preventDefault();
      if (engine) {
        const typeIdx = TABLE_TYPE_INDEX[activeTable];
        engine.setTableEntry(typeIdx, activeCol, tableCursor, 0);
        useGTUltraStore.getState().refreshAllTables();
      }
      return;
    }

    // Escape — clear hex entry
    if (key === 'Escape') {
      setHexDigit(null);
      return;
    }
  }, [tableCursor, activeTable, activeCol, hexDigit, engine, visibleRows, setTableCursor]);

  return (
    <div style={{ width, height, display: 'flex', flexDirection: 'column' }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', height: tabHeight, background: 'var(--color-bg-tertiary)' }}>
        {TABLE_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => { setActiveTable(t); setHexDigit(null); }}
            style={{
              flex: 1,
              background: activeTable === t ? '#0d0d0d' : 'transparent',
              color: activeTable === t ? TABLE_COLORS[t] : '#555',
              border: 'none',
              borderBottom: activeTable === t ? `2px solid ${TABLE_COLORS[t]}` : '2px solid transparent',
              cursor: 'pointer',
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 10,
              fontWeight: 'bold',
              textTransform: 'uppercase',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Table content */}
      <div style={{ position: 'relative', width, height: contentHeight }}>
        <canvas
          ref={canvasRef}
          style={{ width, height: contentHeight, outline: 'none', cursor: drawing ? 'crosshair' : 'default' }}
          tabIndex={0}
          onClick={handleCanvasClick}
          onKeyDown={handleKeyDown}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={() => { setDrawing(false); setHoverInfo(null); }}
        />
        {/* Hover tooltip */}
        {hoverInfo && hoverInfo.idx >= 0 && (
          <div style={{
            position: 'absolute',
            left: Math.min(hoverInfo.x + 12, width - 90),
            top: Math.max(0, hoverInfo.y - 24),
            background: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: 3,
            padding: '2px 6px',
            fontSize: 9,
            fontFamily: '"JetBrains Mono", monospace',
            color: TABLE_COLORS[activeTable],
            pointerEvents: 'none',
            zIndex: 10,
            whiteSpace: 'nowrap',
          }}>
            [{hoverInfo.idx.toString(16).toUpperCase().padStart(2, '0')}] L:{table.left[hoverInfo.idx].toString(16).toUpperCase().padStart(2, '0')} R:{table.right[hoverInfo.idx].toString(16).toUpperCase().padStart(2, '0')}
            {activeTable === 'wave' && WAVE_LEFT_ANNOTATIONS[table.left[hoverInfo.idx]] ? ` (${WAVE_LEFT_ANNOTATIONS[table.left[hoverInfo.idx]]})` : ''}
          </div>
        )}
      </div>
    </div>
  );
};
