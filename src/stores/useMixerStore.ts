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
import { getChannelRoutedEffectsManager } from '../engine/tone/ChannelRoutedEffects';
import { getActiveDubBus } from '../engine/dub/DubBus';

// Rebuild WASM per-channel effect routing after any insert-effect mutation
// or when a master effect's selectedChannels changes.
// Debounced to coalesce rapid changes (e.g. loading a preset adds 4 effects).
let _wasmRebuildTimer: ReturnType<typeof setTimeout> | null = null;
export function scheduleWasmEffectRebuild(): void {
  if (_wasmRebuildTimer) clearTimeout(_wasmRebuildTimer);
  _wasmRebuildTimer = setTimeout(() => {
    _wasmRebuildTimer = null;
    void (async () => {
      try {
        const { getActiveIsolationEngine } = await import('../engine/tone/ChannelRoutedEffects');
        const engine = await getActiveIsolationEngine();
        if (!engine) {
          console.log('[MixerStore] scheduleWasmEffectRebuild: no isolation-capable engine available');
          return;
        }

        const { getToneEngine } = await import('../engine/ToneEngine');
        const masterEffectsInput = getToneEngine().masterEffectsInput;
        const mgr = getChannelRoutedEffectsManager(masterEffectsInput);

        const channelEffects = new Map<number, EffectConfig[]>();

        // 1. Per-channel insert effects from mixer store
        const state = useMixerStore.getState();
        for (let ch = 0; ch < state.channels.length; ch++) {
          const effects = state.channels[ch].insertEffects;
          if (effects.length > 0) {
            channelEffects.set(ch, effects.map(e => ({ ...e, parameters: { ...e.parameters } })));
          }
        }

        // 2. Master effects with selectedChannels (per-channel targeting from master FX panel)
        const { useAudioStore } = await import('./useAudioStore');
        const masterEffects = useAudioStore.getState().masterEffects;
        for (const fx of masterEffects) {
          if (fx.enabled && Array.isArray(fx.selectedChannels) && fx.selectedChannels.length > 0) {
            for (const ch of fx.selectedChannels) {
              const existing = channelEffects.get(ch) ?? [];
              existing.push({ ...fx, parameters: { ...fx.parameters } });
              channelEffects.set(ch, existing);
            }
          }
        }

        console.log(`[MixerStore] scheduleWasmEffectRebuild: rebuilding with ${channelEffects.size} channels having effects`);
        await mgr.rebuild(channelEffects, engine);
      } catch (e) {
        console.warn('[MixerStore] Failed to rebuild WASM per-channel effects:', e);
      }
    })();
  }, 50);
}

// Forward effective mute state to TrackerReplayer's channelMuteMask.
// This is essential for WASM synth engines (FC, TFMX, etc.) whose audio
// bypasses per-channel Tone.Channel nodes and routes through synthBus.

// ── Cached engine references for mute forwarding ───────────────────────────
// Resolved once via dynamic import, then reused synchronously.
// Each engine is a singleton — hasInstance() guards against calling before init.

interface MuteMaskEngine {
  hasInstance(): boolean;
  getInstance(): { setMuteMask(mask: number): void };
}

interface GainEngine {
  hasInstance(): boolean;
  getInstance(): { setChannelGain(ch: number, gain: number): void };
}

interface ChannelOnEngine {
  hasInstance(): boolean;
  getInstance(): { setChannelOn(ch: number, on: boolean): void };
}

const _muteMaskEngineCache = new Map<string, { Engine: MuteMaskEngine; chLimit?: number }>();
const _gainEngineCache = new Map<string, { Engine: GainEngine; maxCh: number }>();
const _channelOnEngineCache = new Map<string, { Engine: ChannelOnEngine; maxCh: number }>();
// rAF-batched dubSend state writes. During slider drag, setChannelDubSend
// is called ~60x/sec. Each zustand setState triggers DubDeckStrip to
// re-render (it subscribes to `channels`). To keep the main thread free
// for the SID ScriptProcessor, we batch drag writes into one setState
// per frame. Last value per channel wins within a frame.
const _pendingDubSends = new Map<number, number>();
let _pendingDubRaf = 0;
function scheduleDubSendStoreWrite(
  ch: number,
  amount: number,
  setter: (fn: (state: any) => void) => void,
): void {
  _pendingDubSends.set(ch, amount);
  if (_pendingDubRaf) return;
  _pendingDubRaf = (typeof requestAnimationFrame !== 'undefined')
    ? requestAnimationFrame(flush)
    : (setTimeout(flush, 16) as unknown as number);
  function flush(): void {
    _pendingDubRaf = 0;
    if (_pendingDubSends.size === 0) return;
    const updates = Array.from(_pendingDubSends.entries());
    _pendingDubSends.clear();
    setter((state: any) => {
      for (const [c, v] of updates) {
        if (c < 0 || c >= state.channels.length) continue;
        state.channels[c].dubSend = v;
      }
    });
  }
}

