/**
 * GTUltraView — Main GoatTracker Ultra editor layout.
 *
 * Layout (matching GoatTracker's classic 80x50 layout):
 * ┌────────────────────────────────────────────┐
 * │ Toolbar: Song name, Play/Stop, SID config  │
 * ├───────────────────────┬────────────────────┤
 * │                       │ Order list (per ch) │
 * │  Pattern Editor       ├────────────────────┤
 * │  (3 or 6 channels)    │ Instrument editor  │
 * │                       ├────────────────────┤
 * │                       │ Table editors      │
 * │                       │ (wave/pulse/filter/ │
 * │                       │  speed)            │
 * └───────────────────────┴────────────────────┘
 */

import React, { useEffect, useState } from 'react';
import { useGTUltraStore } from '../../stores/useGTUltraStore';
import { GTPatternEditor } from './GTPatternEditor';
import { GTToolbar } from './GTToolbar';
import { GTInstrumentPanel } from './GTInstrumentPanel';
import { GTOrderList } from './GTOrderList';
import { GTTableEditor } from './GTTableEditor';
import { useGTKeyboardHandler } from './GTKeyboardHandler';
import { GTUltraEngine } from '../../engine/gtultra/GTUltraEngine';
import { getGTUltraASIDBridge } from '../../engine/gtultra/GTUltraASIDBridge';

const SIDEBAR_WIDTH = 320;
const TOOLBAR_HEIGHT = 36;

export const GTUltraView: React.FC<{ width: number; height: number }> = ({ width, height }) => {
  const setEngine = useGTUltraStore((s) => s.setEngine);
  const sidCount = useGTUltraStore((s) => s.sidCount);
  const channelCount = sidCount * 3;
  const [patternData, setPatternData] = useState<Uint8Array[]>([]);

  // Keyboard input
  useGTKeyboardHandler(true);

  // Initialize engine on mount
  useEffect(() => {
    let gtEngine: GTUltraEngine | null = null;
    let disposed = false;

    const setup = async () => {
      const audioCtx = new AudioContext();
      gtEngine = new GTUltraEngine(audioCtx, {
        onReady: () => {
          if (disposed) return;
          console.log('[GTUltra] Engine ready');
          const store = useGTUltraStore.getState();
          // Load any pending song data that arrived before engine was ready
          if (store.pendingSongData) {
            gtEngine!.loadSong(store.pendingSongData.buffer as ArrayBuffer);
            store.setPendingSongData(null);
          }
          store.refreshSongInfo();
          store.refreshAllOrders();
          store.refreshAllInstruments();
          store.refreshAllTables();
        },
        onPosition: (pos) => {
          useGTUltraStore.getState().updatePlaybackPos(pos);
        },
        onAsidWrite: (chip, reg, value) => {
          getGTUltraASIDBridge().writeRegister(chip, reg, value);
        },
        onPatternData: (pattern, length, data) => {
          useGTUltraStore.getState().updatePatternData(pattern, length, data);
        },
        onOrderData: (channel, data) => {
          useGTUltraStore.getState().updateOrderData(channel, data);
        },
        onInstrumentData: (instrument, data) => {
          useGTUltraStore.getState().updateInstrumentData(instrument, data);
        },
        onTableData: (tableType, left, right) => {
          useGTUltraStore.getState().updateTableData(tableType, left, right);
        },
        onSidRegisters: (sidIdx, data) => {
          useGTUltraStore.getState().updateSidRegisters(sidIdx, data);
        },
        onSongInfo: (info) => {
          const store = useGTUltraStore.getState();
          store.setSongName(info.name);
          store.setSongAuthor(info.author);
          // Request all pattern data now that we know how many patterns exist
          if (info.numPatterns > 0) {
            store.refreshAllPatterns(info.numPatterns);
          }
        },
        onError: (err) => {
          console.error('[GTUltra] Engine error:', err);
        },
      });
      await gtEngine.init();
      await gtEngine.ready;
      if (disposed) { gtEngine.dispose(); return; }
      gtEngine.output.connect(audioCtx.destination);
      setEngine(gtEngine);
    };

    setup().catch(console.error);

    return () => {
      disposed = true;
      gtEngine?.dispose();
      setEngine(null);
    };
  }, [setEngine]);

  // Provide empty pattern data until WASM heap reading is implemented
  useEffect(() => {
    const empty = Array.from({ length: channelCount }, () => new Uint8Array(128 * 4));
    setPatternData(empty);
  }, [channelCount]);

  const editorWidth = width - SIDEBAR_WIDTH;
  const editorHeight = height - TOOLBAR_HEIGHT;
  const sidebarHeight = editorHeight;
  const orderHeight = Math.floor(sidebarHeight * 0.25);
  const instrHeight = Math.floor(sidebarHeight * 0.35);
  const tableHeight = sidebarHeight - orderHeight - instrHeight;

  return (
    <div style={{ width, height, display: 'flex', flexDirection: 'column', background: '#1a1a2e', color: '#e0e0ff' }}>
      {/* Toolbar */}
      <GTToolbar width={width} height={TOOLBAR_HEIGHT} />

      {/* Main content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Pattern editor */}
        <GTPatternEditor
          width={editorWidth}
          height={editorHeight}
          patternData={patternData}
          channelCount={channelCount}
        />

        {/* Sidebar */}
        <div style={{ width: SIDEBAR_WIDTH, display: 'flex', flexDirection: 'column' }}>
          <GTOrderList
            width={SIDEBAR_WIDTH}
            height={orderHeight}
            channelCount={channelCount}
          />
          <GTInstrumentPanel
            width={SIDEBAR_WIDTH}
            height={instrHeight}
          />
          <GTTableEditor
            width={SIDEBAR_WIDTH}
            height={tableHeight}
          />
        </div>
      </div>
    </div>
  );
};
