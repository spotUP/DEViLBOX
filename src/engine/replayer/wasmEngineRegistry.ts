/**
 * The native engine registry: which WASM engine plays a song, as data.
 *
 * Each descriptor names the song field that carries its file data; the first
 * descriptor in table order whose data a song carries plays it. Kept apart
 * from NativeEngineRouting (which starts, stops and routes the engines) so
 * the question "which engine plays this song" costs no engine import: the
 * importer asks it while parsing (playsOnDedicatedEngine), and a cold
 * NativeEngineRouting import pulls in Tone and every statically linked
 * engine (~10 s in a test worker).
 *
 * To add a new WASM engine, add one entry to WASM_ENGINES[].
 */

import type { TrackerSong } from '../TrackerReplayer';

// ---------------------------------------------------------------------------
// Engine registry types
// ---------------------------------------------------------------------------

/** Minimal interface shared by all singleton WASM engines */
export interface WASMSingletonEngine {
  ready(): Promise<void>;
  loadTune?(data: ArrayBuffer | Uint8Array, ...args: any[]): Promise<void>;
  loadSong?(data: ArrayBuffer | Uint8Array): Promise<any>;
  play(): void;
  stop(): void;
  pause(): void;
  output: GainNode;
}

export interface WASMSingletonStatic {
  getInstance(): WASMSingletonEngine;
  hasInstance(): boolean;
}

