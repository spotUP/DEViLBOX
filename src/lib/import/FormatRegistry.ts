/**
 * FormatRegistry — Single source of truth for all supported music file formats.
 *
 * Every format DEViLBOX can load is defined here once. Consumers (ImportModuleDialog,
 * ModuleLoader, GlobalDragDropHandler, UnifiedFileLoader, parseModuleToSong) all
 * derive their format lists, extension sets, and detection logic from this registry.
 *
 * Adding a new format = adding one entry here. No other file needs format lists.
 */

import type { FormatEnginePreferences } from '@/stores/useSettingsStore';
import { isUADEFormat } from './formats/UADEParser';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Broad family for grouping and dispatch routing */
export type FormatFamily =
  | 'midi'
  | 'furnace'
  | 'amiga-native'    // Native parser + UADE fallback
  | 'c64-chip'        // C64 SID (PSID/RSID)
  | 'chip-dump'       // VGM, YM, NSF, SAP, AY
  | 'pc-tracker'      // PC tracker with native parser + libopenmpt fallback (669, FAR, etc.)
  | 'libopenmpt'      // MOD, XM, IT, S3M — native first, then libopenmpt
  | 'uade-only';      // UADE prefix-based formats with no native parser

/** How this format is matched against a filename */
export type MatchMode =
  | 'extension'   // Standard extension match: /\.ext$/i
  | 'prefix'      // Amiga prefix match: basename starts with 'prefix.'
  | 'both';       // Both extension and prefix (e.g., .dl and dl.*)

/** What the native parser's import function looks like */
export interface NativeParserRef {
  /** Dynamic import path, e.g., '@lib/import/formats/HivelyParser' */
  module: string;
  /** Name of the parse function export, e.g., 'parseHivelyFile' */
  parseFn: string;
  /** Name of the format-detect function export (optional), e.g., 'isHivelyFormat' */
  detectFn?: string;
}

/** A single format definition in the registry */
export interface FormatDefinition {
  /** Unique key matching FormatEnginePreferences where applicable */
  key: string;

  /** Human-readable label */
  label: string;

  /** Short description for UI */
  description: string;

  /** Format family for dispatch routing */
  family: FormatFamily;

  /** How the filename is matched */
  matchMode: MatchMode;

  /**
   * Extension regex (for matchMode 'extension' or 'both').
   * Applied against the full lowercase filename.
   * Examples: /\.(hvl|ahx)$/i, /\.okt$/i
   */
  extRegex?: RegExp;

  /**
   * Prefix strings (for matchMode 'prefix' or 'both').
   * Matched against lowercase basename with startsWith.
   * Examples: ['rh.', 'rhp.'] for Rob Hubbard
   */
  prefixes?: string[];

  /**
   * Preference key in FormatEnginePreferences (if user can toggle native/UADE).
   * Undefined for formats without a preference toggle.
   */
  prefKey?: keyof FormatEnginePreferences;

  /** Native parser reference (lazy-loaded). Undefined = no native parser. */
  nativeParser?: NativeParserRef;

  /** Whether UADE can handle this format as fallback */
  uadeFallback?: boolean;

  /** Whether libopenmpt can handle this format as fallback */
  libopenmptFallback?: boolean;

  /** If true, only native parser (no UADE/libopenmpt toggle in UI) */
  nativeOnly?: boolean;

  /** If true, libopenmpt can play this for preview in ImportModuleDialog */
  libopenmptPlayable?: boolean;

  /**
   * Custom dispatch — for formats with special logic (magic-byte disambiguation,
   * two-file formats, multi-variant, etc.) that can't be handled by the generic
   * withFallback helper. When set, the dispatcher calls this instead.
   *
   * The function name in parseModuleToSong that handles this format's special logic.
   * Used during Phase 4 migration; the dispatcher will import and call it.
   */
  customDispatch?: boolean;

  /**
   * NativeFormatMetadata key — if present, getNativeFormatMetadata can extract
   * header info for the import dialog preview.
   */
  hasMetadata?: boolean;
}

// ─── Registry ───────────────────────────────────────────────────────────────

