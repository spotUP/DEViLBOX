/**
 * Mixer Store — 16-channel + master volume/pan/mute/solo state
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { getToneEngine } from '../engine/ToneEngine';

export interface MixerChannelState {
  volume: number;   // 0–1, 1 = unity (0 dB)
  pan: number;      // -1..1
  muted: boolean;
  soloed: boolean;
  name: string;
}

function defaultChannels(): MixerChannelState[] {
  return Array.from({ length: 16 }, (_, i) => ({
    volume: 1,
    pan: 0,
    muted: false,
    soloed: false,
    name: `CH ${i + 1}`,
  }));
}

/** Convert 0-1 linear to dB: 0 → -60 dB, 0.5 → ≈-6 dB, 1 → 0 dB */
function toDb(v: number): number {
  return v <= 0 ? -60 : 20 * Math.log10(v);
}

/** Silently call ToneEngine — swallows errors when engine is not yet ready (e.g. in tests). */
function applyToEngine(fn: () => void): void {
  try {
    fn();
  } catch {
    // Engine not ready — ignore (tests, SSR, early init)
  }
}

interface MixerStoreState {
  channels: MixerChannelState[];
  master: { volume: number };
  domPanelVisible: boolean;
  isSoloing: boolean;
}

interface MixerStoreActions {
  setChannelVolume: (ch: number, vol: number) => void;
  setChannelPan: (ch: number, pan: number) => void;
  setChannelMute: (ch: number, muted: boolean) => void;
  setChannelSolo: (ch: number, soloed: boolean) => void;
  setMasterVolume: (vol: number) => void;
  toggleDomPanel: () => void;
  getInitialState: () => MixerStoreState;
}

type MixerStore = MixerStoreState & MixerStoreActions;

function buildInitialState(): MixerStoreState {
  return {
    channels: defaultChannels(),
    master: { volume: 1 },
    domPanelVisible: false,
    isSoloing: false,
  };
}

export const useMixerStore = create<MixerStore>()(
  immer((set, get) => ({
    ...buildInitialState(),

    getInitialState(): MixerStoreState {
      return buildInitialState();
    },

    setChannelVolume(ch: number, vol: number): void {
      set((state) => {
        state.channels[ch].volume = vol;
      });
      applyToEngine(() => {
        getToneEngine().setMixerChannelVolume(ch, toDb(vol));
      });
    },

    setChannelPan(ch: number, pan: number): void {
      set((state) => {
        state.channels[ch].pan = pan;
      });
      applyToEngine(() => {
        getToneEngine().setMixerChannelPan(ch, pan);
      });
    },

    setChannelMute(ch: number, muted: boolean): void {
      set((state) => {
        state.channels[ch].muted = muted;
      });
      applyToEngine(() => {
        getToneEngine().setChannelMute(ch, muted);
      });
    },

    setChannelSolo(ch: number, soloed: boolean): void {
      set((state) => {
        state.channels[ch].soloed = soloed;
        const isSoloing = state.channels.some((c) => c.soloed);
        state.isSoloing = isSoloing;
      });

      // Recompute effective mutes for all channels based on solo state
      applyToEngine(() => {
        const { channels, isSoloing } = get();
        channels.forEach((c, i) => {
          const effectiveMute = isSoloing ? !c.soloed : c.muted;
          getToneEngine().setChannelMute(i, effectiveMute);
        });
      });
    },

    setMasterVolume(vol: number): void {
      set((state) => {
        state.master.volume = vol;
      });
      applyToEngine(() => {
        getToneEngine().setMasterVolume(toDb(vol));
      });
    },

    toggleDomPanel(): void {
      set((state) => {
        state.domPanelVisible = !state.domPanelVisible;
      });
    },
  }))
);
