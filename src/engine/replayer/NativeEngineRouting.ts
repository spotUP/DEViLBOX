/**
 * Native engine routing - lifecycle management for WASM engines.
 *
 * Uses a declarative registry: each engine is described by a descriptor in
 * WASM_ENGINES[]. The start/stop/pause/resume functions iterate the registry
 * instead of containing per-engine if/else blocks.
 *
 * To add a new WASM engine, add one entry to WASM_ENGINES[].
 * C64 SID is instance-based (not singleton) and handled separately.
 */

import { silenceIsNotTheSongs } from './performerSilence';
import * as Tone from 'tone';
import type { TrackerSong } from '../TrackerReplayer';
import { getToneEngine } from '../ToneEngine';
import { getNativeAudioNode } from '@utils/audio-context';
import { HivelyEngine } from '../hively/HivelyEngine';
import type { UADEEngine } from '../uade/UADEEngine';
import { MusicLineEngine } from '../musicline/MusicLineEngine';
import { C64SIDEngine } from '../C64SIDEngine';
import { SF2Engine } from '../sf2/SF2Engine';
import { SilenceDetector } from './SilenceDetector';
import { advanceNativeSubsong } from './nativeSubsongPlayback';
import { useWasmPositionStore } from '../../stores/useWasmPositionStore';
import { JamCrackerEngine } from '../jamcracker/JamCrackerEngine';
import { getActiveDubBus } from '../dub/DubBus';
import { asIsolationCapable, setPlayingIsolationEngine } from '../tone/ChannelRoutedEffects';
import { needsPaulaOutputStage } from '@engine/paulaOutput';
import { WASM_ENGINES, shouldActivate, songFromStores, type NativeEngineDescriptor, type WASMSingletonStatic } from './wasmEngineRegistry';

export { WASM_ENGINES, shouldActivate, playsOnDedicatedEngine } from './wasmEngineRegistry';

/**
 * Engines linked into this module, so stop / pause / resume reach them
 * synchronously (the registry resolves every engine lazily).
 */
const STATIC_ENGINES: Readonly<Record<string, WASMSingletonStatic>> = {
  Hively: HivelyEngine as unknown as WASMSingletonStatic,
  JamCracker: JamCrackerEngine as unknown as WASMSingletonStatic,
  MusicLine: MusicLineEngine as unknown as WASMSingletonStatic,
};

export { C64SIDEngine };
export { SF2Engine };

/** Active silence detectors keyed by engine synthType */
const activeSilenceDetectors = new Map<string, SilenceDetector>();

/**
 * A native engine's song has ended (its output stayed silent): stop the
 * engine AND the transport. Stopping only the engine left the transport
 * playing — the grid frozen on the last position while the play marker kept
 * scrolling, and no sound (ghostbattle_gameover.hip7, 2026-09-28).
 */
export async function endNativeSong(instance: { stop(): void }): Promise<void> {
  try { instance.stop(); } catch { /* ignored */ }
  const { useTransportStore } = await import('@stores/useTransportStore');
  const transport = useTransportStore.getState();
  if (transport.isPlaying) transport.stop();
}

/**
 * A native engine's output stayed silent. A file with more subsongs plays
 * the next one (owner, 2026-10-05: "just skip to next subsong when it
 * ends") and the detector watches again; on the last subsong, or an engine
 * without subsongs, the song ends.
 */
export async function onNativeSongSilence(key: string, instance: { stop(): void }, detector: { resume(): void }): Promise<void> {
  if (await advanceNativeSubsong(key, instance)) {
    console.log(`[NativeEngineRouting] ${key} silence detected — next subsong`);
    detector.resume();
    return;
  }
  console.log(`[NativeEngineRouting] ${key} silence detected — stopping`);
  await endNativeSong(instance);
}


