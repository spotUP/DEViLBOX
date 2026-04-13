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
import type { TrackerSong, TrackerFormat } from '../TrackerReplayer';
import { getToneEngine } from '../ToneEngine';
import { getNativeAudioNode } from '@utils/audio-context';
import { HivelyEngine } from '../hively/HivelyEngine';
import type { UADEEngine } from '../uade/UADEEngine';
import { MusicLineEngine } from '../musicline/MusicLineEngine';
import { C64SIDEngine } from '../C64SIDEngine';
import { SF2Engine } from '../sf2/SF2Engine';
import { SilenceDetector } from './SilenceDetector';
import { useWasmPositionStore } from '../../stores/useWasmPositionStore';
import { JamCrackerEngine } from '../jamcracker/JamCrackerEngine';

export { C64SIDEngine };
export { SF2Engine };

/** Active silence detectors keyed by engine synthType */
const activeSilenceDetectors = new Map<string, SilenceDetector>();

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
  /** Dynamic import path (used when staticRef is null) — DEPRECATED, use dynamicResolver */
  dynamicImport?: string;
  /** Export name from dynamic import — DEPRECATED, use dynamicResolver */
  dynamicExportName?: string;
  /** Dynamic resolver function (preferred over dynamicImport for Vite compatibility) */
  dynamicResolver?: () => Promise<WASMSingletonStatic>;
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
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/klystrack/KlysEngine')).KlysEngine as unknown as WASMSingletonStatic,
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
    needsDirectRouting: true,
    staticRef: JamCrackerEngine as unknown as WASMSingletonStatic,
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
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/futureplayer/FuturePlayerEngine')).FuturePlayerEngine as unknown as WASMSingletonStatic,
  },
  {
    key: 'PreTracker',
    synthType: 'PreTrackerSynth',
    suppressNotes: true,
    fileDataKey: 'preTrackerFileData',
    formats: ['PreTracker'],
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/pretracker/PreTrackerEngine')).PreTrackerEngine as unknown as WASMSingletonStatic,
  },
  {
    key: 'MusicAssembler',
    synthType: 'MusicAssemblerSynth',
    suppressNotes: true,
    fileDataKey: 'maFileData',
    formats: null,  // activate whenever maFileData exists
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/ma/MaEngine')).MaEngine as unknown as WASMSingletonStatic,
  },
  {
    key: 'BenDaglish',
    synthType: 'BenDaglishSynth',
    suppressNotes: true,
    fileDataKey: 'bdFileData',
    formats: null,  // activate whenever bdFileData exists
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/bd/BdEngine')).BdEngine as unknown as WASMSingletonStatic,
  },
  {
    key: 'Hippel',
    synthType: 'HippelSynth',
    suppressNotes: true,
    fileDataKey: 'hippelFileData',
    formats: null, // activate whenever hippelFileData exists (handles ST, 7V, CoSo, FC, MCMD)
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/hippel/HippelEngine')).HippelEngine as unknown as WASMSingletonStatic,
  },
  {
    key: 'Sonix',
    synthType: 'SonixSynth',
    suppressNotes: true,
    fileDataKey: 'sonixFileData',
    formats: ['Sonix'],
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/sonix/SonixEngine')).SonixEngine as unknown as WASMSingletonStatic,
  },
  {
    key: 'Pxtone',
    synthType: 'PxtoneSynth',
    suppressNotes: true,
    fileDataKey: 'pxtoneFileData',
    formats: ['PxTone'],
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/pxtone/PxtoneEngine')).PxtoneEngine as unknown as WASMSingletonStatic,
  },
  {
    key: 'Organya',
    synthType: 'OrganyaSynth',
    suppressNotes: true,
    fileDataKey: 'organyaFileData',
    formats: ['Organya'],
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/organya/OrganyaEngine')).OrganyaEngine as unknown as WASMSingletonStatic,
  },
  {
    key: 'Sawteeth',
    synthType: 'SawteethSynth',
    suppressNotes: true,
    fileDataKey: 'sawteethFileData',
    formats: ['SAW'],
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/sawteeth/SawteethEngine')).SawteethEngine as unknown as WASMSingletonStatic,
  },
  {
    key: 'Eupmini',
    synthType: 'EupminiSynth',
    suppressNotes: true,
    fileDataKey: 'eupFileData',
    formats: ['EUP'],
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/eupmini/EupminiEngine')).EupminiEngine as unknown as WASMSingletonStatic,
  },
  {
    key: 'Ixalance',
    synthType: 'IxalanceSynth',
    suppressNotes: true,
    fileDataKey: 'ixsFileData',
    formats: ['IXS'],
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/ixalance/IxalanceEngine')).IxalanceEngine as unknown as WASMSingletonStatic,
  },
  {
    key: 'Cpsycle',
    synthType: 'CpsycleSynth',
    suppressNotes: true,
    fileDataKey: 'psycleFileData',
    formats: ['Psycle'],
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/cpsycle/CpsycleEngine')).CpsycleEngine as unknown as WASMSingletonStatic,
  },
  {
    key: 'Sc68',
    synthType: 'Sc68Synth',
    suppressNotes: true,
    fileDataKey: 'sc68FileData',
    formats: null,
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/sc68/Sc68Engine')).Sc68Engine as unknown as WASMSingletonStatic,
  },
  {
    key: 'Qsf',
    synthType: 'QsfSynth',
    suppressNotes: true,
    fileDataKey: 'qsfFileData',
    formats: null,
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/qsf/QsfEngine')).QsfEngine as unknown as WASMSingletonStatic,
  },
  {
    key: 'Zxtune',
    synthType: 'ZxtuneSynth',
    suppressNotes: true,
    fileDataKey: 'zxtuneFileData',
    formats: ['ZXTune'],
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/zxtune/ZxtuneEngine')).ZxtuneEngine as unknown as WASMSingletonStatic,
  },
  {
    key: 'PumaTracker',
    synthType: 'PumaTrackerSynth',
    suppressNotes: true,
    fileDataKey: 'pumaTrackerFileData',
    formats: ['PumaTracker'],
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/pumatracker/PumaTrackerEngine')).PumaTrackerEngine as unknown as WASMSingletonStatic,
  },
  {
    key: 'FredEditorReplayer',
    synthType: 'FredEditorReplayerSynth',
    suppressNotes: true,
    fileDataKey: 'fredEditorWasmFileData',
    formats: null,  // activate whenever fredEditorWasmFileData exists
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/fred/FredEditorReplayerEngine')).FredEditorReplayerEngine as unknown as WASMSingletonStatic,
  },
  {
    key: 'SteveTurner',
    synthType: 'SteveTurnerSynth',
    suppressNotes: true,
    fileDataKey: 'steveTurnerFileData',
    formats: null, // activate whenever steveTurnerFileData exists
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/steveturner/SteveTurnerEngine')).SteveTurnerEngine as unknown as WASMSingletonStatic,
  },
  {
    key: 'SidMon1Replayer',
    synthType: 'SidMon1Synth',
    suppressNotes: true,
    fileDataKey: 'sidmon1WasmFileData',
    formats: null, // activate whenever sidmon1WasmFileData exists
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/sidmon1/SidMon1ReplayerEngine')).SidMon1ReplayerEngine as unknown as WASMSingletonStatic,
  },
  {
    key: 'ArtOfNoise',
    synthType: 'ArtOfNoiseSynth',
    suppressNotes: true,
    fileDataKey: 'artOfNoiseFileData',
    formats: ['AON'],
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/artofnoise/ArtOfNoiseEngine')).ArtOfNoiseEngine as unknown as WASMSingletonStatic,
  },
  {
    key: 'Pmdmini',
    synthType: 'PmdminiSynth',
    suppressNotes: true,
    fileDataKey: 'pmdFileData',
    formats: ['PMD'],
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/pmdmini/PmdminiEngine')).PmdminiEngine as unknown as WASMSingletonStatic,
  },
  {
    key: 'Fmplayer',
    synthType: 'FmplayerSynth',
    suppressNotes: true,
    fileDataKey: 'fmplayerFileData',
    formats: ['FMP'],
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/fmplayer/FmplayerEngine')).FmplayerEngine as unknown as WASMSingletonStatic,
  },
  {
    key: 'SidMon2',
    synthType: 'SidMon2Synth',
    suppressNotes: true,
    fileDataKey: 'sd2FileData',
    formats: null,  // activate whenever sd2FileData exists
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/sidmon2/Sd2Engine')).Sd2Engine as unknown as WASMSingletonStatic,
  },
  {
    key: 'Mdxmini',
    synthType: 'MdxminiSynth',
    suppressNotes: true,
    fileDataKey: 'mdxminiFileData',
    formats: ['MDX' as TrackerFormat],
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/mdxmini/MdxminiEngine')).MdxminiEngine as unknown as WASMSingletonStatic,
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
  {
    key: 'TFMXModule',
    synthType: 'TFMXModuleSynth',
    suppressNotes: true,
    fileDataKey: 'tfmxFileData',
    formats: ['TFMX' as TrackerFormat],
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/tfmx/TFMXEngine')).TFMXEngine as unknown as WASMSingletonStatic,
    getLoadArgs: (song: TrackerSong) => [song.tfmxSmplData],
  },
  {
    key: 'Asap',
    synthType: 'AsapSynth',
    suppressNotes: true,
    fileDataKey: 'asapFileData',
    formats: ['ASAP' as TrackerFormat],
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/asap/AsapEngine')).AsapEngine as unknown as WASMSingletonStatic,
    getLoadArgs: (song: TrackerSong) => [song.asapFilename || 'tune.sap'],
  },
  {
    key: 'SoundControlReplayer',
    synthType: 'SoundControlWasmSynth',
    suppressNotes: true,
    fileDataKey: 'soundControlFileData',
    formats: null,
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/soundcontrol/SoundControlEngine')).SoundControlEngine as unknown as WASMSingletonStatic,
  },
  {
    key: 'DeltaMusic1Replayer',
    synthType: 'DeltaMusic1WasmSynth',
    suppressNotes: true,
    fileDataKey: 'deltaMusic1FileData',
    formats: null,
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/deltamusic1/DeltaMusic1Engine')).DeltaMusic1Engine as unknown as WASMSingletonStatic,
  },
  {
    key: 'DeltaMusic2Replayer',
    synthType: 'DeltaMusic2WasmSynth',
    suppressNotes: true,
    fileDataKey: 'deltaMusic2FileData',
    formats: null,
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/deltamusic2/DeltaMusic2Engine')).DeltaMusic2Engine as unknown as WASMSingletonStatic,
  },
  // RobHubbard, CoreDesign, StartrekkerAM — no NostalgicPlayer C# source,
  {
    key: 'RonKlarenReplayer',
    synthType: 'RonKlarenWasmSynth',
    suppressNotes: true,
    fileDataKey: 'ronKlarenFileData',
    formats: null,
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/ronklaren/RonKlarenEngine')).RonKlarenEngine as unknown as WASMSingletonStatic,
  },
  {
    key: 'ActionamicsReplayer',
    synthType: 'ActionamicsWasmSynth',
    suppressNotes: true,
    fileDataKey: 'actionamicsFileData',
    formats: null,
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/actionamics/ActionamicsEngine')).ActionamicsEngine as unknown as WASMSingletonStatic,
  },
  {
    key: 'ActivisionProReplayer',
    synthType: 'ActivisionProWasmSynth',
    suppressNotes: true,
    fileDataKey: 'activisionProFileData',
    formats: null,
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/activisionpro/ActivisionProEngine')).ActivisionProEngine as unknown as WASMSingletonStatic,
  },
  {
    key: 'SynthesisReplayer',
    synthType: 'SynthesisWasmSynth',
    suppressNotes: true,
    fileDataKey: 'synthesisFileData',
    formats: null,
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/synthesis/SynthesisEngine')).SynthesisEngine as unknown as WASMSingletonStatic,
  },
  {
    key: 'DssReplayer',
    synthType: 'DssWasmSynth',
    suppressNotes: true,
    fileDataKey: 'dssFileData',
    formats: null,
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/dss/DssEngine')).DssEngine as unknown as WASMSingletonStatic,
  },
  {
    key: 'SoundFactory2Replayer',
    synthType: 'SoundFactory2WasmSynth',
    suppressNotes: true,
    fileDataKey: 'soundFactoryFileData',
    formats: null,
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/soundfactory/SoundFactory2Engine')).SoundFactory2Engine as unknown as WASMSingletonStatic,
  },
  {
    key: 'FaceTheMusicReplayer',
    synthType: 'FaceTheMusicWasmSynth',
    suppressNotes: true,
    fileDataKey: 'faceTheMusicFileData',
    formats: null,
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/facethemusic/FaceTheMusicEngine')).FaceTheMusicEngine as unknown as WASMSingletonStatic,
  },
  {
    key: 'FredReplayer2',
    synthType: 'FredReplayerWasmSynth2',
    suppressNotes: true,
    fileDataKey: 'fredReplayerFileData',
    formats: null,
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/fred-replayer/FredReplayerEngine')).FredReplayerEngine as unknown as WASMSingletonStatic,
  },
  {
    key: 'OktalyzerReplayer',
    synthType: 'OktalyzerWasmSynth',
    suppressNotes: true,
    fileDataKey: 'oktalyzerFileData',
    formats: null,
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/oktalyzer/OktalyzerEngine')).OktalyzerEngine as unknown as WASMSingletonStatic,
  },
  {
    key: 'InStereo1Replayer',
    synthType: 'InStereo1WasmSynth',
    suppressNotes: true,
    fileDataKey: 'inStereo1FileData',
    formats: null,
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/instereo1/InStereo1Engine')).InStereo1Engine as unknown as WASMSingletonStatic,
  },
  {
    key: 'FutureComposerReplayer',
    synthType: 'FutureComposerWasmSynth',
    suppressNotes: true,
    fileDataKey: 'futureComposerFileData',
    formats: null,
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/futurecomposer/FutureComposerEngine')).FutureComposerEngine as unknown as WASMSingletonStatic,
  },
  {
    key: 'InStereo2Replayer',
    synthType: 'InStereo2WasmSynth',
    suppressNotes: true,
    fileDataKey: 'inStereo2FileData',
    formats: null,
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/instereo2/InStereo2Engine')).InStereo2Engine as unknown as WASMSingletonStatic,
  },
  {
    key: 'QuadraComposerReplayer',
    synthType: 'QuadraComposerWasmSynth',
    suppressNotes: true,
    fileDataKey: 'quadraComposerFileData',
    formats: null,
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/quadracomposer/QuadraComposerEngine')).QuadraComposerEngine as unknown as WASMSingletonStatic,
  },
  // UADE-only. Fall through to UADE.
  {
    key: 'SoundMonReplayer',
    synthType: 'SoundMonWasmSynth',
    suppressNotes: true,
    fileDataKey: 'soundMonFileData',
    formats: null,
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/soundmon/SoundMonEngine')).SoundMonEngine as unknown as WASMSingletonStatic,
  },
  {
    key: 'DigMugReplayer',
    synthType: 'DigMugWasmSynth',
    suppressNotes: true,
    fileDataKey: 'digMugFileData',
    formats: null,
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/digmug/DigMugEngine')).DigMugEngine as unknown as WASMSingletonStatic,
  },
  {
    key: 'DavidWhittakerReplayer',
    synthType: 'DavidWhittakerWasmSynth',
    suppressNotes: true,
    fileDataKey: 'davidWhittakerFileData',
    formats: null,
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/davidwhittaker/DavidWhittakerEngine')).DavidWhittakerEngine as unknown as WASMSingletonStatic,
  },
  {
    key: 'SonicArranger',
    synthType: 'SonicArrangerWasmSynth',
    suppressNotes: true,
    fileDataKey: 'sonicArrangerFileData',
    formats: null,
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/sonic-arranger/SonicArrangerEngine')).SonicArrangerEngine as unknown as WASMSingletonStatic,
  },
  {
    key: 'UADEEditable',
    synthType: 'UADEEditableSynth',
    suppressNotes: true,
    fileDataKey: 'uadeEditableFileData',
    formats: null, // activate whenever uadeEditableFileData exists
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/uade/UADEEngine')).UADEEngine as unknown as WASMSingletonStatic,
    onStarted: (_instance, song) => {
      // After UADE loads, read pattern data from chip RAM for formats with a decoder
      const layout = song.uadePatternLayout;
      if (!layout) return;
      // Async: read patterns from chip RAM after UADE finishes unpacking
      setTimeout(async () => {
        try {
          const { UADEEngine } = await import('@/engine/uade/UADEEngine');
          if (!UADEEngine.hasInstance()) return;
          const { UADEChipEditor } = await import('@/engine/uade/UADEChipEditor');
          const editor = new UADEChipEditor(UADEEngine.getInstance());
          const { populatePatternsFromChipRAM } = await import('@/engine/uade/UADEChipRAMPatternReader');
          await populatePatternsFromChipRAM(editor, layout);
        } catch (err) {
          console.warn('[NativeEngineRouting] Chip RAM pattern read failed:', err);
        }
      }, 500);
    },
  },
  {
    key: 'V2M',
    synthType: 'V2MSynth',
    suppressNotes: true,
    fileDataKey: 'v2mFileData',
    formats: null, // activate whenever v2mFileData exists
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/v2m/V2MEngine')).V2MEngine as unknown as WASMSingletonStatic,
  },
];

