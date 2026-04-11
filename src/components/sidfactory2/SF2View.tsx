/**
 * SF2View — SID Factory II pattern editor view (DOM mode).
 *
 * Layout (matches native SF2 screen_edit):
 * ┌──────────────────────────────────────────────────────┐
 * │ Toolbar (driver info, song name, transport)           │  36px
 * ├──────────────┬───────────────────────────────────────┤
 * │ Order Matrix │ PatternEditorCanvas (sequences)        │
 * │ (per-track   │                                       │
 * │  order lists)│                                       │  flex
 * │  150px       │                                       │
 * └──────────────┴───────────────────────────────────────┘
 *
 * Uses the shared PatternEditorCanvas with FormatChannel[] from
 * useSF2FormatData, same approach as JamCrackerView / GTUltraView.
 */

import React, { useCallback } from 'react';
import { PatternEditorCanvas } from '@/components/tracker/PatternEditorCanvas';
import { SF2_COLUMNS } from './sf2Adapter';
import { useSF2FormatData } from './useSF2FormatData';
import { useSF2Store, type SF2OrderList } from '@/stores/useSF2Store';
import { useSF2KeyboardHandler } from './SF2KeyboardHandler';
import { useSF2LiveSync } from '@/hooks/useSF2Engine';

const TOOLBAR_H = 36;
const ORDER_MATRIX_W = 150;