/** Synth types routed through the stereo separation chain */
const ROUTABLE_SYNTH_TYPES = new Set(
  ['UADESynth', 'SunVoxSynth', 'SunVoxModular', ...WASM_ENGINES.map(e => e.synthType)]
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveEngine(desc: NativeEngineDescriptor): Promise<WASMSingletonStatic> {
  const linked = STATIC_ENGINES[desc.key] ?? desc.staticRef;
  if (linked) return linked;
  if (desc.dynamicResolver) return desc.dynamicResolver();
  const mod = await import(/* @vite-ignore */ desc.dynamicImport!);
  return mod[desc.dynamicExportName!] as WASMSingletonStatic;
}

function tryResolveSync(desc: NativeEngineDescriptor): WASMSingletonStatic | null {
  return STATIC_ENGINES[desc.key] ?? desc.staticRef ?? null;
}

export { silenceIsNotTheSongs, mixerSilencesAChannel } from './performerSilence';




/**
 * What will make the sound for `song`, by the same rule `startNativeEngines`
 * applies: the first registry descriptor whose file data the song carries
 * (its `key`, e.g. `Hippel`, `UADEEditable`); `UADE classic` when the song's
 * instruments stream through UADESynth with no editable file data; else
 * `tracker` (the TypeScript scheduler voices the grid). The bridge reports
 * this next to the registry label, which names the format's registry entry
 * and misled two triages into blaming the wrong engine (ledger F22).
 */
export function playingEngineFor(song: Pick<TrackerSong, 'format' | 'instruments'> & Partial<TrackerSong>): string {
  const desc = WASM_ENGINES.find((d) => shouldActivate(d, song as TrackerSong));
  if (desc) return desc.key;
  if (song.instruments?.some((inst) => inst.synthType === 'UADESynth')) return 'UADE classic';
  return 'tracker';
}

/**
 * `playingEngineFor` over what the stores hold for the LOADED song. The
 * replayer's `getSong()` lags a load: read right after `load_file` it still
 * held the previous song, and the bridge named the previous song's engine
 * (`Hippel` for a UADE-played .gray, `UADEEditable` for a Fred song,
 * 2026-10-04). The format store takes the file data at apply time.
 */
export function playingEngineFromStores(
  format: Record<string, unknown> & { songFormat?: string | null; originalModuleData?: { format?: string } | null },
  instruments: ReadonlyArray<{ synthType?: string }>,
): string {
  return playingEngineFor(songFromStores(format, instruments));
}

function registerWholeMixDubSend(key: string, source: AudioNode | null | undefined): void {
  if (!source) return;
  try {
    getActiveDubBus()?.registerWholeMixTap(key, source);
  } catch (e) {
    console.warn(`[NativeEngineRouting] ${key} whole-mix dub send skipped:`, e);
  }
}

/**
 * Tell the dub bus whether the engine now playing exposes per-channel outputs,
 * asking the same resolvers the channel taps use. Hippel plays in "classic"
 * mode through TFMXEngine, which does not; the mode alone said it did, so the
 * whole-mix fallback stayed silent and the dub bus got no input.
 */
export async function reportPlaybackIsolation(
  bus: { setEngineIsolation(canIsolate: boolean | null): void } | null = getActiveDubBus(),
  resolveEngine: () => Promise<{ isAvailable(): boolean; supportsDubSends?(): boolean } | null> = async () =>
    (await import('../tone/ChannelRoutedEffects')).getActiveIsolationEngine(),
): Promise<void> {
  try {
    const engine = await resolveEngine() as ({ isAvailable(): boolean; supportsDubSends?(): boolean } | null);
    bus?.setEngineIsolation(!!engine?.isAvailable() && engine.supportsDubSends?.() !== false);
  } catch (e) {
    console.warn('[NativeEngineRouting] isolation report skipped:', e);
  }
}

/** Make a started native engine the dub/isolation engine for this song, when it can be one. */
function registerPlayingEngine(instance: unknown): void {
  setPlayingIsolationEngine(asIsolationCapable(instance));
}

function unregisterWholeMixDubSend(key: string): void {
  try {
    getActiveDubBus()?.unregisterWholeMixTap(key);
  } catch { /* ok */ }
  const dry = _nativeDryGains.get(key);
  if (dry) {
    try { dry.disconnect(); } catch { /* already gone */ }
    _nativeDryGains.delete(key);
  }
}

/**
 * The DRY gain of each direct-routed native engine, between the engine's
 * output and the master path. `masterDrop` ramps these. It used to ramp
 * `instance.output.gain` - but the dub bus's whole-mix tap and the silence
 * detector hang off `instance.output`, so a Drop killed the wet feed with
 * the dry and the desk went completely silent (owner, 2026-10-04). The tap
 * stays on the engine output; only what goes to the master is dropped.
 */
const _nativeDryGains = new Map<string, GainNode>();
function attachDryGain(key: string, source: GainNode): GainNode {
  const existing = _nativeDryGains.get(key);
  if (existing) { try { existing.disconnect(); } catch { /* ok */ } }
  const dry = source.context.createGain();
  source.connect(dry);
  _nativeDryGains.set(key, dry);
  return dry;
}
export function liveNativeDryGains(): GainNode[] {
  return [..._nativeDryGains.values()];
}

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

/** Result of starting native engines - caller applies to its own state */
export interface NativeEngineStartResult {
  suppressNotes: boolean;
  c64SidEngine: C64SIDEngine | null;
  sf2Engine: SF2Engine | null;
  hivelyEngine: HivelyEngine | null;
  uadeEngine: UADEEngine | null;
  musicLineEngine: MusicLineEngine | null;
}

// ---------------------------------------------------------------------------
// Start native engines (called from TrackerReplayer.play())
// ---------------------------------------------------------------------------

/** Track which engine keys are currently running to prevent duplicate starts */
const _runningEngineKeys = new Set<string>();

/** The registry engine `key` while it plays the current song, else null. */
export async function runningEngineInstance(key: string): Promise<unknown> {
  if (!_runningEngineKeys.has(key)) return null;
  const desc = WASM_ENGINES.find((d) => d.key === key);
  if (!desc) return null;
  const engine = await resolveEngine(desc);
  return engine.hasInstance() ? engine.getInstance() : null;
}

/**
 * Record a position an engine reported, if that engine is playing the current
 * song. Engines are singletons whose position callbacks outlive a song: after
 * stopNativeEngines() cleared the store, a stopped engine's late report marked
 * the store active again and the pattern editor followed that frozen position
 * through every later song (an AmigaKlang .mod showed empty pattern 0 while it
 * played). Only the running engine owns the position.
 */
export function reportEnginePosition(
  key: string,
  row: number,
  songPos?: number,
  channelRows?: number[],
  channelPositions?: number[],
): void {
  if (!_runningEngineKeys.has(key)) return;
  useWasmPositionStore.getState().setPosition(row, songPos, channelRows, channelPositions);
}

/** Clear running engine tracking (call on stop/dispose) */
export function clearRunningEngineKeys(): void {
  _runningEngineKeys.clear();
}

let _activeC64SidEngine: C64SIDEngine | null = null;
/** Get the currently active C64SIDEngine instance (null when no SID is playing). */
export function getActiveC64SidEngine(): C64SIDEngine | null { return _activeC64SidEngine; }

export async function startNativeEngines(
  song: TrackerSong,
  separationInputTone: Tone.ToneAudioNode,
  isDJDeck: boolean,
  muted: boolean,
  routedNativeEngines: Set<string>,
): Promise<NativeEngineStartResult> {
  // Wait for any pending async engine stops from the previous song to complete.
  // Prevents race conditions during rapid song switching where the old engine's
  // stop messages collide with the new engine's initialization.
  await _pendingStopPromise;

  const toneEngine = getToneEngine();
  let suppressNotes = false;
  let c64SidEngine: C64SIDEngine | null = null;
  let sf2Engine: SF2Engine | null = null;
  let hivelyEngine: HivelyEngine | null = null;
  let uadeEngine: UADEEngine | null = null;
  let musicLineEngine: MusicLineEngine | null = null;

  // Clean up any leftover silence detectors from a previous session
  for (const [, detector] of activeSilenceDetectors) {
    detector.dispose();
  }
  activeSilenceDetectors.clear();

  // --- Singleton WASM engines (registry-driven) ---
  const startedEngineKeys = new Set<string>();
  for (const desc of WASM_ENGINES) {
    if (!shouldActivate(desc, song)) continue;

    // Skip engines already running — prevents double-start when startNativeEngines
    // is called twice in quick succession (e.g. FT2Toolbar play + usePatternPlayback
    // effect both triggering it). The second loadSong would reinitialize the WASM
    // backend, killing audio from the first start.
    if (_runningEngineKeys.has(desc.key)) {
      startedEngineKeys.add(desc.key);
      // Still report suppression: the engine is playing this song, so the TS
      // scheduler must NOT also voice the pattern notes. Missing this let a
      // re-played/re-loaded Cinter4 (whose decompiled patterns carry real notes)
      // double the WASM output through synth voices.
      if (desc.suppressNotes) suppressNotes = true;
      continue;
    }

    // One engine per song: the first descriptor (table order) whose data the
    // song carries plays it - prevents dual audio (e.g. Hively + UADE).
    if (startedEngineKeys.size > 0) continue;

    if (desc.suppressNotes) suppressNotes = true;

    try {
      const EngineClass = await resolveEngine(desc);

      const instance = EngineClass.getInstance();
      await instance.ready();

      // Load file data into the engine
      const fileData = song[desc.fileDataKey] as ArrayBuffer | Uint8Array;
      const dataCopy = fileData instanceof Uint8Array
        ? fileData.slice(0) : (fileData as ArrayBuffer).slice(0);
      const extraArgs = desc.getLoadArgs?.(song) ?? [];

      if (desc.loadMethod === 'loadTune') {
        await instance.loadTune!(dataCopy, ...extraArgs);
      } else {
        await instance.loadSong!(dataCopy);
      }

      // Run engine-specific post-load setup
      desc.onStarted?.(instance, song);

      // Pre-create synth instrument so audio graph is connected before play()
      const firstInst = song.instruments.find(i => i.synthType === desc.synthType);
      if (firstInst) {
        toneEngine.getInstrument(firstInst.id, firstInst);
      }

      startedEngineKeys.add(desc.key);
      _runningEngineKeys.add(desc.key);

      if (!muted) {
        // Restore gain in case it was muted by a previous stopNativeEngines
        const output = (instance as unknown as { output?: { gain?: AudioParam } }).output;
        if (output?.gain) {
          try { output.gain.setValueAtTime(1, 0); } catch { /* best effort */ }
        }
        instance.play();
        console.log(`[NativeEngineRouting] ${desc.key} loaded & playing`);

        // Capture HivelyEngine for position sync in TrackerReplayer.
        // AHX/HVL are Amiga chip formats — NOT C64 SID — so they use the
        // standard WebAudio dub bus path, not SID dub mode.
        if (desc.key === 'Hively') {
          hivelyEngine = instance as unknown as HivelyEngine;
          // Also push positions to useWasmPositionStore so DubRouter can read
          // the live row for AutoDub fires. Without this every fire stamped
          // on row 0 (the transport-store fallback) and overwrote the
          // previous one — Zxx cells appeared to "never get written".
          hivelyEngine.onPositionUpdate((update) => {
            reportEnginePosition(desc.key, update.row, update.position);
          });
        }

        // Capture UADEEngine for position sync in TrackerReplayer
        if (desc.key === 'UADEEditable') {
          uadeEngine = instance as unknown as UADEEngine;
        }

        // Capture MusicLineEngine for position sync in TrackerReplayer
        if (desc.key === 'MusicLine') {
          musicLineEngine = instance as unknown as MusicLineEngine;
        }

        // TFMX module position sync: use timing table (cumulativeJiffies → row/pattern)
        if (desc.key === 'TFMXModule' && 'onPositionUpdate' in instance) {
          const timingTable = song.tfmxTimingTable as
            { patternIndex: number; row: number; cumulativeJiffies: number }[] | undefined;

          // Get tempo from the song's initialBPM/initialSpeed (set by TFMXParser from tempo value)
          // TFMXParser: CIA mode (tempo>=16) → initialBPM = tempo*2.5/24
          // VBlank mode (tempo<16) → initialBPM=125, initialSpeed=tempo+1
          // For jiffy conversion: use 20ms/jiffy as default (VBlank rate)
          // The timing table already encodes per-row jiffy durations from the actual TFMX commands
          const msPerJiffy = 20; // VBlank: 1/50s. For CIA, the timing table jiffies are already scaled.
          const sr = Tone.context.sampleRate || 44100;

          let _posLogCount = 0;
          (instance as any).onPositionUpdate((update: { samplesRendered: number; elapsedMs?: number; songEnd: boolean }) => {
            if (!timingTable || timingTable.length === 0) return;

            // Compute elapsed ms from samplesRendered (more reliable than worklet's elapsedMs)
            const elapsedMs = (update.samplesRendered / sr) * 1000;
            const currentJiffies = elapsedMs / msPerJiffy;

            // Binary search for the last entry where cumulativeJiffies <= currentJiffies
            let lo = 0, hi = timingTable.length - 1;
            while (lo < hi) {
              const mid = (lo + hi + 1) >>> 1;
              if (timingTable[mid].cumulativeJiffies <= currentJiffies) {
                lo = mid;
              } else {
                hi = mid - 1;
              }
            }

            const entry = timingTable[lo];
            const row = entry.row;
            const position = entry.patternIndex;

            if (_posLogCount < 3) {
              _posLogCount++;
              console.log(`[TFMXModule] pos #${_posLogCount}: elapsed=${elapsedMs.toFixed(0)}ms jiffies=${currentJiffies.toFixed(1)} → pat=${position} row=${row} (of ${timingTable.length} entries)`);
            }

            if (Number.isFinite(row) && Number.isFinite(position)) {
              reportEnginePosition(desc.key, row, position);
            }
          });
          console.log(`[NativeEngineRouting] TFMXModule position sync wired (${timingTable?.length ?? 0} entries, msPerJiffy=${msPerJiffy})`);
        }

        // Hippel position sync: the decoder reports voice 0's track step and
        // the file offset it reads next; the parser's cell spans turn that
        // offset into a grid row. Steps are the grid's patterns, in order.
        if (desc.key === 'Hippel' && song.hippelFileData) {
          const { mapHippelCells } = await import('@/engine/hippel/rebuildHippelModule');
          const { hippelRowAt } = await import('@/engine/hippel/hippelCellSpans');
          const spans = mapHippelCells(song.hippelFileData, song.instruments.length);
          if (spans) {
            (instance as unknown as import('@/engine/tfmx/TFMXEngine').TFMXEngine).onPositionUpdate((u) => {
              if (u.step === undefined || u.step < 0 || u.patternOffset === undefined || u.patternOffset < 0) return;
              reportEnginePosition(desc.key, hippelRowAt(spans, u.step, u.patternOffset), u.step);
            });
            console.log(`[NativeEngineRouting] Hippel position sync wired (${spans.length} steps)`);
          }
        }

        // Generic position sync for WASM engines with onPositionUpdate.
        // IMPORTANT: Do NOT call store.play() or set isPlaying here — that triggers
        // usePatternPlayback reload effect → startNativeEngines() → infinite respawn loop.
        // The TrackerReplayer.play() already sets isPlaying via the normal flow.
        // We only update currentRow so the pattern editor scrolls.
        if ('onPositionUpdate' in instance && typeof (instance as any).onPositionUpdate === 'function' && desc.key !== 'Hively' && desc.key !== 'UADEEditable' && desc.key !== 'TFMXModule' && desc.key !== 'Hippel') {
          // Wire position updates to the lightweight WASM position store.
          // This bypasses useTransportStore entirely to avoid triggering
          // the usePatternPlayback effect chain (which causes recursive engine spawns).
          // MusicLine: use onPosition for per-channel row/position data
          if (desc.key === 'MusicLine' && 'onPosition' in instance) {
            (instance as any).onPosition((update: { position: number; row: number; channelRows?: number[]; channelPositions?: number[] }) => {
              reportEnginePosition(desc.key, update.row, update.position, update.channelRows, update.channelPositions);
            });
          } else {
            (instance as any).onPositionUpdate((update: { songPos?: number; row: number }) => {
              reportEnginePosition(desc.key, update.row, update.songPos);
            });
          }
          // Also connect meters on first play
          try { getToneEngine().connectMeters(); } catch { /* ok */ }
          console.log(`[NativeEngineRouting] ${desc.key} position sync wired`);
        }

        // Direct routing for engines without a synth in song.instruments
        if (desc.needsDirectRouting && !isDJDeck && !routedNativeEngines.has(desc.synthType)) {
          const nativeInput = getNativeAudioNode(separationInputTone as any);
          // Everything bound for the master goes through `dry`; the dub tap
          // and the silence detector stay on `instance.output` (see attachDryGain).
          const dry = attachDryGain(`native:${desc.synthType}`, instance.output);
          if (nativeInput) {
            // Handle cross-context routing (stale AudioContext from HMR)
            if (instance.output.context !== nativeInput.context) {
              try {
                const msDest = (instance.output.context as AudioContext).createMediaStreamDestination();
                dry.connect(msDest);
                const msSource = (nativeInput.context as AudioContext).createMediaStreamSource(msDest.stream);
                msSource.connect(nativeInput);
                console.log(`[NativeEngineRouting] ${desc.key} output → stereo separation (cross-context bridge)`);
              } catch (bridgeErr) {
                console.error(`[NativeEngineRouting] ${desc.key} cross-context bridge failed:`, bridgeErr);
                // Fallback: connect to engine's own context destination
                dry.connect(instance.output.context.destination);
              }
            } else {
              // An engine that emulates Paula hands over its DAC output raw —
              // no Amiga 500 ever did. The stage goes IN FRONT of the same
              // destination, so isolation, the dub tap and everything else
              // downstream are untouched. `engine/paulaOutput.ts` holds the
              // survey that decides membership.
              const viaPaula = needsPaulaOutputStage(desc.synthType)
                && toneEngine.routeThroughPaulaStage(dry, nativeInput);
              if (!viaPaula) dry.connect(nativeInput);
              console.log(`[NativeEngineRouting] ${desc.key} output → stereo separation${viaPaula ? ' (via Amiga output stage)' : ''}`);
            }
            routedNativeEngines.add(desc.synthType);
            registerWholeMixDubSend(`native:${desc.synthType}`, instance.output);
            registerPlayingEngine(instance);
            void reportPlaybackIsolation();
          } else {
            // Fallback: connect directly to audio context destination
            const ctx = instance.output.context;
            dry.connect(ctx.destination);
            routedNativeEngines.add(desc.synthType);
            registerWholeMixDubSend(`native:${desc.synthType}`, instance.output);
            registerPlayingEngine(instance);
            void reportPlaybackIsolation();
            console.log(`[NativeEngineRouting] ${desc.key} output → destination (fallback)`);
          }
        }
        // Start silence detection for looping formats
        if (desc.needsDirectRouting) {
          const detector = new SilenceDetector(instance.output.context);
          detector.start(instance.output, instance.output, () => {
            void onNativeSongSilence(desc.key, instance, detector);
          }, silenceIsNotTheSongs);
          activeSilenceDetectors.set(desc.synthType, detector);
        }
      } else {
        console.log(`[NativeEngineRouting] ${desc.key} loaded but skipping play (muted)`);
      }
    } catch (err) {
      console.error(`[NativeEngineRouting] Failed to start ${desc.key}:`, err);
    }
  }

  // --- C64 SID (instance-based, not singleton - special case) ---
  if (song.c64SidFileData && song.format === 'SID') {
    suppressNotes = true;
    // Check if SF2 store has loaded data (set by applyEditorMode → useSF2Store.loadSF2Data)
    const { useSF2Store } = await import('@stores/useSF2Store');
    const sf2State = useSF2Store.getState();
    const hasSF2Data = sf2State.rawFileData !== null && sf2State.descriptor !== null;
    console.log('[NativeEngineRouting] C64 SID path activated — hasSF2Data:', hasSF2Data, 'dataLen:', song.c64SidFileData.length);
    try {
      const audioContext = Tone.getContext().rawContext as AudioContext;
      const synthBusNode = getNativeAudioNode(toneEngine.synthBus as any);

      // SF2 files: use SF2Engine for live editing support
      if (hasSF2Data && sf2State.descriptor && sf2State.driverCommon && sf2State.musicData) {
        const engine = new SF2Engine(song.c64SidFileData);
        engine.setDriverInfo({
          descriptor: sf2State.descriptor,
          driverCommon: sf2State.driverCommon,
          musicData: sf2State.musicData,
          tableDefs: sf2State.tableDefs,
          loadAddress: sf2State.loadAddress,
        });
        await engine.init(audioContext, synthBusNode ?? undefined);
        sf2Engine = engine;
        c64SidEngine = engine.engine;

        const { useTransportStore } = await import('@stores/useTransportStore');
        const globalPitch = useTransportStore.getState().globalPitch ?? 0;
        if (globalPitch !== 0) {
          c64SidEngine.setPlaybackRate(Math.pow(2, globalPitch / 12));
        }

        if (!muted) {
          await engine.play();
          console.log('[NativeEngineRouting] SF2Engine loaded & playing (live editing enabled:', engine.canEdit, ')');
        } else {
          console.log('[NativeEngineRouting] SF2Engine loaded but skipping play (muted)');
        }
      } else {
        // Regular SID file (PSID/RSID)
        c64SidEngine = new C64SIDEngine(song.c64SidFileData);
        await c64SidEngine.init(audioContext, synthBusNode ?? undefined);

        const { useTransportStore } = await import('@stores/useTransportStore');
        const globalPitch = useTransportStore.getState().globalPitch ?? 0;
        if (globalPitch !== 0) {
          c64SidEngine.setPlaybackRate(Math.pow(2, globalPitch / 12));
        }

        _activeC64SidEngine = c64SidEngine;

        // Apply global headphones mode if enabled in settings
        try {
          const { useSettingsStore } = await import('@stores/useSettingsStore');
          if (useSettingsStore.getState().headphonesMode) c64SidEngine.setHeadphones(true);
        } catch { /* ok */ }

        if (!muted) {
          await c64SidEngine.play();
          console.log('[NativeEngineRouting] C64SIDEngine loaded & playing');
        } else {
          console.log('[NativeEngineRouting] C64SIDEngine loaded but skipping play (muted)');
        }

        // Apply post-init RAM patches (CheeseCutter: restore $C000-$CFFF
        // that the PSID driver overwrote with its init shim)
        if (song.c64MemPatches) {
          for (const patch of song.c64MemPatches) {
            c64SidEngine.writeRAMBlock(patch.addr, patch.data);
          }
          console.log(`[NativeEngineRouting] Applied ${song.c64MemPatches.length} post-init RAM patch(es)`);
        }
      }

      // Connect SID output to the dub bus as a WET SEND. The send starts
      // at gain=0 (silent) — only echo throws and channel dub-send sliders
      // ramp it up. SID's dry signal stays connected to master via gainNode.
      if (c64SidEngine) {
        try {
          const { getDrumPadEngine } = await import('@hooks/drumpad/useMIDIPadRouting');
          const dpEngine = getDrumPadEngine();
          if (dpEngine) {
            const dubInput = dpEngine.getDubBusInput();
            c64SidEngine.connectDubSend(dubInput, 0.35); // always-on send so spring/echo drip
            console.log('[NativeEngineRouting] SID dub bus send connected (baseline=0.35)');
            // Enable SID mode on the dub bus so dub synths use real SID chip
            const dubBus = dpEngine.getDubBus?.();
            if (dubBus) {
              void dubBus.enableSIDMode();
              // Register the dub send gain so full-mix echo throws work
              const sendGain = c64SidEngine.getDubSendGain();
              if (sendGain) {
                dubBus.registerSidDubSend(sendGain, 0.35); // baseline matches connectDubSend above
              }
              // Register per-voice taps if available (jsSID with external AudioContext)
              const voiceOutputs = c64SidEngine.getVoiceOutputs();
              if (voiceOutputs) {
                dubBus.registerSidVoiceTaps(voiceOutputs);
                console.log('[NativeEngineRouting] Per-voice SID dub taps registered');
              }
              // Make-up boost: when the dub bus is live the SID's dry output
              // tends to sit way below the wet dub effects. Let DubBus
              // ramp the SID master up while dub is enabled and restore it
              // when disabled. Captures the engine so it survives later
              // bus enable/disable toggles.
              const sidEngineRef = c64SidEngine;
              dubBus.registerSidBoostHandler((boost) => {
                try { sidEngineRef.setDubBoost(boost); } catch { /* ok */ }
              });
            }
          }
        } catch (e) {
          console.warn('[NativeEngineRouting] SID dub bus send skipped:', e);
        }
      }
    } catch (err) {
      console.error('[NativeEngineRouting] Failed to start C64SIDEngine:', err);
    }
  }

  // --- CheeseCutter — 6502 CPU + reSID WASM engine (flat RAM, no PSID) ---
  if (song.cheeseCutterFileData) {
    suppressNotes = true;
    try {
      const { CheeseCutterEngine } = await import('../cheesecut/CheeseCutterEngine');
      const cc = CheeseCutterEngine.getInstance();
      await cc.init();
      await cc.ready();

      const synthBusNode = getNativeAudioNode(toneEngine.synthBus as any);
      if (synthBusNode) cc.connectTo(synthBusNode);
      else if (cc.output) cc.output.connect(Tone.getContext().rawContext as AudioContext as unknown as AudioNode);
      registerWholeMixDubSend('native:CheeseCutterSynth', cc.output);

      // Read multiplier from store data
      const { useCheeseCutterStore } = await import('@stores/useCheeseCutterStore');
      const ccState = useCheeseCutterStore.getState();
      const mult = ccState.speedMultiplier || 1;

      await cc.loadAndPlay(song.cheeseCutterFileData, 0, mult);

      // Enable ASID/WebUSB hardware output if setting is on
      const { useSettingsStore } = await import('@stores/useSettingsStore');
      if (useSettingsStore.getState().sidHardwareMode !== 'off') {
        const { getSIDHardwareManager } = await import('@/lib/sid/SIDHardwareManager');
        const mgr = getSIDHardwareManager();
        cc.enableAsid((diffs) => {
          for (let i = 0; i < diffs.length; i += 2) {
            mgr.writeRegister(0, diffs[i], diffs[i + 1]);
          }
        });
      }

      console.log('[NativeEngineRouting] CheeseCutterEngine loaded & playing, multiplier:', mult);
    } catch (err) {
      console.error('[NativeEngineRouting] Failed to start CheeseCutterEngine:', err);
    }
  }

  // --- Symphonie Pro — parse file data and load directly into WASM engine ---
  if (song.symphonieFileData) {
    suppressNotes = true;
    try {
      const { SymphonieEngine } = await import('../symphonie/SymphonieEngine');
      const { parseSymphonieForPlayback } = await import('@/lib/import/formats/SymphonieProParser');
      const { getDevilboxAudioContext } = await import('@/utils/audio-context');

      const symphEngine = SymphonieEngine.getInstance();
      const ctx = getDevilboxAudioContext();

      // Parse the raw file data into playback format
      console.log('[NativeEngineRouting] Symphonie: parsing file data...');
      const playbackData = await parseSymphonieForPlayback(
        song.symphonieFileData,
        song.name || 'unknown.symmod'
      );
      console.log('[NativeEngineRouting] Symphonie: parsed OK —',
        playbackData.instruments.length, 'instruments,',
        playbackData.patterns.length, 'patterns,',
        playbackData.orderList.length, 'orders,',
        playbackData.numChannels, 'channels');

      // Load song into WASM engine (creates worklet + sends data)
      await symphEngine.loadSong(ctx, playbackData);
      const node = symphEngine.getNode();
      console.log('[NativeEngineRouting] Symphonie: loadSong complete, node=', !!node);

      // Connect worklet node to audio output
      if (node) {
        if (!isDJDeck) {
          const nativeInput = getNativeAudioNode(separationInputTone as any);
          if (nativeInput) {
            node.connect(nativeInput);
            routedNativeEngines.add('SymphonieSynth');
            registerWholeMixDubSend('native:SymphonieSynth', node);
            console.log('[NativeEngineRouting] Symphonie output → stereo separation');
          } else {
            node.connect(ctx.destination);
            routedNativeEngines.add('SymphonieSynth');
            registerWholeMixDubSend('native:SymphonieSynth', node);
            console.log('[NativeEngineRouting] Symphonie output → destination (fallback)');
          }
        } else {
          node.connect(ctx.destination);
          routedNativeEngines.add('SymphonieSynth');
        }
      }

      if (!muted) {
        symphEngine.play();
        console.log('[NativeEngineRouting] SymphonieEngine playing');
      }
    } catch (err) {
      console.error('[NativeEngineRouting] Failed to start SymphonieEngine:', err);
    }
  }

  // --- SunVox song mode ---
  // SunVoxSynth (old black-box player): start sequencer, suppress notes
  // SunVoxModular (new modular editor): start sequencer for audio, but let replayer drive notes
  if (!muted) {
    // Old SunVoxSynth: keep original behavior (suppress notes, internal sequencer)
    const svSynthInsts = song.instruments.filter(
      i => i.synthType === 'SunVoxSynth' && i.sunvox?.isSong === true,
    );
    if (svSynthInsts.length > 0) {
      suppressNotes = true;
      for (const inst of svSynthInsts) {
        try {
          const svSynth = toneEngine.getInstrument(inst.id, inst);
          if (svSynth && 'triggerAttack' in svSynth) {
            (svSynth as import('@/types/synth').DevilboxSynth).triggerAttack?.(60);
          }
        } catch { /* ignored */ }
      }
    }

    // SunVoxModular: start the internal sequencer and suppress tracker note events.
    // The SunVox WASM sequencer drives all module playback internally — tracker note
    // events would conflict (noteOff from tracker silences notes started by sequencer).
    const svModularInsts = song.instruments.filter(
      i => i.synthType === 'SunVoxModular' && i.sunvox?.isSong === true,
    );
    if (svModularInsts.length > 0) {
      suppressNotes = true;
      // Only connect the FIRST instrument to the audio graph — all SunVoxModular
      // song-mode instances share the same WASM output GainNode. Connecting all N
      // would sum the same signal N times, causing clipping.
      toneEngine.getInstrument(svModularInsts[0].id, svModularInsts[0]);
      // Start sequencer on first instance (all share the same WASM handle)
      // Wait up to 10s for the shared song handle to load before starting playback.
      try {
        const firstSynth = toneEngine.getInstrument(svModularInsts[0].id, svModularInsts[0]);
        if (firstSynth && 'startSequencer' in firstSynth) {
          const synth = firstSynth as import('@/engine/sunvox-modular/SunVoxModularSynth').SunVoxModularSynth;
          await Promise.race([
            synth.startSequencer(),
            new Promise<void>(resolve => setTimeout(resolve, 10000)),
          ]);
          console.log('[NativeEngineRouting] SunVox modular sequencer started');
        }
      } catch { /* ignored */ }
    }
  }

  // --- Route native engine outputs through the stereo separation chain ---
  // In DJ mode, DeckEngine.loadSong() handles routing.
  if (!isDJDeck) {
    for (const inst of song.instruments) {
      if (ROUTABLE_SYNTH_TYPES.has(inst.synthType) && !routedNativeEngines.has(inst.synthType)) {
        const nativeInput = getNativeAudioNode(separationInputTone as any);
        if (nativeInput) {
          toneEngine.rerouteNativeEngine(inst.synthType, nativeInput);
          routedNativeEngines.add(inst.synthType);
          if (inst.synthType === 'SunVoxSynth' || inst.synthType === 'SunVoxModular') {
            registerWholeMixDubSend(`native:${inst.synthType}`, toneEngine.getNativeEngineOutput(inst.synthType));
          }
        }
      }
    }
  }

  return { suppressNotes, c64SidEngine, sf2Engine, hivelyEngine, uadeEngine, musicLineEngine };
}

// ---------------------------------------------------------------------------
// Promise that resolves when all async engine stops from the last stopNativeEngines() complete.
// startNativeEngines() awaits this to prevent race conditions during rapid song switching.
let _pendingStopPromise: Promise<void> = Promise.resolve();

// Stop native engines (called from TrackerReplayer.stop())
// ---------------------------------------------------------------------------

export function stopNativeEngines(
  song: TrackerSong | null,
  routedNativeEngines: Set<string>,
  c64SidEngine: C64SIDEngine | null,
): C64SIDEngine | null {
  // The next song's engine reports its own isolation capability.
  try { getActiveDubBus()?.setEngineIsolation(null); } catch { /* ok */ }
  setPlayingIsolationEngine(null);
  // Save running keys before clearing (needed for async engine stop below)
  const wasRunning = new Set(_runningEngineKeys);
  // Clear the running engine guard so next play() can start fresh
  _runningEngineKeys.clear();


  // Clear WASM position tracking (synchronous — async import caused race with startNativeEngines)
  useWasmPositionStore.getState().clear();

  // Stop silence detectors
  for (const [, detector] of activeSilenceDetectors) {
    detector.dispose();
  }
  activeSilenceDetectors.clear();

  // Stop routed native engines via ToneEngine
  if (routedNativeEngines.size > 0) {
    const toneEngine = getToneEngine();
    for (const st of routedNativeEngines) {
      try { toneEngine.stopNativeEngine(st); } catch { /* ignored */ }
      unregisterWholeMixDubSend(`native:${st}`);
    }
  }

  // Collect async stop promises so startNativeEngines can await them
  const asyncStops: Promise<void>[] = [];

  // Stop ALL WASM engines that were running — not just ones matching the current song.
  // The current song may have already been replaced by a new load, so shouldActivate()
  // would miss the previous engine. Use wasRunning to stop everything that was started.
  for (const desc of WASM_ENGINES) {
    // Try synchronous stop first (fast path)
    const ref = tryResolveSync(desc);
    if (ref) {
        try {
          if (ref.hasInstance()) {
            const inst = ref.getInstance();
            inst.stop();
            unregisterWholeMixDubSend(`native:${desc.synthType}`);
            // Immediately mute the output gain to prevent audio leaking while
            // the async stop message is processed by the worklet thread.
            const output = (inst as unknown as { output?: { gain?: AudioParam } }).output;
          if (output?.gain) {
            try { output.gain.setValueAtTime(0, 0); } catch { /* best effort */ }
          }
        }
      } catch { /* ignored */ }
    }
    // If not synchronously resolvable but was started this session, stop via
    // cached dynamic resolver. This handles TFMXModule and other dynamicResolver engines.
    if (!ref && desc.dynamicResolver && wasRunning.has(desc.key)) {
      asyncStops.push(desc.dynamicResolver().then(cls => {
        try {
          if (cls.hasInstance()) cls.getInstance().stop();
          unregisterWholeMixDubSend(`native:${desc.synthType}`);
        } catch { /* ignored */ }
      }).catch(() => {}));
    }
  }

  // Force-stop UADEEngine regardless of song state — generic UADE files
  // (unrecognized extensions) activate UADEEngine but aren't tracked in WASM_ENGINES.
  asyncStops.push(import('../uade/UADEEngine').then(({ UADEEngine: UE }) => {
    if (UE.hasInstance()) {
      const inst = UE.getInstance();
      inst.stop();
      try { inst.output.gain.setValueAtTime(0, 0); } catch { /* best effort */ }
    }
  }).catch(() => {}));

  // Force-stop LibopenmptEngine — not in WASM_ENGINES but manages its own worklet
  asyncStops.push(import('../libopenmpt/LibopenmptEngine').then(({ LibopenmptEngine: LE }) => {
    if (LE.hasInstance()) {
      LE.getInstance().stop();
    }
  }).catch(() => {}));

  // Stop SymphonieEngine if active
  if (song?.symphonieFileData) {
    asyncStops.push(import('../symphonie/SymphonieEngine').then(({ SymphonieEngine }) => {
      if (SymphonieEngine.hasInstance()) {
        const engine = SymphonieEngine.getInstance();
        engine.stop();
        unregisterWholeMixDubSend('native:SymphonieSynth');
        const node = engine.getNode();
        if (node) { try { node.disconnect(); } catch { /* ignored */ } }
      }
    }).catch(() => {}));
  }

  // Stop SunVox song-mode instances
  if (song) {
    const toneEngine = getToneEngine();
    const sunvoxSongInsts = song.instruments.filter(
      i => (i.synthType === 'SunVoxSynth' || i.synthType === 'SunVoxModular') && i.sunvox?.isSong === true,
    );
    for (const inst of sunvoxSongInsts) {
      try {
        const svSynth = toneEngine.getInstrument(inst.id, inst);
        if (svSynth && 'stopSequencer' in svSynth) {
          (svSynth as import('@/engine/sunvox-modular/SunVoxModularSynth').SunVoxModularSynth).stopSequencer();
        } else if (svSynth && 'triggerRelease' in svSynth) {
          (svSynth as import('@/types/synth').DevilboxSynth).triggerRelease?.();
        }
      } catch { /* ignored */ }
    }
    // NOTE: Do NOT call resetSharedSunVoxHandle() here — stopNativeEngines() runs
    // on every stop/play cycle, not just when loading a new song. Destroying the
    // handle here makes the song unplayable on resume. The worklet's loadSong
    // handler already stops playback and clears stale state before loading new data.
  }

  // Stop CheeseCutterEngine if active (singleton — always check, song may already be null)
  asyncStops.push(import('../cheesecut/CheeseCutterEngine').then(({ CheeseCutterEngine }) => {
    if (CheeseCutterEngine.hasInstance()) {
      const engine = CheeseCutterEngine.getInstance();
      engine.stop();
      unregisterWholeMixDubSend('native:CheeseCutterSynth');
      const node = engine.output;
      if (node) { try { node.disconnect(); } catch { /* ignored */ } }
    }
  }).catch(() => {}));

  // Store pending stop promise so startNativeEngines() can await it
  _pendingStopPromise = Promise.allSettled(asyncStops).then(() => {});

  // Stop C64SIDEngine (instance-based)
  if (c64SidEngine) {
    try {
      c64SidEngine.stop();
      c64SidEngine.dispose();
      // Disable SID mode on the dub bus when SID engine stops
      try {
        import('@hooks/drumpad/useMIDIPadRouting').then(({ getDrumPadEngine }) => {
          const dpEngine = getDrumPadEngine();
          dpEngine?.getDubBus?.()?.disableSIDMode();
        }).catch(() => {});
      } catch { /* ok */ }
    } catch (err) {
      console.warn('[NativeEngineRouting] Error stopping C64SIDEngine:', err);
    }
    _activeC64SidEngine = null;
    return null;
  }

  return c64SidEngine;
}

// ---------------------------------------------------------------------------
// Pause native engines (called from TrackerReplayer.pause())
// ---------------------------------------------------------------------------

export function pauseNativeEngines(routedNativeEngines: Set<string>): void {
  if (routedNativeEngines.size === 0) return;
  const toneEngine = getToneEngine();

  for (const st of routedNativeEngines) {
    const desc = WASM_ENGINES.find(e => e.synthType === st);
    if (!desc) {
      // Not a registered WASM engine (e.g., UADESynth) - use generic stop
      try { toneEngine.stopNativeEngine(st); } catch { /* ignored */ }
      continue;
    }

    if (desc.supportsPause) {
      const ref = tryResolveSync(desc);
      if (ref) {
        try { if (ref.hasInstance()) ref.getInstance().pause(); } catch { /* ignored */ }
      } else {
        resolveEngine(desc).then(cls => {
          if (cls.hasInstance()) cls.getInstance().pause();
        }).catch(() => {});
      }
    } else {
      try { toneEngine.stopNativeEngine(st); } catch { /* ignored */ }
    }
  }
}

// ---------------------------------------------------------------------------
// Resume native engines (called from TrackerReplayer.resume())
// ---------------------------------------------------------------------------

export function resumeNativeEngines(
  routedNativeEngines: Set<string>,
  muted: boolean,
): void {
  if (muted) return;

  for (const desc of WASM_ENGINES) {
    if (!desc.supportsResume) continue;
    if (!routedNativeEngines.has(desc.synthType)) continue;

    const ref = tryResolveSync(desc);
    if (ref) {
      try {
        if (ref.hasInstance()) {
          const inst = ref.getInstance();
          // Restore gain muted by stopNativeEngines
          const output = (inst as unknown as { output?: { gain?: AudioParam } }).output;
          if (output?.gain) {
            try { output.gain.setValueAtTime(1, 0); } catch { /* best effort */ }
          }
          inst.play();
        }
      } catch { /* ignored */ }
    } else {
      resolveEngine(desc).then(cls => {
        if (cls.hasInstance()) {
          const inst = cls.getInstance();
          const output = (inst as unknown as { output?: { gain?: AudioParam } }).output;
          if (output?.gain) {
            try { output.gain.setValueAtTime(1, 0); } catch { /* best effort */ }
          }
          inst.play();
        }
      }).catch(() => {});
    }
  }
}

// ---------------------------------------------------------------------------
// Restore native engine routing (called from loadSong/dispose)
// ---------------------------------------------------------------------------

export function restoreNativeRouting(routedNativeEngines: Set<string>): void {
  if (routedNativeEngines.size > 0) {
    const toneEngine = getToneEngine();
    for (const key of routedNativeEngines) {
      toneEngine.restoreNativeEngineRouting(key);
    }
    routedNativeEngines.clear();
  }
}

// ---------------------------------------------------------------------------
// Pre-initialize MusicLine WASM (called from loadSong)
// ---------------------------------------------------------------------------

export function preInitMusicLine(musiclineFileData: Uint8Array): void {
  void (async () => {
    try {
      const mlEngine = MusicLineEngine.getInstance();
      await mlEngine.ready();
      await mlEngine.loadSong(musiclineFileData.slice(0));
    } catch (err) {
      console.warn('[NativeEngineRouting] ML WASM pre-init failed:', err);
    }
  })();
}
