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
import { useProjectStore } from '@/stores/useProjectStore';
import { GTUltraEngine } from './GTUltraEngine';
import { getGTUltraASIDBridge } from './GTUltraASIDBridge';
import { getSIDHardwareManager } from '@/lib/sid/SIDHardwareManager';
import { setFormatPlaybackRow } from '@engine/FormatPlaybackState';
import { getNativeAudioNode } from '@utils/audio-context';
import { getToneEngine } from '@engine/ToneEngine';

/** Populate DEViLBOX instrument store from GT Ultra WASM instrument data */
function populateInstrumentStore(): void {
  // Wait for WASM instrument data callbacks (63 instruments sent individually)
  setTimeout(() => {
    const gtStore = useGTUltraStore.getState();
    const instruments = gtStore.buildInstrumentConfigs();
    if (instruments.length > 0) {
      useInstrumentStore.getState().loadInstruments(instruments);
    }
  }, 500);
}

export function useGTUltraEngineInit(): void {
  const setEngine = useGTUltraStore((s) => s.setEngine);

  useEffect(() => {
    // Skip if engine already exists (e.g. the other view initialized it)
    if (useGTUltraStore.getState().engine) return;

    let gtEngine: GTUltraEngine | null = null;
    let disposed = false;
    let bridgeUnsub: (() => void) | null = null;

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
          // Don't populate instruments here — wait for onSongLoaded when data is ready
        },
        onPosition: (() => {
          let lastRow = -1;
          let lastPos = -1;
          return (pos: { row: number; pos: number }) => {
            // Always update the lightweight singleton (no React overhead)
            setFormatPlaybackRow(pos.row);
            // Only update Zustand store when values actually change
            if (pos.row !== lastRow || pos.pos !== lastPos) {
              lastRow = pos.row;
              lastPos = pos.pos;
              useGTUltraStore.getState().updatePlaybackPos({
                row: pos.row,
                songPos: pos.pos,
                position: pos.pos,
              });
            }
          };
        })(),
        onAsidWrite: (chip, reg, value, tick, tableType, tableIndex) => {
          getGTUltraASIDBridge().writeRegister(chip, reg, value);
          getGTUltraASIDBridge().captureRegisterWrite(chip, reg, value, tick, tableType, tableIndex);
        },
        onPatternData: (pattern, length, data) => useGTUltraStore.getState().updatePatternData(pattern, length, data),
        onOrderData: (channel, data) => useGTUltraStore.getState().updateOrderData(channel, data),
        onInstrumentData: (instrument, data) => {
          useGTUltraStore.getState().updateInstrumentData(instrument, data);
          // Sync to DEViLBOX instrument store
          const instStore = useInstrumentStore.getState();
          const existing = instStore.instruments.find(i => i.id === instrument);
          if (existing && existing.synthType === 'GTUltraSynth') {
            const instView = useGTUltraStore.getState().instrumentData[instrument];
            if (instView) {
              instStore.updateInstrument(instrument, {
                gtUltra: {
                  ad: instView.ad,
                  sr: instView.sr,
                  vibdelay: instView.vibdelay,
                  gatetimer: instView.gatetimer,
                  firstwave: instView.firstwave,
                  name: instView.name || '',
                  wavePtr: instView.wavePtr,
                  pulsePtr: instView.pulsePtr,
                  filterPtr: instView.filterPtr,
                  speedPtr: instView.speedPtr,
                },
              });
            }
          }
        },
        onTableData: (tableType, left, right) => useGTUltraStore.getState().updateTableData(tableType, left, right),
        onSidRegisters: (sidIdx, data) => useGTUltraStore.getState().updateSidRegisters(sidIdx, data),
        onSongInfo: (info) => {
          const store = useGTUltraStore.getState();
          store.setSongName(info.name);
          store.setSongAuthor(info.author);
          if (info.channelCount > 3) store.setSidCount(2);
          else store.setSidCount(1);
          if (info.numPatterns > 0) store.refreshAllPatterns(info.numPatterns);
          // Refresh orders AFTER sidCount is set so all channels are fetched
          store.refreshAllOrders();
          // Update project metadata so the project tab shows the song name
          useProjectStore.getState().setMetadata({
            name: info.name || store.songName || 'Untitled',
            author: info.author || '',
          });
        },
        onSongLoaded: (ok, channelCount) => {
          if (!ok) {
            console.error('[GTUltra] Song load failed in WASM engine');
            return;
          }
          const store = useGTUltraStore.getState();
          // Set sidCount immediately from the songLoaded response (no async wait)
          const newSidCount = (channelCount && channelCount > 3) ? 2 : 1;
          console.log(`[GTUltra] onSongLoaded: channelCount=${channelCount} → sidCount=${newSidCount}`);
          store.setSidCount(newSidCount as 1 | 2);
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
      // Route through master effects chain (not directly to destination)
      const masterFxIn = getNativeAudioNode(getToneEngine().masterEffectsInput as any);
      if (masterFxIn) {
        gtEngine.output.connect(masterFxIn);
      } else {
        // Fallback: direct to destination if ToneEngine not ready yet
        gtEngine.output.connect(audioCtx.destination);
        console.warn('[GTUltra] ToneEngine masterEffectsInput not available, audio bypasses master FX');
      }

      // Mute softsynth output whenever the hardware bridge is on — otherwise
      // the WASM reSID emulator and the USB-SID-Pico would play the same song
      // in parallel.
      const bridge = getGTUltraASIDBridge();
      const syncOutputGain = (enabled: boolean) => {
        if (!gtEngine) return;
        gtEngine.output.gain.value = enabled ? 0 : 1;
      };
      bridgeUnsub = bridge.onChange(syncOutputGain);
      syncOutputGain(bridge.isEnabled);

      // Auto-enable hardware bridge if a USB-SID-Pico / ASID device is already
      // active (user connected it via Settings → SID Hardware wizard). Saves
      // the user from having to click the toolbar toggle every session.
      if (getSIDHardwareManager().isActive && !bridge.isEnabled) {
        bridge.enable();
        gtEngine.enableAsid(true);
      }
    };

    setup().catch(console.error);

    return () => {
      disposed = true;
      if (bridgeUnsub) bridgeUnsub();
      if (gtEngine) {
        gtEngine.dispose();
        useGTUltraStore.getState().setEngine(null);
      }
    };
  }, [setEngine]);
}
