/**
 * SF2View — SID Factory II pattern editor view (DOM mode).
 *
 * Layout:
 * ┌──────────────────────────────────────────────┐
 * │ Toolbar (driver info, song name, positions)   │  36px
 * ├──────────────────────────────────────────────┤
 * │ PatternEditorCanvas (sequences side by side)  │  flex
 * └──────────────────────────────────────────────┘
 *
 * Uses the shared PatternEditorCanvas with FormatChannel[] from
 * useSF2FormatData, same approach as JamCrackerView / GTUltraView.
 */

import React, { useCallback } from 'react';
import { PatternEditorCanvas } from '@/components/tracker/PatternEditorCanvas';
import { SF2_COLUMNS } from './sf2Adapter';
import { useSF2FormatData } from './useSF2FormatData';
import { useSF2Store } from '@/stores/useSF2Store';

const TOOLBAR_H = 36;

export const SF2View: React.FC = () => {
  const { channels, currentRow, isPlaying, handleCellChange } = useSF2FormatData();
  const descriptor = useSF2Store((s) => s.descriptor);
  const songName = useSF2Store((s) => s.songName);
  const trackCount = useSF2Store((s) => s.trackCount);
  const orderLists = useSF2Store((s) => s.orderLists);
  const orderCursor = useSF2Store((s) => s.orderCursor);
  const loaded = useSF2Store((s) => s.loaded);

  const maxOlLen = Math.max(1, ...orderLists.map(ol => ol.entries.length));

  const handlePrevPos = useCallback(() => {
    useSF2Store.getState().setOrderCursor(Math.max(0, orderCursor - 1));
  }, [orderCursor]);

  const handleNextPos = useCallback(() => {
    useSF2Store.getState().setOrderCursor(Math.min(maxOlLen - 1, orderCursor + 1));
  }, [orderCursor, maxOlLen]);

  const driverVersion = descriptor
    ? `${descriptor.driverName} v${descriptor.versionMajor}.${String(descriptor.versionMinor).padStart(2, '0')}`
    : '';

  const toolbarInfo = [
    songName || 'Untitled',
    driverVersion,
    `Tracks: ${trackCount}`,
    `Pos: ${orderCursor + 1}/${maxOlLen}`,
  ].filter(Boolean).join('  │  ');

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      width: '100%', height: '100%',
      backgroundColor: 'var(--color-bg)',
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      fontSize: '12px',
      color: 'var(--color-text-secondary)',
    }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        height: `${TOOLBAR_H}px`, padding: '0 12px',
        borderBottom: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-bg-tertiary)',
      }}>
        <div style={{ fontWeight: 'bold', color: 'var(--color-accent-primary)', minWidth: '30px' }}>SF2</div>
        <div style={{ flex: 1, fontSize: '11px', color: 'var(--color-text-muted)', overflow: 'hidden', whiteSpace: 'nowrap' }}>
          {toolbarInfo}
        </div>
        <button
          className="px-2 py-0.5 text-xs bg-dark-bgSecondary hover:bg-dark-bgTertiary text-text-secondary rounded border border-dark-border"
          onClick={handlePrevPos}
          disabled={orderCursor <= 0}
        >
          ◀ Prev
        </button>
        <button
          className="px-2 py-0.5 text-xs bg-dark-bgSecondary hover:bg-dark-bgTertiary text-text-secondary rounded border border-dark-border"
          onClick={handleNextPos}
          disabled={orderCursor >= maxOlLen - 1}
        >
          Next ▶
        </button>
      </div>

      {/* Pattern Editor */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {loaded && channels.length > 0 ? (
          <PatternEditorCanvas
            formatColumns={SF2_COLUMNS}
            formatChannels={channels}
            formatCurrentRow={currentRow}
            formatIsPlaying={isPlaying}
            onFormatCellChange={handleCellChange}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-text-secondary text-sm font-mono">
            {loaded ? 'Loading pattern data…' : 'No SF2 file loaded'}
          </div>
        )}
      </div>
    </div>
  );
};
