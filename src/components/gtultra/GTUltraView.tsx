/**
 * GTUltraView — Main GoatTracker Ultra editor layout (DOM mode).
 *
 * Layout:
 * ┌────────────────────────────────────────────┐
 * │ Toolbar: Song name, Play/Stop, SID config  │
 * ├───────────────────────┬────────────────────┤
 * │                       │ Order list (per ch) │
 * │  Pattern Editor       ├────────────────────┤
 * │  (3 or 6 channels)    │ Instrument editor  │
 * │                       ├────────────────────┤
 * │                       │ Table editors      │
 * └───────────────────────┴────────────────────┘
 */

import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import * as Tone from 'tone';
import { useTransportStore } from '@stores/useTransportStore';
import { useGTUltraStore } from '../../stores/useGTUltraStore';
import { PatternEditorCanvas } from '@/components/tracker/PatternEditorCanvas';
import type { FormatChannel } from '@/components/shared/format-editor-types';
import { GTU_COLUMNS, gtuToFormatChannels, parseBinaryPatternData } from './gtuAdapter';
import { GTToolbar } from './GTToolbar';
import { GTInstrumentPanel } from './GTInstrumentPanel';
import { GTOrderList } from './GTOrderList';
import { GTTableEditor } from './GTTableEditor';
import { useGTKeyboardHandler } from './GTKeyboardHandler';
import { GTUltraEngine } from '../../engine/gtultra/GTUltraEngine';
import { getGTUltraASIDBridge } from '../../engine/gtultra/GTUltraASIDBridge';

const SIDEBAR_WIDTH = 300;

