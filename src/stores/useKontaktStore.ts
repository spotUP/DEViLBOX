import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { kontaktBridge } from '@/engine/kontakt/KontaktBridge';
import type { BridgeSlotInfo, KontaktInstrument, PluginInfo } from '@/engine/kontakt/protocol';
import { useInstrumentStore } from './useInstrumentStore';

export type KontaktBridgeStatus = 'disconnected' | 'connecting' | 'ready' | 'error';

interface KontaktState {
  bridgeStatus: KontaktBridgeStatus;
  pluginName: string | null;
  currentPreset: string | null;
  plugins: PluginInfo[];
  instruments: KontaktInstrument[];
  slots: BridgeSlotInfo[];
  error: string | null;
  volume: number;
  connect: () => Promise<void>;
  disconnect: () => void;
  loadPlugin: (name: string) => void;
  unloadPlugin: (slot?: number) => void;
  showGUI: (slot?: number) => void;
  noteOn: (note: number, velocity?: number, channel?: number, slot?: number) => void;
  noteOff: (note: number, channel?: number, slot?: number) => void;
  programChange: (program: number, channel?: number, slot?: number) => void;
  setVolume: (value: number) => void;
  cc: (ccNum: number, value: number, channel?: number, slot?: number) => void;
  loadPreset: (path: string, slot?: number) => void;
  loadInstrument: (name: string) => void;
  cacheState: (name: string) => void;
  listInstruments: () => void;
  getSlotForInstrument: (instrumentId: number) => number | undefined;
}

export const useKontaktStore = create<KontaktState>()(
  immer((set) => ({
    bridgeStatus: 'disconnected' as KontaktBridgeStatus,
    pluginName: null,
    currentPreset: null,
    plugins: [] as PluginInfo[],
    instruments: [] as KontaktInstrument[],
    slots: [] as BridgeSlotInfo[],
    error: null,
    volume: 0.75,

    connect: async () => {
      const currentStatus = useKontaktStore.getState().bridgeStatus;
      if (currentStatus === 'ready') return;
      // If already connecting, wait for the pending connection attempt
      if (currentStatus === 'connecting') {
        await kontaktBridge.connect();
        return;
      }
      set((state) => {
        state.bridgeStatus = 'connecting';
        state.error = null;
      });
      try {
        await kontaktBridge.connect();
      } catch (e) {
        set((state) => {
          state.bridgeStatus = 'error';
          state.error = e instanceof Error ? e.message : 'Bridge connection failed';
        });
        throw e;
      }
    },

    disconnect: () => {
      kontaktBridge.disconnect();
      set((state) => {
        state.bridgeStatus = 'disconnected';
        state.error = null;
        state.pluginName = null;
        state.currentPreset = null;
        state.plugins = [];
        state.slots = [];
      });
    },

    loadPlugin: (name) => {
      try {
        console.log('[KontaktStore] loadPlugin sending:', name);
        kontaktBridge.loadPlugin(name);
        console.log('[KontaktStore] loadPlugin sent OK');
      } catch (e) {
        console.error('[KontaktStore] loadPlugin FAILED:', e);
      }
    },

    unloadPlugin: (slot) => {
      try { kontaktBridge.unloadPlugin(slot); } catch { /* not connected */ }
    },

    showGUI: (slot) => {
      try { kontaktBridge.showGUI(slot); } catch { /* not connected */ }
    },

    noteOn: (note, velocity = 100, channel = 0, slot) => {
      try { kontaktBridge.noteOn(note, velocity, channel, slot); } catch { /* not connected */ }
    },

    noteOff: (note, channel = 0, slot) => {
      try { kontaktBridge.noteOff(note, channel, slot); } catch { /* not connected */ }
    },

    programChange: (program, channel = 0, slot) => {
      try { kontaktBridge.programChange(program, channel, slot); } catch { /* not connected */ }
    },

    setVolume: (value) => {
      const clamped = Math.max(0, Math.min(1, value));
      set((state) => { state.volume = clamped; });
      try { kontaktBridge.cc(7, Math.round(clamped * 127), 0); } catch { /* */ }
    },

    cc: (ccNum, value, channel = 0, slot) => {
      try { kontaktBridge.cc(ccNum, value, channel, slot); } catch { /* */ }
    },

    loadPreset: (path, slot) => {
      try {
        console.log('[KontaktStore] loadPreset sending:', path);
        kontaktBridge.loadPreset(path, slot);
        console.log('[KontaktStore] loadPreset sent OK');
      } catch (e) {
        console.error('[KontaktStore] loadPreset FAILED:', e);
      }
    },

    loadInstrument: (name) => {
      try {
        console.log('[KontaktStore] loadInstrument:', name);
        kontaktBridge.loadInstrument(name);
      } catch (e) {
        console.error('[KontaktStore] loadInstrument FAILED:', e);
      }
    },

    cacheState: (name) => {
      try {
        kontaktBridge.cacheState(name);
      } catch (e) {
        console.error('[KontaktStore] cacheState FAILED:', e);
      }
    },

    listInstruments: () => {
      try {
        kontaktBridge.listInstruments();
      } catch { /* not connected */ }
    },

    getSlotForInstrument: (instrumentId) => {
      return useInstrumentStore.getState().getInstrument(instrumentId)?.bridgeSlotId;
    },
  })),
);

// Subscribe to bridge status AFTER store is created (avoids immer draft error during init)
kontaktBridge.subscribe((snapshot) => {
  useKontaktStore.setState({
    bridgeStatus: snapshot.bridgeStatus,
    pluginName: snapshot.pluginName,
    currentPreset: snapshot.currentPreset,
    plugins: snapshot.plugins,
    instruments: snapshot.instruments,
    slots: snapshot.slots,
    error: snapshot.error,
  });
});
