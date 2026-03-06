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
import { FormatPatternEditor } from '@/components/shared/FormatPatternEditor';
import { GTU_COLUMNS, gtuToFormatChannels, parseBinaryPatternData, encodeBinaryPatternData } from './gtuAdapter';
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
  const engine = useGTUltraStore((s) => s.engine);
  const patternLength = useGTUltraStore((s) => s.patternLength);
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
          console.log('[GTUltra] Engine ready');
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
    const result: FormatChannel[] = [];

    // Get the pattern index from the first channel's order list at current position
    // (All channels should display the same pattern for now)
    const patIdx = orderData[0]?.[currentOrderPos] ?? 0;
    const patEntry = patternData.get(patIdx);

    if (!patEntry) {
      for (let ch = 0; ch < channelCount; ch++) {
        result.push({ label: `CH${(ch + 1).toString().padStart(2, '0')}`, patternLength: 64, rows: [] });
      }
      return result;
    }

    const structured = parseBinaryPatternData(patEntry.data, channelCount, patEntry.length);
    const formatted = gtuToFormatChannels(structured, channelCount, patEntry.length);
    return formatted;
  }, [channelCount, orderData, patternData, currentOrderPos]);

  const handleCellChange = useCallback((channelIdx: number, rowIdx: number, columnKey: string, value: number) => {
    if (!engine) return;

    const patIdx = orderData[0]?.[currentOrderPos] ?? 0;
    const patEntry = patternData.get(patIdx);
    if (!patEntry) return;

    const structured = parseBinaryPatternData(patEntry.data, channelCount, patEntry.length);
    const channelRows = structured[channelIdx];

    // Update the cell
    if (columnKey === 'note') channelRows[rowIdx].note = value;
    else if (columnKey === 'instrument') channelRows[rowIdx].instrument = value;
    else if (columnKey === 'command') channelRows[rowIdx].command = value;
    else if (columnKey === 'data') channelRows[rowIdx].data = value;

    // Encode back to binary
    const newBinary = encodeBinaryPatternData(structured, patEntry.length);

    // Send to engine
    engine.updatePattern(patIdx, channelIdx, rowIdx, columnKey, value);
  }, [engine, currentOrderPos, orderData, patternData, channelCount]);

  const sidebarW = Math.min(SIDEBAR_WIDTH, Math.floor(width * 0.35));
  const editorW = width - sidebarW;

  return (
    <div ref={containerRef} className="flex flex-col flex-1 min-h-0 bg-dark-bgPrimary text-ft2-text font-mono" style={propW ? { width, height } : undefined}>
      {/* Toolbar */}
      <GTToolbar />

      {/* Main content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Pattern editor */}
        <FormatPatternEditor
          width={editorW}
          height={height - 36}
          columns={GTU_COLUMNS}
          channels={channels}
          currentRow={currentRow}
          isPlaying={isPlaying}
          onCellChange={handleCellChange}
        />

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
