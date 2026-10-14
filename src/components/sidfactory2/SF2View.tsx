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

import React, { useCallback, useEffect, useState } from 'react';
import { PatternEditorCanvas } from '@/components/tracker/PatternEditorCanvas';
import { SF2_COLUMNS } from './sf2Adapter';
import { useSF2FormatData } from './useSF2FormatData';
import { useSF2Store } from '@/stores/useSF2Store';
import { SF2OrderMatrix } from './SF2OrderMatrix';
import { useSF2KeyboardHandler } from './SF2KeyboardHandler';
import { useSF2LiveSync, useSF2Engine } from '@/hooks/useSF2Engine';
import { SIDHardwareToggle } from '@/components/common/SIDHardwareToggle';

const TOOLBAR_H = 36;

export const SF2View: React.FC = () => {
  const { channels, currentRow, currentOrderPos, isPlaying, handleCellChange } = useSF2FormatData();
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
  const playMarkers = useSF2Store((s) => s.playMarkers);
  const selectedMarker = useSF2Store((s) => s.selectedMarker);
  const sidModel = useSF2Store((s) => s.sidModel);
  const sidRegion = useSF2Store((s) => s.sidRegion);
  const notationMode = useSF2Store((s) => s.notationMode);
  const songCount = useSF2Store((s) => s.songCount);
  const currentSong = useSF2Store((s) => s.currentSong);
  const songNames = useSF2Store((s) => s.songNames);

  useSF2KeyboardHandler(loaded);
  useSF2LiveSync();

  // Hardware SID output bridge
  const { engine: sf2Engine } = useSF2Engine();
  const c64 = sf2Engine?.engine ?? null;
  const [hwBridgeEnabled, setHwBridgeEnabled] = useState(false);
  const [hwWriteCount, setHwWriteCount] = useState(0);

  useEffect(() => {
    if (!c64) return;
    const unsub = c64.onHardwareChange(setHwBridgeEnabled);
    setHwBridgeEnabled(c64.isHardwareOutputEnabled);
    return unsub;
  }, [c64]);

  useEffect(() => {
    if (!hwBridgeEnabled) { setHwWriteCount(0); return; }
    const interval = setInterval(async () => {
      const { getSIDHardwareManager } = await import('@/lib/sid/SIDHardwareManager');
      setHwWriteCount(getSIDHardwareManager().writeCount);
    }, 500);
    return () => clearInterval(interval);
  }, [hwBridgeEnabled]);

  const handleHwEnable = useCallback(() => { c64?.enableHardwareOutput(); }, [c64]);
  const handleHwDisable = useCallback(() => { c64?.disableHardwareOutput(); }, [c64]);

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
    <div className="flex flex-col w-full h-full bg-dark-bg font-mono text-xs text-text-secondary">
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
        <span className="text-text-muted text-[10px]">{sidModel}</span>
        <span className="text-text-muted text-[10px]">{sidRegion}</span>
        <span className="text-text-muted text-[10px]">{notationMode === 'sharp' ? '♯' : '♭'}</span>
        {songCount > 1 && (
          <>
            <span className="text-dark-border">│</span>
            <span className="text-accent-primary text-[10px] font-bold">
              Song {currentSong + 1}/{songCount}
            </span>
            <span className="text-text-muted text-[10px] truncate max-w-[80px]">
              {songNames[currentSong] || ''}
            </span>
          </>
        )}
        <SIDHardwareToggle
          bridgeEnabled={hwBridgeEnabled}
          onEnable={handleHwEnable}
          onDisable={handleHwDisable}
          writeCount={hwWriteCount}
        />
        <span className="text-dark-border">│</span>
        {/* Play marker slots */}
        <div className="flex gap-px">
          {playMarkers.map((m, i) => (
            <span
              key={i}
              className={`w-4 text-center text-[9px] rounded cursor-pointer ${
                i === selectedMarker
                  ? m.isSet ? 'bg-accent-success/30 text-accent-success font-bold' : 'bg-accent-primary/20 text-accent-primary'
                  : m.isSet ? 'text-accent-success/60' : 'text-text-muted/30'
              }`}
              title={m.isSet ? `Marker ${i + 1}: pos ${m.orderPos}:${m.eventPos}` : `Marker ${i + 1}: empty`}
              onClick={() => {
                useSF2Store.getState().selectMarker(i);
                if (m.isSet) useSF2Store.getState().gotoPlayMarker();
              }}
            >
              {i + 1}
            </span>
          ))}
        </div>
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
            currentPosition={currentOrderPos}
            isPlaying={isPlaying}
            onPositionClick={handlePosClick}
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
