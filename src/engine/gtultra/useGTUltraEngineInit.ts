/**
 * useGTUltraEngineInit — Shared hook for initializing the GT Ultra WASM engine.
 *
 * Used by both the DOM GTUltraView and the Pixi PixiGTUltraView so the engine
 * init logic is a single source of truth.
 */

import { useEffect } from 'react';
import * as Tone from 'tone';
import { useGTUltraStore } from '@/stores/useGTUltraStore';
import { useInstrumentStore } from '@/stores/useInstrumentStore';
import { GTUltraEngine } from './GTUltraEngine';
import { getGTUltraASIDBridge } from './GTUltraASIDBridge';

/** Populate DEViLBOX instrument store from GT Ultra WASM instrument data */
function populateInstrumentStore(): void {
  // Small delay to ensure instrument data has arrived from WASM callbacks
  setTimeout(() => {
    const gtStore = useGTUltraStore.getState();
    const instruments = gtStore.buildInstrumentConfigs();
    if (instruments.length > 0) {
      useInstrumentStore.getState().loadInstruments(instruments);
    }
  }, 100);
}

export function useGTUltraEngineInit(): void {
  const setEngine = useGTUltraStore((s) => s.setEngine);

  useEffect(() => {
    // Skip if engine already exists (e.g. the other view initialized it)
    if (useGTUltraStore.getState().engine) return;

    let gtEngine: GTUltraEngine | null = null;
    let disposed = false;

    const setup = async () => {
      const audioCtx = Tone.getContext().rawContext as AudioContext;
      if (audioCtx.state === 'suspended') await audioCtx.resume();

      gtEngine = new GTUltraEngine(audioCtx, {
        onReady: () => {
          if (disposed) return;
          const store = useGTUltraStore.getState();
          store.setEngine(gtEngine);

          if (store.pendingSongData) {
            const pd = store.pendingSongData;
            const songBuffer = pd.buffer.slice(pd.byteOffset, pd.byteOffset + pd.byteLength) as ArrayBuffer;
            gtEngine!.loadSong(songBuffer);
            store.setPendingSongData(null);
          }
          store.refreshSongInfo();
          store.refreshAllOrders();
          store.refreshAllInstruments();
          store.refreshAllTables();
          populateInstrumentStore();
        },
        onPosition: (pos) => useGTUltraStore.getState().updatePlaybackPos(pos),
        onAsidWrite: (chip, reg, value) => getGTUltraASIDBridge().writeRegister(chip, reg, value),
        onPatternData: (pattern, length, data) => useGTUltraStore.getState().updatePatternData(pattern, length, data),
        onOrderData: (channel, data) => useGTUltraStore.getState().updateOrderData(channel, data),
        onInstrumentData: (instrument, data) => useGTUltraStore.getState().updateInstrumentData(instrument, data),
        onTableData: (tableType, left, right) => useGTUltraStore.getState().updateTableData(tableType, left, right),
        onSidRegisters: (sidIdx, data) => useGTUltraStore.getState().updateSidRegisters(sidIdx, data),
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
          populateInstrumentStore();
        },
        onError: (err) => console.error('[GTUltra] Engine error:', err),
      });

      await gtEngine.init();
      await gtEngine.ready;
      if (disposed) { gtEngine.dispose(); return; }
      gtEngine.output.connect(audioCtx.destination);
    };

    setup().catch(console.error);

    return () => {
      disposed = true;
      if (gtEngine) {
        gtEngine.dispose();
        useGTUltraStore.getState().setEngine(null);
      }
    };
  }, [setEngine]);
}
