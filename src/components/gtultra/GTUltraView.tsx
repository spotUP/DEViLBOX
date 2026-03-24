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
import type { FormatCell, FormatChannel } from '@/components/shared/format-editor-types';
import { GTU_COLUMNS, resolveOrderPattern } from './gtuAdapter';
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
            // Uint8Array.buffer may be a larger pooled ArrayBuffer —
            // slice to extract ONLY the file data, not the entire pool.
            const pd = store.pendingSongData;
            const songBuffer = pd.buffer.slice(pd.byteOffset, pd.byteOffset + pd.byteLength) as ArrayBuffer;
            gtEngine!.loadSong(songBuffer);
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
        onSongLoaded: (ok) => {
          if (!ok) {
            console.error('[GTUltra] Song load failed in WASM engine');
            return;
          }
          const store = useGTUltraStore.getState();
          store.refreshSongInfo();
          store.refreshAllOrders();
          store.refreshAllInstruments();
          store.refreshAllTables();
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

    // GT patterns are single-channel: each channel has its own order list pointing
    // to shared pattern numbers.  Resolve each channel's pattern independently.
    for (let ch = 0; ch < channelCount; ch++) {
      const patIdx = resolveOrderPattern(orderData[ch], currentOrderPos);
      const pat = patternData.get(patIdx);
      const rows: FormatCell[] = [];
      const patLen = pat?.length ?? 64;

      for (let row = 0; row < patLen; row++) {
        if (pat && row < pat.length) {
          const off = row * 4;
          rows.push({
            note: pat.data[off] ?? 0,
            instrument: pat.data[off + 1] ?? 0,
            command: pat.data[off + 2] ?? 0,
            data: pat.data[off + 3] ?? 0,
          });
        } else {
          rows.push({ note: 0, instrument: 0, command: 0, data: 0 });
        }
      }

      result.push({
        label: `CH${(ch + 1).toString().padStart(2, '0')}`,
        patternLength: patLen,
        rows,
      });
    }

    return result;
  }, [channelCount, orderData, patternData, currentOrderPos]);

  const handleCellChange = useCallback((channelIdx: number, rowIdx: number, columnKey: string, value: number) => {
    const engine = useGTUltraStore.getState().engine;
    if (!engine) return;
    const store = useGTUltraStore.getState();
    const patIdx = resolveOrderPattern(store.orderData[channelIdx], currentOrderPos);
    const colMap: Record<string, number> = { note: 0, instrument: 1, command: 2, data: 3 };
    const col = colMap[columnKey];
    if (col === undefined) return;
    engine.setPatternCell(patIdx, rowIdx, col, value);
  }, [currentOrderPos]);

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