let _engineCacheWarmedUp = false;

// Cached singleton refs populated during warm-up (avoids require() in runtime paths)
let _trackerReplayerMod: { getTrackerReplayer(): any } | null = null;
let _furnaceDispatchEngineRef: any = null;
let _sunVoxEngineRef: any = null;

// Helper to register a bitmask engine (and optionally gain engine) in the cache
function _regBitmask(name: string, Engine: any, chLimit?: number): void {
  if (Engine?.hasInstance) {
    _muteMaskEngineCache.set(name, { Engine, chLimit });
    // Only add to gain cache if the engine class actually has setChannelGain
    if (Engine.prototype?.setChannelGain) {
      _gainEngineCache.set(name, { Engine: Engine as unknown as GainEngine, maxCh: chLimit ?? 32 });
    }
  }
}

// Eagerly warm up all engine imports so mute is synchronous.
// Each import uses a STATIC string path so Vite can properly resolve them.
void (async () => {
  const promises: Promise<void>[] = [
    // ── Bitmask engines (setMuteMask) ──────────────────────────────────────
    import('../engine/libopenmpt/LibopenmptEngine').then(m => _regBitmask('LibopenmptEngine', m.LibopenmptEngine)).catch(() => {}),
    import('../engine/uade/UADEEngine').then(m => _regBitmask('UADEEngine', m.UADEEngine, 4)).catch(() => {}),
    import('../engine/fc/FCEngine').then(m => _regBitmask('FCEngine', m.FCEngine)).catch(() => {}),
    import('../engine/soundmon/SoundMonEngine').then(m => _regBitmask('SoundMonEngine', m.SoundMonEngine)).catch(() => {}),
    import('../engine/jamcracker/JamCrackerEngine').then(m => _regBitmask('JamCrackerEngine', m.JamCrackerEngine)).catch(() => {}),
    import('../engine/ma/MaEngine').then(m => _regBitmask('MaEngine', m.MaEngine)).catch(() => {}),
    import('../engine/hippel/HippelEngine').then(m => _regBitmask('HippelEngine', m.HippelEngine)).catch(() => {}),
    import('../engine/sonix/SonixEngine').then(m => _regBitmask('SonixEngine', m.SonixEngine)).catch(() => {}),
    import('../engine/pretracker/PreTrackerEngine').then(m => _regBitmask('PreTrackerEngine', m.PreTrackerEngine)).catch(() => {}),
    import('../engine/pumatracker/PumaTrackerEngine').then(m => _regBitmask('PumaTrackerEngine', m.PumaTrackerEngine)).catch(() => {}),
    import('../engine/artofnoise/ArtOfNoiseEngine').then(m => _regBitmask('ArtOfNoiseEngine', m.ArtOfNoiseEngine)).catch(() => {}),
    import('../engine/fred/FredEditorReplayerEngine').then(m => _regBitmask('FredEditorReplayerEngine', m.FredEditorReplayerEngine)).catch(() => {}),
    import('../engine/steveturner/SteveTurnerEngine').then(m => _regBitmask('SteveTurnerEngine', m.SteveTurnerEngine)).catch(() => {}),
    import('../engine/sidmon1/SidMon1ReplayerEngine').then(m => _regBitmask('SidMon1ReplayerEngine', m.SidMon1ReplayerEngine)).catch(() => {}),
    import('../engine/sidmon1/SidMon1Engine').then(m => _regBitmask('SidMon1Engine', m.SidMon1Engine)).catch(() => {}),
    import('../engine/sidmon2/Sd2Engine').then(m => _regBitmask('Sd2Engine', m.Sd2Engine)).catch(() => {}),
    import('../engine/bd/BdEngine').then(m => _regBitmask('BdEngine', m.BdEngine)).catch(() => {}),
    import('../engine/futureplayer/FuturePlayerEngine').then(m => _regBitmask('FuturePlayerEngine', m.FuturePlayerEngine)).catch(() => {}),
    import('../engine/robhubbard/RobHubbardEngine').then(m => _regBitmask('RobHubbardEngine', m.RobHubbardEngine)).catch(() => {}),
    import('../engine/davidwhittaker/DavidWhittakerEngine').then(m => _regBitmask('DavidWhittakerEngine', m.DavidWhittakerEngine)).catch(() => {}),
    import('../engine/octamed/OctaMEDEngine').then(m => _regBitmask('OctaMEDEngine', m.OctaMEDEngine)).catch(() => {}),
    import('../engine/startrekker-am/StartrekkerAMEngine').then(m => _regBitmask('StartrekkerAMEngine', m.StartrekkerAMEngine)).catch(() => {}),
    import('../engine/sc68/Sc68Engine').then(m => _regBitmask('Sc68Engine', m.Sc68Engine)).catch(() => {}),
    import('../engine/eupmini/EupminiEngine').then(m => _regBitmask('EupminiEngine', m.EupminiEngine)).catch(() => {}),
    import('../engine/ixalance/IxalanceEngine').then(m => _regBitmask('IxalanceEngine', m.IxalanceEngine)).catch(() => {}),
    import('../engine/cpsycle/CpsycleEngine').then(m => _regBitmask('CpsycleEngine', m.CpsycleEngine)).catch(() => {}),
    import('../engine/organya/OrganyaEngine').then(m => _regBitmask('OrganyaEngine', m.OrganyaEngine)).catch(() => {}),
    import('../engine/sawteeth/SawteethEngine').then(m => _regBitmask('SawteethEngine', m.SawteethEngine)).catch(() => {}),
    import('../engine/pxtone/PxtoneEngine').then(m => _regBitmask('PxtoneEngine', m.PxtoneEngine)).catch(() => {}),
    import('../engine/symphonie/SymphonieEngine').then(m => _regBitmask('SymphonieEngine', m.SymphonieEngine)).catch(() => {}),
    import('../engine/zxtune/ZxtuneEngine').then(m => _regBitmask('ZxtuneEngine', m.ZxtuneEngine)).catch(() => {}),
    import('../engine/coredesign/CoreDesignEngine').then(m => _regBitmask('CoreDesignEngine', m.CoreDesignEngine)).catch(() => {}),
    import('../engine/sonic-arranger/SonicArrangerEngine').then(m => _regBitmask('SonicArrangerEngine', m.SonicArrangerEngine)).catch(() => {}),
    import('../engine/digmug/DigMugEngine').then(m => _regBitmask('DigMugEngine', m.DigMugEngine)).catch(() => {}),
    import('../engine/deltamusic1/DeltaMusic1Engine').then(m => _regBitmask('DeltaMusic1Engine', m.DeltaMusic1Engine)).catch(() => {}),
    import('../engine/deltamusic2/DeltaMusic2Engine').then(m => _regBitmask('DeltaMusic2Engine', m.DeltaMusic2Engine)).catch(() => {}),
    import('../engine/soundfx/SoundFxEngine').then(m => _regBitmask('SoundFxEngine', m.SoundFxEngine)).catch(() => {}),
    import('../engine/gmc/GmcEngine').then(m => _regBitmask('GmcEngine', m.GmcEngine)).catch(() => {}),
    import('../engine/voodoo/VoodooEngine').then(m => _regBitmask('VoodooEngine', m.VoodooEngine)).catch(() => {}),
    import('../engine/soundcontrol/SoundControlEngine').then(m => _regBitmask('SoundControlEngine', m.SoundControlEngine)).catch(() => {}),
    import('../engine/instereo1/InStereo1Engine').then(m => _regBitmask('InStereo1Engine', m.InStereo1Engine)).catch(() => {}),
    import('../engine/instereo2/InStereo2Engine').then(m => _regBitmask('InStereo2Engine', m.InStereo2Engine)).catch(() => {}),
    import('../engine/futurecomposer/FutureComposerEngine').then(m => _regBitmask('FutureComposerEngine', m.FutureComposerEngine)).catch(() => {}),
    import('../engine/quadracomposer/QuadraComposerEngine').then(m => _regBitmask('QuadraComposerEngine', m.QuadraComposerEngine)).catch(() => {}),
    import('../engine/actionamics/ActionamicsEngine').then(m => _regBitmask('ActionamicsEngine', m.ActionamicsEngine)).catch(() => {}),
    import('../engine/activisionpro/ActivisionProEngine').then(m => _regBitmask('ActivisionProEngine', m.ActivisionProEngine)).catch(() => {}),
    import('../engine/facethemusic/FaceTheMusicEngine').then(m => _regBitmask('FaceTheMusicEngine', m.FaceTheMusicEngine)).catch(() => {}),
    import('../engine/ronklaren/RonKlarenEngine').then(m => _regBitmask('RonKlarenEngine', m.RonKlarenEngine)).catch(() => {}),
    import('../engine/v2m/V2MEngine').then(m => _regBitmask('V2MEngine', m.V2MEngine, 16)).catch(() => {}),
    import('../engine/fmplayer/FmplayerEngine').then(m => _regBitmask('FmplayerEngine', m.FmplayerEngine, 10)).catch(() => {}),
    import('../engine/hippelcoso/HippelCoSoEngine').then(m => _regBitmask('HippelCoSoEngine', m.HippelCoSoEngine, 32)).catch(() => {}),

    // ── Gain-only engines (setChannelGain, no setMuteMask) ─────────────────
    import('../engine/hively/HivelyEngine').then(({ HivelyEngine }) => { _gainEngineCache.set('HivelyEngine', { Engine: HivelyEngine as unknown as GainEngine, maxCh: 16 }); }).catch(() => {}),
    import('../engine/klystrack/KlysEngine').then(({ KlysEngine }) => { _gainEngineCache.set('KlysEngine', { Engine: KlysEngine as unknown as GainEngine, maxCh: 32 }); }).catch(() => {}),

    // ── Channel on/off engine ──────────────────────────────────────────────
    import('../engine/musicline/MusicLineEngine').then(({ MusicLineEngine }) => { _channelOnEngineCache.set('MusicLineEngine', { Engine: MusicLineEngine as unknown as ChannelOnEngine, maxCh: 8 }); }).catch(() => {}),

    // ── TrackerReplayer — main mute mask + SID forwarder ───────────────────
    import('../engine/TrackerReplayer').then((mod) => { _trackerReplayerMod = mod as any; }).catch(() => {}),

    // ── FurnaceDispatchEngine — per-channel mute ───────────────────────────
    import('../engine/furnace-dispatch/FurnaceDispatchEngine').then((mod) => { _furnaceDispatchEngineRef = mod.FurnaceDispatchEngine; }).catch(() => {}),

    // ── SunVoxEngine — for VU polling ──────────────────────────────────────
    import('../engine/sunvox/SunVoxEngine').then((mod) => { _sunVoxEngineRef = mod.SunVoxEngine; }).catch(() => {}),
  ];

  await Promise.allSettled(promises);
  _engineCacheWarmedUp = true;
})();

