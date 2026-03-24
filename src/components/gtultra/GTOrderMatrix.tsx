/**
 * GTOrderMatrix — Tabbed panel with order list + table editors for GoatTracker Ultra.
 *
 * AHX/Hively-style position editor pattern: a compact tabbed panel (~160px height)
 * sitting between the toolbar and pattern editor.
 *
 * Tabs:
 *   Orders — Per-channel order list (pattern sequence)
 *   Wave   — Wave table editor (255 entries, left+right)
 *   Pulse  — Pulse table editor
 *   Filter — Filter table editor
 *   Speed  — Speed table editor
 *
 * Uses canvas-based rendering with monospace hex display.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useGTUltraStore } from '../../stores/useGTUltraStore';

export const GT_ORDER_MATRIX_HEIGHT = 160;

type TabId = 'orders' | 'wave' | 'pulse' | 'filter' | 'speed';
const TABS: { id: TabId; label: string }[] = [
  { id: 'orders', label: 'Orders' },
  { id: 'wave', label: 'Wave' },
  { id: 'pulse', label: 'Pulse' },
  { id: 'filter', label: 'Filter' },
  { id: 'speed', label: 'Speed' },
];

const TAB_COLORS: Record<TabId, string> = {
  orders: '#ff6666',
  wave: '#60e060',
  pulse: '#ff8866',
  filter: '#ffcc00',
  speed: '#6699ff',
};

// Table type index for engine.setTableEntry()
const TABLE_TYPE_INDEX: Record<string, number> = { wave: 0, pulse: 1, filter: 2, speed: 3 };

// Table pointer field names on GTInstrumentView
const TABLE_PTR_FIELD: Record<string, 'wavePtr' | 'pulsePtr' | 'filterPtr' | 'speedPtr'> = {
  wave: 'wavePtr', pulse: 'pulsePtr', filter: 'filterPtr', speed: 'speedPtr',
};

const CHAR_W = 8;
const ROW_H = 14;
const TAB_BAR_H = 24;
const HEADER_H = 16;

interface GTOrderMatrixProps {
  width: number;
  height: number;
}

// ─── Order command coloring ──────────────────────────────────────────────────

function getOrderColor(val: number): string {
  if (val === 0xFF) return '#dd0000';
  if (val >= 0xF0) return '#00dd00';
  if (val >= 0xE0) return '#dddd00';
  if (val >= 0xD0) return '#00dddd';
  return '#e0e0e0';
}

function formatOrderVal(val: number): string {
  if (val === 0xFF) return 'EN';
  if (val >= 0xD0 && val <= 0xDF) return `R${(val & 0x0F).toString(16).toUpperCase()}`;
  if (val >= 0xE0 && val <= 0xEF) return `-${(val & 0x0F).toString(16).toUpperCase()}`;
  if (val >= 0xF0 && val <= 0xFE) return `+${(val & 0x0F).toString(16).toUpperCase()}`;
  return val.toString(16).toUpperCase().padStart(2, '0');
}

// ─── Orders Canvas ──────────────────────────────────────────────────────────

const OrdersCanvas: React.FC<{ width: number; height: number }> = ({ width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const orderData = useGTUltraStore((s) => s.orderData);
  const playbackPos = useGTUltraStore((s) => s.playbackPos);
  const orderCursor = useGTUltraStore((s) => s.orderCursor);
  const setOrderCursor = useGTUltraStore((s) => s.setOrderCursor);
  const orderChannelCol = useGTUltraStore((s) => s.orderChannelCol);
  const setOrderChannelCol = useGTUltraStore((s) => s.setOrderChannelCol);
  const sidCount = useGTUltraStore((s) => s.sidCount);
  const engine = useGTUltraStore((s) => s.engine);

  const [scrollOffset, setScrollOffset] = useState(0);
  const [hexDigit, setHexDigit] = useState<number | null>(null);

  const channelCount = sidCount * 3;
  const contentH = height - HEADER_H;
  const visibleRows = Math.floor(contentH / ROW_H);
  const totalLen = orderData.length > 0 ? orderData[0].length : 0;

  // Auto-scroll to keep cursor visible
  useEffect(() => {
    if (orderCursor < scrollOffset) {
      setScrollOffset(orderCursor);
    } else if (orderCursor >= scrollOffset + visibleRows) {
      setScrollOffset(orderCursor - visibleRows + 1);
    }
  }, [orderCursor, scrollOffset, visibleRows]);

  // Render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);
    ctx.font = `11px "JetBrains Mono", monospace`;
    ctx.textBaseline = 'top';

    // Header
    const posColW = CHAR_W * 3 + 4;
    const chColW = Math.max(CHAR_W * 3, Math.floor((width - posColW) / channelCount));

    ctx.fillStyle = '#111122';
    ctx.fillRect(0, 0, width, HEADER_H);
    ctx.fillStyle = '#555';
    ctx.fillText('Pos', 2, 2);
    for (let ch = 0; ch < channelCount; ch++) {
      ctx.fillStyle = ch === orderChannelCol ? '#ccc' : '#555';
      ctx.fillText(`C${ch + 1}`, posColW + ch * chColW, 2);
    }

    // Rows
    for (let vi = 0; vi < visibleRows; vi++) {
      const idx = scrollOffset + vi;
      if (idx >= totalLen) break;
      const y = HEADER_H + vi * ROW_H;
      const isPlay = idx === playbackPos.position;
      const isCursor = idx === orderCursor;

      // Playback highlight
      if (isPlay) {
        ctx.fillStyle = 'rgba(233, 69, 96, 0.15)';
        ctx.fillRect(0, y, width, ROW_H);
      }

      // Cursor highlight
      if (isCursor) {
        const activeX = posColW + orderChannelCol * chColW;
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(activeX - 2, y, chColW, ROW_H);
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, y + 0.5, width - 1, ROW_H - 1);
      }

      // Position index
      ctx.fillStyle = isPlay ? '#ff6666' : '#555';
      ctx.fillText(idx.toString(16).toUpperCase().padStart(2, '0'), 4, y + 1);

      // Channel values
      for (let ch = 0; ch < channelCount; ch++) {
        const val = orderData[ch]?.[idx] ?? 0;
        ctx.fillStyle = getOrderColor(val);
        ctx.fillText(formatOrderVal(val), posColW + ch * chColW, y + 1);
      }
    }

    // Hex entry indicator
    if (hexDigit !== null) {
      const cx = posColW + orderChannelCol * chColW;
      const cy = HEADER_H + (orderCursor - scrollOffset) * ROW_H;
      if (cy >= HEADER_H && cy < height) {
        ctx.fillStyle = 'rgba(255, 102, 102, 0.3)';
        ctx.fillRect(cx - 2, cy, CHAR_W, ROW_H);
        ctx.fillStyle = '#ff6666';
        ctx.fillText(hexDigit.toString(16).toUpperCase(), cx, cy + 1);
      }
    }
  }, [width, height, orderData, playbackPos.position, orderCursor, orderChannelCol,
      channelCount, scrollOffset, visibleRows, totalLen, hexDigit]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 3 : -3;
    setScrollOffset((s) => Math.max(0, Math.min(totalLen - visibleRows, s + delta)));
  }, [totalLen, visibleRows]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (y < HEADER_H) return;
    const idx = scrollOffset + Math.floor((y - HEADER_H) / ROW_H);
    if (idx >= totalLen) return;
    setOrderCursor(idx);

    const posColW = CHAR_W * 3 + 4;
    const chColW = Math.max(CHAR_W * 3, Math.floor((width - posColW) / channelCount));
    const relX = x - posColW;
    if (relX >= 0) {
      const ch = Math.min(channelCount - 1, Math.floor(relX / chColW));
      setOrderChannelCol(ch);
    }
    setHexDigit(null);
    canvasRef.current?.focus();
  }, [scrollOffset, totalLen, setOrderCursor, setOrderChannelCol, width, channelCount]);

  const handleDoubleClick = useCallback(() => {
    if (engine) {
      const store = useGTUltraStore.getState();
      engine.play(store.currentSong, orderCursor, 0);
      store.setPlaying(true);
    }
  }, [engine, orderCursor]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const { key } = e;
    e.stopPropagation();

    if (key === 'ArrowUp') { e.preventDefault(); setOrderCursor(Math.max(0, orderCursor - 1)); setHexDigit(null); return; }
    if (key === 'ArrowDown') { e.preventDefault(); setOrderCursor(Math.min(totalLen - 1, orderCursor + 1)); setHexDigit(null); return; }
    if (key === 'ArrowLeft') { e.preventDefault(); setOrderChannelCol(Math.max(0, orderChannelCol - 1)); setHexDigit(null); return; }
    if (key === 'ArrowRight') { e.preventDefault(); setOrderChannelCol(Math.min(channelCount - 1, orderChannelCol + 1)); setHexDigit(null); return; }
    if (key === 'PageUp') { e.preventDefault(); setOrderCursor(Math.max(0, orderCursor - visibleRows)); setHexDigit(null); return; }
    if (key === 'PageDown') { e.preventDefault(); setOrderCursor(Math.min(totalLen - 1, orderCursor + visibleRows)); setHexDigit(null); return; }
    if (key === 'Home') { e.preventDefault(); setOrderCursor(0); setHexDigit(null); return; }
    if (key === 'End') { e.preventDefault(); setOrderCursor(totalLen - 1); setHexDigit(null); return; }

    if (key === 'Enter') { e.preventDefault(); handleDoubleClick(); return; }
    if (key === 'Escape') { setHexDigit(null); return; }

    const hexChar = key.toUpperCase();
    if (/^[0-9A-F]$/.test(hexChar)) {
      e.preventDefault();
      const nibble = parseInt(hexChar, 16);
      if (hexDigit === null) {
        setHexDigit(nibble);
      } else {
        const value = (hexDigit << 4) | nibble;
        if (engine) {
          engine.setOrderEntry(orderChannelCol, orderCursor, value);
          useGTUltraStore.getState().refreshAllOrders();
        }
        setHexDigit(null);
        setOrderCursor(Math.min(totalLen - 1, orderCursor + 1));
      }
    }
  }, [orderCursor, totalLen, orderChannelCol, channelCount, hexDigit, engine,
      setOrderCursor, setOrderChannelCol, visibleRows, handleDoubleClick]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, outline: 'none', cursor: 'pointer' }}
      tabIndex={0}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      onWheel={handleWheel}
    />
  );
};

// ─── Table Canvas ───────────────────────────────────────────────────────────

const TableCanvas: React.FC<{
  width: number;
  height: number;
  tableType: 'wave' | 'pulse' | 'filter' | 'speed';
}> = ({ width, height, tableType }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tableData = useGTUltraStore((s) => s.tableData);
  const tableCursor = useGTUltraStore((s) => s.tableCursor);
  const setTableCursor = useGTUltraStore((s) => s.setTableCursor);
  const instrumentData = useGTUltraStore((s) => s.instrumentData);
  const currentInstrument = useGTUltraStore((s) => s.currentInstrument);
  const engine = useGTUltraStore((s) => s.engine);

  const [scrollOffset, setScrollOffset] = useState(0);
  const [activeCol, setActiveCol] = useState<0 | 1>(0);
  const [hexDigit, setHexDigit] = useState<number | null>(null);

  const contentH = height - HEADER_H;
  const visibleRows = Math.floor(contentH / ROW_H);
  const table = tableData[tableType] ?? { left: new Uint8Array(255), right: new Uint8Array(255) };
  const color = TAB_COLORS[tableType];

  // Get current instrument's table pointer for highlight
  const instrView = instrumentData[currentInstrument];
  const ptrField = TABLE_PTR_FIELD[tableType];
  const instrPtr = instrView?.[ptrField] ?? -1;

  // Auto-scroll to keep cursor visible
  useEffect(() => {
    if (tableCursor < scrollOffset) {
      setScrollOffset(tableCursor);
    } else if (tableCursor >= scrollOffset + visibleRows) {
      setScrollOffset(tableCursor - visibleRows + 1);
    }
  }, [tableCursor, scrollOffset, visibleRows]);

  // Render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);
    ctx.font = `11px "JetBrains Mono", monospace`;
    ctx.textBaseline = 'top';

    // Header
    ctx.fillStyle = '#111122';
    ctx.fillRect(0, 0, width, HEADER_H);
    ctx.fillStyle = '#555';
    ctx.fillText('IDX', 4, 2);
    ctx.fillStyle = activeCol === 0 ? '#ccc' : '#555';
    ctx.fillText('LEFT', 36, 2);
    ctx.fillStyle = activeCol === 1 ? '#ccc' : '#555';
    ctx.fillText('RIGHT', 76, 2);

    // Rows
    for (let vi = 0; vi < visibleRows; vi++) {
      const idx = scrollOffset + vi;
      if (idx >= 255) break;
      const y = HEADER_H + vi * ROW_H;
      const isCursor = idx === tableCursor;
      const isPtr = idx === instrPtr;

      // Instrument pointer highlight
      if (isPtr) {
        ctx.fillStyle = 'rgba(255, 102, 102, 0.12)';
        ctx.fillRect(0, y, width, ROW_H);
      }

      // Cursor highlight
      if (isCursor) {
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(0, y, width, ROW_H);
        const colX = activeCol === 0 ? 34 : 74;
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(colX, y, 28, ROW_H);
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, y + 0.5, width - 1, ROW_H - 1);
      }

      // Index
      ctx.fillStyle = isPtr ? color : '#555';
      ctx.fillText(idx.toString(16).toUpperCase().padStart(2, '0'), 8, y + 1);

      // Left value
      const left = table.left[idx];
      ctx.fillStyle = left === 0 ? '#333' : color;
      ctx.fillText(left.toString(16).toUpperCase().padStart(2, '0'), 38, y + 1);

      // Right value
      const right = table.right[idx];
      ctx.fillStyle = right === 0 ? '#333' : color;
      ctx.fillText(right.toString(16).toUpperCase().padStart(2, '0'), 78, y + 1);
    }

    // Hex entry indicator
    if (hexDigit !== null) {
      const colX = activeCol === 0 ? 38 : 78;
      const cy = HEADER_H + (tableCursor - scrollOffset) * ROW_H;
      if (cy >= HEADER_H && cy < height) {
        ctx.fillStyle = 'rgba(255, 102, 102, 0.3)';
        ctx.fillRect(colX - 2, cy, CHAR_W, ROW_H);
        ctx.fillStyle = color;
        ctx.fillText(hexDigit.toString(16).toUpperCase(), colX, cy + 1);
      }
    }
  }, [width, height, table, tableCursor, scrollOffset, visibleRows, activeCol,
      hexDigit, instrPtr, color]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 3 : -3;
    setScrollOffset((s) => Math.max(0, Math.min(254 - visibleRows, s + delta)));
  }, [visibleRows]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (y < HEADER_H) return;
    const idx = scrollOffset + Math.floor((y - HEADER_H) / ROW_H);
    if (idx < 255) setTableCursor(idx);
    setActiveCol(x >= 64 && x < 110 ? 1 : 0);
    setHexDigit(null);
    canvasRef.current?.focus();
  }, [scrollOffset, setTableCursor]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const { key } = e;
    e.stopPropagation();

    if (key === 'ArrowUp') { e.preventDefault(); setTableCursor(Math.max(0, tableCursor - 1)); setHexDigit(null); return; }
    if (key === 'ArrowDown') { e.preventDefault(); setTableCursor(Math.min(254, tableCursor + 1)); setHexDigit(null); return; }
    if (key === 'ArrowLeft') { e.preventDefault(); setActiveCol(0); setHexDigit(null); return; }
    if (key === 'ArrowRight') { e.preventDefault(); setActiveCol(1); setHexDigit(null); return; }
    if (key === 'PageUp') { e.preventDefault(); setTableCursor(Math.max(0, tableCursor - visibleRows)); setHexDigit(null); return; }
    if (key === 'PageDown') { e.preventDefault(); setTableCursor(Math.min(254, tableCursor + visibleRows)); setHexDigit(null); return; }
    if (key === 'Home') { e.preventDefault(); setTableCursor(0); setHexDigit(null); return; }
    if (key === 'End') { e.preventDefault(); setTableCursor(254); setHexDigit(null); return; }
    if (key === 'Escape') { setHexDigit(null); return; }

    // Delete — clear current cell
    if (key === 'Delete') {
      e.preventDefault();
      if (engine) {
        engine.setTableEntry(TABLE_TYPE_INDEX[tableType], activeCol, tableCursor, 0);
        useGTUltraStore.getState().refreshAllTables();
      }
      return;
    }

    // Hex entry
    const hexChar = key.toUpperCase();
    if (/^[0-9A-F]$/.test(hexChar)) {
      e.preventDefault();
      const nibble = parseInt(hexChar, 16);
      if (hexDigit === null) {
        setHexDigit(nibble);
      } else {
        const value = (hexDigit << 4) | nibble;
        if (engine) {
          engine.setTableEntry(TABLE_TYPE_INDEX[tableType], activeCol, tableCursor, value);
          useGTUltraStore.getState().refreshAllTables();
        }
        setHexDigit(null);
        setTableCursor(Math.min(254, tableCursor + 1));
      }
    }
  }, [tableCursor, tableType, activeCol, hexDigit, engine, visibleRows, setTableCursor]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, outline: 'none', cursor: 'pointer' }}
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onWheel={handleWheel}
    />
  );
};

// ─── Main Component ─────────────────────────────────────────────────────────

export const GTOrderMatrix: React.FC<GTOrderMatrixProps> = ({ width, height }) => {
  const [activeTab, setActiveTab] = useState<TabId>('orders');
  const contentH = height - TAB_BAR_H;

  return (
    <div
      style={{
        width,
        height,
        display: 'flex',
        flexDirection: 'column',
        background: '#1a1a2e',
      }}
    >
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          gap: 1,
          height: TAB_BAR_H,
          alignItems: 'stretch',
          borderBottom: '1px solid #222244',
          flexShrink: 0,
        }}
      >
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            style={{
              flex: 1,
              background: activeTab === id ? '#2a2a4e' : 'transparent',
              color: activeTab === id ? TAB_COLORS[id] : '#888',
              border: 'none',
              borderBottom: activeTab === id ? `2px solid ${TAB_COLORS[id]}` : '2px solid transparent',
              cursor: 'pointer',
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 10,
              fontWeight: activeTab === id ? 'bold' : 'normal',
              textTransform: 'uppercase',
              padding: 0,
              letterSpacing: '0.05em',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {activeTab === 'orders' ? (
          <OrdersCanvas width={width} height={contentH} />
        ) : (
          <TableCanvas width={width} height={contentH} tableType={activeTab} />
        )}
      </div>
    </div>
  );
};
