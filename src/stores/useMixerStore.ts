/**
 * Mixer Store — 16-channel + master volume/pan/mute/solo state
 *
 * For WASM engines, per-channel audio routing doesn't exist — they output a
 * single mixed stream. We forward channel gain/mute to the active WASM engine:
 * - Furnace: per-channel mute via furnace_dispatch_mute()
 * - Hively, Klystrack, JamCracker, PreTracker, MA, Hippel: per-channel gain
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { getToneEngine } from '../engine/ToneEngine';
import { useFormatStore } from './useFormatStore';

// Lazy references to WASM engines to avoid circular imports
let _furnaceDispatchEngine: any = null;
function getFurnaceDispatchEngine(): any {
  if (!_furnaceDispatchEngine) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _furnaceDispatchEngine = require('../engine/furnace-dispatch/FurnaceDispatchEngine').FurnaceDispatchEngine;
  }
  return _furnaceDispatchEngine;
}

/**
 * Get the active WASM engine instance that supports setChannelGain, if any.
 * Returns null if no gain-capable WASM engine is currently active.
 */
export function getActiveGainEngine(): { setChannelGain(ch: number, gain: number): void } | null {
  const fmt = useFormatStore.getState();
  try {
    if (fmt.editorMode === 'hively') {
      const { HivelyEngine } = require('../engine/hively/HivelyEngine');
      if (HivelyEngine.hasInstance()) return HivelyEngine.getInstance();
    } else if (fmt.editorMode === 'klystrack') {
      const { KlysEngine } = require('../engine/klystrack/KlysEngine');
      if (KlysEngine.hasInstance()) return KlysEngine.getInstance();
    } else if (fmt.editorMode === 'jamcracker') {
      const { JamCrackerEngine } = require('../engine/jamcracker/JamCrackerEngine');
      if (JamCrackerEngine.hasInstance()) return JamCrackerEngine.getInstance();
    } else if (fmt.preTrackerFileData) {
      const { PreTrackerEngine } = require('../engine/pretracker/PreTrackerEngine');
      if (PreTrackerEngine.hasInstance()) return PreTrackerEngine.getInstance();
    } else if (fmt.maFileData) {
      const { MaEngine } = require('../engine/ma/MaEngine');
      if (MaEngine.hasInstance()) return MaEngine.getInstance();
    } else if (fmt.bdFileData) {
      const { BdEngine } = require('../engine/bd/BdEngine');
      if (BdEngine.hasInstance()) return BdEngine.getInstance();
    } else if (fmt.sd2FileData) {
      const { Sd2Engine } = require('../engine/sidmon2/Sd2Engine');
      if (Sd2Engine.hasInstance()) return Sd2Engine.getInstance();
    } else if (fmt.hippelFileData) {
      const { HippelEngine } = require('../engine/hippel/HippelEngine');
      if (HippelEngine.hasInstance()) return HippelEngine.getInstance();
    } else if (fmt.ixsFileData) {
      const { IxalanceEngine } = require('../engine/ixalance/IxalanceEngine');
      if (IxalanceEngine.hasInstance()) return IxalanceEngine.getInstance();
    } else if (fmt.psycleFileData) {
      const { CpsycleEngine } = require('../engine/cpsycle/CpsycleEngine');
      if (CpsycleEngine.hasInstance()) return CpsycleEngine.getInstance();
    } else if (fmt.sc68FileData) {
      const { Sc68Engine } = require('../engine/sc68/Sc68Engine');
      if (Sc68Engine.hasInstance()) return Sc68Engine.getInstance();
    } else if (fmt.zxtuneFileData) {
      const { ZxtuneEngine } = require('../engine/zxtune/ZxtuneEngine');
      if (ZxtuneEngine.hasInstance()) return ZxtuneEngine.getInstance();
    } else if (fmt.pumaTrackerFileData) {
      const { PumaTrackerEngine } = require('../engine/pumatracker/PumaTrackerEngine');
      if (PumaTrackerEngine.hasInstance()) return PumaTrackerEngine.getInstance();
    } else if (fmt.artOfNoiseFileData) {
      const { ArtOfNoiseEngine } = require('../engine/artofnoise/ArtOfNoiseEngine');
      if (ArtOfNoiseEngine.hasInstance()) return ArtOfNoiseEngine.getInstance();
    }
  } catch {
    // Engine not ready
  }
  return null;
}