export const SF2View: React.FC = () => {
  const { channels, currentRow, isPlaying, handleCellChange } = useSF2FormatData();
  const handleCursorChange = useCallback((cursor: { channelIndex: number; rowIndex: number; columnIndex: number }) => {
    useSF2Store.getState().setCursor({
      channel: cursor.channelIndex,
      row: cursor.rowIndex,
      column: cursor.columnIndex,
    });
  }, []);
  const descriptor = useSF2Store((s) => s.descriptor);
  const songName = useSF2Store((s) => s.songName);
  const trackCount = useSF2Store((s) => s.trackCount);
  const orderLists = useSF2Store((s) => s.orderLists);
  const orderCursor = useSF2Store((s) => s.orderCursor);
  const loaded = useSF2Store((s) => s.loaded);
  const sequences = useSF2Store((s) => s.sequences);

  useSF2KeyboardHandler(loaded);
  useSF2LiveSync();

  const maxOlLen = Math.max(1, ...orderLists.map(ol => ol.entries.length));
  const seqCount = sequences.size;

  const handlePrevPos = useCallback(() => {
    useSF2Store.getState().setOrderCursor(Math.max(0, orderCursor - 1));
  }, [orderCursor]);

  const handleNextPos = useCallback(() => {
    useSF2Store.getState().setOrderCursor(Math.min(maxOlLen - 1, orderCursor + 1));
  }, [orderCursor, maxOlLen]);

  const handlePosClick = useCallback((pos: number) => {
    useSF2Store.getState().setOrderCursor(pos);
  }, []);

  const driverVersion = descriptor
    ? `v${descriptor.versionMajor}.${String(descriptor.versionMinor).padStart(2, '0')}`
    : '';

  return (
    <div className="flex flex-col w-full h-full bg-dark-bgPrimary font-mono text-xs text-text-secondary">
      {/* Toolbar */}
      <div
        className="flex items-center gap-2 px-3 border-b border-dark-border bg-dark-bgTertiary flex-shrink-0"
        style={{ height: TOOLBAR_H }}
      >
        <span className="text-accent-primary font-bold text-sm tracking-wide">SID Factory II</span>
        <span className="text-text-muted text-[10px]">{driverVersion}</span>
        <span className="text-dark-border">│</span>
        <span className="text-text-secondary text-[11px] truncate flex-1">{songName || 'Untitled'}</span>
        <span className="text-dark-border">│</span>
        <span className="text-text-muted text-[10px]">{trackCount}ch</span>
        <span className="text-text-muted text-[10px]">{seqCount} seq</span>
        <span className="text-dark-border">│</span>
        <button
          className="px-2 py-0.5 text-[10px] bg-dark-bgSecondary hover:bg-dark-bgTertiary text-text-secondary rounded border border-dark-border disabled:opacity-30"
          onClick={handlePrevPos}
          disabled={orderCursor <= 0}
        >
          Prev
        </button>
        <span className="text-accent-primary font-bold text-[11px] min-w-[50px] text-center">
          {orderCursor + 1}/{maxOlLen}
        </span>
        <button
          className="px-2 py-0.5 text-[10px] bg-dark-bgSecondary hover:bg-dark-bgTertiary text-text-secondary rounded border border-dark-border disabled:opacity-30"
          onClick={handleNextPos}
          disabled={orderCursor >= maxOlLen - 1}
        >
          Next
        </button>
      </div>

      {/* Main content: Order Matrix + Pattern Editor */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Order Matrix (left panel) */}
        {loaded && orderLists.length > 0 && (
          <SF2OrderMatrix
            orderLists={orderLists}
            orderCursor={orderCursor}
            onPosClick={handlePosClick}
          />
        )}

        {/* Pattern Editor */}
        <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
          {loaded && channels.length > 0 ? (
            <PatternEditorCanvas
              formatColumns={SF2_COLUMNS}
              formatChannels={channels}
              formatCurrentRow={currentRow}
              formatIsPlaying={isPlaying}
              onFormatCellChange={handleCellChange}
              onFormatCursorChange={handleCursorChange}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-text-muted text-sm">
              {loaded ? 'Loading pattern data…' : 'Drop a .sf2 file to start editing'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Order Matrix Component ──

const SF2OrderMatrix: React.FC<{
  orderLists: SF2OrderList[];
  orderCursor: number;
  onPosClick: (pos: number) => void;
}> = React.memo(({ orderLists, orderCursor, onPosClick }) => {
  const maxLen = Math.max(1, ...orderLists.map(ol => ol.entries.length));
  const visibleRows = Math.min(maxLen, 256);

  return (
    <div
      className="flex-shrink-0 border-r border-dark-border bg-dark-bgSecondary overflow-y-auto"
      style={{ width: ORDER_MATRIX_W }}
    >
      {/* Header */}
      <div className="sticky top-0 z-10 flex bg-dark-bgTertiary border-b border-dark-border">
        <div className="w-8 text-center text-[9px] text-text-muted py-0.5 border-r border-dark-border/50">Pos</div>
        {orderLists.map((_, ch) => (
          <div key={ch} className="flex-1 text-center text-[9px] text-text-muted py-0.5 border-r border-dark-border/50 last:border-r-0">
            T{ch + 1}
          </div>
        ))}
      </div>

      {/* Rows */}
      {Array.from({ length: visibleRows }, (_, pos) => {
        const isCurrent = pos === orderCursor;
        return (
          <div
            key={pos}
            className={`flex cursor-pointer hover:bg-dark-bgTertiary transition-colors ${
              isCurrent ? 'bg-accent-primary/15 border-l-2 border-l-accent-primary' : ''
            } ${pos % 8 === 0 ? 'border-t border-dark-border/30' : ''}`}
            onClick={() => onPosClick(pos)}
          >
            <div className={`w-8 text-center text-[9px] py-px border-r border-dark-border/50 ${
              isCurrent ? 'text-accent-primary font-bold' : 'text-text-muted'
            }`}>
              {pos.toString(16).toUpperCase().padStart(2, '0')}
            </div>
            {orderLists.map((ol, ch) => {
              const entry = pos < ol.entries.length ? ol.entries[pos] : null;
              const seqIdx = entry?.seqIdx ?? -1;
              const isEnd = entry === null || seqIdx < 0;
              const isLoopPoint = ol.hasLoop && pos === ol.loopIndex;
              const transpose = entry?.transpose ?? 0xA0;
              const transposeOffset = transpose - 0xA0;
              const showTranspose = transposeOffset !== 0;
              return (
                <div
                  key={ch}
                  className={`flex-1 text-center text-[10px] py-px border-r border-dark-border/50 last:border-r-0 ${
                    isEnd
                      ? 'text-text-muted/30'
                      : isLoopPoint
                        ? 'text-accent-success font-bold'
                        : isCurrent
                          ? 'text-accent-primary font-bold'
                          : 'text-text-secondary'
                  }`}
                >
                  {isEnd ? '··' : (
                    <>
                      {showTranspose && (
                        <span className="text-[8px] text-accent-warning">
                          {transposeOffset > 0 ? '+' : ''}{transposeOffset}{' '}
                        </span>
                      )}
                      {seqIdx.toString(16).toUpperCase().padStart(2, '0')}
                      {isLoopPoint && <span className="text-accent-success text-[8px]"> ↺</span>}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
});