function forwardReplayerMuteMask(channels: MixerChannelState[], isSoloing: boolean): void {
  let mask = 0;
  for (let i = 0; i < Math.min(channels.length, 32); i++) {
    const effectiveMute = isSoloing ? !channels[i].soloed : channels[i].muted;
    if (!effectiveMute) mask |= (1 << i);
  }

  // Forward to TrackerReplayer (affects ToneEngine note triggering)
  if (_trackerReplayerMod) {
    try {
      _trackerReplayerMod.getTrackerReplayer().setChannelMuteMask(mask);
    } catch (e: any) {
      console.warn('[Mixer] TrackerReplayer.setChannelMuteMask error:', e?.message);
    }
  } else {
    console.warn('[Mixer] _trackerReplayerMod is null — warm-up not complete?');
  }

  if (!_engineCacheWarmedUp) {
    console.warn('[Mixer] engine cache not warmed up yet');
    return;
  }

  // Bitmask engines (setMuteMask)
  for (const [, { Engine, chLimit }] of _muteMaskEngineCache) {
    try {
      if (Engine.hasInstance()) {
        const m = chLimit ? mask & ((1 << chLimit) - 1) : mask;
        Engine.getInstance().setMuteMask(m);
      }
    } catch (e: any) {
      console.warn('[Mixer] setMuteMask error:', e?.message);
    }
  }

  // Gain-based engines (setChannelGain)
  for (const [, { Engine, maxCh }] of _gainEngineCache) {
    try {
      if (Engine.hasInstance()) {
        const inst = Engine.getInstance();
        for (let ch = 0; ch < maxCh; ch++) {
          inst.setChannelGain(ch, (mask & (1 << ch)) !== 0 ? 1.0 : 0.0);
        }
      }
    } catch (e: any) {
      console.warn('[Mixer] setChannelGain error:', e?.message);
    }
  }

  // Channel on/off engines
  for (const [, { Engine, maxCh }] of _channelOnEngineCache) {
    try {
      if (Engine.hasInstance()) {
        const inst = Engine.getInstance();
        for (let ch = 0; ch < maxCh; ch++) {
          inst.setChannelOn(ch, (mask & (1 << ch)) !== 0);
        }
      }
    } catch (e: any) {
      console.warn('[Mixer] setChannelOn error:', e?.message);
    }
  }

  // C64 SID: instance-based (not singleton), access via replayer
  if (_trackerReplayerMod) {
    try {
      const sidEngine = _trackerReplayerMod.getTrackerReplayer().getC64SIDEngine();
      if (sidEngine) {
        sidEngine.setMuteMask(mask & 0x07); // 3 SID voices
      }
    } catch { /* replayer not initialized */ }
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

  // Use cached SunVox engine ref from warm-up
  try {
    if (!_sunVoxEngineRef || !_sunVoxEngineRef.hasInstance()) { _sunVoxVuInFlight = false; return; }
    const engine = _sunVoxEngineRef.getInstance();
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

// Lazy reference to Furnace engine — uses cached ref from warm-up
function getFurnaceDispatchEngine(): any {
  return _furnaceDispatchEngineRef;
}

/**
 * Get the active WASM engine instance that supports setChannelGain, if any.
 * Iterates the warm-up cache — only one engine will have an active instance at a time.
 */
export function getActiveGainEngine(): { setChannelGain(ch: number, gain: number): void } | null {
  if (!_engineCacheWarmedUp) return null;
  for (const [, { Engine }] of _gainEngineCache) {
    try {
      if (Engine.hasInstance()) return Engine.getInstance() as any;
    } catch { /* not ready */ }
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
      const eng = getFurnaceDispatchEngine();
      if (eng) {
        const c = channels[ch];
        const effectiveMute = isSoloing ? !c.soloed : (c.muted || c.volume <= 0);
        eng.getInstance().mute(ch, effectiveMute);
      }
    } catch (e: any) {
      console.warn('[Mixer] Furnace mute error:', e?.message);
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
    try {
      const c = channels[ch];
      const effectiveMute = isSoloing ? !c.soloed : c.muted;
      const gain = effectiveMute ? 0 : c.volume;
      gainEngine.setChannelGain(ch, gain);
    } catch (e: any) {
      console.warn('[Mixer] setChannelGain error:', e?.message);
    }
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
      const eng = getFurnaceDispatchEngine();
      if (eng) {
        const engine = eng.getInstance();
        channels.forEach((c, i) => {
          const effectiveMute = isSoloing ? !c.soloed : (c.muted || c.volume <= 0);
          engine.mute(i, effectiveMute);
        });
      }
    } catch (e: any) {
      console.warn('[Mixer] Furnace mute-all error:', e?.message);
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
    try {
      channels.forEach((c, i) => {
        const effectiveMute = isSoloing ? !c.soloed : c.muted;
        const gain = effectiveMute ? 0 : c.volume;
        gainEngine.setChannelGain(i, gain);
      });
    } catch (e: any) {
      console.warn('[Mixer] setChannelGain-all error:', e?.message);
    }
  }
}

// ── Sync mute/solo state to pattern channels for visual rendering ──────────
// useMixerStore is the single source of truth for mute/solo.
// Pattern channel .muted/.solo are read-only mirrors used for rendering.
function syncMuteToPatternChannels(): void {
  // Use dynamic import to avoid circular dependency at module scope.
  // Both useMixerStore and useTrackerStore import each other — direct import would deadlock.
  import('./useTrackerStore').then(({ useTrackerStore }) => {
    const { channels } = useMixerStore.getState();
    const trackerState = useTrackerStore.getState();
    const numChannels = channels.length;

    const pattern = trackerState.patterns[trackerState.currentPatternIndex];
    if (!pattern) return;

    let needsUpdate = false;
    for (let i = 0; i < Math.min(pattern.channels.length, numChannels); i++) {
      if (pattern.channels[i].muted !== channels[i].muted ||
          pattern.channels[i].solo !== channels[i].soloed) {
        needsUpdate = true;
        break;
      }
    }
    if (!needsUpdate) return;

    useTrackerStore.setState((state: any) => {
      for (const pat of state.patterns) {
        for (let i = 0; i < Math.min(pat.channels.length, numChannels); i++) {
          pat.channels[i].muted = channels[i].muted;
          pat.channels[i].solo = channels[i].soloed;
        }
      }
    });
  }).catch(() => {
    // TrackerStore not ready
  });
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
  dubSend: number;  // 0–1 send into shared DubBus (0 = no send, 1 = full send)
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
    dubSend: 0,               // dub bus send (0 = off)
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
  updateChannelInsertEffect: (ch: number, effectIndex: number, updates: Partial<EffectConfig>) => void;

  // Dub bus send
  setChannelDubSend: (ch: number, amount: number) => void;

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

  // Reset mute/solo state (called on song load)
  resetMuteState: () => void;
  reapplyAllMutes: () => void;
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
        const { channels: chans, isSoloing: soloing } = get();
        const effectiveMute = soloing ? !chans[ch].soloed : muted;
        getToneEngine().setChannelMute(ch, effectiveMute);
      });
      const { channels: chans, isSoloing: soloing } = get();
      forwardWasmChannelGain(ch, chans, soloing);
      forwardReplayerMuteMask(chans, soloing);
      syncMuteToPatternChannels();
    },

    setChannelSolo(ch: number, soloed: boolean): void {
      set((state) => {
        // Exclusive solo: clear all other solos first (tracker convention)
        state.channels.forEach((c, i) => {
          if (i !== ch) c.soloed = false;
        });
        state.channels[ch].soloed = soloed;
        state.isSoloing = soloed; // Only one can be soloed
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
      syncMuteToPatternChannels();
    },

    resetMuteState(): void {
      set((state) => {
        state.channels.forEach((c) => {
          c.muted = false;
          c.soloed = false;
        });
        state.isSoloing = false;
      });
      // Apply to all engines
      applyToEngine(() => {
        const { channels } = get();
        channels.forEach((_, i) => {
          getToneEngine().setChannelMute(i, false);
        });
      });
      const { channels, isSoloing } = get();
      forwardAllWasmChannelGains(channels, isSoloing);
      forwardReplayerMuteMask(channels, isSoloing);
      syncMuteToPatternChannels();
    },

    reapplyAllMutes(): void {
      const { channels, isSoloing } = get();
      applyToEngine(() => {
        channels.forEach((c, i) => {
          const effectiveMute = isSoloing ? !c.soloed : c.muted;
          try { getToneEngine().setChannelMute(i, effectiveMute); } catch { /* ok */ }
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
      // Apply to native audio engine + WASM isolation
      getChannelEffectsManager().addEffect(ch, effect);
      scheduleWasmEffectRebuild();
    },

    removeChannelInsertEffect(ch: number, effectIndex: number): void {
      set((state) => {
        if (ch < 0 || ch >= state.channels.length) return;
        state.channels[ch].insertEffects.splice(effectIndex, 1);
      });
      getChannelEffectsManager().removeEffect(ch, effectIndex);
      scheduleWasmEffectRebuild();
    },

    toggleChannelInsertEffect(ch: number, effectIndex: number): void {
      set((state) => {
        if (ch < 0 || ch >= state.channels.length) return;
        const fx = state.channels[ch].insertEffects[effectIndex];
        if (fx) fx.enabled = !fx.enabled;
      });
      getChannelEffectsManager().toggleEffect(ch, effectIndex);
      scheduleWasmEffectRebuild();
    },

    moveChannelInsertEffect(ch: number, fromIndex: number, toIndex: number): void {
      set((state) => {
        if (ch < 0 || ch >= state.channels.length) return;
        const arr = state.channels[ch].insertEffects;
        const [item] = arr.splice(fromIndex, 1);
        if (item) arr.splice(toIndex, 0, item);
      });
      getChannelEffectsManager().moveEffect(ch, fromIndex, toIndex);
      scheduleWasmEffectRebuild();
    },

    updateChannelInsertEffect(ch: number, effectIndex: number, updates: Partial<EffectConfig>): void {
      set((state) => {
        if (ch < 0 || ch >= state.channels.length) return;
        const fx = state.channels[ch].insertEffects[effectIndex];
        if (!fx) return;
        if (updates.parameters) {
          fx.parameters = { ...fx.parameters, ...updates.parameters };
        }
        if (updates.wet !== undefined) fx.wet = updates.wet;
        if (updates.enabled !== undefined) fx.enabled = updates.enabled;
      });

      if (updates.enabled !== undefined) {
        getChannelEffectsManager().toggleEffect(ch, effectIndex);
        // Toggle changes which effects are active — needs rebuild
        scheduleWasmEffectRebuild();
      } else {
        // Push parameter/wet changes to both engines in real-time
        const state = get();
        const effect = state.channels[ch]?.insertEffects[effectIndex];
        if (effect) {
          const cloned = structuredClone(effect) as EffectConfig;
          getChannelEffectsManager().updateEffectParams(ch, effectIndex, cloned);
          // Also update WASM routed effects (no rebuild needed for param changes)
          try {
            const mgr = getChannelRoutedEffectsManager();
            if (mgr?.hasActiveSlots) {
              mgr.updateEffectParams(ch, effectIndex, cloned);
            }
          } catch { /* manager not initialized yet */ }
        }
      }
    },

    // Dub bus send — routes through the multi-output WASM worklet via
    // ChannelRoutedEffects. Tracker worklets (LibOpenMPT/Furnace/Hively/UADE)
    // dedicate outputs [5..36] to per-channel dub taps; the manager owns
    // those 32 GainNodes and lazily activates them as needed.
    //
    // Audio update fires immediately (smooth gain ramp). Zustand state
    // write is rAF-batched so rapid drag (60 calls/sec) produces at most
    // one React re-render per frame — prevents main-thread stalls that
    // cause SID ScriptProcessor audio stutter during slider drag.
    setChannelDubSend(ch: number, amount: number): void {
      const clamped = Math.max(0, Math.min(1, amount));

      // Audio update FIRST — immediate, never deferred.
      // SID mode: route to per-voice taps on the dub bus directly.
      let handledBySid = false;
      try {
        const dubBus = getActiveDubBus();
        if (dubBus?.setSidVoiceDubSend(ch, clamped)) {
          handledBySid = true;
        }
      } catch { /* not in SID mode or dub bus not ready */ }

      if (!handledBySid) {
        try {
          getChannelRoutedEffectsManager()?.setChannelDubSend(ch, clamped);
        } catch (e) {
          console.warn('[MixerStore] setChannelDubSend: manager unavailable', e);
        }
      }

      // State update — rAF-batched so drag doesn't cause 60 re-renders/sec.
      scheduleDubSendStoreWrite(ch, clamped, set);
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

      // Auto-route: when loading a preset with effects, set all channels'
      // send levels to 50% so the user hears the effect immediately.
      // When clearing (empty effects), reset send levels to 0.
      const autoLevel = effects.length > 0 ? 0.5 : 0;
      const state = get();
      for (let ch = 0; ch < state.channels.length; ch++) {
        const current = state.channels[ch].sendLevels[busIndex] ?? 0;
        // Only auto-route if currently at 0 (don't overwrite user adjustments)
        if (effects.length > 0 && current > 0) continue;
        // For clearing, always reset
        if (effects.length === 0 && current === 0) continue;
        get().setChannelSendLevel(ch, busIndex, autoLevel);
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
      // Rebuild WASM isolation for the new effect chain
      scheduleWasmEffectRebuild();
    },
  }))
);
