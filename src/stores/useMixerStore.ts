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
import type { EffectConfig } from '@typedefs/instrument';
import { getChannelEffectsManager } from '../engine/ChannelEffectsManager';
import { getSendBusManager } from '../engine/SendBusManager';

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
  try {
    // Forward to MusicLine engine if active (uses m_ChannelsOn bitfield)
    const { MusicLineEngine } = require('../engine/musicline/MusicLineEngine');
    if (MusicLineEngine.hasInstance()) {
      const ml = MusicLineEngine.getInstance();
      for (let ch = 0; ch < 8; ch++) {
        ml.setChannelOn(ch, (mask & (1 << ch)) !== 0);
      }
    }
  } catch {
    // MusicLineEngine not active
  }
}

// ── SunVox mute bridge ─────────────────────────────────────────────────────
// Instead of require() (which can return wrong module instances in Vite ESM),
// the SunVox engine registers itself here when a song loads.
let _sunVoxMuteBridge: {
  engine: { muteModule(h: number, m: number): void; unmuteModule(h: number, m: number): void; setModuleMuteState(h: number, u: number[], m: number[]): void };
  getHandle: () => number;
  getInstruments: () => any[];
  getPattern: () => any | null;
} | null = null;

// ── SunVox VU meter polling ────────────────────────────────────────────────
// Polls module scope data at ~15Hz and feeds per-channel RMS levels into
// ToneEngine's realtime channel levels (picked up by mixer VU meters).
let _sunVoxVuInterval: ReturnType<typeof setInterval> | null = null;
let _sunVoxVuInFlight = false;

function startSunVoxVuPolling(): void {
  if (_sunVoxVuInterval) return;
  _sunVoxVuInterval = setInterval(pollSunVoxLevels, 67); // ~15Hz
}

function stopSunVoxVuPolling(): void {
  if (_sunVoxVuInterval) {
    clearInterval(_sunVoxVuInterval);
    _sunVoxVuInterval = null;
  }
  _sunVoxVuInFlight = false;
}

function pollSunVoxLevels(): void {
  if (_sunVoxVuInFlight || !_sunVoxMuteBridge) return;
  const bridge = _sunVoxMuteBridge;
  const handle = bridge.getHandle();
  if (handle < 0) return;

  // Build channel→moduleId mapping
  const pattern = bridge.getPattern();
  if (!pattern) return;
  const instruments = bridge.getInstruments();
  const channels = pattern.channels as { instrumentId?: number }[];
  const moduleIds: number[] = [];
  const channelMap: number[] = []; // index into moduleIds → channel index

  for (let i = 0; i < channels.length; i++) {
    const instrId = channels[i]?.instrumentId;
    const inst = instruments.find((ins: { id: number }) => ins.id === instrId);
    const modId = inst?.sunvox?.noteTargetModuleId as number | undefined;
    if (modId !== undefined && modId >= 0) {
      // Check if this moduleId is already in the list
      let existing = moduleIds.indexOf(modId);
      if (existing === -1) {
        existing = moduleIds.length;
        moduleIds.push(modId);
      }
      channelMap[i] = existing;
    } else {
      channelMap[i] = -1;
    }
  }

  if (moduleIds.length === 0) return;

  _sunVoxVuInFlight = true;

  // Use dynamic import pattern to avoid circular deps
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SunVoxEngine } = require('../engine/sunvox/SunVoxEngine');
    if (!SunVoxEngine.hasInstance()) { _sunVoxVuInFlight = false; return; }
    const engine = SunVoxEngine.getInstance();
    engine.getModuleLevels(handle, moduleIds).then((levels: Float32Array) => {
      _sunVoxVuInFlight = false;
      if (!_sunVoxMuteBridge || levels.length === 0) return;
      // Map module levels back to per-channel levels
      const chLevels: number[] = new Array(channels.length).fill(0);
      for (let i = 0; i < channels.length; i++) {
        const idx = channelMap[i];
        if (idx >= 0 && idx < levels.length) {
          chLevels[i] = levels[idx];
        }
      }
      try {
        getToneEngine().updateRealtimeChannelLevels(chLevels);
      } catch { /* ToneEngine not ready */ }
    }).catch(() => {
      _sunVoxVuInFlight = false;
    });
  } catch {
    _sunVoxVuInFlight = false;
  }
}

/** Called by SunVoxModularSynth when a song loads to register the mute bridge */
export function registerSunVoxMuteBridge(bridge: typeof _sunVoxMuteBridge): void {
  _sunVoxMuteBridge = bridge;
  startSunVoxVuPolling();
}

/** Called when SunVox song is unloaded */
export function unregisterSunVoxMuteBridge(): void {
  stopSunVoxVuPolling();
  _sunVoxMuteBridge = null;
}