export const FORMAT_REGISTRY: FormatDefinition[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // MIDI
  // ═══════════════════════════════════════════════════════════════════════════
  {
    key: 'midi',
    label: 'MIDI',
    description: 'Standard MIDI file',
    family: 'midi',
    matchMode: 'extension',
    extRegex: /\.(mid|midi)$/i,
    nativeOnly: true,
    nativeParser: { module: '@lib/import/MIDIImporter', parseFn: 'importMIDIFile' },
    customDispatch: true, // MIDI has special options (quantize, pattern length, etc.)
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FURNACE / DEFLASK
  // ═══════════════════════════════════════════════════════════════════════════
  {
    key: 'fur',
    label: 'Furnace',
    description: 'Furnace tracker module',
    family: 'furnace',
    matchMode: 'extension',
    extRegex: /\.fur$/i,
    nativeOnly: true,
    customDispatch: true, // Special Furnace subsong handling
  },
  {
    key: 'dmf',
    label: 'DefleMask / X-Tracker',
    description: 'DefleMask or X-Tracker DMF — magic-byte disambiguation',
    family: 'furnace',
    matchMode: 'extension',
    extRegex: /\.dmf$/i,
    prefKey: 'xTracker',
    nativeParser: { module: '@lib/import/formats/XTrackerParser', parseFn: 'parseXTrackerFile', detectFn: 'isXTrackerFormat' },
    uadeFallback: true,
    customDispatch: true, // Magic byte disambiguation (DDMF vs DefleMask)
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // AMIGA NATIVE — Native parser + UADE fallback
  // ═══════════════════════════════════════════════════════════════════════════
  {
    key: 'hvl',
    label: 'HivelyTracker',
    description: 'HivelyTracker/AHX — native parser or UADE',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.(hvl|ahx)$/i,
    prefixes: ['hvl.', 'ahx.'],
    prefKey: 'hvl',
    nativeParser: { module: '@lib/import/formats/HivelyParser', parseFn: 'parseHivelyFile' },
    uadeFallback: true,
    hasMetadata: true,
  },
  {
    key: 'okt',
    label: 'Oktalyzer',
    description: 'Oktalyzer 8-channel — OpenMPT WASM for full pattern data',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.(okt|okta)$/i,
    prefixes: ['okt.'],
    prefKey: 'okt',
    libopenmptPlayable: true,
    hasMetadata: true,
  },
  {
    key: 'med',
    label: 'OctaMED',
    description: 'OctaMED/MED — OpenMPT WASM for accurate BPM/speed',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.(med|mmd[0-3]|mmdc)$/i,
    prefixes: ['med.', 'mmd0.', 'mmd1.', 'mmd2.', 'mmd3.'],
    prefKey: 'med',
    libopenmptPlayable: true,
    hasMetadata: true,
  },
  {
    key: 'digi',
    label: 'DigiBooster',
    description: 'DigiBooster (v1) — native parser or UADE',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.digi$/i,
    prefixes: ['digi.'],
    prefKey: 'digi',
    uadeFallback: true,
    hasMetadata: true,
  },
  {
    key: 'deltaMusic2',
    label: 'Delta Music 2',
    description: 'Delta Music 2.0 — magic ".FNL" at 0xBC6',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.dm2$/i,
    prefixes: ['dm2.'],
    prefKey: 'deltaMusic2',
    nativeParser: { module: '@lib/import/formats/DeltaMusic2Parser', parseFn: 'parseDeltaMusic2File', detectFn: 'isDeltaMusic2Format' },
    uadeFallback: true,
  },
  {
    key: 'fc',
    label: 'Future Composer',
    description: 'Future Composer 1.3/1.4 — FC2 auto-falls back to UADE',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.(fc|fc2|fc3|fc4|fc13|fc14|sfc|smod|bfc|bsi)$/i,
    prefixes: ['fc.', 'fc13.', 'fc14.', 'smod.', 'bfc.', 'bsi.'],
    prefKey: 'fc',
    nativeParser: { module: '@lib/import/formats/FCParser', parseFn: 'parseFCFile' },
    uadeFallback: true,
    hasMetadata: true,
    customDispatch: true, // FC has complex multi-variant magic detection
  },
  {
    key: 'soundmon',
    label: 'SoundMon',
    description: "Brian Postma's SoundMon V1/V2/V3",
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.(bp|bp3|sndmon)$/i,
    prefixes: ['bp.', 'bp3.', 'sndmon.'],
    prefKey: 'soundmon',
    nativeParser: { module: '@lib/import/formats/SoundMonParser', parseFn: 'parseSoundMonFile' },
    uadeFallback: true,
    hasMetadata: true,
  },
  {
    key: 'sidmon1',
    label: 'SidMon 1',
    description: 'SidMon 1.0 — native parser or UADE',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.sid1$/i,
    prefixes: ['sid1.'],
    prefKey: 'sidmon1',
    nativeParser: { module: '@lib/import/formats/SidMon1Parser', parseFn: 'parseSidMon1File', detectFn: 'isSidMon1Format' },
    uadeFallback: true,
    customDispatch: true, // .sid1 has C64 SID fallback if not SidMon
  },
  {
    key: 'sidmon2',
    label: 'SidMon II',
    description: 'SidMon II — Sd2Engine WASM replayer with native pattern display',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.(sid2|sd2|smn)$/i,
    prefixes: ['sid2.', 'sd2.', 'smn.'],
    prefKey: 'sidmon2',
    nativeParser: { module: '@lib/import/formats/SidMon2Parser', parseFn: 'parseSidMon2File' },
    uadeFallback: false,
    hasMetadata: true,
  },
  {
    key: 'fred',
    label: 'Fred Editor',
    description: 'Fred Editor by Software of Sweden',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.fred$/i,
    prefixes: ['fred.'],
    prefKey: 'fred',
    nativeParser: { module: '@lib/import/formats/FredEditorParser', parseFn: 'parseFredEditorFile' },
    uadeFallback: true,
    hasMetadata: true,
  },
  {
    key: 'soundfx',
    label: 'Sound-FX',
    description: 'Sound-FX v1.0 and v2.0',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.(sfx|sfx2|sfx13)$/i,
    prefixes: ['sfx.', 'sfx2.'],
    prefKey: 'soundfx',
    nativeParser: { module: '@lib/import/formats/SoundFXParser', parseFn: 'parseSoundFXFile' },
    uadeFallback: true,
    hasMetadata: true,
  },
  {
    key: 'jamcracker',
    label: 'JamCracker Pro',
    description: 'JamCracker Pro — native parser or UADE',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.(jam|jc)$/i,
    prefixes: ['jam.'],
    nativeParser: { module: '@lib/import/formats/JamCrackerParser', parseFn: 'parseJamCrackerFile', detectFn: 'isJamCrackerFormat' },
    uadeFallback: true,
  },
  {
    key: 'quadraComposer',
    label: 'Quadra Composer',
    description: 'Quadra Composer — native parser or UADE',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.(emod|qc)$/i,
    prefixes: ['emod.', 'qc.'],
    nativeParser: { module: '@lib/import/formats/QuadraComposerParser', parseFn: 'parseQuadraComposerFile', detectFn: 'isQuadraComposerFormat' },
    uadeFallback: true,
  },
  {
    key: 'amosMusicBank',
    label: 'AMOS Music Bank',
    description: 'AMOS Music Bank — native parser or UADE',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.abk$/i,
    prefixes: ['abk.'],
    prefKey: 'amosMusicBank',
    nativeParser: { module: '@lib/import/formats/AMOSMusicBankParser', parseFn: 'parseAMOSMusicBankFile', detectFn: 'isAMOSMusicBankFormat' },
    uadeFallback: true,
  },
  {
    key: 'sonicArranger',
    label: 'Sonic Arranger',
    description: 'Sonic Arranger — magic "SOARV1.0"',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.(sa|sonic)$/i,
    prefixes: ['sa.', 'sonic.'],
    prefKey: 'sonicArranger',
    nativeParser: { module: '@lib/import/formats/SonicArrangerParser', parseFn: 'parseSonicArrangerFile', detectFn: 'isSonicArrangerFormat' },
    uadeFallback: true,
    hasMetadata: true,
  },
  {
    key: 'inStereo2',
    label: 'InStereo! 2',
    description: 'InStereo! 2.0',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.is20$/i,
    prefixes: ['is20.'],
    prefKey: 'inStereo2',
    nativeParser: { module: '@lib/import/formats/InStereo2Parser', parseFn: 'parseInStereo2File', detectFn: 'isInStereo2Format' },
    uadeFallback: true,
  },
  {
    key: 'inStereo1',
    label: 'InStereo! 1',
    description: 'InStereo! 1.0',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.is10$/i,
    prefixes: ['is10.'],
    prefKey: 'inStereo1',
    nativeParser: { module: '@lib/import/formats/InStereo1Parser', parseFn: 'parseInStereo1File', detectFn: 'isInStereo1Format' },
    uadeFallback: true,
  },
  {
    key: 'inStereoAmbiguous',
    label: 'InStereo!',
    description: 'InStereo! .is — tries IS2 then IS1 by magic',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.is$/i,
    prefixes: ['is.'],
    customDispatch: true, // Magic-byte disambiguation between IS1 and IS2
    uadeFallback: true,
  },
  {
    key: 'hippelCoso',
    label: 'Hippel-CoSo',
    description: 'Jochen Hippel CoSo — native parser or UADE',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.(hipc|soc|coso)$/i,
    prefixes: ['hipc.', 'coso.'],
    prefKey: 'hippelCoso',
    nativeParser: { module: '@lib/import/formats/HippelCoSoParser', parseFn: 'parseHippelCoSoFile', detectFn: 'isHippelCoSoFormat' },
    uadeFallback: true,
  },
  {
    key: 'robHubbard',
    label: 'Rob Hubbard',
    description: 'Rob Hubbard Amiga prefix format (rh.*)',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.(rh|rhp)$/i,
    prefixes: ['rh.'],
    prefKey: 'robHubbard',
    nativeParser: { module: '@lib/import/formats/RobHubbardParser', parseFn: 'parseRobHubbardFile', detectFn: 'isRobHubbardFormat' },
    uadeFallback: true,
  },
  {
    key: 'tfmx',
    label: 'TFMX',
    description: 'Jochen Hippel TFMX — native parser or UADE',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.(tfmx|mdat|tfx)$/i,
    prefixes: ['mdat.', 'tfmx.', 'tfx.'],
    prefKey: 'tfmx',
    nativeParser: { module: '@lib/import/formats/TFMXParser', parseFn: 'parseTFMXFile' },
    uadeFallback: true,
    hasMetadata: true,
  },
  {
    key: 'mugician',
    label: 'Digital Mugician',
    description: 'Digital Mugician V1/V2 by Rob Hubbard',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.(dmu|dmu2|mug|mug2)$/i,
    prefixes: ['dmu.', 'mug.'],
    prefKey: 'mugician',
    nativeParser: { module: '@lib/import/formats/DigitalMugicianParser', parseFn: 'parseDigitalMugicianFile' },
    uadeFallback: true,
    hasMetadata: true,
  },
  {
    key: 'davidWhittaker',
    label: 'David Whittaker',
    description: 'David Whittaker format — native parser or UADE',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.(dw|dwold)$/i,
    prefixes: ['dw.'],
    prefKey: 'davidWhittaker',
    nativeParser: { module: '@lib/import/formats/DavidWhittakerParser', parseFn: 'parseDavidWhittakerFile', detectFn: 'isDavidWhittakerFormat' },
    uadeFallback: true,
  },
  {
    key: 'artOfNoise',
    label: 'Art of Noise',
    description: 'Art of Noise — native parser or UADE',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.(aon|aon8)$/i,
    prefixes: ['aon.', 'aon4.', 'aon8.'],
    prefKey: 'artOfNoise',
    nativeParser: { module: '@lib/import/formats/ArtOfNoiseParser', parseFn: 'parseArtOfNoiseFile', detectFn: 'isArtOfNoiseFormat' },
    uadeFallback: true,
  },
  {
    key: 'digitalSymphony',
    label: 'Digital Symphony',
    description: 'Digital Symphony — native parser or UADE',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.dsym$/i,
    prefixes: ['dsym.'],
    prefKey: 'digitalSymphony',
    nativeParser: { module: '@lib/import/formats/DigitalSymphonyParser', parseFn: 'parseDigitalSymphonyFile', detectFn: 'isDigitalSymphonyFormat' },
    uadeFallback: true,
  },
  {
    key: 'graoumfTracker2',
    label: 'Graoumf Tracker 2',
    description: 'Graoumf Tracker 2 — native parser or UADE',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.(gt2|gtk)$/i,
    prefixes: ['gt2.', 'gtk.'],
    prefKey: 'graoumfTracker2',
    nativeParser: { module: '@lib/import/formats/GraoumfTracker2Parser', parseFn: 'parseGraoumfTracker2File', detectFn: 'isGraoumfTracker2Format' },
    uadeFallback: true,
  },
  {
    key: 'symphoniePro',
    label: 'Symphonie Pro',
    description: 'Symphonie Pro — native parser or UADE',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.symmod$/i,
    prefixes: ['symmod.'],
    prefKey: 'symphoniePro',
    nativeParser: { module: '@lib/import/formats/SymphonieProParser', parseFn: 'parseSymphonieProFile', detectFn: 'isSymphonieProFormat' },
    uadeFallback: true,
    libopenmptPlayable: true,
  },
  {
    key: 'digiBoosterPro',
    label: 'DigiBooster Pro',
    description: 'DigiBooster Pro — native parser, UADE, or libopenmpt',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.dbm$/i,
    prefixes: ['dbm.'],
    prefKey: 'digiBoosterPro',
    nativeParser: { module: '@lib/import/formats/DigiBoosterProParser', parseFn: 'parseDigiBoosterProFile', detectFn: 'isDigiBoosterProFormat' },
    uadeFallback: true,
    libopenmptFallback: true,
    libopenmptPlayable: true,
  },
  {
    key: 'pumaTracker',
    label: 'Puma Tracker',
    description: 'Puma Tracker — native parser or UADE',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.puma$/i,
    prefixes: ['puma.'],
    prefKey: 'pumaTracker',
    nativeParser: { module: '@lib/import/formats/PumaTrackerParser', parseFn: 'parsePumaTrackerFile', detectFn: 'isPumaTrackerFormat' },
    uadeFallback: true,
  },
  {
    key: 'synthesis',
    label: 'Synthesis',
    description: 'Synthesis — native parser or UADE',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.syn$/i,
    prefixes: ['syn.'],
    prefKey: 'synthesis',
    nativeParser: { module: '@lib/import/formats/SynthesisParser', parseFn: 'parseSynthesisFile', detectFn: 'isSynthesisFormat' },
    uadeFallback: true,
  },
  {
    key: 'digitalSoundStudio',
    label: 'Digital Sound Studio',
    description: 'Digital Sound Studio — native parser or UADE',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.dss$/i,
    prefixes: ['dss.'],
    prefKey: 'digitalSoundStudio',
    nativeParser: { module: '@lib/import/formats/DigitalSoundStudioParser', parseFn: 'parseDigitalSoundStudioFile', detectFn: 'isDigitalSoundStudioFormat' },
    uadeFallback: true,
  },
  {
    key: 'musicAssembler',
    label: 'Music Assembler',
    description: 'Music Assembler — native parser or UADE',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.ma$/i,
    prefixes: ['ma.'],
    prefKey: 'musicAssembler',
    nativeParser: { module: '@lib/import/formats/MusicAssemblerParser', parseFn: 'parseMusicAssemblerFile', detectFn: 'isMusicAssemblerFormat' },
    uadeFallback: true,
  },
  {
    key: 'chuckBiscuits',
    label: 'Chuck Biscuits',
    description: 'Chuck Biscuits Atari ST — native parser or UADE',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.cba$/i,
    prefixes: ['cba.'],
    prefKey: 'chuckBiscuits',
    nativeParser: { module: '@lib/import/formats/ChuckBiscuitsParser', parseFn: 'parseChuckBiscuitsFile', detectFn: 'isChuckBiscuitsFormat' },
    uadeFallback: true,
  },
  {
    key: 'imagesMusicSystem',
    label: "Image's Music System",
    description: "Image's Music System — native parser or UADE",
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.ims$/i,
    prefixes: ['ims.'],
    prefKey: 'imagesMusicSystem',
    nativeParser: { module: '@lib/import/formats/ImagesMusicSystemParser', parseFn: 'parseImagesMusicSystemFile', detectFn: 'isImagesMusicSystemFormat' },
    uadeFallback: true,
  },
  {
    key: 'iceTracker',
    label: 'IceTracker',
    description: 'IceTracker — native parser or UADE',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.ice$/i,
    prefixes: ['ice.'],
    prefKey: 'iceTracker',
    nativeParser: { module: '@lib/import/formats/ICEParser', parseFn: 'parseICEFile', detectFn: 'isICEFormat' },
    uadeFallback: true,
  },
  {
    key: 'musicLine',
    label: 'MusicLine Editor',
    description: 'MusicLine Editor — native WASM engine (no UADE fallback)',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.ml$/i,
    prefixes: ['ml.'],
    prefKey: 'musicLine',
    nativeParser: { module: '@lib/import/formats/MusicLineParser', parseFn: 'parseMusicLineFile', detectFn: 'isMusicLineFormat' },
    nativeOnly: true,
    hasMetadata: true,
    customDispatch: true, // .ml is ambiguous: MusicLine first (magic "MLEDMODL"), then Medley
  },
  {
    key: 'gameMusicCreator',
    label: 'Game Music Creator',
    description: 'Game Music Creator — native parser or UADE',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.gmc$/i,
    prefixes: ['gmc.'],
    prefKey: 'gameMusicCreator',
    nativeParser: { module: '@lib/import/formats/GameMusicCreatorParser', parseFn: 'parseGameMusicCreatorFile', detectFn: 'isGameMusicCreatorFormat' },
    uadeFallback: true,
  },
  {
    key: 'faceTheMusic',
    label: 'Face the Music',
    description: 'Face the Music — native parser or UADE',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.ftm$/i,
    prefixes: ['ftm.'],
    prefKey: 'faceTheMusic',
    nativeParser: { module: '@lib/import/formats/FaceTheMusicParser', parseFn: 'parseFaceTheMusicFile', detectFn: 'isFaceTheMusicFormat' },
    uadeFallback: true,
    libopenmptPlayable: true,
  },
  {
    key: 'sawteeth',
    label: 'Sawteeth',
    description: 'Sawteeth / Karsten Obarski — native parser or UADE',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.st$/i,
    prefixes: ['st.'],
    prefKey: 'sawteeth',
    nativeParser: { module: '@lib/import/formats/SawteethParser', parseFn: 'parseSawteethFile', detectFn: 'isSawteethFormat' },
    uadeFallback: true,
  },
  {
    key: 'soundControl',
    label: 'Sound Control',
    description: 'Sound Control — native parser or UADE',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.(sc|sct)$/i,
    prefixes: ['sc.', 'sct.'],
    prefKey: 'soundControl',
    nativeParser: { module: '@lib/import/formats/SoundControlParser', parseFn: 'parseSoundControlFile', detectFn: 'isSoundControlFormat' },
    uadeFallback: true,
  },
  {
    key: 'soundFactory',
    label: 'Sound Factory',
    description: 'Sound Factory Pro — native parser or UADE',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.psf$/i,
    prefixes: ['psf.'],
    prefKey: 'soundFactory',
    nativeParser: { module: '@lib/import/formats/SoundFactoryParser', parseFn: 'parseSoundFactoryFile', detectFn: 'isSoundFactoryFormat' },
    uadeFallback: true,
  },
  {
    key: 'actionamics',
    label: 'Actionamics',
    description: 'Actionamics — native parser or UADE',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.act$/i,
    prefixes: ['act.'],
    prefKey: 'actionamics',
    nativeParser: { module: '@lib/import/formats/ActionamicsParser', parseFn: 'parseActionamicsFile', detectFn: 'isActionamicsFormat' },
    uadeFallback: true,
  },
  {
    key: 'activisionPro',
    label: 'Activision Pro',
    description: 'Activision Pro — native parser or UADE',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.(avp|mw)$/i,
    prefixes: ['avp.'],
    prefKey: 'activisionPro',
    nativeParser: { module: '@lib/import/formats/ActivisionProParser', parseFn: 'parseActivisionProFile', detectFn: 'isActivisionProFormat' },
    uadeFallback: true,
  },
  {
    key: 'ronKlaren',
    label: 'Ron Klaren',
    description: 'Ron Klaren format — native parser or UADE',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.(rk|rkb)$/i,
    prefixes: ['rk.'],
    prefKey: 'ronKlaren',
    nativeParser: { module: '@lib/import/formats/RonKlarenParser', parseFn: 'parseRonKlarenFile', detectFn: 'isRonKlarenFormat' },
    uadeFallback: true,
  },
  {
    key: 'kris',
    label: 'KRIS / ChipTracker',
    description: 'ChipTracker (KRIS prefix) — native parser or UADE',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.kris$/i,
    prefixes: ['kris.'],
    prefKey: 'kris',
    nativeParser: { module: '@lib/import/formats/KRISParser', parseFn: 'parseKRISFile', detectFn: 'isKRISFormat' },
    uadeFallback: true,
  },
  {
    key: 'deltaMusic1',
    label: 'Delta Music',
    description: 'Delta Music 1.x — magic "ALL " detection',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.dm1?$/i,
    prefixes: ['dm.', 'dm1.'],
    prefKey: 'deltaMusic1',
    nativeParser: { module: '@lib/import/formats/DeltaMusic1Parser', parseFn: 'parseDeltaMusic1File', detectFn: 'isDeltaMusic1Format' },
    uadeFallback: true,
  },
  {
    key: 'ams',
    label: 'AMS / Velvet Studio',
    description: "AMS (Extreme's Tracker / Velvet Studio) — native parser or UADE",
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.ams$/i,
    prefixes: ['ams.'],
    prefKey: 'ams',
    nativeParser: { module: '@lib/import/formats/AMSParser', parseFn: 'parseAMSFile', detectFn: 'isAMSFormat' },
    uadeFallback: true,
    libopenmptPlayable: true,
  },
  {
    key: 'iffSmus',
    label: 'IFF SMUS',
    description: 'IFF SMUS Sonix — native parser or UADE',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.(smus|snx|tiny)$/i,
    prefixes: ['smus.', 'snx.'],
    prefKey: 'iffSmus',
    nativeParser: { module: '@lib/import/formats/IffSmusParser', parseFn: 'parseIffSmusFile' },
    uadeFallback: true,
    customDispatch: true, // Two parsers: IffSmus and SonixMusicDriver
  },
  {
    key: 'magneticFieldsPacker',
    label: 'Magnetic Fields Packer',
    description: 'Magnetic Fields Packer — two-file format',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.mfp$/i,
    prefixes: ['mfp.'],
    prefKey: 'magneticFieldsPacker',
    nativeParser: { module: '@lib/import/formats/MagneticFieldsPackerParser', parseFn: 'parseMagneticFieldsPackerFile', detectFn: 'isMagneticFieldsPackerFormat' },
    uadeFallback: true,
    customDispatch: true, // Two-file format + MFP/MagneticFieldsPacker dual parser
  },
  {
    key: 'richardJoseph',
    label: 'Richard Joseph',
    description: 'Richard Joseph format — two-file format',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.(rjp|rj)$/i,
    prefixes: ['rjp.'],
    prefKey: 'richardJoseph',
    nativeParser: { module: '@lib/import/formats/RichardJosephParser', parseFn: 'parseRichardJosephFile', detectFn: 'isRichardJosephFormat' },
    uadeFallback: true,
    customDispatch: true, // Magic byte check + companion files
  },
  {
    key: 'speedySystem',
    label: 'Speedy System',
    description: 'Speedy System A1 — Apple IIgs',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.ss$/i,
    prefixes: ['ss.'],
    prefKey: 'speedySystem',
    nativeParser: { module: '@lib/import/formats/SpeedySystemParser', parseFn: 'parseSpeedySystemFile', detectFn: 'isSpeedySystemFormat' },
    uadeFallback: true,
  },
  {
    key: 'tronic',
    label: 'Tronic',
    description: 'Tronic — Stefan Hartmann Amiga tracker',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.(trc|dp|tro|tronic)$/i,
    prefixes: ['trc.', 'tro.'],
    prefKey: 'tronic',
    nativeParser: { module: '@lib/import/formats/TronicParser', parseFn: 'parseTronicFile', detectFn: 'isTronicFormat' },
    uadeFallback: true,
  },
  {
    key: 'medley',
    label: 'Medley',
    description: 'Medley tracker — magic "MSOB"',
    family: 'amiga-native',
    matchMode: 'extension',
    extRegex: /\.ml$/i, // Shares .ml with MusicLine — MusicLine is checked first
    prefKey: 'medley',
    nativeParser: { module: '@lib/import/formats/MedleyParser', parseFn: 'parseMedleyFile', detectFn: 'isMedleyFormat' },
    uadeFallback: true,
    customDispatch: true, // Only reached if MusicLine magic didn't match
  },
  {
    key: 'daveLowe',
    label: 'Dave Lowe',
    description: 'Dave Lowe format — two variants (old/new)',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.(dl|dl_deli)$/i,
    prefixes: ['dl.'],
    prefKey: 'daveLowe',
    nativeParser: { module: '@lib/import/formats/DaveLoweParser', parseFn: 'parseDaveLoweFile', detectFn: 'isDaveLoweFormat' },
    uadeFallback: true,
    customDispatch: true, // Two sub-parsers: DaveLowe + DaveLoweNew
  },
  {
    key: 'lme',
    label: 'LME',
    description: 'Leggless Music Editor — magic "LME"',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.lme$/i,
    prefixes: ['lme.'],
    prefKey: 'lme',
    nativeParser: { module: '@lib/import/formats/LMEParser', parseFn: 'parseLMEFile', detectFn: 'isLMEFormat' },
    uadeFallback: true,
  },
  {
    key: 'infogrames',
    label: 'Infogrames',
    description: 'Infogrames/CPC — Gobliins, Ween, etc.',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.dum$/i,
    prefixes: ['dum.'],
    prefKey: 'infogrames',
    nativeParser: { module: '@lib/import/formats/InfogramesParser', parseFn: 'parseInfogramesFile', detectFn: 'isInfogramesFormat' },
    uadeFallback: true,
  },
  {
    key: 'pt36',
    label: 'ProTracker 3.6',
    description: 'ProTracker 3.6 IFF wrapper — FORM+MODL magic',
    family: 'amiga-native',
    matchMode: 'extension',
    // No extension — detected by magic bytes only (FORM at 0, MODL at 8)
    prefKey: 'pt36',
    nativeParser: { module: '@lib/import/formats/PT36Parser', parseFn: 'parsePT36File' },
    libopenmptFallback: true,
    customDispatch: true, // Magic-only detection, no extension
  },

  // ── Prefix-based Amiga formats (native parser + UADE fallback) ────────────
  {
    key: 'benDaglish',
    label: 'Ben Daglish',
    description: 'Ben Daglish format (bd.* prefix or .bd extension)',
    family: 'amiga-native',
    matchMode: 'both',
    prefixes: ['bd.'],
    extRegex: /\.bd$/i,
    prefKey: 'benDaglish',
    nativeParser: { module: '@lib/import/formats/BenDaglishParser', parseFn: 'parseBenDaglishFile', detectFn: 'isBenDaglishFormat' },
    uadeFallback: false,
  },
  {
    key: 'markCooksey',
    label: 'Mark Cooksey',
    description: 'Mark Cooksey / Don Adan (mc.*/mcr.*/mco.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['mc.', 'mcr.', 'mco.'],
    prefKey: 'markCooksey',
    nativeParser: { module: '@lib/import/formats/MarkCookseyParser', parseFn: 'parseMarkCookseyFile', detectFn: 'isMarkCookseyFormat' },
    uadeFallback: true,
  },
  {
    key: 'jeroenTel',
    label: 'Jeroen Tel',
    description: 'Jeroen Tel format (jt.*/mon_old.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['jt.', 'mon_old.'],
    prefKey: 'jeroenTel',
    nativeParser: { module: '@lib/import/formats/JeroenTelParser', parseFn: 'parseJeroenTelFile', detectFn: 'isJeroenTelFormat' },
    uadeFallback: true,
  },
  {
    key: 'quartet',
    label: 'Quartet',
    description: 'Quartet (qpa.*/sqt.*/qts.* prefix, .4v suffix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['qpa.', 'sqt.', 'qts.'],
    extRegex: /\.4v$/i,
    prefKey: 'quartet',
    nativeParser: { module: '@lib/import/formats/QuartetParser', parseFn: 'parseQuartetFile', detectFn: 'isQuartetFormat' },
    uadeFallback: true,
  },
  {
    key: 'soundMaster',
    label: 'Sound Master',
    description: 'Sound Master (sm.*/sm1.*/sm2.*/sm3.*/smpro.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['sm.', 'sm1.', 'sm2.', 'sm3.', 'smpro.'],
    prefKey: 'soundMaster',
    nativeParser: { module: '@lib/import/formats/SoundMasterParser', parseFn: 'parseSoundMasterFile', detectFn: 'isSoundMasterFormat' },
    uadeFallback: true,
  },
  {
    key: 'zoundMonitor',
    label: 'Zound Monitor',
    description: 'Zound Monitor (sng.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['sng.'],
    prefKey: 'zoundMonitor',
    nativeParser: { module: '@lib/import/formats/ZoundMonitorParser', parseFn: 'parseZoundMonitorFile', detectFn: 'isZoundMonitorFormat' },
    uadeFallback: true,
    customDispatch: true, // .sng extension is also GoatTracker; prefix form only here
  },
  {
    key: 'synthPack',
    label: 'Synth Pack',
    description: 'Synth Pack (osp.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['osp.'],
    prefKey: 'synthPack',
    nativeParser: { module: '@lib/import/formats/SynthPackParser', parseFn: 'parseSynthPackFile', detectFn: 'isSynthPackFormat' },
    uadeFallback: true,
  },
  {
    key: 'tcbTracker',
    label: 'TCB Tracker',
    description: 'TCB Tracker (tcb.* prefix or .tcb extension)',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.tcb$/i,
    prefixes: ['tcb.'],
    prefKey: 'tcbTracker',
    nativeParser: { module: '@lib/import/formats/TCBTrackerParser', parseFn: 'parseTCBTrackerFile', detectFn: 'isTCBTrackerFormat' },
    uadeFallback: true,
  },
  {
    key: 'mmdc',
    label: 'MMDC',
    description: 'MMDC / MED Packer (mmdc.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['mmdc.'],
    prefKey: 'mmdc',
    nativeParser: { module: '@lib/import/formats/MMDCParser', parseFn: 'parseMMDCFile', detectFn: 'isMMDCFormat' },
    uadeFallback: true,
  },
  {
    key: 'psa',
    label: 'Professional Sound Artists',
    description: 'PSA (psa.* prefix / .psa extension)',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.psa$/i,
    prefixes: ['psa.'],
    prefKey: 'psa',
    nativeParser: { module: '@lib/import/formats/PSAParser', parseFn: 'parsePSAFile', detectFn: 'isPSAFormat' },
    uadeFallback: true,
  },
  {
    key: 'steveTurner',
    label: 'Steve Turner',
    description: 'Steve Turner/JasonPage Old (jpo.*/jpold.* / .jpo)',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.(jpo|jpold)$/i,
    prefixes: ['jpo.', 'jpold.'],
    prefKey: 'steveTurner',
    nativeParser: { module: '@lib/import/formats/SteveTurnerParser', parseFn: 'parseSteveTurnerFile', detectFn: 'isSteveTurnerFormat' },
    uadeFallback: true,
  },
  {
    key: 'tme',
    label: 'TME',
    description: 'TME (.tme / tme.* prefix)',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.tme$/i,
    prefixes: ['tme.'],
    prefKey: 'tme',
    nativeParser: { module: '@lib/import/formats/TMEParser', parseFn: 'parseTMEFile', detectFn: 'isTMEFormat' },
    uadeFallback: true,
  },
  {
    key: 'jasonPage',
    label: 'Jason Page',
    description: 'Jason Page (jpn.*/jpnd.*/jp.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['jpn.', 'jpnd.', 'jp.'],
    prefKey: 'jasonPage',
    nativeParser: { module: '@lib/import/formats/JasonPageParser', parseFn: 'parseJasonPageFile', detectFn: 'isJasonPageFormat' },
    uadeFallback: true,
  },
  {
    key: 'futurePlayer',
    label: 'Future Player',
    description: 'Future Player (.fp / fp.* prefix)',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.fp$/i,
    prefixes: ['fp.'],
    prefKey: 'futurePlayer',
    nativeParser: { module: '@lib/import/formats/FuturePlayerParser', parseFn: 'parseFuturePlayerFile', detectFn: 'isFuturePlayerFormat' },
    uadeFallback: true,
  },
  {
    key: 'jasonBrooke',
    label: 'Jason Brooke',
    description: 'Jason Brooke (jcb.*/jcbo.*/jb.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['jcb.', 'jcbo.', 'jb.'],
    prefKey: 'jasonBrooke',
    nativeParser: { module: '@lib/import/formats/JasonBrookeParser', parseFn: 'parseJasonBrookeFile', detectFn: 'isJasonBrookeFormat' },
    uadeFallback: true,
  },
  {
    key: 'laxity',
    label: 'Laxity',
    description: 'Laxity (powt.*/pt.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['powt.', 'pt.'],
    prefKey: 'laxity',
    nativeParser: { module: '@lib/import/formats/LaxityParser', parseFn: 'parseLaxityFile', detectFn: 'isLaxityFormat' },
    uadeFallback: true,
  },
  {
    key: 'fredGray',
    label: 'Fred Gray',
    description: 'Fred Gray (gray.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['gray.'],
    prefKey: 'fredGray',
    nativeParser: { module: '@lib/import/formats/FredGrayParser', parseFn: 'parseFredGrayFile', detectFn: 'isFredGrayFormat' },
    uadeFallback: true,
  },
  {
    key: 'musicMaker4V',
    label: 'Music Maker 4V',
    description: 'Music Maker 4V (mm4.*/sdata.* prefix or *.mm4/*.sdata extension)',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.(mm4|sdata)$/i,
    prefixes: ['mm4.', 'sdata.'],
    prefKey: 'musicMaker4V',
    nativeParser: { module: '@lib/import/formats/MusicMakerParser', parseFn: 'parseMusicMaker4VFile', detectFn: 'isMusicMaker4VFormat' },
    uadeFallback: true,
  },
  {
    key: 'musicMaker8V',
    label: 'Music Maker 8V',
    description: 'Music Maker 8V (mm8.* prefix or *.mm8 extension)',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.mm8$/i,
    prefixes: ['mm8.'],
    prefKey: 'musicMaker8V',
    nativeParser: { module: '@lib/import/formats/MusicMakerParser', parseFn: 'parseMusicMaker8VFile', detectFn: 'isMusicMaker8VFormat' },
    uadeFallback: true,
  },
  {
    key: 'jochenHippelST',
    label: 'Jochen Hippel ST',
    description: 'Jochen Hippel ST (.sog, hst.*, mdst.*)',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.sog$/i,
    prefixes: ['mdst.', 'hst.'],
    prefKey: 'jochenHippelST',
    nativeParser: { module: '@lib/import/formats/JochenHippelSTParser', parseFn: 'parseJochenHippelSTFile', detectFn: 'isJochenHippelSTFormat' },
    uadeFallback: true,
  },
  {
    key: 'specialFX',
    label: 'Special FX',
    description: 'Special FX / SpecialFX_ST (doda.* prefix / .jd extension)',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.jd$/i,
    prefixes: ['doda.', 'jd.'],
    prefKey: 'specialFX',
    nativeParser: { module: '@lib/import/formats/SpecialFXParser', parseFn: 'parseSpecialFXFile', detectFn: 'isSpecialFXFormat' },
    uadeFallback: true,
  },
  {
    key: 'timeTracker',
    label: 'Time Tracker',
    description: 'Time Tracker (tmk.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['tmk.'],
    prefKey: 'timeTracker',
    nativeParser: { module: '@lib/import/formats/TimeTrackerParser', parseFn: 'parseTimeTrackerFile', detectFn: 'isTimeTrackerFormat' },
    uadeFallback: true,
  },
  {
    key: 'cinemaware',
    label: 'Cinemaware',
    description: 'Cinemaware (cin.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['cin.'],
    prefKey: 'cinemaware',
    nativeParser: { module: '@lib/import/formats/CinemawareParser', parseFn: 'parseCinemawareFile', detectFn: 'isCinemawareFormat' },
    uadeFallback: true,
  },
  {
    key: 'novoTradePacker',
    label: 'NovoTrade Packer',
    description: 'NovoTrade Packer (ntp.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['ntp.'],
    prefKey: 'novoTradePacker',
    nativeParser: { module: '@lib/import/formats/NovoTradePackerParser', parseFn: 'parseNovoTradePackerFile', detectFn: 'isNovoTradePackerFormat' },
    uadeFallback: true,
  },
  {
    key: 'alcatrazPacker',
    label: 'Alcatraz Packer',
    description: 'Alcatraz Packer (alp.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['alp.'],
    prefKey: 'alcatrazPacker',
    nativeParser: { module: '@lib/import/formats/AlcatrazPackerParser', parseFn: 'parseAlcatrazPackerFile', detectFn: 'isAlcatrazPackerFormat' },
    uadeFallback: true,
  },
  {
    key: 'bladePacker',
    label: 'Blade Packer',
    description: 'Blade Packer (uds.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['uds.'],
    prefKey: 'bladePacker',
    nativeParser: { module: '@lib/import/formats/BladePackerParser', parseFn: 'parseBladePackerFile', detectFn: 'isBladePackerFormat' },
    uadeFallback: true,
  },
  {
    key: 'tomyTracker',
    label: 'Tomy Tracker',
    description: 'Tomy Tracker (sg.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['sg.'],
    prefKey: 'tomyTracker',
    nativeParser: { module: '@lib/import/formats/TomyTrackerParser', parseFn: 'parseTomyTrackerFile', detectFn: 'isTomyTrackerFormat' },
    uadeFallback: true,
  },
  {
    key: 'fashionTracker',
    label: 'Fashion Tracker',
    description: 'Fashion Tracker (ex.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['ex.'],
    prefKey: 'fashionTracker',
    nativeParser: { module: '@lib/import/formats/FashionTrackerParser', parseFn: 'parseFashionTrackerFile', detectFn: 'isFashionTrackerFormat' },
    uadeFallback: true,
  },
  {
    key: 'multiMediaSound',
    label: 'MultiMedia Sound',
    description: 'MultiMedia Sound (mms.*/sfx20.* prefix or *.mms extension)',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.(mms|sfx20)$/i,
    prefixes: ['mms.', 'sfx20.'],
    prefKey: 'multiMediaSound',
    nativeParser: { module: '@lib/import/formats/MultiMediaSoundParser', parseFn: 'parseMultiMediaSoundFile', detectFn: 'isMultiMediaSoundFormat' },
    uadeFallback: true,
  },
  {
    key: 'seanConran',
    label: 'Sean Conran',
    description: 'Sean Conran (scr.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['scr.'],
    prefKey: 'seanConran',
    nativeParser: { module: '@lib/import/formats/SeanConranParser', parseFn: 'parseSeanConranFile', detectFn: 'isSeanConranFormat' },
    uadeFallback: true,
  },
  {
    key: 'thomasHermann',
    label: 'Thomas Hermann',
    description: 'Thomas Hermann (thm.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['thm.'],
    prefKey: 'thomasHermann',
    nativeParser: { module: '@lib/import/formats/ThomasHermannParser', parseFn: 'parseThomasHermannFile', detectFn: 'isThomasHermannFormat' },
    uadeFallback: true,
  },
  {
    key: 'titanicsPacker',
    label: "Titanic's Packer",
    description: "Titanic's Packer (tits.* prefix)",
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['tits.'],
    prefKey: 'titanicsPacker',
    nativeParser: { module: '@lib/import/formats/TitanicsPackerParser', parseFn: 'parseTitanicsPackerFile', detectFn: 'isTitanicsPackerFormat' },
    uadeFallback: true,
  },
  {
    key: 'krisHatlelid',
    label: 'Kris Hatlelid',
    description: 'Kris Hatlelid (kh.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['kh.'],
    prefKey: 'krisHatlelid',
    nativeParser: { module: '@lib/import/formats/KrisHatlelidParser', parseFn: 'parseKrisHatlelidFile', detectFn: 'isKrisHatlelidFormat' },
    uadeFallback: true,
  },
  {
    key: 'ntsp',
    label: 'NTSP',
    description: 'NTSP (two.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['two.'],
    prefKey: 'ntsp',
    nativeParser: { module: '@lib/import/formats/NTSPParser', parseFn: 'parseNTSPFile', detectFn: 'isNTSPFormat' },
    uadeFallback: true,
  },
  {
    key: 'moshPacker',
    label: 'Mosh Packer',
    description: 'Mosh Packer (mosh.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['mosh.'],
    prefKey: 'moshPacker',
    nativeParser: { module: '@lib/import/formats/MoshPackerParser', parseFn: 'parseMoshPackerFile', detectFn: 'isMoshPackerFormat' },
    uadeFallback: true,
  },
  {
    key: 'coreDesign',
    label: 'Core Design',
    description: 'Core Design (core.* prefix / .core extension)',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.core$/i,
    prefixes: ['core.'],
    prefKey: 'coreDesign',
    nativeParser: { module: '@lib/import/formats/CoreDesignParser', parseFn: 'parseCoreDesignFile', detectFn: 'isCoreDesignFormat' },
    uadeFallback: true,
  },
  {
    key: 'jankoMrsicFlogel',
    label: 'Janko Mrsic-Flogel',
    description: 'Janko Mrsic-Flogel (jmf.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['jmf.'],
    prefKey: 'jankoMrsicFlogel',
    nativeParser: { module: '@lib/import/formats/JankoMrsicFlogelParser', parseFn: 'parseJankoMrsicFlogelFile', detectFn: 'isJankoMrsicFlogelFormat' },
    uadeFallback: true,
  },
  {
    key: 'soundPlayer',
    label: 'Sound Player',
    description: 'Sound Player (sjs.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['sjs.'],
    prefKey: 'soundPlayer',
    nativeParser: { module: '@lib/import/formats/SoundPlayerParser', parseFn: 'parseSoundPlayerFile', detectFn: 'isSoundPlayerFormat' },
    uadeFallback: true,
  },
  {
    key: 'nickPellingPacker',
    label: 'Nick Pelling Packer',
    description: 'Nick Pelling Packer (npp.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['npp.'],
    prefKey: 'nickPellingPacker',
    nativeParser: { module: '@lib/import/formats/NickPellingPackerParser', parseFn: 'parseNickPellingPackerFile', detectFn: 'isNickPellingPackerFormat' },
    uadeFallback: true,
  },
  {
    key: 'peterVerswyvelenPacker',
    label: 'Peter Verswyvelen Packer',
    description: 'Peter Verswyvelen Packer (pvp.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['pvp.'],
    prefKey: 'peterVerswyvelenPacker',
    nativeParser: { module: '@lib/import/formats/PeterVerswyvelenPackerParser', parseFn: 'parsePeterVerswyvelenPackerFile', detectFn: 'isPeterVerswyvelenPackerFormat' },
    uadeFallback: true,
  },
  {
    key: 'wallyBeben',
    label: 'Wally Beben',
    description: 'Wally Beben (wb.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['wb.'],
    prefKey: 'wallyBeben',
    nativeParser: { module: '@lib/import/formats/WallyBebenParser', parseFn: 'parseWallyBebenFile', detectFn: 'isWallyBebenFormat' },
    uadeFallback: true,
  },
  {
    key: 'steveBarrett',
    label: 'Steve Barrett',
    description: 'Steve Barrett (sb.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['sb.'],
    prefKey: 'steveBarrett',
    nativeParser: { module: '@lib/import/formats/SteveBarrettParser', parseFn: 'parseSteveBarrettFile', detectFn: 'isSteveBarrettFormat' },
    uadeFallback: true,
  },
  {
    key: 'paulSummers',
    label: 'Paul Summers',
    description: 'Paul Summers (snk.* prefix or *.snk extension)',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.snk$/i,
    prefixes: ['snk.'],
    prefKey: 'paulSummers',
    nativeParser: { module: '@lib/import/formats/PaulSummersParser', parseFn: 'parsePaulSummersFile', detectFn: 'isPaulSummersFormat' },
    uadeFallback: true,
  },
  {
    key: 'desire',
    label: 'Desire',
    description: 'Desire (dsr.* prefix / .dsr extension)',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.dsr$/i,
    prefixes: ['dsr.'],
    prefKey: 'desire',
    nativeParser: { module: '@lib/import/formats/DesireParser', parseFn: 'parseDesireFile', detectFn: 'isDesireFormat' },
    uadeFallback: true,
  },
  {
    key: 'martinWalker',
    label: 'Martin Walker',
    description: 'Martin Walker (avp.*/mw.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['mw.'],
    prefKey: 'martinWalker',
    nativeParser: { module: '@lib/import/formats/MartinWalkerParser', parseFn: 'parseMartinWalkerFile', detectFn: 'isMartinWalkerFormat' },
    uadeFallback: true,
  },
  {
    key: 'paulShields',
    label: 'Paul Shields',
    description: 'Paul Shields (ps.* prefix or *.ps extension)',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.ps$/i,
    prefixes: ['ps.'],
    prefKey: 'paulShields',
    nativeParser: { module: '@lib/import/formats/PaulShieldsParser', parseFn: 'parsePaulShieldsFile', detectFn: 'isPaulShieldsFormat' },
    uadeFallback: true,
  },
  {
    key: 'paulRobotham',
    label: 'Paul Robotham',
    description: 'Paul Robotham (dat.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['dat.'],
    prefKey: 'paulRobotham',
    nativeParser: { module: '@lib/import/formats/PaulRobothamParser', parseFn: 'parsePaulRobothamFile', detectFn: 'isPaulRobothamFormat' },
    uadeFallback: true,
  },
  {
    key: 'pierreAdane',
    label: 'Pierre Adane',
    description: 'Pierre Adane (pap.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['pap.'],
    prefKey: 'pierreAdane',
    nativeParser: { module: '@lib/import/formats/PierreAdaneParser', parseFn: 'parsePierreAdaneFile', detectFn: 'isPierreAdaneFormat' },
    uadeFallback: true,
  },
  {
    key: 'anders0land',
    label: 'Anders Øland',
    description: 'Anders Øland (hot.* prefix / .hot extension)',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.hot$/i,
    prefixes: ['hot.'],
    prefKey: 'anders0land',
    nativeParser: { module: '@lib/import/formats/Anders0landParser', parseFn: 'parseAnders0landFile', detectFn: 'isAnders0landFormat' },
    uadeFallback: true,
  },
  {
    key: 'andrewParton',
    label: 'Andrew Parton',
    description: 'Andrew Parton (bye.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['bye.'],
    prefKey: 'andrewParton',
    nativeParser: { module: '@lib/import/formats/AndrewPartonParser', parseFn: 'parseAndrewPartonFile', detectFn: 'isAndrewPartonFormat' },
    uadeFallback: true,
  },
  {
    key: 'customMade',
    label: 'Custom Made',
    description: 'Custom Made (cm.*/rk.*/rkb.* prefix / .cm extension)',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.cm$/i,
    prefixes: ['cm.'],
    prefKey: 'customMade',
    nativeParser: { module: '@lib/import/formats/CustomMadeParser', parseFn: 'parseCustomMadeFile', detectFn: 'isCustomMadeFormat' },
    uadeFallback: true,
  },
  {
    key: 'benDaglishSID',
    label: 'Ben Daglish SID',
    description: 'Ben Daglish SID (bds.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['bds.'],
    prefKey: 'benDaglishSID',
    nativeParser: { module: '@lib/import/formats/BenDaglishSIDParser', parseFn: 'parseBenDaglishSIDFile', detectFn: 'isBenDaglishSIDFormat' },
    uadeFallback: true,
  },
  {
    key: 'digitalSonixChrome',
    label: 'Digital Sonix Chrome',
    description: 'Digital Sonix Chrome (dsc.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['dsc.'],
    prefKey: 'digitalSonixChrome',
    nativeParser: { module: '@lib/import/formats/DigitalSonixChromeParser', parseFn: 'parseDigitalSonixChromeFile', detectFn: 'isDigitalSonixChromeFormat' },
    uadeFallback: true,
  },
  {
    key: 'jesperOlsen',
    label: 'Jesper Olsen',
    description: 'Jesper Olsen (jo.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['jo.'],
    prefKey: 'jesperOlsen',
    nativeParser: { module: '@lib/import/formats/JesperOlsenParser', parseFn: 'parseJesperOlsenFile', detectFn: 'isJesperOlsenFormat' },
    uadeFallback: true,
  },
  {
    key: 'kimChristensen',
    label: 'Kim Christensen',
    description: 'Kim Christensen (kim.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['kim.'],
    prefKey: 'kimChristensen',
    nativeParser: { module: '@lib/import/formats/KimChristensenParser', parseFn: 'parseKimChristensenFile', detectFn: 'isKimChristensenFormat' },
    uadeFallback: true,
  },
  {
    key: 'ashleyHogg',
    label: 'Ashley Hogg',
    description: 'Ashley Hogg (ash.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['ash.'],
    prefKey: 'ashleyHogg',
    nativeParser: { module: '@lib/import/formats/AshleyHoggParser', parseFn: 'parseAshleyHoggFile', detectFn: 'isAshleyHoggFormat' },
    uadeFallback: true,
  },
  {
    key: 'adpcmMono',
    label: 'ADPCM Mono',
    description: 'ADPCM Mono (adpcm.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['adpcm.'],
    prefKey: 'adpcmMono',
    nativeParser: { module: '@lib/import/formats/ADPCMmonoParser', parseFn: 'parseADPCMmonoFile', detectFn: 'isADPCMmonoFormat' },
    uadeFallback: true,
  },
  {
    key: 'janneSalmijarvi',
    label: 'Janne Salmijärvi',
    description: 'Janne Salmijärvi (js.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['js.'],
    prefKey: 'janneSalmijarvi',
    nativeParser: { module: '@lib/import/formats/JanneSalmijarviParser', parseFn: 'parseJanneSalmijarviFile', detectFn: 'isJanneSalmijarviFormat' },
    uadeFallback: true,
  },
  {
    key: 'jochenHippel7V',
    label: 'Jochen Hippel 7V',
    description: 'Jochen Hippel 7V (hip7.*/s7g.* prefix / .hip7 extension)',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.hip7$/i,
    prefixes: ['hip7.', 's7g.'],
    prefKey: 'jochenHippel7V',
    nativeParser: { module: '@lib/import/formats/JochenHippel7VParser', parseFn: 'parseJochenHippel7VFile', detectFn: 'isJochenHippel7VFormat' },
    uadeFallback: true,
  },
  {
    key: 'maximumEffect',
    label: 'Maximum Effect',
    description: 'Maximum Effect (max.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['max.'],
    prefKey: 'maximumEffect',
    nativeParser: { module: '@lib/import/formats/MaximumEffectParser', parseFn: 'parseMaximumEffectFile', detectFn: 'isMaximumEffectFormat' },
    uadeFallback: true,
  },
  {
    key: 'midiLoriciel',
    label: 'MIDI Loriciel',
    description: 'MIDI Loriciel (midi.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['midi.'],
    prefKey: 'midiLoriciel',
    nativeParser: { module: '@lib/import/formats/MIDILoricielParser', parseFn: 'parseMIDILoricielFile', detectFn: 'isMIDILoricielFormat' },
    uadeFallback: true,
  },
  {
    key: 'onEscapee',
    label: 'On Escapee',
    description: 'On Escapee (one.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['one.'],
    prefKey: 'onEscapee',
    nativeParser: { module: '@lib/import/formats/OnEscapeeParser', parseFn: 'parseOnEscapeeFile', detectFn: 'isOnEscapeeFormat' },
    uadeFallback: true,
  },
  {
    key: 'paulTonge',
    label: 'Paul Tonge',
    description: 'Paul Tonge (pat.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['pat.'],
    prefKey: 'paulTonge',
    nativeParser: { module: '@lib/import/formats/PaulTongeParser', parseFn: 'parsePaulTongeFile', detectFn: 'isPaulTongeFormat' },
    uadeFallback: true,
  },
  {
    key: 'robHubbardST',
    label: 'Rob Hubbard ST',
    description: 'Rob Hubbard ST (rho.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['rho.'],
    prefKey: 'robHubbardST',
    nativeParser: { module: '@lib/import/formats/RobHubbardSTParser', parseFn: 'parseRobHubbardSTFile', detectFn: 'isRobHubbardSTFormat' },
    uadeFallback: true,
  },
  {
    key: 'maniacsOfNoise',
    label: 'Maniacs of Noise',
    description: 'Maniacs of Noise (mon.* prefix, NOT mon_old.*)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['mon.'],
    prefKey: 'maniacsOfNoise',
    nativeParser: { module: '@lib/import/formats/ManiacsOfNoiseParser', parseFn: 'parseManiacsOfNoiseFile', detectFn: 'isManiacsOfNoiseFormat' },
    uadeFallback: true,
    customDispatch: true, // Must exclude mon_old.* (handled by jeroenTel)
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // C64 / CHIP ENGINES
  // ═══════════════════════════════════════════════════════════════════════════
  {
    key: 'goatTracker',
    label: 'GoatTracker',
    description: 'GoatTracker SID tracker song (GTS magic)',
    family: 'c64-chip',
    matchMode: 'extension',
    extRegex: /\.sng$/i,
    nativeOnly: true,
    customDispatch: true, // Magic-byte detection (GTS!..GTS5), also Zound Monitor uses .sng
  },
  {
    key: 'c64sid',
    label: 'C64 SID',
    description: 'Commodore 64 SID (PSID/RSID) — C64SIDEngine',
    family: 'c64-chip',
    matchMode: 'extension',
    extRegex: /\.sid$/i,
    nativeOnly: true,
    nativeParser: { module: '@lib/import/formats/SIDParser', parseFn: 'parseSIDFile', detectFn: 'isSIDFormat' },
    hasMetadata: true,
    customDispatch: true, // .sid is ambiguous: PSID/RSID first, then SidMon1, then UADE
  },
  {
    key: 'sidFactory2',
    label: 'SID Factory II',
    description: 'SID Factory II project file (.sf2) — PSID-wrapped C64SIDEngine',
    family: 'c64-chip',
    matchMode: 'extension',
    extRegex: /\.sf2$/i,
    nativeOnly: true,
    nativeParser: { module: '@lib/import/formats/SIDFactory2Parser', parseFn: 'parseSIDFactory2File', detectFn: 'isSIDFactory2File' },
    customDispatch: true, // Must distinguish from SoundFont (.sf2 = RIFF header)
  },
  {
    key: 'cheesecutter',
    label: 'CheeseCutter',
    description: 'CheeseCutter C64 SID tracker (.ct)',
    family: 'c64-chip',
    matchMode: 'extension',
    extRegex: /\.ct$/i,
    nativeOnly: true,
    customDispatch: true,
    nativeParser: {
      module: '@lib/import/formats/CheeseCutterParser',
      parseFn: 'parseCheeseCutterFile',
      detectFn: 'isCheeseCutterFile',
    },
  },

  // ── Chip dump formats ─────────────────────────────────────────────────────
  {
    key: 'vgm',
    label: 'VGM',
    description: 'Video Game Music register dumps',
    family: 'chip-dump',
    matchMode: 'extension',
    extRegex: /\.(vgm|vgz)$/i,
    nativeOnly: true,
    nativeParser: { module: '@lib/import/formats/VGMParser', parseFn: 'parseVGMFile' },
  },
  {
    key: 'ym',
    label: 'YM',
    description: 'Atari ST AY/YM2149 register dumps',
    family: 'chip-dump',
    matchMode: 'extension',
    extRegex: /\.ym$/i,
    nativeOnly: true,
    nativeParser: { module: '@lib/import/formats/YMParser', parseFn: 'parseYMFile' },
  },
  {
    key: 'nsf',
    label: 'NSF',
    description: 'NES Sound Format',
    family: 'chip-dump',
    matchMode: 'extension',
    extRegex: /\.nsfe?$/i,
    nativeOnly: true,
    nativeParser: { module: '@lib/import/formats/NSFParser', parseFn: 'parseNSFFile' },
  },
  {
    key: 'sap',
    label: 'SAP',
    description: 'Atari 8-bit POKEY',
    family: 'chip-dump',
    matchMode: 'extension',
    extRegex: /\.sap$/i,
    nativeOnly: true,
    nativeParser: { module: '@lib/import/formats/SAPParser', parseFn: 'parseSAPFile' },
  },
  {
    key: 'asap-native',
    label: 'ASAP',
    description: 'Atari 8-bit POKEY native formats (CMC/RMT/TMC/DLT/MPT)',
    family: 'chip-dump',
    matchMode: 'extension',
    extRegex: /\.(cmc|cm3|cmr|cms|dmc|dlt|mpt|mpd|rmt|tmc|tm8|tm2|fc)$/i,
    nativeOnly: true,
    nativeParser: { module: '@lib/import/formats/AsapParser', parseFn: 'parseAsapFile' },
  },
  {
    key: 'ay',
    label: 'AY',
    description: 'ZX Spectrum AY (ZXAYEMUL)',
    family: 'chip-dump',
    matchMode: 'extension',
    extRegex: /\.ay$/i,
    nativeOnly: true,
    nativeParser: { module: '@lib/import/formats/AYParser', parseFn: 'parseAYFile' },
  },
  {
    key: 's98',
    label: 'S98',
    description: 'Japanese computer FM register dumps (PC-88/PC-98/MSX)',
    family: 'chip-dump',
    matchMode: 'extension',
    extRegex: /\.s98$/i,
    nativeOnly: true,
    nativeParser: { module: '@lib/import/formats/S98Parser', parseFn: 'parseS98File' },
  },
  {
    key: 'gbs',
    label: 'GBS',
    description: 'Game Boy Sound System',
    family: 'chip-dump',
    matchMode: 'extension',
    extRegex: /\.gbs$/i,
    nativeOnly: true,
    nativeParser: { module: '@lib/import/formats/GBSParser', parseFn: 'parseGBSFile' },
  },
  {
    key: 'hes',
    label: 'HES',
    description: 'PC Engine / TurboGrafx-16 sound',
    family: 'chip-dump',
    matchMode: 'extension',
    extRegex: /\.hes$/i,
    nativeOnly: true,
    nativeParser: { module: '@lib/import/formats/HESParser', parseFn: 'parseHESFile' },
  },
  {
    key: 'kss',
    label: 'KSS',
    description: 'MSX music (AY/SCC/FM)',
    family: 'chip-dump',
    matchMode: 'extension',
    extRegex: /\.kss$/i,
    nativeOnly: true,
    nativeParser: { module: '@lib/import/formats/KSSParser', parseFn: 'parseKSSFile' },
  },
  {
    key: 'spc',
    label: 'SPC',
    description: 'Super Nintendo SPC700 sound',
    family: 'chip-dump',
    matchMode: 'extension',
    extRegex: /\.spc$/i,
    nativeOnly: true,
    nativeParser: { module: '@lib/import/formats/SPCParser', parseFn: 'parseSPCFile' },
  },
  {
    key: 'mdx',
    label: 'MDX',
    description: 'Sharp X68000 music (YM2151 + ADPCM)',
    family: 'chip-dump',
    matchMode: 'extension',
    extRegex: /\.mdx$/i,
    nativeOnly: true,
    nativeParser: { module: '@lib/import/formats/MDXParser', parseFn: 'parseMDXFile' },
  },
  {
    key: 'sndh',
    label: 'SNDH/SC68',
    description: 'Atari ST music (YM2149)',
    family: 'chip-dump',
    matchMode: 'extension',
    extRegex: /\.(sndh|sc68)$/i,
    nativeOnly: true,
    nativeParser: { module: '@lib/import/formats/SNDHParser', parseFn: 'parseSNDHFile' },
    hasMetadata: true,
  },
  {
    key: 'qsf',
    label: 'QSF',
    description: 'Capcom QSound (CPS1/CPS2 arcade)',
    family: 'chip-dump',
    matchMode: 'extension',
    extRegex: /\.(qsf|miniqsf)$/i,
    nativeOnly: true,
    nativeParser: { module: '@lib/import/formats/QsfParser', parseFn: 'parseQsfFile', detectFn: 'isQsfFormat' },
    hasMetadata: true,
  },
  {
    key: 'pmd',
    label: 'PMD',
    description: 'PC-98 Professional Music Driver (YM2608)',
    family: 'chip-dump',
    matchMode: 'extension',
    extRegex: /\.(m|m2|mz|pmd)$/i,
    nativeOnly: true,
    nativeParser: { module: '@lib/import/formats/PMDParser', parseFn: 'parsePMDFile', detectFn: 'isPMDFormat' },
  },
  {
    key: 'fmp',
    label: 'FMP (PLAY6)',
    description: 'PC-98 FMP/PLAY6 music driver (YM2608 OPNA)',
    family: 'chip-dump',
    matchMode: 'extension',
    extRegex: /\.(opi|ovi|ozi)$/i,
    nativeOnly: true,
    nativeParser: { module: '@lib/import/formats/FmplayerParser', parseFn: 'parseFmplayerFile', detectFn: 'isFmplayerFormat' },
  },
  {
    key: 'adplug',
    label: 'AdPlug',
    description: 'PC AdLib/OPL music formats',
    family: 'chip-dump',
    matchMode: 'extension',
    extRegex: /\.(rad|hsc|cmf|d00|dro|imf|sa2|lds|sci|got|bam|cff|dtm|mkj|rix|jbm|a2m|a2t|amd|xad|adl|agd|bmf|dfm|dmo|ha2|hsp|hsq|laa|mad|mdi|mdy|mkf|msc|mtk|mtr|pis|plx|rac|rol|sat|sdb|sop|sqx|xms|xsm|edl|dtl|as3m|adlib|wlf)$/i,
    nativeOnly: true,
    nativeParser: { module: '@lib/import/formats/AdPlugParser', parseFn: 'parseAdPlugFile' },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // WASM-ONLY REPLAY — Extension registration for formats handled by
  // AmigaFormatParsers (no native parser reference — routing is in AmigaFormatParsers)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    key: 'pxtone',
    label: 'PxTone',
    description: 'PxTone Collage / Tune by Studio Pixel',
    family: 'chip-dump',
    matchMode: 'extension',
    extRegex: /\.(ptcop|pttune)$/i,
    nativeOnly: true,
  },
  {
    key: 'organya',
    label: 'Organya',
    description: 'Organya (Cave Story) music format',
    family: 'chip-dump',
    matchMode: 'extension',
    extRegex: /\.org$/i,
    nativeOnly: true,
  },
  {
    key: 'eupmini',
    label: 'EUP',
    description: 'FM Towns EUP music (YM2612 + SSG + ADPCM)',
    family: 'chip-dump',
    matchMode: 'extension',
    extRegex: /\.eup$/i,
    nativeOnly: true,
  },
  {
    key: 'ixalance',
    label: 'IXS',
    description: 'Impulse Tracker variant (IXS/Ixalance)',
    family: 'chip-dump',
    matchMode: 'extension',
    extRegex: /\.ixs$/i,
    nativeOnly: true,
  },
  {
    key: 'cpsycle',
    label: 'Psycle',
    description: 'Psycle modular tracker',
    family: 'chip-dump',
    matchMode: 'extension',
    extRegex: /\.psy$/i,
    nativeOnly: true,
  },
  {
    key: 'zxtune',
    label: 'ZXTune',
    description: 'ZX Spectrum / AY-3-8910 chiptune formats',
    family: 'chip-dump',
    matchMode: 'extension',
    extRegex: /\.(pt3|pt2|pt1|stc|st1|st3|vtx|psg|sqt|psc|asc|gtr|ftc|ayc|cop|tfc|tfd|tf0|pdt|chi|str|dst|dmm|et1)$/i,
    nativeOnly: true,
  },
  {
    key: 'v2m',
    label: 'V2M',
    description: 'Farbrausch V2 Synthesizer Music — demoscene synth format',
    family: 'chip-dump',
    matchMode: 'extension',
    extRegex: /\.v2m$/i,
    nativeOnly: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PC TRACKER — Native parser + libopenmpt fallback
  // ═══════════════════════════════════════════════════════════════════════════
  {
    key: 'composer667',
    label: 'Composer 667',
    description: 'CDFM/Composer 667 — native parser or libopenmpt',
    family: 'pc-tracker',
    matchMode: 'extension',
    extRegex: /\.667$/i,
    prefKey: 'composer667',
    nativeParser: { module: '@lib/import/formats/Composer667Parser', parseFn: 'parseComposer667File', detectFn: 'isComposer667Format' },
    libopenmptFallback: true,
  },
  {
    key: 'fmTracker',
    label: 'FM Tracker',
    description: 'Davey W Taylor FM Tracker — native parser or libopenmpt',
    family: 'pc-tracker',
    matchMode: 'extension',
    extRegex: /\.fmt$/i,
    prefKey: 'fmTracker',
    nativeParser: { module: '@lib/import/formats/FMTrackerParser', parseFn: 'parseFMTrackerFile', detectFn: 'isFMTrackerFormat' },
    libopenmptFallback: true,
  },
  {
    key: 'imagoOrpheus',
    label: 'Imago Orpheus',
    description: 'Imago Orpheus — native parser or libopenmpt',
    family: 'pc-tracker',
    matchMode: 'extension',
    extRegex: /\.imf$/i,
    prefKey: 'imagoOrpheus',
    nativeParser: { module: '@lib/import/formats/ImagoOrpheusParser', parseFn: 'parseImagoOrpheusFile', detectFn: 'isImagoOrpheusFormat' },
    libopenmptFallback: true,
    libopenmptPlayable: true,
  },
  {
    key: 'cdfm67',
    label: 'CDFM Composer 670',
    description: 'CDFM Composer 670 — native parser or libopenmpt',
    family: 'pc-tracker',
    matchMode: 'extension',
    extRegex: /\.c67$/i,
    prefKey: 'cdfm67',
    nativeParser: { module: '@lib/import/formats/CDFM67Parser', parseFn: 'parseCDFM67File', detectFn: 'isCDFM67Format' },
    libopenmptFallback: true,
  },
  {
    key: 'easyTrax',
    label: 'EasyTrax',
    description: 'EasyTrax — native parser or libopenmpt',
    family: 'pc-tracker',
    matchMode: 'extension',
    extRegex: /\.etx$/i,
    prefKey: 'easyTrax',
    nativeParser: { module: '@lib/import/formats/EasyTraxParser', parseFn: 'parseEasyTraxFile', detectFn: 'isEasyTraxFormat' },
    libopenmptFallback: true,
  },
  {
    key: 'karlMorton',
    label: 'Karl Morton',
    description: 'Karl Morton .mus — native parser or libopenmpt',
    family: 'pc-tracker',
    matchMode: 'extension',
    extRegex: /\.mus$/i,
    prefKey: 'karlMorton',
    nativeParser: { module: '@lib/import/formats/KarlMortonParser', parseFn: 'parseKarlMortonFile', detectFn: 'isKarlMortonFormat' },
    libopenmptFallback: true,
    customDispatch: true, // .mus is ambiguous: Karl Morton vs UFO/MicroProse
  },
  {
    key: 'xmf',
    label: 'XMF',
    description: 'Astroidea XMF / Imperium Galactica',
    family: 'pc-tracker',
    matchMode: 'extension',
    extRegex: /\.xmf$/i,
    prefKey: 'xmf',
    nativeParser: { module: '@lib/import/formats/XMFParser', parseFn: 'parseXMFFile', detectFn: 'isXMFFormat' },
    libopenmptFallback: true,
  },
  {
    key: 'uax',
    label: 'UAX',
    description: 'Unreal Audio Package',
    family: 'pc-tracker',
    matchMode: 'extension',
    extRegex: /\.uax$/i,
    prefKey: 'uax',
    nativeParser: { module: '@lib/import/formats/UAXParser', parseFn: 'parseUAXFile' },
    nativeOnly: true,
  },
  {
    key: 'madTracker2',
    label: 'MadTracker 2',
    description: 'MadTracker 2 — native parser or libopenmpt',
    family: 'pc-tracker',
    matchMode: 'extension',
    extRegex: /\.mt2$/i,
    prefKey: 'madTracker2',
    nativeParser: { module: '@lib/import/formats/MadTracker2Parser', parseFn: 'parseMadTracker2File', detectFn: 'isMadTracker2Format' },
    libopenmptFallback: true,
    libopenmptPlayable: true,
  },
  {
    key: 'psm',
    label: 'PSM',
    description: 'PSM/PSM16 — native parser or libopenmpt',
    family: 'pc-tracker',
    matchMode: 'extension',
    extRegex: /\.psm$/i,
    prefKey: 'psm',
    nativeParser: { module: '@lib/import/formats/PSMParser', parseFn: 'parsePSMFile', detectFn: 'isPSMFormat' },
    libopenmptFallback: true,
    libopenmptPlayable: true,
  },
  // Native-first PC trackers that fall through to libopenmpt (no pref toggle)
  {
    key: 'unic',      label: 'UNIC Tracker',       description: 'UNIC Tracker',          family: 'pc-tracker', matchMode: 'both', extRegex: /\.unic$/i, prefixes: ['unic.'], nativeParser: { module: '@lib/import/formats/UNICParser', parseFn: 'parseUNICFile', detectFn: 'isUNICFormat' }, libopenmptFallback: true,
  },
  {
    key: 'mtm',       label: 'MultiTracker',        description: 'MultiTracker',           family: 'pc-tracker', matchMode: 'extension', extRegex: /\.mtm$/i,  nativeParser: { module: '@lib/import/formats/MTMParser', parseFn: 'parseMTMFile', detectFn: 'isMTMFormat' }, libopenmptFallback: true,
  },
  {
    key: '669',       label: 'Composer 669',         description: 'Composer 669',           family: 'pc-tracker', matchMode: 'extension', extRegex: /\.669$/i,  nativeParser: { module: '@lib/import/formats/Format669Parser', parseFn: 'parse669File', detectFn: 'is669Format' }, libopenmptFallback: true,
  },
  {
    key: 'far',       label: 'Farandole Composer',   description: 'Farandole Composer',     family: 'pc-tracker', matchMode: 'extension', extRegex: /\.far$/i,  nativeParser: { module: '@lib/import/formats/FARParser', parseFn: 'parseFARFile', detectFn: 'isFARFormat' }, libopenmptFallback: true,
  },
  {
    key: 'plm',       label: 'Disorder Tracker 2',   description: 'Disorder Tracker 2',     family: 'pc-tracker', matchMode: 'extension', extRegex: /\.plm$/i,  nativeParser: { module: '@lib/import/formats/PLMParser', parseFn: 'parsePLMFile', detectFn: 'isPLMFormat' }, libopenmptFallback: true,
  },
  {
    key: 'ult',       label: 'Ultra Tracker',        description: 'Ultra Tracker',          family: 'pc-tracker', matchMode: 'extension', extRegex: /\.ult$/i,  nativeParser: { module: '@lib/import/formats/ULTParser', parseFn: 'parseULTFile', detectFn: 'isULTFormat' }, libopenmptFallback: true,
  },
  {
    key: 'rtm',       label: 'Reality Tracker',      description: 'Reality Tracker',        family: 'pc-tracker', matchMode: 'extension', extRegex: /\.rtm$/i,  nativeParser: { module: '@lib/import/formats/RTMParser', parseFn: 'parseRTMFile', detectFn: 'isRTMFormat' }, libopenmptFallback: true,
  },
  {
    key: 'dsm',       label: 'DSIK Sound Module',    description: 'DSIK Sound Module',      family: 'pc-tracker', matchMode: 'extension', extRegex: /\.dsm$/i,  nativeParser: { module: '@lib/import/formats/DSMParser', parseFn: 'parseDSMFile', detectFn: 'isDSMFormat' }, libopenmptFallback: true,
  },
  {
    key: 'dtm',       label: 'Digital Tracker',      description: 'Digital Tracker',        family: 'pc-tracker', matchMode: 'extension', extRegex: /\.dtm$/i,  nativeParser: { module: '@lib/import/formats/DTMParser', parseFn: 'parseDTMFile', detectFn: 'isDTMFormat' }, libopenmptFallback: true,
  },
  {
    key: 'stm',       label: 'ScreamTracker 2',      description: 'ScreamTracker 2',        family: 'pc-tracker', matchMode: 'extension', extRegex: /\.stm$/i,  nativeParser: { module: '@lib/import/formats/STMParser', parseFn: 'parseSTMFile', detectFn: 'isSTMFormat' }, libopenmptFallback: true,
  },
  {
    key: 'stx',       label: 'ScreamTracker STMIK',  description: 'ScreamTracker STMIK',    family: 'pc-tracker', matchMode: 'extension', extRegex: /\.stx$/i,  nativeParser: { module: '@lib/import/formats/STXParser', parseFn: 'parseSTXFile', detectFn: 'isSTXFormat' }, libopenmptFallback: true,
  },
  {
    key: 'nru',       label: 'NoiseRunner',          description: 'NoiseRunner',            family: 'pc-tracker', matchMode: 'extension', extRegex: /\.nru$/i,  nativeParser: { module: '@lib/import/formats/NRUParser', parseFn: 'parseNRUFile', detectFn: 'isNRUFormat' }, libopenmptFallback: true,
  },
  {
    key: 'ptm',       label: 'PolyTracker',          description: 'PolyTracker',            family: 'pc-tracker', matchMode: 'extension', extRegex: /\.ptm$/i,  nativeParser: { module: '@lib/import/formats/PTMParser', parseFn: 'parsePTMFile', detectFn: 'isPTMFormat' }, libopenmptFallback: true,
  },
  {
    key: 'gdm',       label: 'General DigiMusic',    description: 'General DigiMusic',      family: 'pc-tracker', matchMode: 'extension', extRegex: /\.gdm$/i,  nativeParser: { module: '@lib/import/formats/GDMParser', parseFn: 'parseGDMFile', detectFn: 'isGDMFormat' }, libopenmptFallback: true,
  },
  {
    key: 'stk',       label: 'Ultimate SoundTracker', description: 'Ultimate SoundTracker', family: 'pc-tracker', matchMode: 'extension', extRegex: /\.stk$/i,  nativeParser: { module: '@lib/import/formats/STKParser', parseFn: 'parseSTKFile', detectFn: 'isSTKFormat' }, libopenmptFallback: true,
  },
  {
    key: 'stp',       label: 'SoundTracker Pro II',  description: 'SoundTracker Pro II',    family: 'pc-tracker', matchMode: 'extension', extRegex: /\.stp$/i,  nativeParser: { module: '@lib/import/formats/STPParser', parseFn: 'parseSTPFile', detectFn: 'isSTPFormat' }, libopenmptFallback: true,
  },
  {
    key: 'mdl',       label: 'DigiTrakker',          description: 'DigiTrakker',            family: 'pc-tracker', matchMode: 'extension', extRegex: /\.mdl$/i,  nativeParser: { module: '@lib/import/formats/MDLParser', parseFn: 'parseMDLFile', detectFn: 'isMDLFormat' }, libopenmptFallback: true,
  },
  {
    key: 'amf',       label: 'Advanced Music Format', description: 'Advanced Music Format', family: 'pc-tracker', matchMode: 'extension', extRegex: /\.amf$/i,  nativeParser: { module: '@lib/import/formats/AMFParser', parseFn: 'parseAMFFile', detectFn: 'isAMFFormat' }, libopenmptFallback: true,
  },
  {
    key: 'j2b',       label: 'Galaxy Sound System',   description: 'Galaxy Sound System (MASI)', family: 'pc-tracker', matchMode: 'extension', extRegex: /\.j2b$/i, libopenmptFallback: true, libopenmptPlayable: true,
  },
  {
    key: 'mo3',       label: 'MO3 Compressed',        description: 'MO3 Compressed Module (MOD/XM/IT/S3M)', family: 'pc-tracker', matchMode: 'extension', extRegex: /\.mo3$/i, libopenmptFallback: true, libopenmptPlayable: true,
  },
  {
    key: 'itp',       label: 'IT Project',             description: 'Impulse Tracker Project', family: 'pc-tracker', matchMode: 'extension', extRegex: /\.itp$/i, libopenmptFallback: true, libopenmptPlayable: true,
  },
  {
    key: 'nst',       label: 'NoiseTracker',           description: 'NoiseTracker (15-instrument MOD)', family: 'pc-tracker', matchMode: 'extension', extRegex: /\.nst$/i, libopenmptFallback: true, libopenmptPlayable: true,
  },
  {
    key: 'wow',       label: "Mod's Grave WOW",        description: "Mod's Grave WOW (8-channel MOD)", family: 'pc-tracker', matchMode: 'extension', extRegex: /\.wow$/i, libopenmptFallback: true, libopenmptPlayable: true,
  },
  {
    key: 'ufo',
    label: 'UFO',
    description: 'UFO / MicroProse — .ufo/.mus',
    family: 'amiga-native',
    matchMode: 'extension',
    extRegex: /\.ufo$/i,
    prefKey: 'ufo',
    nativeParser: { module: '@lib/import/formats/UFOParser', parseFn: 'parseUFOFile', detectFn: 'isUFOFormat' },
    uadeFallback: true,
  },
  {
    key: 'kt',
    label: 'Klystrack',
    description: 'Klystrack chiptune tracker (.kt)',
    family: 'amiga-native',
    matchMode: 'extension',
    extRegex: /\.(kt|ki)$/i,
    prefKey: 'kt',
    nativeParser: { module: '@lib/import/formats/KlysParser', parseFn: 'parseKlystrack', detectFn: 'isKlystrack' },
    hasMetadata: true,
  },
  {
    key: 'earAche',
    label: 'EarAche',
    description: 'EarAche synthesis tracker by Morten Grouleff (ea.* prefix, EASO magic)',
    family: 'amiga-native',
    matchMode: 'both',
    prefixes: ['ea.'],
    extRegex: /\.ea$/i,
    prefKey: 'earAche',
    nativeParser: { module: '@lib/import/formats/EarAcheParser', parseFn: 'parseEarAcheFile', detectFn: 'isEarAcheFormat' },
    uadeFallback: true,
  },
  {
    key: 'scumm',
    label: 'SCUMM',
    description: 'LucasArts SCUMM Amiga music (scumm.* prefix / .scumm suffix) — self-contained 68k binary',
    family: 'amiga-native',
    matchMode: 'both',
    prefixes: ['scumm.'],
    extRegex: /\.scumm$/i,
    prefKey: 'scumm',
    nativeParser: { module: '@lib/import/formats/SCUMMParser', parseFn: 'parseSCUMMFile', detectFn: 'isSCUMMFormat' },
    uadeFallback: true,
  },

  // ── SunTronic / TSM (The Sun Machine) ────────────────────────────────────
  {
    key: 'suntronic',
    label: 'SunTronic',
    description: 'SunTronic / TSM — The Sun Machine (Amiga synth exe, tsm.* prefix / .sun extension)',
    family: 'amiga-native',
    matchMode: 'both',
    extRegex: /\.(sun|tsm)$/i,
    prefixes: ['tsm.'],
    prefKey: 'suntronic',
    nativeParser: { module: '@lib/import/formats/SunTronicParser', parseFn: 'parseSunTronicFile', detectFn: 'isSunTronicFormat' },
    uadeFallback: true,
  },

  // ── GlueMon ─────────────────────────────────────────────────────────────
  {
    key: 'gluemon',
    label: 'GlueMon',
    description: 'GlueMon — Amiga tracker (glue.* / gm.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['glue.', 'gm.'],
    nativeParser: { module: '@lib/import/formats/GlueMonParser', parseFn: 'parseGlueMonFile', detectFn: 'isGlueMonFormat' },
    uadeFallback: true,
  },

  // ── Sean Connolly ───────────────────────────────────────────────────────
  {
    key: 'seanConnolly',
    label: 'Sean Connolly',
    description: 'Sean Connolly — Amiga tracker (s-c.* / scn.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['s-c.', 'scn.'],
    nativeParser: { module: '@lib/import/formats/SeanConnollyParser', parseFn: 'parseSeanConnollyFile', detectFn: 'isSeanConnollyFormat' },
    uadeFallback: true,
  },

  // ── SimpleAmigaStub formats (compiled 68k with chip RAM editing) ────────
  {
    key: 'artAndMagic',
    label: 'Art and Magic',
    description: 'Art and Magic — Amiga tracker (aam.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['aam.'],
    nativeParser: { module: '@lib/import/formats/SimpleAmigaStubParser', parseFn: 'parseArtAndMagicFile' },
    uadeFallback: true,
  },
  {
    key: 'mikeDavies',
    label: 'Mike Davies',
    description: 'Mike Davies — Amiga tracker (md.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['md.'],
    nativeParser: { module: '@lib/import/formats/SimpleAmigaStubParser', parseFn: 'parseMikeDaviesFile' },
    uadeFallback: true,
  },
  {
    key: 'markII',
    label: 'Mark II',
    description: 'Mark II — Amiga tracker (mk2.* / mkii.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['mk2.', 'mkii.'],
    nativeParser: { module: '@lib/import/formats/SimpleAmigaStubParser', parseFn: 'parseMarkIIFile' },
    uadeFallback: true,
  },
  {
    key: 'sonicArrangerSas',
    label: 'Sonic Arranger SAS',
    description: 'Sonic Arranger SAS — Amiga tracker (sas.* prefix)',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['sas.'],
    nativeParser: { module: '@lib/import/formats/SimpleAmigaStubParser', parseFn: 'parseSonicArrangerSasFile' },
    uadeFallback: true,
  },
  {
    key: 'aProSys',
    label: 'A-Pro-Sys',
    description: 'A-Pro-Sys — Amiga tracker',
    family: 'amiga-native',
    matchMode: 'prefix',
    prefixes: ['aps.'],
    nativeParser: { module: '@lib/import/formats/SimpleAmigaStubParser', parseFn: 'parseAProSysFile' },
    uadeFallback: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DEMOSCENE FORMATS — Renoise XRNS with VSTi synth extraction
  // ═══════════════════════════════════════════════════════════════════════════
  {
    key: 'xrns',
    label: 'Renoise',
    description: 'Renoise song with WaveSabre/Oidos/Tunefish synth extraction',
    family: 'pc-tracker',
    matchMode: 'extension',
    extRegex: /\.xrns$/i,
    nativeOnly: true,
    nativeParser: { module: '@lib/import/formats/XRNSParser', parseFn: 'parseXRNS' },
    hasMetadata: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // LIBOPENMPT — Standard tracker formats (native parser first, then libopenmpt)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    key: 'mod',
    label: 'ProTracker MOD',
    description: 'ProTracker / compatible .mod',
    family: 'libopenmpt',
    matchMode: 'extension',
    extRegex: /\.(mod|m15)$/i,
    prefKey: 'mod',
    nativeParser: { module: '@lib/import/formats/MODParser', parseFn: 'parseMODFile', detectFn: 'isMODFormat' },
    uadeFallback: true,
    libopenmptFallback: true,
  },
  {
    key: 'xm',
    label: 'FastTracker II XM',
    description: 'FastTracker II .xm',
    family: 'libopenmpt',
    matchMode: 'extension',
    extRegex: /\.xm$/i,
    nativeParser: { module: '@lib/import/formats/XMParser', parseFn: 'parseXMFile', detectFn: 'isXMFormat' },
    libopenmptFallback: true,
  },
  {
    key: 'it',
    label: 'Impulse Tracker',
    description: 'Impulse Tracker / OpenMPT .it/.mptm',
    family: 'libopenmpt',
    matchMode: 'extension',
    extRegex: /\.(it|mptm)$/i,
    nativeParser: { module: '@lib/import/formats/ITParser', parseFn: 'parseITFile', detectFn: 'isITFormat' },
    libopenmptFallback: true,
  },
  {
    key: 's3m',
    label: 'ScreamTracker 3',
    description: 'ScreamTracker 3 .s3m',
    family: 'libopenmpt',
    matchMode: 'extension',
    extRegex: /\.s3m$/i,
    nativeParser: { module: '@lib/import/formats/S3MParser', parseFn: 'parseS3MFile', detectFn: 'isS3MFormat' },
    libopenmptFallback: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Amiga format extensions routed by AmigaFormatParsers.ts
  // (catch-all so isSupportedFormat() accepts them before the parser routes)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    key: 'amiga_formats_catchall',
    label: 'Amiga Format',
    description: 'Amiga music formats handled by AmigaFormatParsers',
    family: 'amiga-native',
    matchMode: 'extension',
    extRegex: /\.(adpcm|adsc|alp|amc|aps|ash|bds|bye|cin|cm|dat|dln|dm|dm1|doda|dsc|dsr|dz|ex|fmt|fw|gray|hd|hip|hip7|hst|ins|jb|jcb|jcbo|jd|jmf|jo|jp|jpn|jpnd|jpo|jpold|js|jt|kh|kim|max|mc|mco|mcr|mdst|mok|mon|mon_old|mosh|mxtx|npp|ntp|one|osp|pap|pat|powt|prt|pt|pvp|qpa|qts|rho|s7g|sb|scr|sg|sjs|sm|sm1|sm2|sm3|smpro|snd|soc|thm|tits|tmk|ts|two|uds|wb)$/i,
    uadeFallback: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // UADE-ONLY — Prefix-based formats with no native parser
  // ═══════════════════════════════════════════════════════════════════════════
  ...([
    ['abk', 'AMOS'], ['agi', 'Sierra AGI'],
    ['ast', 'ActionAmics prefix'], ['bss', 'Beathoeven Synthesizer'],
    ['bfc', 'FutureComposer-BSI'], ['bsi', 'BSI'], ['fc-bsi', 'FC-BSI'],
    ['cus', 'Custom'], ['cust', 'Custom'], ['custom', 'Custom'],
    ['dh', 'David Hanney'], ['dns', 'Dynamic Synthesizer'], ['dz', 'Darius Zendeh'],
    ['mkiio', 'Mark II (O)'],
    ['mg', 'MG'], ['ems', 'EMS'], ['emsv6', 'EMS v6'],
    ['fw', 'Forgotten Worlds'],
    ['hd', 'Howie Davies'], ['hn', 'HN'], ['thn', 'THN'],
    ['mtp2', 'MajorTom 2'], ['arp', 'ARP'],
    ['hip', 'Jochen Hippel base'], ['mcmd', 'MCMD'], ['sog', 'SOG'],
    ['mok', 'Silmarils'], ['mso', 'Medley SO'],
    ['pn', 'Pokeynoise'],
    ['riff', 'RiffRaff'],
    ['sa-p', 'Sonic Arranger P'], ['lion', 'Lion'], ['sa_old', 'Sonic Arranger Old'],
    ['sdr', 'SynthDream'],
    ['spl', 'Sound Programming Language'], ['tw', 'TW'],
    ['sun', 'SUN-Tronic'], ['synmod', 'SynTracker'],
    ['tf', 'Tim Follin'],
    ['thx', 'AHX/THX prefix'],
    ['tfhd1.5', 'TFMX HD 1.5'], ['tfhd7v', 'TFMX HD 7V'], ['tfhdpro', 'TFMX HD Pro'],
    ['tfmx1.5', 'TFMX 1.5'], ['tfmx7v', 'TFMX 7V'], ['tfmxpro', 'TFMX Pro'],
    ['vss', 'Voodoo Supreme Synthesizer'],
    // Additional UADE-only prefixes (added for format test coverage)
    ['ah', 'Ashley Hogg'], ['bvs', 'Beathoven Synthesizer v2'],
    ['cba', 'ChipTracker Archive'], ['chip', 'ChipTracker'],
    ['cd', 'Core Design'], ['dlw', 'Dave Lowe WTD'],
    ['fp2', 'Future Player 2'], ['fredmon', 'Fred Editor Monitor'],
    ['mxt', 'MaxTrax'], ['nt', 'NoiseTracker'],
    ['ntsp', 'NTSP'], ['psum', 'Paul Summers'],
    ['rhst', 'Rob Hubbard ST'], ['rkl', 'Ron Klaren'],
    ['sc2', 'Sean Connolly 2'], ['sil', 'Silmarils v2'],
    ['tomy', 'TomyTracker'], ['st', 'SoundTracker prefix'],
    ['ins', 'InStereo!'],
  ] as const).map(([prefix, label]): FormatDefinition => ({
    key: `uade_${prefix.replace(/[.-]/g, '_')}`,
    label,
    description: `${label} — UADE only (${prefix}.* prefix)`,
    family: 'uade-only',
    matchMode: 'prefix',
    prefixes: [`${prefix}.`],
    uadeFallback: true,
  })),
];

// ─── Derived helpers (cached) ───────────────────────────────────────────────

let _extensionSetCache: Set<string> | null = null;
let _allExtensionsCache: string[] | null = null;

/** Extract all unique extensions from registry entries that have extRegex */
function buildExtensionSet(): Set<string> {
  if (_extensionSetCache) return _extensionSetCache;
  const exts = new Set<string>();
  for (const fmt of FORMAT_REGISTRY) {
    if (!fmt.extRegex) continue;
    // Extract extension literals from regex source, e.g. /\.(hvl|ahx)$/i → ['.hvl', '.ahx']
    const src = fmt.extRegex.source;
    const m = src.match(/^\\\.\(?([^)$]+)\)?\$$/);
    if (m) {
      for (const ext of m[1].split('|')) {
        exts.add(`.${ext.replace(/\\/g, '')}`);
      }
    }
  }
  _extensionSetCache = exts;
  return exts;
}

/**
 * Get all supported file extensions as an array of lowercase strings.
 * Replaces ModuleLoader.getSupportedExtensions().
 */
export function getFormatExtensions(): string[] {
  if (_allExtensionsCache) return _allExtensionsCache;
  _allExtensionsCache = [...buildExtensionSet()].sort();
  return _allExtensionsCache;
}

/**
 * Check if a filename matches any registered format.
 * Replaces ModuleLoader.isSupportedModule().
 */
export function isSupportedFormat(filename: string): boolean {
  const lower = filename.toLowerCase();
  const ext = lower.slice(lower.lastIndexOf('.'));
  if (buildExtensionSet().has(ext)) return true;
  // Check prefix-based formats (both prefix.name and name.prefix)
  const base = getBasename(lower);
  const extNoDot = ext.slice(1); // '.sog' → 'sog'
  if (FORMAT_REGISTRY.some(fmt =>
    fmt.prefixes?.some(p => base.startsWith(p) || p === `${extNoDot}.`)
  )) return true;
  // Fallback: check UADE extension/prefix list (covers ~80 PTK-Prowiz packed
  // format variants and other UADE-only formats not in the FORMAT_REGISTRY)
  return isUADEFormat(lower);
}

/**
 * Detect the format of a file by name (and optionally buffer for magic bytes).
 * Returns the first matching FormatDefinition or null.
 * Replaces detectNativeFormat() in ImportModuleDialog.
 */
export function detectFormat(filename: string): FormatDefinition | null {
  const lower = filename.toLowerCase();
  const base = getBasename(lower);
  const ext = lower.slice(lower.lastIndexOf('.') + 1);

  for (const fmt of FORMAT_REGISTRY) {
    if (fmt.matchMode === 'extension' || fmt.matchMode === 'both') {
      if (fmt.extRegex?.test(lower)) return fmt;
    }
    if (fmt.matchMode === 'prefix' || fmt.matchMode === 'both') {
      // Match both prefix form (prefix.songname) and extension form (songname.prefix)
      if (fmt.prefixes?.some(p => base.startsWith(p) || p === `${ext}.`)) return fmt;
    }
  }
  return null;
}

/**
 * Get all formats that are playable by libopenmpt in the ImportModuleDialog preview.
 */
export function getLibopenmptPlayableKeys(): Set<string> {
  return new Set(
    FORMAT_REGISTRY
      .filter(f => f.libopenmptPlayable)
      .map(f => f.key)
  );
}

/**
 * Get all format keys that are native-only (no UADE/libopenmpt toggle).
 */
export function getNativeOnlyKeys(): Set<string> {
  return new Set(
    FORMAT_REGISTRY
      .filter(f => f.nativeOnly)
      .map(f => f.key)
  );
}

/** Extract basename from a path (handles both / and \\ separators) */
function getBasename(filepath: string): string {
  return (filepath.split('/').pop() ?? filepath).split('\\').pop() ?? filepath;
}
