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

// Forward effective mute state to TrackerReplayer's channelMuteMask.
// This is essential for WASM synth engines (FC, TFMX, etc.) whose audio
// bypasses per-channel Tone.Channel nodes and routes through synthBus.
function forwardReplayerMuteMask(channels: MixerChannelState[], isSoloing: boolean): void {
  let mask = 0;
  for (let i = 0; i < Math.min(channels.length, 16); i++) {
    const effectiveMute = isSoloing ? !channels[i].soloed : channels[i].muted;
    if (!effectiveMute) mask |= (1 << i);
  }
  try {
    // Forward to TrackerReplayer (affects ToneEngine note triggering)
    const { getTrackerReplayer } = require('../engine/TrackerReplayer');
    const replayer = getTrackerReplayer();
    replayer.setChannelMuteMask(mask);
  } catch {
    // Replayer not initialized yet
  }
  try {
    // Forward to UADE engine if active (uses Paula hardware mute mask)
    const { UADEEngine } = require('../engine/uade/UADEEngine');
    if (UADEEngine.hasInstance()) {
      UADEEngine.getInstance().setMuteMask(mask & 0x0F);
    }
  } catch {
    // UADE not active
  }
  try {
    // Forward to libopenmpt engine if active (DigiBooster, Symphonie, etc.)
    const { LibopenmptEngine } = require('../engine/libopenmpt/LibopenmptEngine');
    if (LibopenmptEngine.hasInstance()) {
      LibopenmptEngine.getInstance().setMuteMask(mask);
    }
  } catch {
    // LibopenmptEngine not active
  }
}

/** Check if the current song has SunVox modular instruments (song mode) */
function hasSunVoxSongInstruments(): boolean {
  try {
    // Late-bound to avoid circular deps (useTrackerStore → useMixerStore)
    const { useInstrumentStore } = require('./useInstrumentStore');
    const instruments = useInstrumentStore.getState().instruments;
    return instruments.some(
      (i: { synthType?: string; sunvox?: { isSong?: boolean } }) =>
        i.synthType === 'SunVoxModular' && i.sunvox?.isSong === true
    );
  } catch { return false; }
}

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
    } else if (fmt.steveTurnerFileData) {
      const { SteveTurnerEngine } = require('../engine/steveturner/SteveTurnerEngine');
      if (SteveTurnerEngine.hasInstance()) return SteveTurnerEngine.getInstance();
    } else if (fmt.sidmon1WasmFileData) {
      const { SidMon1ReplayerEngine } = require('../engine/sidmon1/SidMon1ReplayerEngine');
      if (SidMon1ReplayerEngine.hasInstance()) return SidMon1ReplayerEngine.getInstance();
    } else if (fmt.fredEditorWasmFileData) {
      const { FredEditorReplayerEngine } = require('../engine/fred/FredEditorReplayerEngine');
      if (FredEditorReplayerEngine.hasInstance()) return FredEditorReplayerEngine.getInstance();
    } else if (fmt.artOfNoiseFileData) {
      const { ArtOfNoiseEngine } = require('../engine/artofnoise/ArtOfNoiseEngine');
      if (ArtOfNoiseEngine.hasInstance()) return ArtOfNoiseEngine.getInstance();
    } else if (fmt.startrekkerAMFileData) {
      const { StartrekkerAMEngine } = require('../engine/startrekker-am/StartrekkerAMEngine');
      if (StartrekkerAMEngine.hasInstance()) return StartrekkerAMEngine.getInstance();
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
function forwardSunVoxModuleMute(channels: MixerChannelState[], isSoloing: boolean): void {
  try {
    // Lazy import to avoid circular deps at module level
    const { SunVoxEngine } = require('../engine/sunvox/SunVoxEngine');
    if (!SunVoxEngine.hasInstance()) return;
    const engine = SunVoxEngine.getInstance();
    const { getSharedSunVoxHandle } = require('../engine/sunvox-modular/SunVoxModularSynth');
    const handle = getSharedSunVoxHandle();
    if (handle < 0) return;

    // Late-bound to avoid circular deps
    const { useTrackerStore } = require('./useTrackerStore');
    const { useInstrumentStore } = require('./useInstrumentStore');
    const trackerState = useTrackerStore.getState();
    const pattern = trackerState.patterns[trackerState.currentPatternIndex];
    if (!pattern) return;
    const instruments = useInstrumentStore.getState().instruments;

    // Collect all SunVox module IDs and whether they should be muted
    // A module is unmuted if ANY channel targeting it is unmuted
    const moduleUnmuted = new Map<number, boolean>();
    for (let i = 0; i < pattern.channels.length; i++) {
      const ch = channels[i];
      if (!ch) continue;
      const instrId = pattern.channels[i]?.instrumentId;
      const inst = instruments.find((ins: { id: number }) => ins.id === instrId);
      if (!inst?.sunvox?.noteTargetModuleId && inst?.sunvox?.noteTargetModuleId !== 0) continue;
      const modId = inst.sunvox.noteTargetModuleId as number;
      const effectiveMute = isSoloing ? !ch.soloed : ch.muted;
      if (!effectiveMute) moduleUnmuted.set(modId, true);
      else if (!moduleUnmuted.has(modId)) moduleUnmuted.set(modId, false);
    }

    // Apply mute/unmute to each SunVox module
    for (const [modId, unmuted] of moduleUnmuted) {
      if (unmuted) engine.unmuteModule(handle, modId);
      else engine.muteModule(handle, modId);
    }
  } catch (err) {
    console.warn('[Mixer] forwardSunVoxModuleMute error:', err);
  }
}

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

  // SunVox songs: mute/unmute at the module level inside the WASM
  if (hasSunVoxSongInstruments()) {
    forwardSunVoxModuleMute(channels, isSoloing);
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

  // SunVox songs: mute/unmute at the module level
  if (hasSunVoxSongInstruments()) {
    forwardSunVoxModuleMute(channels, isSoloing);
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
      forwardReplayerMuteMask(chans, soloing);
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
      forwardReplayerMuteMask(channels, isSoloing);
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
