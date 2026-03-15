/**
 * JamCrackerView — Pattern viewer for JamCracker Pro (.jam) files.
 *
 * Layout (via GenericFormatView):
 * ┌──────────────────────────────────────────────────┐
 * │ Toolbar (format, speed, song position)           │
 * ├──────────────────────────────────────────────────┤
 * │ Song Order List (positionEditor slot)            │
 * ├──────────────────────────────────────────────────┤
 * │ Pattern Editor (4 channels, fills remaining)     │
 * └──────────────────────────────────────────────────┘
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { useTransportStore } from '@stores/useTransportStore';
import { PatternEditorCanvas } from '@/components/tracker/PatternEditorCanvas';
import { JAMCRACKER_COLUMNS } from './jamcrackerAdapter';
import { JamCrackerEngine } from '@engine/jamcracker/JamCrackerEngine';
import { useJamCrackerData } from '@/hooks/useJamCrackerData';

const TOOLBAR_H = 36;
const ORDER_H = 120;

export const JamCrackerView: React.FC = () => {
  const speed = useTransportStore(s => s.speed);
  const {
    songInfo, channels, setEditPos, activePos,
    currentRow, isPlaying, patIdx, numRows, refreshPatternData,
  } = useJamCrackerData();

  const orderRef = useRef<HTMLDivElement>(null);

  // Auto-scroll order list to current position during playback
  useEffect(() => {
    if (!orderRef.current || !isPlaying) return;
    const el = orderRef.current;
    const itemW = 44;
    const targetLeft = activePos * itemW - el.clientWidth / 2 + itemW / 2;
    el.scrollLeft = Math.max(0, targetLeft);
  }, [activePos, isPlaying]);

  const handleCellChange = useCallback((channelIdx: number, rowIdx: number, columnKey: string, value: number) => {
    if (!JamCrackerEngine.hasInstance() || patIdx < 0) return;
    const fieldMap: Record<string, number> = {
      period: 0, instrument: 1, speed: 2, arpeggio: 3, vibrato: 4, volume: 5, porta: 6,
    };
    const fieldIdx = fieldMap[columnKey] ?? 0;
    JamCrackerEngine.getInstance().setPatternCell(patIdx, rowIdx, channelIdx, fieldIdx, value);
    refreshPatternData();
  }, [patIdx, refreshPatternData]);

  const handleExport = useCallback(async () => {
    if (!JamCrackerEngine.hasInstance()) return;
    const data = await JamCrackerEngine.getInstance().save();
    if (data.length === 0) return;
    const blob = new Blob([data.buffer as ArrayBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'export.jam';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const toolbarInfo = [
    `Speed: ${speed ?? 6}`,
    `Patterns: ${songInfo?.numPats ?? '?'}`,
    `Instruments: ${songInfo?.numInst ?? '?'}`,
    `Pos: ${activePos}/${songInfo?.songLen ?? '?'}`,
    patIdx >= 0 ? `Pat: ${patIdx}` : '',
    numRows > 0 ? `Rows: ${numRows}` : '',
  ].filter(Boolean).join('  |  ');

  const toolbarSlot = (
    <button
      className="px-2 py-0.5 text-xs bg-green-800 hover:bg-green-700 text-green-100 rounded border border-green-600"
      onClick={handleExport}
    >
      Export .jam
    </button>
  );

  const positionEditor = (
    <div style={{ height: ORDER_H }}>
      <div className="px-3 pt-2 pb-1">
        <span className="text-xs text-ft2-textDim">Song Order</span>
      </div>
      <div
        ref={orderRef}
        className="px-3 pb-2 flex gap-1 overflow-x-auto"
        style={{ maxHeight: ORDER_H - 30 }}
      >
        {songInfo?.entries.map((entry, idx) => (
          <button
            key={idx}
            onClick={() => { if (!isPlaying) setEditPos(idx); }}
            className={`flex-shrink-0 w-10 h-8 text-xs font-mono rounded border flex items-center justify-center ${
              idx === activePos
                ? 'bg-accent-primary/20 border-accent-primary text-accent-primary font-bold'
                : 'bg-dark-bgSecondary border-dark-border text-ft2-textDim hover:border-ft2-text/30'
            }`}
          >
            {entry.toString(16).toUpperCase().padStart(2, '0')}
          </button>
        )) ?? <span className="text-ft2-textDim text-xs">Loading...</span>}
      </div>
    </div>
  );

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      width: '100%', height: '100%',
      backgroundColor: '#0d0d0d',
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      fontSize: '12px',
      color: 'var(--color-text-secondary)',
    }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        height: `${TOOLBAR_H}px`, padding: '0 12px',
        borderBottom: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-bg-tertiary)',
      }}>
        <div style={{ fontWeight: 'bold', minWidth: '40px' }}>JAM</div>
        <div style={{ flex: 1, fontSize: '11px', color: 'var(--color-text-muted)' }}>{toolbarInfo}</div>
        {toolbarSlot}
      </div>

      {/* Song Order */}
      <div style={{
        height: `${ORDER_H}px`,
        borderBottom: '1px solid var(--color-border)',
        overflow: 'auto',
        backgroundColor: 'var(--color-bg-secondary)',
      }}>
        {positionEditor}
      </div>

      {/* Pattern Editor — only mount once pattern data is loaded so the worker
           initialises with valid channel/cell data (not an empty snapshot) */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {channels.length > 0 ? (
          <PatternEditorCanvas
            formatColumns={JAMCRACKER_COLUMNS}
            formatChannels={channels}
            formatCurrentRow={currentRow}
            formatIsPlaying={isPlaying}
            onFormatCellChange={handleCellChange}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-text-secondary text-sm font-mono">
            Loading pattern data…
          </div>
        )}
      </div>
    </div>
  );
};