function hasActiveSunVoxSong(): boolean {
  return _sunVoxMuteBridge !== null && _sunVoxMuteBridge.getHandle() >= 0;
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
    if (!_sunVoxMuteBridge) return;
    const bridge = _sunVoxMuteBridge;
    const engine = bridge.engine;
    const handle = bridge.getHandle();
    if (handle < 0) return;

    const pattern = bridge.getPattern();
    if (!pattern) return;
    const instruments = bridge.getInstruments();

    // Collect SunVox root module IDs into unmuted/muted lists.
    // The worklet walks the graph downstream from each root to mute entire signal chains.
    // Shared modules (e.g. reverb used by multiple channels) stay unmuted if ANY chain is active.
    const unmutedRoots: number[] = [];
    const mutedRoots: number[] = [];
    const seen = new Set<number>();
    for (let i = 0; i < pattern.channels.length; i++) {
      const ch = channels[i];
      if (!ch) continue;
      const instrId = pattern.channels[i]?.instrumentId;
      const inst = instruments.find((ins: { id: number }) => ins.id === instrId);
      if (!inst?.sunvox?.noteTargetModuleId && inst?.sunvox?.noteTargetModuleId !== 0) continue;
      const modId = inst.sunvox.noteTargetModuleId as number;
      if (seen.has(modId)) continue; // Already handled by a previous channel
      seen.add(modId);
      const effectiveMute = isSoloing ? !ch.soloed : ch.muted;
      // Check if ANY channel targeting this module is unmuted
      let anyUnmuted = !effectiveMute;
      if (!anyUnmuted) {
        for (let j = i + 1; j < pattern.channels.length; j++) {
          const ch2 = channels[j];
          if (!ch2) continue;
          const instrId2 = pattern.channels[j]?.instrumentId;
          const inst2 = instruments.find((ins: { id: number }) => ins.id === instrId2);
          if (inst2?.sunvox?.noteTargetModuleId !== modId) continue;
          const mute2 = isSoloing ? !ch2.soloed : ch2.muted;
          if (!mute2) { anyUnmuted = true; break; }
        }
      }
      if (anyUnmuted) unmutedRoots.push(modId);
      else mutedRoots.push(modId);
    }

    // Send full mute state to worklet — it walks the graph and handles shared modules
    engine.setModuleMuteState(handle, unmutedRoots, mutedRoots);
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
  if (hasActiveSunVoxSong()) {
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
  if (hasActiveSunVoxSong()) {
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
  effects: [string | null, string | null]; // 2 FX slots: effect type name or null (legacy)
  insertEffects: EffectConfig[]; // Full insert effect chain (up to 4)
  sendLevels: number[]; // Send levels per return bus (0-1), indexed by bus number
}

function defaultChannels(): MixerChannelState[] {
  return Array.from({ length: 16 }, (_, i) => ({
    volume: 1,
    pan: 0,
    muted: false,
    soloed: false,
    name: `CH ${i + 1}`,
    effects: [null, null],
    insertEffects: [],
    sendLevels: [0, 0, 0, 0], // 4 send buses
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

export interface SendBusState {
  name: string;
  volume: number;    // 0-1 return level
  muted: boolean;
  effects: EffectConfig[];  // Return bus effect chain
}

function defaultSendBuses(): SendBusState[] {
  return [
    { name: 'Send A', volume: 1, muted: false, effects: [] },
    { name: 'Send B', volume: 1, muted: false, effects: [] },
    { name: 'Send C', volume: 1, muted: false, effects: [] },
    { name: 'Send D', volume: 1, muted: false, effects: [] },
  ];
}

interface MixerStoreState {
  channels: MixerChannelState[];
  master: { volume: number };
  sendBuses: SendBusState[];
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

  // Per-channel insert effects
  addChannelInsertEffect: (ch: number, effect: EffectConfig) => void;
  removeChannelInsertEffect: (ch: number, effectIndex: number) => void;
  toggleChannelInsertEffect: (ch: number, effectIndex: number) => void;
  moveChannelInsertEffect: (ch: number, fromIndex: number, toIndex: number) => void;

  // Send levels
  setChannelSendLevel: (ch: number, sendIndex: number, level: number) => void;

  // Send bus return controls
  setSendBusVolume: (busIndex: number, volume: number) => void;
  setSendBusMute: (busIndex: number, muted: boolean) => void;
  addSendBusEffect: (busIndex: number, effect: EffectConfig) => void;
  removeSendBusEffect: (busIndex: number, effectIndex: number) => void;
  setSendBusEffects: (busIndex: number, effects: EffectConfig[]) => void;

  // Effect presets
  loadChannelInsertPreset: (ch: number, effects: EffectConfig[]) => void;
}

type MixerStore = MixerStoreState & MixerStoreActions;

function buildInitialState(): MixerStoreState {
  return {
    channels: defaultChannels(),
    master: { volume: 1 },
    sendBuses: defaultSendBuses(),
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

    // Per-channel insert effects
    addChannelInsertEffect(ch: number, effect: EffectConfig): void {
      set((state) => {
        if (ch < 0 || ch >= state.channels.length) return;
        if (state.channels[ch].insertEffects.length >= 4) return;
        state.channels[ch].insertEffects.push(effect);
      });
      // Apply to audio engine
      getChannelEffectsManager().addEffect(ch, effect);
    },

    removeChannelInsertEffect(ch: number, effectIndex: number): void {
      set((state) => {
        if (ch < 0 || ch >= state.channels.length) return;
        state.channels[ch].insertEffects.splice(effectIndex, 1);
      });
      getChannelEffectsManager().removeEffect(ch, effectIndex);
    },

    toggleChannelInsertEffect(ch: number, effectIndex: number): void {
      set((state) => {
        if (ch < 0 || ch >= state.channels.length) return;
        const fx = state.channels[ch].insertEffects[effectIndex];
        if (fx) fx.enabled = !fx.enabled;
      });
      getChannelEffectsManager().toggleEffect(ch, effectIndex);
    },

    moveChannelInsertEffect(ch: number, fromIndex: number, toIndex: number): void {
      set((state) => {
        if (ch < 0 || ch >= state.channels.length) return;
        const arr = state.channels[ch].insertEffects;
        const [item] = arr.splice(fromIndex, 1);
        if (item) arr.splice(toIndex, 0, item);
      });
      getChannelEffectsManager().moveEffect(ch, fromIndex, toIndex);
    },

    // Send levels
    setChannelSendLevel(ch: number, sendIndex: number, level: number): void {
      const clampedLevel = Math.max(0, Math.min(1, level));
      set((state) => {
        if (ch < 0 || ch >= state.channels.length) return;
        if (sendIndex < 0 || sendIndex >= state.channels[ch].sendLevels.length) return;
        state.channels[ch].sendLevels[sendIndex] = clampedLevel;
      });

      // Wire audio graph: connect channel output to send bus input
      try {
        const engine = getToneEngine();
        const channelOutput = engine.getChannelOutputByIndex(ch);
        if (!channelOutput) return;

        const sendGain = getSendBusManager().getOrCreateSendGainForChannel(
          ch, sendIndex, channelOutput.channel
        );
        if (sendGain) {
          sendGain.gain.rampTo(clampedLevel, 0.05);
        }
      } catch {
        // Engine not initialized yet — send levels will be applied when channels are created
      }
    },

    // Send bus return controls
    setSendBusVolume(busIndex: number, volume: number): void {
      const clamped = Math.max(0, Math.min(1, volume));
      set((state) => {
        if (busIndex < 0 || busIndex >= state.sendBuses.length) return;
        state.sendBuses[busIndex].volume = clamped;
      });
      try { getSendBusManager().setBusVolume(busIndex, clamped); } catch { /* engine not ready */ }
    },

    setSendBusMute(busIndex: number, muted: boolean): void {
      set((state) => {
        if (busIndex < 0 || busIndex >= state.sendBuses.length) return;
        state.sendBuses[busIndex].muted = muted;
      });
      try { getSendBusManager().setBusMute(busIndex, muted); } catch { /* engine not ready */ }
    },

    addSendBusEffect(busIndex: number, effect: EffectConfig): void {
      set((state) => {
        if (busIndex < 0 || busIndex >= state.sendBuses.length) return;
        state.sendBuses[busIndex].effects.push(effect);
      });
      getSendBusManager().addBusEffect(busIndex, effect);
    },

    removeSendBusEffect(busIndex: number, effectIndex: number): void {
      set((state) => {
        if (busIndex < 0 || busIndex >= state.sendBuses.length) return;
        state.sendBuses[busIndex].effects.splice(effectIndex, 1);
      });
      getSendBusManager().removeBusEffect(busIndex, effectIndex);
    },

    setSendBusEffects(busIndex: number, effects: EffectConfig[]): void {
      // Clear existing, then add all new effects
      const bus = getSendBusManager();
      const currentInfo = bus.getBusInfo();
      if (busIndex < 0 || busIndex >= currentInfo.length) return;

      // Remove all existing effects (reverse order)
      for (let i = currentInfo[busIndex].effectCount - 1; i >= 0; i--) {
        bus.removeBusEffect(busIndex, i);
      }

      set((state) => {
        if (busIndex < 0 || busIndex >= state.sendBuses.length) return;
        state.sendBuses[busIndex].effects = effects;
      });

      // Add new effects
      for (const fx of effects) {
        bus.addBusEffect(busIndex, fx);
      }
    },

    // Effect presets — load a full effect chain onto a channel
    loadChannelInsertPreset(ch: number, effects: EffectConfig[]): void {
      // Clear existing insert effects
      const mgr = getChannelEffectsManager();
      const existing = mgr.getEffects(ch);
      for (let i = existing.length - 1; i >= 0; i--) {
        mgr.removeEffect(ch, i);
      }

      set((state) => {
        if (ch < 0 || ch >= state.channels.length) return;
        state.channels[ch].insertEffects = [];
      });

      // Add new effects
      for (const fx of effects) {
        set((state) => {
          if (ch < 0 || ch >= state.channels.length) return;
          state.channels[ch].insertEffects.push(fx);
        });
        mgr.addEffect(ch, fx);
      }
    },
  }))
);