/** Descriptor for a singleton WASM engine in the registry */
export interface NativeEngineDescriptor {
  /** Unique key for logging */
  key: string;
  /** SynthType name used for audio routing */
  synthType: string;
  /** Whether to suppress TrackerReplayer note triggers */
  suppressNotes: boolean;
  /** Which song field holds the raw file data */
  fileDataKey: keyof TrackerSong;
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

export const WASM_ENGINES: NativeEngineDescriptor[] = [
  {
    key: 'Hively',
    synthType: 'HivelySynth',
    suppressNotes: true,
    fileDataKey: 'hivelyFileData',
    loadMethod: 'loadTune',
    getLoadArgs: (song) => [song.hivelyMeta?.stereoMode ?? 2],
    supportsPause: true,
    supportsResume: true,
    needsDirectRouting: false,
    // Linked statically by NativeEngineRouting (STATIC_ENGINES) for its sync stop/pause/resume.
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/hively/HivelyEngine')).HivelyEngine as unknown as WASMSingletonStatic,
  },
  {
    key: 'Klystrack',
    synthType: 'KlysSynth',
    suppressNotes: true,
    fileDataKey: 'klysFileData',
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
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    // Linked statically by NativeEngineRouting (STATIC_ENGINES) for its sync stop/pause/resume.
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/jamcracker/JamCrackerEngine')).JamCrackerEngine as unknown as WASMSingletonStatic,
  },
  {
    key: 'FuturePlayer',
    synthType: 'FuturePlayerSynth',
    suppressNotes: true,
    fileDataKey: 'futurePlayerFileData',
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
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    // Jochen Hippel's formats are decoded by libtfmxaudiodecoder, which lives
    // in the TFMX WASM (its Jochen/ tree: COSO, TFMX-ST, MCMD, SMOD/FC). The
    // old Hippel WASM was a transpile of UADE's player shell: its InitPlayer
    // jumped through UADE callbacks that do not exist outside UADE, so every
    // Hippel song played silence (prehistoric_tale.hipc, 2026-09-28). A
    // single-file module has no companion smpl file.
    dynamicResolver: async () => (await import('@/engine/tfmx/TFMXEngine')).TFMXEngine as unknown as WASMSingletonStatic,
    getLoadArgs: () => [],
  },
  {
    key: 'Sonix',
    synthType: 'SonixSynth',
    suppressNotes: true,
    fileDataKey: 'sonixFileData',
    // Activate whenever sonixFileData exists. It is attached only by
    // SonixMusicDriverParser.parseSonixFile for genuine Sonix modules (SNX, and
    // FORM/SMUS carrying an SNX1 synth chunk). The SMUS path keeps song.format
    // = 'IFF SMUS' for the editable view; the WASM C port synthesizes from the
    // SNX1 chunk directly (UADE can't synth the external instruments).
    loadMethod: 'loadTune',
    // Pass external instrument files + the memfs song path to loadTune so the WASM
    // engine can load sample-based instruments (.instr/.ss) via memfs. 'sonix/song'
    // must match SonixMusicDriverParser.SONIX_MEMFS_SONG_PATH (its parent 'sonix' is
    // where sidecarFiles' Instruments/ dir lives).
    getLoadArgs: (song) => [song.sonixSidecarFiles ?? [], 'sonix/song'],
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/sonix/SonixEngine')).SonixEngine as unknown as WASMSingletonStatic,
  },
  {
    key: 'MaxTrax',
    synthType: 'MaxTraxSynth',
    suppressNotes: true,
    fileDataKey: 'maxTraxFileData',
    // Activate whenever maxTraxFileData exists (set by MaxTraxParser).
    // The WASM replayer drives all audio; the tracker scheduler must not
    // also trigger the Sampler instruments that the parser decoded for display.
    loadMethod: 'loadTune',
    getLoadArgs: () => [0], // score 0 = first sub-song
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/maxtrax/MaxTraxEngine')).MaxTraxEngine as unknown as WASMSingletonStatic,
  },
  {
    key: 'Pxtone',
    synthType: 'PxtoneSynth',
    suppressNotes: true,
    fileDataKey: 'pxtoneFileData',
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
    loadMethod: 'loadTune',
    // The FMB / PMB banks the song's header names ride as load args.
    getLoadArgs: (song: TrackerSong) => [song.eupFmBankData, song.eupPcmBankData],
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
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/zxtune/ZxtuneEngine')).ZxtuneEngine as unknown as WASMSingletonStatic,
  },
  {
    // ZX Spectrum .ay (ZXAY EMUL): aylet 0.5 compiled to wasm runs the tune's
    // own Z80 code with a real AY. The grid is a view (AYParser); the engine
    // plays the whole file (ledger F15).
    key: 'Aylet',
    synthType: 'AyletSynth',
    suppressNotes: true,
    fileDataKey: 'ayFileData',
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/aylet/AyletEngine')).AyletEngine as unknown as WASMSingletonStatic,
  },
  {
    // Studio Pixel PiyoPiyo (.pmd): a worklet port of piyopiyo-rs plays the
    // whole file; the grid is a view (PiyoPiyoParser). Sweep 2026-10-05, B5.
    key: 'PiyoPiyo',
    synthType: 'PiyoPiyoSynth',
    suppressNotes: true,
    fileDataKey: 'piyoPiyoFileData',
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/piyopiyo/PiyoPiyoEngine')).PiyoPiyoEngine as unknown as WASMSingletonStatic,
  },
  {
    // TFM Music Maker (.tfe, ZX Spectrum TurboFM): ZXTune's player drives two
    // ymfm YM2203 in tfm-wasm; the grid is a view (TFMMusicMakerParser).
    key: 'TFM',
    synthType: 'TFMSynth',
    suppressNotes: true,
    fileDataKey: 'tfmFileData',
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/tfm/TFMEngine')).TFMEngine as unknown as WASMSingletonStatic,
  },
  {
    // Atari ST SNDH (.snd/.sndh, raw or ICE!-packed): PSG play runs the
    // file's own 68000 code with YM2149, MFP timers and STE DMA sound in
    // psgplay-wasm; the grid is a view (SNDHParser). SC68 containers stay
    // on Sc68. The subtune rides as a load arg (0 = the file's default).
    key: 'Psgplay',
    synthType: 'PsgplaySynth',
    suppressNotes: true,
    fileDataKey: 'sndhFileData',
    loadMethod: 'loadTune',
    getLoadArgs: (song: TrackerSong) => [song.sndhSubtune ?? 0],
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/psgplay/PsgplayEngine')).PsgplayEngine as unknown as WASMSingletonStatic,
  },
  {
    // Console game music (NSF/NSFE, GBS, HES, KSS, SPC, VGM/VGZ, GYM):
    // game-music-emu runs the game's own sound program, or replays the
    // register log, on the emulated CPU and sound chips (game-music-emu-wasm).
    // Nothing to edit: GameMusicParser reads the header, the song opens in
    // the scope view. The track rides as a load arg (0-based).
    key: 'Gme',
    synthType: 'GmeSynth',
    suppressNotes: true,
    fileDataKey: 'gmeFileData',
    loadMethod: 'loadTune',
    getLoadArgs: (song: TrackerSong) => [song.gmeTrack ?? 0],
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/gme/GmeEngine')).GmeEngine as unknown as WASMSingletonStatic,
  },
  {
    // S98 register logs (PC-88 / PC-98 / X1 / FM Towns / MSX): s98-wasm
    // replays the log on one ymfm chip per device. Nothing to edit:
    // S98Parser reads the header, the song opens in the scope view.
    key: 'S98',
    synthType: 'S98Synth',
    suppressNotes: true,
    fileDataKey: 's98FileData',
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/s98/S98Engine')).S98Engine as unknown as WASMSingletonStatic,
  },
  {
    // StoneTracker (.spm + .sps, Amiga): the authors' StonePlayer_Hard.bin
    // runs on Musashi's 68020 with a Paula + CIA-B in stonetracker-wasm; the
    // grid is a view (StoneTrackerParser). The SPS bank rides as a load arg.
    key: 'StoneTracker',
    synthType: 'StoneTrackerSynth',
    suppressNotes: true,
    fileDataKey: 'stoneTrackerFileData',
    loadMethod: 'loadTune',
    getLoadArgs: (song: TrackerSong) => [song.stoneTrackerSampleData],
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/stonetracker/StoneTrackerEngine')).StoneTrackerEngine as unknown as WASMSingletonStatic,
  },
  {
    // Any UADE eagleplayer on the shared Musashi host (eagleplayer-wasm:
    // UADE's own sound core `score` drives the format's player). Which
    // player comes from the song's eaglePlayerId (eaglePlayerFormats.ts).
    // Ahead of UADEEditable: a song carrying both plays here.
    key: 'EaglePlayer',
    synthType: 'EaglePlayerSynth',
    suppressNotes: true,
    fileDataKey: 'eaglePlayerFileData',
    loadMethod: 'loadTune',
    getLoadArgs: (song: TrackerSong) => [song.eaglePlayerId, song.eaglePlayerFileName ?? song.name],
    supportsPause: true,
    supportsResume: true,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/eagleplayer/EaglePlayerEngine')).EaglePlayerEngine as unknown as WASMSingletonStatic,
  },
  {
    // MusicMaker V8 (.sdata + .ip, Amiga): a worklet replayer built from the
    // author's player source (MusicMaker4/8.asm) plays the song; the grid is a
    // view (MusicMakerParser). The song travels as one FORM/MMV8 IFF.
    key: 'MusicMaker',
    synthType: 'MusicMakerSynth',
    suppressNotes: true,
    fileDataKey: 'musicMakerFileData',
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/musicmaker/MusicMakerEngine')).MusicMakerEngine as unknown as WASMSingletonStatic,
  },
  {
    key: 'PumaTracker',
    synthType: 'PumaTrackerSynth',
    suppressNotes: true,
    fileDataKey: 'pumaTrackerFileData',
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/pumatracker/PumaTrackerEngine')).PumaTrackerEngine as unknown as WASMSingletonStatic,
  },
  {
    key: 'SteveTurner',
    synthType: 'SteveTurnerSynth',
    suppressNotes: true,
    fileDataKey: 'steveTurnerFileData',
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
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/artofnoise/ArtOfNoiseEngine')).ArtOfNoiseEngine as unknown as WASMSingletonStatic,
  },
  {
    key: 'Cinter4',
    synthType: 'Cinter4Synth',
    suppressNotes: true,
    fileDataKey: 'cinter4FileData',
    loadMethod: 'loadTune',
    getLoadArgs: (song) => [song.cinter4RawData, {
      spd: song.initialSpeed || 6,
      ticksPerTrack: song.cinter4Music?.ticksPerTrack ?? 0,
      restartTick: song.cinter4Music?.restartTick ?? 0,
    }],
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/cinter4/Cinter4Engine')).Cinter4Engine as unknown as WASMSingletonStatic,
  },
  {
    key: 'Pmdmini',
    synthType: 'PmdminiSynth',
    suppressNotes: true,
    fileDataKey: 'pmdFileData',
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
    loadMethod: 'loadSong',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    // Linked statically by NativeEngineRouting (STATIC_ENGINES) for its sync stop/pause/resume.
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/musicline/MusicLineEngine')).MusicLineEngine as unknown as WASMSingletonStatic,
  },
  {
    key: 'TFMXModule',
    synthType: 'TFMXModuleSynth',
    suppressNotes: true,
    fileDataKey: 'tfmxFileData',
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
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/asap/AsapEngine')).AsapEngine as unknown as WASMSingletonStatic,
    getLoadArgs: (song: TrackerSong) => [song.asapFilename || 'tune.sap', song.asapSong ?? -1],
  },
  {
    key: 'SoundControlReplayer',
    synthType: 'SoundControlWasmSynth',
    suppressNotes: true,
    fileDataKey: 'soundControlFileData',
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
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/sonic-arranger/SonicArrangerEngine')).SonicArrangerEngine as unknown as WASMSingletonStatic,
  },
  {
    key: 'SunTronicSong',
    // MUST precede UADEEditable: the dispatch loop keeps only the FIRST
    // descriptor that activates (skips later ones once one engine started).
    // sunTronicSongFileData is attached ONLY when the user picks
    // the 'native' engine pref, so ordering it first makes native win over the
    // generic UADE-editable fallback for exactly those songs. Default pref leaves
    // the key unset → this descriptor is inert → UADEEditable still handles the song.
    synthType: 'SunTronicSongSynth',
    suppressNotes: true,
    fileDataKey: 'sunTronicSongFileData',
    loadMethod: 'loadTune',
    getLoadArgs: (song) => [song.sunTronicCompanionPcm ?? []],
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/suntronic/SunTronicSongEngine')).SunTronicSongEngine as unknown as WASMSingletonStatic,
  },
  {
    key: 'UADEEditable',
    synthType: 'UADEEditableSynth',
    suppressNotes: true,
    fileDataKey: 'uadeEditableFileData',
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
          await populatePatternsFromChipRAM(editor, layout, song.instruments?.length ?? 0);
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
    loadMethod: 'loadTune',
    supportsPause: false,
    supportsResume: false,
    needsDirectRouting: true,
    staticRef: null,
    dynamicResolver: async () => (await import('@/engine/v2m/V2MEngine')).V2MEngine as unknown as WASMSingletonStatic,
  },
];

export function shouldActivate(desc: NativeEngineDescriptor, song: TrackerSong): boolean {
  // The data decides: an engine plays the song that carries its file data.
  // A song.format gate used to sit here; parsers label their songs for the
  // grid (PumaTracker says 'MOD' for Amiga separation and editing), so the
  // PumaTracker and Psycle engines never started (owner, 2026-10-05: our own
  // WASM engines play whenever they can).
  return !!song[desc.fileDataKey];
}

/**
 * Whether `song` plays on an engine of its own rather than on UADE: the
 * descriptor `startNativeEngines` would start for it is not the one fed
 * `uadeEditableFileData`. The importer asks this before it hands a song to
 * UADE, so "has a dedicated engine" is this registry, not a copy of it.
 */
export function playsOnDedicatedEngine(song: Partial<TrackerSong>): boolean {
  const desc = WASM_ENGINES.find((d) => shouldActivate(d, song as TrackerSong));
  return !!desc && desc.fileDataKey !== 'uadeEditableFileData';
}
