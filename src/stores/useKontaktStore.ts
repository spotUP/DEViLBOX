import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { kontaktBridge } from '@/engine/kontakt/KontaktBridge';

export type KontaktBridgeStatus = 'disconnected' | 'connecting' | 'ready' | 'error';

interface KontaktState {
  bridgeStatus: KontaktBridgeStatus;
  currentPreset: string | null;
  error: string | null;
  volume: number;
  connect: () => Promise<void>;
  disconnect: () => void;
  noteOn: (note: number, velocity?: number, channel?: number) => void;
  noteOff: (note: number, channel?: number) => void;
  setVolume: (value: number) => void;
  cc: (ccNum: number, value: number, channel?: number) => void;
  loadPreset: (path: string) => void;
}

export const useKontaktStore = create<KontaktState>()(
  immer((set) => ({
    bridgeStatus: 'disconnected' as KontaktBridgeStatus,
    currentPreset: null,
    error: null,
    volume: 0.75,

    connect: async () => {
      set((state) => {
        state.bridgeStatus = 'connecting';
        state.error = null;
      });
      try {
        await kontaktBridge.connect();
        console.log('[Kontakt] Bridge connected via WebSocket');
      } catch (e) {
        set((state) => {
          state.bridgeStatus = 'error';
          state.error = e instanceof Error ? e.message : 'Bridge connection failed';
        });
      }
    },

    disconnect: () => {
      kontaktBridge.disconnect();
      set((state) => {
        state.bridgeStatus = 'disconnected';
        state.error = null;
        state.currentPreset = null;
      });
    },

    noteOn: (note, velocity = 100, channel = 0) => {
      try { kontaktBridge.noteOn(note, velocity, channel); } catch { /* not connected */ }
    },

    noteOff: (note, channel = 0) => {
      try { kontaktBridge.noteOff(note, channel); } catch { /* not connected */ }
    },

    setVolume: (value) => {
      const clamped = Math.max(0, Math.min(1, value));
      set((state) => { state.volume = clamped; });
      try { kontaktBridge.cc(7, Math.round(clamped * 127), 0); } catch { /* */ }
    },

    cc: (ccNum, value, channel = 0) => {
      try { kontaktBridge.cc(ccNum, value, channel); } catch { /* */ }
    },

    loadPreset: (path) => {
      try { kontaktBridge.loadPreset(path); } catch { /* */ }
    },
  })),
);

// Subscribe to bridge status AFTER store is created (avoids immer draft error during init)
kontaktBridge.subscribe((snapshot) => {
  useKontaktStore.setState({
    bridgeStatus: snapshot.bridgeStatus,
    currentPreset: snapshot.currentPreset,
    error: snapshot.error,
  });
});
