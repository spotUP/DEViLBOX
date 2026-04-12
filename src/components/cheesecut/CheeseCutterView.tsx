/**
 * CheeseCutterView — CheeseCutter pattern editor view (DOM mode).
 *
 * Layout (matches SF2View):
 * +----------------------------------------------+
 * | Toolbar (CheeseCutter info, transport, HW)    |  36px
 * +----------+-----------------------------------+
 * | Order    | PatternEditorCanvas               |
 * | Matrix   | (3 channels from current order    |
 * | (3 cols) |  position's sequences)            |
 * | 150px    |                                   |
 * +----------+-----------------------------------+
 *
 * Uses the shared PatternEditorCanvas with FormatChannel[] from
 * useCheeseCutterFormatData, same approach as SF2View / GTUltraView.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { PatternEditorCanvas } from '@/components/tracker/PatternEditorCanvas';
import { CC_COLUMNS } from './cheeseCutterAdapter';
import { useCheeseCutterFormatData } from './useCheeseCutterFormatData';
import { useCheeseCutterStore } from '@/stores/useCheeseCutterStore';
import { useCheeseCutterKeyboardHandler } from './CheeseCutterKeyboardHandler';
import { useCheeseCutterEngine, useCheeseCutterLiveSync } from '@/hooks/useCheeseCutterEngine';
import { SIDHardwareToggle } from '@/components/common/SIDHardwareToggle';
import type { CCTrackListEntry } from '@/stores/useCheeseCutterStore';

const TOOLBAR_H = 36;
const ORDER_MATRIX_W = 150;

export const CheeseCutterView: React.FC = () => {
  const { channels, currentRow, isPlaying, handleCellChange } = useCheeseCutterFormatData();
  const handleCursorChange = useCallback((cursor: { channelIndex: number; rowIndex: number; columnIndex: number }) => {
    useCheeseCutterStore.getState().setCursor({
      channel: cursor.channelIndex,
      row: cursor.rowIndex,
      column: cursor.columnIndex,
    });
  }, []);

  const loaded = useCheeseCutterStore((s) => s.loaded);
  const version = useCheeseCutterStore((s) => s.version);
  const title = useCheeseCutterStore((s) => s.title);
  const sidModel = useCheeseCutterStore((s) => s.sidModel);
  const clock = useCheeseCutterStore((s) => s.clock);
  const subtuneCount = useCheeseCutterStore((s) => s.subtuneCount);
  const currentSubtune = useCheeseCutterStore((s) => s.currentSubtune);
  const trackLists = useCheeseCutterStore((s) => s.trackLists);
  const orderCursor = useCheeseCutterStore((s) => s.orderCursor);

  useCheeseCutterKeyboardHandler(loaded);
  useCheeseCutterLiveSync();

  // Hardware SID output bridge
  const { engine: ccEngine } = useCheeseCutterEngine();
  const [hwBridgeEnabled, setHwBridgeEnabled] = useState(false);
  const [hwWriteCount, setHwWriteCount] = useState(0);

  useEffect(() => {
    if (!ccEngine) return;
    const unsub = ccEngine.onHardwareChange(setHwBridgeEnabled);
    setHwBridgeEnabled(ccEngine.isHardwareOutputEnabled);
    return unsub;
  }, [ccEngine]);

  useEffect(() => {
    if (!hwBridgeEnabled) { setHwWriteCount(0); return; }
    const interval = setInterval(async () => {
      const { getSIDHardwareManager } = await import('@/lib/sid/SIDHardwareManager');
      setHwWriteCount(getSIDHardwareManager().writeCount);
    }, 500);
    return () => clearInterval(interval);
  }, [hwBridgeEnabled]);

  const handleHwEnable = useCallback(() => { ccEngine?.enableHardwareOutput(); }, [ccEngine]);
  const handleHwDisable = useCallback(() => { ccEngine?.disableHardwareOutput(); }, [ccEngine]);

  const maxOlLen = Math.max(1, ...trackLists.map(tl => tl.length));

  const handlePrevPos = useCallback(() => {
    useCheeseCutterStore.getState().setOrderCursor(Math.max(0, orderCursor - 1));
  }, [orderCursor]);

  const handleNextPos = useCallback(() => {
    useCheeseCutterStore.getState().setOrderCursor(Math.min(maxOlLen - 1, orderCursor + 1));
  }, [orderCursor, maxOlLen]);

  const handlePosClick = useCallback((pos: number) => {
    useCheeseCutterStore.getState().setOrderCursor(pos);
  }, []);

  const sidModelStr = sidModel === 0 ? '6581' : '8580';
  const clockStr = clock === 0 ? 'PAL' : 'NTSC';

  return (
    <div className="flex flex-col w-full h-full bg-dark-bgPrimary font-mono text-xs text-text-secondary">
      {/* Toolbar */}
      <div
        className="flex items-center gap-2 px-3 border-b border-dark-border bg-dark-bgTertiary flex-shrink-0"
        style={{ height: TOOLBAR_H }}
      >
        <span className="text-accent-primary font-bold text-sm tracking-wide">CheeseCutter</span>
        <span className="text-text-muted text-[10px]">v{version}</span>
        <span className="text-dark-border">|</span>
        <span className="text-text-secondary text-[11px] truncate flex-1">{title || 'Untitled'}</span>
        <span className="text-dark-border">|</span>
        <span className="text-text-muted text-[10px]">3ch</span>
        <span className="text-text-muted text-[10px]">{sidModelStr}</span>
        <span className="text-text-muted text-[10px]">{clockStr}</span>
        {subtuneCount > 1 && (
          <>
            <span className="text-dark-border">|</span>
            <span className="text-accent-primary text-[10px] font-bold">
              Subtune {currentSubtune + 1}/{subtuneCount}
            </span>
          </>
        )}
        <SIDHardwareToggle
          bridgeEnabled={hwBridgeEnabled}
          onEnable={handleHwEnable}
          onDisable={handleHwDisable}
          writeCount={hwWriteCount}
        />
        <span className="text-dark-border">|</span>
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
        {loaded && trackLists.length > 0 && (
          <CCOrderMatrix
            trackLists={trackLists}
            orderCursor={orderCursor}
            onPosClick={handlePosClick}
          />
        )}

        {/* Pattern Editor */}
        <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
          {loaded && channels.length > 0 ? (
            <PatternEditorCanvas
              formatColumns={CC_COLUMNS}
              formatChannels={channels}
              formatCurrentRow={currentRow}
              formatIsPlaying={isPlaying}
              onFormatCellChange={handleCellChange}
              onFormatCursorChange={handleCursorChange}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-text-muted text-sm">
              {loaded ? 'Loading pattern data...' : 'Drop a .ct file to start editing'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// -- Order Matrix Component --

const CCOrderMatrix: React.FC<{
  trackLists: Array<CCTrackListEntry[]>;
  orderCursor: number;
  onPosClick: (pos: number) => void;
}> = React.memo(({ trackLists, orderCursor, onPosClick }) => {
  const maxLen = Math.max(1, ...trackLists.map(tl => tl.length));
  const visibleRows = Math.min(maxLen, 256);

  return (
    <div
      className="flex-shrink-0 border-r border-dark-border bg-dark-bgSecondary overflow-y-auto"
      style={{ width: ORDER_MATRIX_W }}
    >
      {/* Header */}
      <div className="sticky top-0 z-10 flex bg-dark-bgTertiary border-b border-dark-border">
        <div className="w-8 text-center text-[9px] text-text-muted py-0.5 border-r border-dark-border/50">Pos</div>
        {trackLists.map((_, ch) => (
          <div key={ch} className="flex-1 text-center text-[9px] text-text-muted py-0.5 border-r border-dark-border/50 last:border-r-0">
            V{ch + 1}
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
            {trackLists.map((tl, ch) => {
              const entry = pos < tl.length ? tl[pos] : null;
              const isEnd = entry === null || entry.isEnd;
              const seqIdx = entry?.sequence ?? -1;
              const transpose = entry?.transpose ?? 0;
              const showTranspose = transpose !== 0;
              return (
                <div
                  key={ch}
                  className={`flex-1 text-center text-[10px] py-px border-r border-dark-border/50 last:border-r-0 ${
                    isEnd
                      ? 'text-text-muted/30'
                      : isCurrent
                        ? 'text-accent-primary font-bold'
                        : 'text-text-secondary'
                  }`}
                >
                  {isEnd ? '..' : (
                    <>
                      {showTranspose && (
                        <span className="text-[8px] text-accent-warning">
                          {transpose > 0 ? '+' : ''}{transpose}{' '}
                        </span>
                      )}
                      {seqIdx.toString(16).toUpperCase().padStart(2, '0')}
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