export const GTUltraView: React.FC<{ width?: number; height?: number }> = ({ width: propW, height: propH }) => {
  const setEngine = useGTUltraStore((s) => s.setEngine);
  const sidCount = useGTUltraStore((s) => s.sidCount);
  const channelCount = sidCount * 3;
  const currentRow = useTransportStore((s) => s.currentRow);
  const isPlaying = useTransportStore((s) => s.isPlaying);
  const orderData = useGTUltraStore((s) => s.orderData);
  const patternData = useGTUltraStore((s) => s.patternData);
  const playbackPos = useGTUltraStore((s) => s.playbackPos);

  // Measure container if no explicit dimensions
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: propW ?? 800, h: propH ?? 600 });

  useEffect(() => {
    if (propW && propH) { setSize({ w: propW, h: propH }); return; }
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ w: width, h: height });
    });
    ro.observe(el);
    // Initial measurement
    setSize({ w: el.clientWidth || 800, h: el.clientHeight || 600 });
    return () => ro.disconnect();
  }, [propW, propH]);

  const { w: width, h: height } = size;

  // Keyboard input
  useGTKeyboardHandler(true);

  // Initialize engine on mount
  useEffect(() => {
    let gtEngine: GTUltraEngine | null = null;
    let disposed = false;

    const setup = async () => {
      const audioCtx = Tone.getContext().rawContext as AudioContext;
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      gtEngine = new GTUltraEngine(audioCtx, {
        onReady: () => {
          if (disposed) return;
          setEngine(gtEngine);
          const store = useGTUltraStore.getState();
          if (store.pendingSongData) {
            gtEngine!.loadSong(store.pendingSongData.buffer as ArrayBuffer);
            store.setPendingSongData(null);
          }
          store.refreshSongInfo();
          store.refreshAllOrders();
          store.refreshAllInstruments();
          store.refreshAllTables();
        },
        onPosition: (pos) => { useGTUltraStore.getState().updatePlaybackPos(pos); },
        onAsidWrite: (chip, reg, value) => { getGTUltraASIDBridge().writeRegister(chip, reg, value); },
        onPatternData: (pattern, length, data) => { useGTUltraStore.getState().updatePatternData(pattern, length, data); },
        onOrderData: (channel, data) => { useGTUltraStore.getState().updateOrderData(channel, data); },
        onInstrumentData: (instrument, data) => { useGTUltraStore.getState().updateInstrumentData(instrument, data); },
        onTableData: (tableType, left, right) => { useGTUltraStore.getState().updateTableData(tableType, left, right); },
        onSidRegisters: (sidIdx, data) => { useGTUltraStore.getState().updateSidRegisters(sidIdx, data); },
        onSongInfo: (info) => {
          const store = useGTUltraStore.getState();
          store.setSongName(info.name);
          store.setSongAuthor(info.author);
          if (info.numPatterns > 0) store.refreshAllPatterns(info.numPatterns);
        },
        onError: (err) => { console.error('[GTUltra] Engine error:', err); },
      });
      await gtEngine.init();
      await gtEngine.ready;
      if (disposed) { gtEngine.dispose(); return; }
      gtEngine.output.connect(audioCtx.destination);
    };

    setup().catch(console.error);

    return () => {
      disposed = true;
      gtEngine?.dispose();
      setEngine(null);
    };
  }, [setEngine]);

  const orderCursor = useGTUltraStore((s) => s.orderCursor);
  const currentOrderPos = isPlaying ? playbackPos.songPos : orderCursor;

  const channels = useMemo(() => {
    // Each channel has its own order list and can point to different patterns.
    // Look up each channel's pattern independently.
    const allSamePattern = (() => {
      const first = orderData[0]?.[currentOrderPos] ?? 0;
      for (let ch = 1; ch < channelCount; ch++) {
        if ((orderData[ch]?.[currentOrderPos] ?? 0) !== first) return false;
      }
      return true;
    })();

    // Fast path: all channels use the same pattern (common case)
    if (allSamePattern) {
      const patIdx = orderData[0]?.[currentOrderPos] ?? 0;
      const patEntry = patternData.get(patIdx);
      if (!patEntry) {
        return Array.from({ length: channelCount }, (_, ch) => ({
          label: `CH${(ch + 1).toString().padStart(2, '0')}`, patternLength: 64, rows: [],
        } as FormatChannel));
      }
      const structured = parseBinaryPatternData(patEntry.data, channelCount, patEntry.length);
      return gtuToFormatChannels(structured, channelCount, patEntry.length);
    }

    // Per-channel patterns: each channel may be at a different pattern
    const result: FormatChannel[] = [];
    for (let ch = 0; ch < channelCount; ch++) {
      const patIdx = orderData[ch]?.[currentOrderPos] ?? 0;
      const patEntry = patternData.get(patIdx);
      if (!patEntry) {
        result.push({ label: `CH${(ch + 1).toString().padStart(2, '0')}`, patternLength: 64, rows: [] });
        continue;
      }
      // Parse full pattern blob, extract just this channel's data
      const structured = parseBinaryPatternData(patEntry.data, channelCount, patEntry.length);
      const allFormatted = gtuToFormatChannels(structured, channelCount, patEntry.length);
      result.push(allFormatted[ch] || { label: `CH${(ch + 1).toString().padStart(2, '0')}`, patternLength: patEntry.length, rows: [] });
    }
    return result;
  }, [channelCount, orderData, patternData, currentOrderPos]);

  const handleCellChange = useCallback((channelIdx: number, rowIdx: number, columnKey: string, value: number) => {
    const engine = useGTUltraStore.getState().engine;
    if (!engine) return;
    const patIdx = orderData[channelIdx]?.[currentOrderPos] ?? orderData[0]?.[currentOrderPos] ?? 0;
    // GT Ultra binary layout: col 0=note, 1=instrument, 2=command, 3=data
    const colMap: Record<string, number> = { note: 0, instrument: 1, command: 2, data: 3 };
    const col = colMap[columnKey];
    if (col === undefined) return;
    // setPatternCell writes to WASM; the onPatternData callback will refresh store
    engine.setPatternCell(patIdx, rowIdx, col, value);
  }, [orderData, currentOrderPos]);

  const sidebarW = Math.min(SIDEBAR_WIDTH, Math.floor(width * 0.35));

  return (
    <div ref={containerRef} className="flex flex-col flex-1 min-h-0 bg-dark-bgPrimary text-ft2-text font-mono" style={propW ? { width, height } : undefined}>
      {/* Toolbar */}
      <GTToolbar />

      {/* Main content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Pattern editor */}
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
          <PatternEditorCanvas
            formatColumns={GTU_COLUMNS}
            formatChannels={channels}
            formatCurrentRow={isPlaying ? playbackPos.row : currentRow}
            formatIsPlaying={isPlaying}
            onFormatCellChange={handleCellChange}
          />
        </div>

        {/* Sidebar */}
        <div className="flex flex-col border-l border-ft2-border" style={{ width: sidebarW }}>
          <GTOrderList
            width={sidebarW}
            height={Math.floor((height - 36) * 0.25)}
            channelCount={channelCount}
          />
          <GTInstrumentPanel
            width={sidebarW}
            height={Math.floor((height - 36) * 0.35)}
          />
          <GTTableEditor
            width={sidebarW}
            height={Math.floor((height - 36) * 0.40)}
          />
        </div>
      </div>
    </div>
  );
};
