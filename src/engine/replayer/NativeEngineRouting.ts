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

import * as Tone from 'tone';
import type { TrackerSong } from '../TrackerReplayer';
import { getToneEngine } from '../ToneEngine';
import { getNativeAudioNode } from '@utils/audio-context';
import { HivelyEngine } from '../hively/HivelyEngine';
import { MusicLineEngine } from '../musicline/MusicLineEngine';
import { C64SIDEngine } from '../C64SIDEngine';

export { C64SIDEngine };

// ---------------------------------------------------------------------------
// Engine registry types
// ---------------------------------------------------------------------------

/** Minimal interface shared by all singleton WASM engines */
interface WASMSingletonEngine {
  ready(): Promise<void>;
  loadTune?(data: ArrayBuffer | Uint8Array, ...args: any[]): Promise<void>;
  loadSong?(data: ArrayBuffer | Uint8Array): Promise<any>;
  play(): void;
  stop(): void;
  pause(): void;
  output: GainNode;
}

interface WASMSingletonStatic {
  getInstance(): WASMSingletonEngine;
  hasInstance(): boolean;
}

/** Descriptor for a singleton WASM engine in the registry */
interface NativeEngineDescriptor {
  /** Unique key for logging */
  key: string;
  /** SynthType name used for audio routing */
  synthType: string;
  /** Whether to suppress TrackerReplayer note triggers */
  suppressNotes: boolean;
  /** Which song field holds the raw file data */
  fileDataKey: keyof TrackerSong;
  /** Format(s) this engine handles (null = activate whenever fileData exists) */
  formats: string[] | null;
  /** Load method name on the engine instance */
  loadMethod: 'loadTune' | 'loadSong';
  /** Extra args to pass after file data (e.g., stereoMode for Hively) */
  getLoadArgs?: (song: TrackerSong) => any[];
  /** Whether this engine supports true pause (vs stop on pause) */
  supportsPause: boolean;
  /** Whether this engine supports true resume via play() after pause */
  supportsResume: boolean;
  /** Whether the engine needs explicit routing (no instrument in song.instruments) */
  needsDirectRouting: boolean;
  /** Static ref for statically-imported engines (null = use dynamic import) */
  staticRef: WASMSingletonStatic | null;
  /** Dynamic import path (used when staticRef is null) */
  dynamicImport?: string;
  /** Export name from dynamic import */
  dynamicExportName?: string;
  /** Optional post-start hook for engine-specific setup (e.g., Klys onSongData) */
  onStarted?: (instance: WASMSingletonEngine, song: TrackerSong) => void;
}

// ---------------------------------------------------------------------------
// Engine registry - add new WASM engines here
// ---------------------------------------------------------------------------

const WASM_ENGINES: NativeEngineDescriptor[] = [
  {
    key: 'Hively',
    synthType: 'HivelySynth',
    suppressNotes: false,
    fileDataKey: 'hivelyFileData',
    formats: ['HVL', 'AHX'],
    loadMethod: 'loadTune',
    getLoadArgs: (song) => [song.hivelyMeta?.stereoMode ?? 2],
    supportsPause: true,
    supportsResume: true,
    needsDirectRouting: false,
    staticRef: HivelyEngine as unknown as WASMSingletonStatic,
  },
  {
    key: 'Klystrack',
    synthType: 'KlysSynth',
    suppressNotes: true,
    fileDataKey: 'klysFileData',
    formats: ['KT'],
    loadMethod: 'loadSong',
    supportsPause: true,
    supportsResume: true,
    needsDirectRouting: false,
    staticRef: null,
    dynamicImport: '@/engine/klystrack/KlysEngine',
    dynamicExportName: 'KlysEngine',
    onStarted: (instance, _song) => {
      // Listen for extracted song data from WASM and update store
      const klys = instance as any;
      if (typeof klys.onSongData === 'function') {
        klys.onSongData((songData: any) => {
          import('@stores').then(({ useFormatStore }) => {
            const state = useFormatStore.getState();
            if (state.klysNative) {
              useFormatStore.setState({
                klysNative: {
                  ...state.klysNative,
                  patterns: songData.patterns,
                  sequences: songData.sequences,
                  instruments: songData.instruments.filter((i: any): i is NonNullable<typeof i> => i !== null),
                },
              });
              console.log('[NativeEngineRouting] KlysEngine song data extracted:',
                songData.patterns.length, 'patterns,',
                songData.sequences.length, 'sequences,',
                songData.instruments.length, 'instruments');
            }
          });
        });
      }
    },
  },
  {
    key: 'JamCracker',
    synthType: 'JamCrackerSynth',
    suppressNotes: true,
    fileDataKey: 'jamCrackerFileData',
    formats: ['JamCracker'],
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: false,
    staticRef: null,
    dynamicImport: '@/engine/jamcracker/JamCrackerEngine',
    dynamicExportName: 'JamCrackerEngine',
  },
  {
    key: 'FuturePlayer',
    synthType: 'FuturePlayerSynth',
    suppressNotes: true,
    fileDataKey: 'futurePlayerFileData',
    formats: ['FuturePlayer'],
    loadMethod: 'loadTune',
    supportsPause: true,
    supportsResume: true,
    needsDirectRouting: false,
    staticRef: null,
    dynamicImport: '@/engine/futureplayer/FuturePlayerEngine',
    dynamicExportName: 'FuturePlayerEngine',
  },
  {
    key: 'MusicLine',
    synthType: 'MusicLineSynth',
    suppressNotes: true,
    fileDataKey: 'musiclineFileData',
    formats: null, // activate whenever musiclineFileData exists
    loadMethod: 'loadSong',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: MusicLineEngine as unknown as WASMSingletonStatic,
  },
];