/** Synth types routed through the stereo separation chain */
const ROUTABLE_SYNTH_TYPES = new Set(
  ['UADESynth', 'SunVoxSynth', 'SunVoxModular', ...WASM_ENGINES.map(e => e.synthType)]
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveEngine(desc: NativeEngineDescriptor): Promise<WASMSingletonStatic> {
  if (desc.staticRef) return desc.staticRef;
  if (desc.dynamicResolver) return desc.dynamicResolver();
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

/** Clear running engine tracking (call on stop/dispose) */
export function clearRunningEngineKeys(): void {
  _runningEngineKeys.clear();
}

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
      continue;
    }

    // Skip wildcard engines (formats: null) when a format-specific engine
    // already handles this song — prevents dual audio (e.g. Hively + UADE).
    if (desc.formats === null && startedEngineKeys.size > 0) continue;

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

        // Capture HivelyEngine for position sync in TrackerReplayer
        if (desc.key === 'Hively') {
          hivelyEngine = instance as unknown as HivelyEngine;
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

          // Also drive FormatPlaybackState so TFMX format-mode rendering scrolls
          const { setFormatPlaybackRow, setFormatPlaybackPlaying } = await import('@/engine/FormatPlaybackState');
          setFormatPlaybackPlaying(true);

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
              useWasmPositionStore.getState().setPosition(row, position);
              setFormatPlaybackRow(row);
            }
          });
          console.log(`[NativeEngineRouting] TFMXModule position sync wired (${timingTable?.length ?? 0} entries, msPerJiffy=${msPerJiffy})`);
        }

        // Generic position sync for WASM engines with onPositionUpdate.
        // IMPORTANT: Do NOT call store.play() or set isPlaying here — that triggers
        // usePatternPlayback reload effect → startNativeEngines() → infinite respawn loop.
        // The TrackerReplayer.play() already sets isPlaying via the normal flow.
        // We only update currentRow so the pattern editor scrolls.
        if ('onPositionUpdate' in instance && typeof (instance as any).onPositionUpdate === 'function' && desc.key !== 'Hively' && desc.key !== 'UADEEditable' && desc.key !== 'TFMXModule') {
          // Wire position updates to the lightweight WASM position store.
          // This bypasses useTransportStore entirely to avoid triggering
          // the usePatternPlayback effect chain (which causes recursive engine spawns).
          // MusicLine: use onPosition for per-channel row/position data
          if (desc.key === 'MusicLine' && 'onPosition' in instance) {
            (instance as any).onPosition((update: { position: number; row: number; channelRows?: number[]; channelPositions?: number[] }) => {
              useWasmPositionStore.getState().setPosition(update.row, update.position, update.channelRows, update.channelPositions);
            });
          } else {
            (instance as any).onPositionUpdate((update: { songPos?: number; row: number }) => {
              useWasmPositionStore.getState().setPosition(update.row, update.songPos);
            });
          }
          // Also connect meters on first play
          try { getToneEngine().connectMeters(); } catch { /* ok */ }
          console.log(`[NativeEngineRouting] ${desc.key} position sync wired`);
        }

        // Direct routing for engines without a synth in song.instruments
        if (desc.needsDirectRouting && !isDJDeck && !routedNativeEngines.has(desc.synthType)) {
          const nativeInput = getNativeAudioNode(separationInputTone as any);
          if (nativeInput) {
            // Handle cross-context routing (stale AudioContext from HMR)
            if (instance.output.context !== nativeInput.context) {
              try {
                const msDest = (instance.output.context as AudioContext).createMediaStreamDestination();
                instance.output.connect(msDest);
                const msSource = (nativeInput.context as AudioContext).createMediaStreamSource(msDest.stream);
                msSource.connect(nativeInput);
                console.log(`[NativeEngineRouting] ${desc.key} output → stereo separation (cross-context bridge)`);
              } catch (bridgeErr) {
                console.error(`[NativeEngineRouting] ${desc.key} cross-context bridge failed:`, bridgeErr);
                // Fallback: connect to engine's own context destination
                instance.output.connect(instance.output.context.destination);
              }
            } else {
              instance.output.connect(nativeInput);
              console.log(`[NativeEngineRouting] ${desc.key} output → stereo separation`);
            }
            routedNativeEngines.add(desc.synthType);
          } else {
            // Fallback: connect directly to audio context destination
            const ctx = instance.output.context;
            instance.output.connect(ctx.destination);
            routedNativeEngines.add(desc.synthType);
            console.log(`[NativeEngineRouting] ${desc.key} output → destination (fallback)`);
          }
        }
        // Start silence detection for looping formats
        if (desc.needsDirectRouting) {
          const detector = new SilenceDetector(instance.output.context);
          detector.start(instance.output, instance.output, () => {
            console.log(`[NativeEngineRouting] ${desc.key} silence detected — stopping`);
            try { instance.stop(); } catch { /* ignored */ }
          });
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
            console.log('[NativeEngineRouting] Symphonie output → stereo separation');
          } else {
            node.connect(ctx.destination);
            routedNativeEngines.add('SymphonieSynth');
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
        try { if (cls.hasInstance()) cls.getInstance().stop(); } catch { /* ignored */ }
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