/**
 * Forward effective channel gain to the active WASM engine.
 * Computes gain from volume + mute/solo state and sends to the engine.
 */
function forwardWasmChannelGain(ch: number, channels: MixerChannelState[], isSoloing: boolean): void {
  const fmt = useFormatStore.getState();

  // Furnace uses mute API (binary on/off)
  if (fmt.editorMode === 'furnace') {
    try {
      const engine = getFurnaceDispatchEngine().getInstance();
      const c = channels[ch];
      const effectiveMute = isSoloing ? !c.soloed : (c.muted || c.volume <= 0);
      engine.mute(ch, effectiveMute);
    } catch {
      // Engine not ready
    }
    return;
  }

  // Other WASM engines use gain API (0.0 - 1.0)
  const gainEngine = getActiveGainEngine();
  if (gainEngine) {
    const c = channels[ch];
    const effectiveMute = isSoloing ? !c.soloed : c.muted;
    const gain = effectiveMute ? 0 : c.volume;
    gainEngine.setChannelGain(ch, gain);
  }
}

/**
 * Forward all channel gains/mutes to the active WASM engine.
 */
function forwardAllWasmChannelGains(channels: MixerChannelState[], isSoloing: boolean): void {
  const fmt = useFormatStore.getState();

  // Furnace uses mute API
  if (fmt.editorMode === 'furnace') {
    try {
      const engine = getFurnaceDispatchEngine().getInstance();
      channels.forEach((c, i) => {
        const effectiveMute = isSoloing ? !c.soloed : (c.muted || c.volume <= 0);
        engine.mute(i, effectiveMute);
      });
    } catch {
      // Engine not ready
    }
    return;
  }

  // Other WASM engines use gain API
  const gainEngine = getActiveGainEngine();
  if (gainEngine) {
    channels.forEach((c, i) => {
      const effectiveMute = isSoloing ? !c.soloed : c.muted;
      const gain = effectiveMute ? 0 : c.volume;
      gainEngine.setChannelGain(i, gain);
    });
  }
}

export interface MixerChannelState {
  volume: number;   // 0–1, 1 = unity (0 dB)
  pan: number;      // -1..1
  muted: boolean;
  soloed: boolean;
  name: string;
  effects: [string | null, string | null]; // 2 FX slots: effect type name or null
}

function defaultChannels(): MixerChannelState[] {
  return Array.from({ length: 16 }, (_, i) => ({
    volume: 1,
    pan: 0,
    muted: false,
    soloed: false,
    name: `CH ${i + 1}`,
    effects: [null, null],
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
  setChannelEffect: (ch: number, slot: 0 | 1, type: string | null) => void;
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
      // Forward gain to active WASM engine
      const { channels, isSoloing } = get();
      forwardWasmChannelGain(ch, channels, isSoloing);
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
      const { channels: chans, isSoloing: soloing } = get();
      forwardWasmChannelGain(ch, chans, soloing);
    },

    setChannelSolo(ch: number, soloed: boolean): void {
      set((state) => {
        state.channels[ch].soloed = soloed;
        const isSoloing = state.channels.some((c) => c.soloed);
        state.isSoloing = isSoloing;
      });

      // Recompute effective mutes for all channels based on solo state
      const { channels, isSoloing } = get();
      applyToEngine(() => {
        channels.forEach((c, i) => {
          const effectiveMute = isSoloing ? !c.soloed : c.muted;
          getToneEngine().setChannelMute(i, effectiveMute);
        });
      });
      forwardAllWasmChannelGains(channels, isSoloing);
    },

    setChannelEffect(ch: number, slot: 0 | 1, type: string | null): void {
      set((state) => {
        if (state.channels[ch]) {
          state.channels[ch].effects[slot] = type;
        }
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