/** Synth types routed through the stereo separation chain */
const ROUTABLE_SYNTH_TYPES = new Set(
  ['UADESynth', ...WASM_ENGINES.map(e => e.synthType)]
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveEngine(desc: NativeEngineDescriptor): Promise<WASMSingletonStatic> {
  if (desc.staticRef) return desc.staticRef;
  const mod = await import(/* @vite-ignore */ desc.dynamicImport!);
  return mod[desc.dynamicExportName!] as WASMSingletonStatic;
}

function tryResolveSync(desc: NativeEngineDescriptor): WASMSingletonStatic | null {
  return desc.staticRef ?? null;
}

function shouldActivate(desc: NativeEngineDescriptor, song: TrackerSong): boolean {
  const fileData = song[desc.fileDataKey];
  if (!fileData) return false;
  if (desc.formats === null) return true;
  return desc.formats.includes(song.format);
}

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

/** Result of starting native engines - caller applies to its own state */
export interface NativeEngineStartResult {
  suppressNotes: boolean;
  c64SidEngine: C64SIDEngine | null;
}

// ---------------------------------------------------------------------------
// Start native engines (called from TrackerReplayer.play())
// ---------------------------------------------------------------------------

export async function startNativeEngines(
  song: TrackerSong,
  separationInputTone: Tone.ToneAudioNode,
  isDJDeck: boolean,
  muted: boolean,
  routedNativeEngines: Set<string>,
): Promise<NativeEngineStartResult> {
  const toneEngine = getToneEngine();
  let suppressNotes = false;
  let c64SidEngine: C64SIDEngine | null = null;

  // --- Singleton WASM engines (registry-driven) ---
  for (const desc of WASM_ENGINES) {
    if (!shouldActivate(desc, song)) continue;

    if (desc.suppressNotes) suppressNotes = true;

    try {
      const EngineClass = await resolveEngine(desc);
      const instance = EngineClass.getInstance();
      await instance.ready();

      // Load file data
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

      if (!muted) {
        instance.play();
        console.log(`[NativeEngineRouting] ${desc.key} loaded & playing`);

        // Direct routing for engines without a synth in song.instruments
        if (desc.needsDirectRouting && !isDJDeck && !routedNativeEngines.has(desc.synthType)) {
          toneEngine.routeNativeEngineOutput({ name: desc.synthType, output: instance.output } as any);
          const nativeInput = getNativeAudioNode(separationInputTone as any);
          if (nativeInput) {
            toneEngine.rerouteNativeEngine(desc.synthType, nativeInput);
            routedNativeEngines.add(desc.synthType);
          }
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
    try {
      const audioContext = Tone.getContext().rawContext as AudioContext;
      const synthBusNode = getNativeAudioNode(toneEngine.synthBus as any);

      c64SidEngine = new C64SIDEngine(song.c64SidFileData);
      await c64SidEngine.init(audioContext, synthBusNode ?? undefined);

      const { useTransportStore } = await import('@stores/useTransportStore');
      const globalPitch = useTransportStore.getState().globalPitch ?? 0;
      if (globalPitch !== 0) {
        c64SidEngine.setPlaybackRate(Math.pow(2, globalPitch / 12));
      }

      if (!muted) {
        await c64SidEngine.play();
        console.log('[NativeEngineRouting] C64SIDEngine loaded & playing');
      } else {
        console.log('[NativeEngineRouting] C64SIDEngine loaded but skipping play (muted)');
      }
    } catch (err) {
      console.error('[NativeEngineRouting] Failed to start C64SIDEngine:', err);
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
        }
      }
    }
  }

  return { suppressNotes, c64SidEngine };
}

// ---------------------------------------------------------------------------
// Stop native engines (called from TrackerReplayer.stop())
// ---------------------------------------------------------------------------

export function stopNativeEngines(
  song: TrackerSong | null,
  routedNativeEngines: Set<string>,
  c64SidEngine: C64SIDEngine | null,
): C64SIDEngine | null {
  // Stop routed native engines via ToneEngine
  if (routedNativeEngines.size > 0) {
    const toneEngine = getToneEngine();
    for (const st of routedNativeEngines) {
      try { toneEngine.stopNativeEngine(st); } catch { /* ignored */ }
    }
  }

  // Stop each registered WASM engine if active
  if (song) {
    for (const desc of WASM_ENGINES) {
      if (!shouldActivate(desc, song)) continue;
      const ref = tryResolveSync(desc);
      if (ref) {
        try { if (ref.hasInstance()) ref.getInstance().stop(); } catch { /* ignored */ }
      } else {
        // Dynamic import - fire and forget
        resolveEngine(desc).then(cls => {
          if (cls.hasInstance()) cls.getInstance().stop();
        }).catch(() => {});
      }
    }
  }

  // Stop C64SIDEngine (instance-based)
  if (c64SidEngine) {
    try {
      c64SidEngine.stop();
      c64SidEngine.dispose();
    } catch (err) {
      console.warn('[NativeEngineRouting] Error stopping C64SIDEngine:', err);
    }
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
      try { if (ref.hasInstance()) ref.getInstance().play(); } catch { /* ignored */ }
    } else {
      resolveEngine(desc).then(cls => {
        if (cls.hasInstance()) cls.getInstance().play();
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
