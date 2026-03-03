/**
 * GTTableEditor — Wave/Pulse/Filter/Speed table editor for GoatTracker Ultra.
 *
 * GoatTracker tables are 255 entries each with left+right column (ltable/rtable).
 * The user switches between 4 table types via tabs.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useGTUltraStore } from '../../stores/useGTUltraStore';

type TableType = 'wave' | 'pulse' | 'filter' | 'speed';

const TABLE_COLORS: Record<TableType, string> = {
  wave: '#60e060',
  pulse: '#ff8866',
  filter: '#ffcc00',
  speed: '#6699ff',
};

const ROW_H = 14;

export const GTTableEditor: React.FC<{ width: number; height: number }> = ({ width, height }) => {
  const [activeTable, setActiveTable] = useState<TableType>('wave');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tableData = useGTUltraStore((s) => s.tableData);
  const tableCursor = useGTUltraStore((s) => s.tableCursor);
  const setTableCursor = useGTUltraStore((s) => s.setTableCursor);

  const tabHeight = 22;
  const headerHeight = 16;
  const contentHeight = height - tabHeight - headerHeight;
  const visibleRows = Math.floor(contentHeight / ROW_H);

  // Get table for active type (ltable + rtable, 255 entries each)
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

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, contentHeight);

    ctx.font = `11px "JetBrains Mono", monospace`;
    ctx.textBaseline = 'top';

    // Header
    ctx.fillStyle = '#0f3460';
    ctx.fillRect(0, 0, width, headerHeight);
    ctx.fillStyle = '#888';
    ctx.fillText(' IDX  LEFT  RIGHT', 4, 2);

    const scrollTop = Math.max(0, tableCursor - Math.floor(visibleRows / 2));
    const color = TABLE_COLORS[activeTable];

    for (let vi = 0; vi < visibleRows; vi++) {
      const idx = scrollTop + vi;
      if (idx >= 255) break;
      const y = headerHeight + vi * ROW_H;
      const isCursor = idx === tableCursor;

      if (isCursor) {
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(0, y, width, ROW_H);
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, y + 0.5, width - 1, ROW_H - 1);
      }

      // Index
      ctx.fillStyle = '#666';
      ctx.fillText(idx.toString(16).toUpperCase().padStart(2, '0'), 8, y + 1);

      // Left value
      const left = table.left[idx];
      ctx.fillStyle = left === 0 ? '#333' : color;
      ctx.fillText(left.toString(16).toUpperCase().padStart(2, '0'), 40, y + 1);

      // Right value
      const right = table.right[idx];
      ctx.fillStyle = right === 0 ? '#333' : color;
      ctx.fillText(right.toString(16).toUpperCase().padStart(2, '0'), 80, y + 1);

      // Visual bar for right value (common for wave/pulse tables)
      if (right > 0 && (activeTable === 'pulse' || activeTable === 'filter')) {
        const barW = (right / 255) * (width - 120);
        ctx.fillStyle = color + '33';
        ctx.fillRect(110, y + 2, barW, ROW_H - 4);
      }
    }
  }, [width, contentHeight, activeTable, table, tableCursor, visibleRows, headerHeight]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const y = e.clientY - rect.top;
    if (y < headerHeight) return;
    const scrollTop = Math.max(0, tableCursor - Math.floor(visibleRows / 2));
    const idx = scrollTop + Math.floor((y - headerHeight) / ROW_H);
    if (idx < 255) setTableCursor(idx);
  }, [tableCursor, visibleRows, headerHeight, setTableCursor]);

  return (
    <div style={{ width, height, display: 'flex', flexDirection: 'column' }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', height: tabHeight, background: '#0f3460' }}>
        {(['wave', 'pulse', 'filter', 'speed'] as TableType[]).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTable(t)}
            style={{
              flex: 1,
              background: activeTable === t ? '#1a1a2e' : 'transparent',
              color: activeTable === t ? TABLE_COLORS[t] : '#666',
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
      <canvas
        ref={canvasRef}
        style={{ width, height: contentHeight }}
        onClick={handleCanvasClick}
      />
    </div>
  );
};
