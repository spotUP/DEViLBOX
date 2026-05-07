import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { kontaktBridge, type KontaktBridgeSnapshot } from '@engine/kontakt/KontaktBridge';

export type KontaktBridgeStatus = 'disconnected' | 'connecting' | 'ready' | 'error';

interface KontaktState {
  bridgeStatus: KontaktBridgeStatus;
  currentPreset: string | null;
  error: string | null;
  sampleRate: number;
  volume: number;
  connect: () => Promise<void>;
  disconnect: () => void;
  loadPreset: (path: string) => void;
  noteOn: (note: number, velocity?: number, channel?: number) => void;
  noteOff: (note: number, channel?: number) => void;
  setVolume: (value: number) => void;
  requestStatus: () => void;
}

const DEFAULT_SAMPLE_RATE = 44100;

function applySnapshot(snapshot: KontaktBridgeSnapshot): Pick<KontaktState, 'bridgeStatus' | 'currentPreset' | 'error' | 'sampleRate'> {
  return {
    bridgeStatus: snapshot.bridgeStatus,
    currentPreset: snapshot.currentPreset,
    error: snapshot.error,
    sampleRate: snapshot.sampleRate || DEFAULT_SAMPLE_RATE,
  };
}

export const useKontaktStore = create<KontaktState>()(
  immer((set) => ({
    bridgeStatus: 'disconnected',
    currentPreset: null,
    error: null,
    sampleRate: DEFAULT_SAMPLE_RATE,
    volume: 0.75,

    connect: async () => {
      set((state) => {
        state.bridgeStatus = 'connecting';
        state.error = null;
      });

      try {
        await kontaktBridge.connect();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to connect to Kontakt bridge';
        set((state) => {
          state.bridgeStatus = 'error';
          state.error = message;
        });
        throw error;
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

    loadPreset: (path) => {
      kontaktBridge.loadPreset(path);
    },

    noteOn: (note, velocity = 100, channel = 0) => {
      kontaktBridge.noteOn(note, velocity, channel);
    },

    noteOff: (note, channel = 0) => {
      kontaktBridge.noteOff(note, channel);
    },

    setVolume: (value) => {
      const clamped = Math.max(0, Math.min(1, value));
      set((state) => {
        state.volume = clamped;
      });
      kontaktBridge.cc(7, Math.round(clamped * 127), 0);
    },

    requestStatus: () => {
      kontaktBridge.requestStatus();
    },
  })),
);

kontaktBridge.subscribe((snapshot) => {
  useKontaktStore.setState(applySnapshot(snapshot));
});
