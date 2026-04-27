/**
 * Default constants, InstrumentConfig, and aggregate types
 */

import type { BeatSlice, BeatSliceConfig } from '../beatSlicer';
import type { EnvelopePoints, AutoVibrato } from '../tracker';
import type { PinkTromboneConfig } from '@engine/pinktrombone/PinkTromboneSynth';
export type { PinkTromboneConfig } from '@engine/pinktrombone/PinkTromboneSynth';
export { DEFAULT_PINK_TROMBONE } from '@engine/pinktrombone/PinkTromboneSynth';

import type { DECtalkConfig } from '@engine/dectalk/DECtalkSynth';
export type { DECtalkConfig } from '@engine/dectalk/DECtalkSynth';
export { DEFAULT_DECTALK } from '@engine/dectalk/DECtalkSynth';

import type {
  SynthType,
  OscillatorConfig,
  EnvelopeConfig,
  FilterConfig,
  FilterEnvelopeConfig,
  PitchEnvelopeConfig,
  ArpeggioConfig,
  LFOConfig,
  DeepPartial,
  InstrumentType,
  UADEChipRamInfo,
} from './base';
import type { EffectConfig } from './effects';
import type {
  TB303Config,
  WavetableConfig,
  HarmonicSynthConfig,
  GranularConfig,
  SuperSawConfig,
  PolySynthConfig,
  OrganConfig,
  ChipSynthConfig,
  PWMSynthConfig,
  StringMachineConfig,
  FormantSynthConfig,
  WobbleBassConfig,
  BuzzmachineConfig,
  DubSirenConfig,
  OscBassConfig,
  CrushBassConfig,
  SonarPingConfig,
  RadioRiserConfig,
  SubSwellConfig,
  SynareConfig,
  SpaceLaserConfig,
  SamConfig,
  WAMConfig,
  V2Config,
  V2SpeechConfig,
  RdPianoConfig,
  MAMEConfig,
  SuperColliderConfig,
  OpenWurliConfig,
  OPL3Config,
  DX7Config,
} from './tonejs';
import { VOWEL_FORMANTS } from './tonejs';
import type {
  FurnaceConfig,
} from './furnace';
import type {
  ChiptuneModuleConfig,
  GTUltraConfig,
  HivelyConfig,
  JamCrackerConfig,
  UADEConfig,
  SoundMonConfig,
  SidMonConfig,
  DigMugConfig,
  FCConfig,
  DeltaMusic1Config,
  DeltaMusic2Config,
  SonicArrangerConfig,
  FredConfig,
  TFMXConfig,
  HippelCoSoConfig,
  RobHubbardConfig,
  SteveTurnerConfig,
  SidMon1Config,
  OctaMEDConfig,
  DavidWhittakerConfig,
  SunVoxConfig,
  InStereo2Config,
  FuturePlayerConfig,
  SymphonieConfig,
  SF2Config,
  RonKlarenConfig,
  PreTrackerConfig,
  SawteethConfig,
  FmplayerConfig,
} from './exotic';
import type {
  DrumMachineConfig,
  DrumKitConfig,
} from './drums';

// ============================================================================
// Metadata & Sample Types
// ============================================================================

export interface InstrumentMetadata {
  importedFrom?: 'MOD' | 'XM' | 'IT' | 'S3M' | 'FUR' | 'XRNS';
  originalEnvelope?: EnvelopePoints; // Preserved point-based volume envelope for FT2 processing
  panningEnvelope?: EnvelopePoints; // Preserved panning envelope for FT2 processing
  autoVibrato?: AutoVibrato; // Preserved auto-vibrato settings
  fadeout?: number; // XM fadeout speed (0-4095), applied per tick on key-off
  sampleMap?: number[]; // XM note-to-sample mapping (96 entries, note 0-95 → sample index)
  multiSamples?: Array<{
    sample: SampleConfig;
    finetune: number;
    relativeNote: number;
    defaultVolume: number;
    panning?: number;
  }>; // All samples for this XM instrument (indexed by sampleMap values)
  preservedSample?: {
    audioBuffer: ArrayBuffer;
    url: string;
    baseNote: string;
    detune: number;
    loop: boolean;
    loopStart: number;
    loopEnd: number;
    envelope: EnvelopeConfig;
  };
  transformHistory?: Array<{
    timestamp: string;
    fromType: SynthType;
    toType: SynthType;
  }>;
  // MOD/XM period-based playback
  modPlayback?: {
    usePeriodPlayback: boolean; // If true, use period-based playback (Amiga)
    periodMultiplier: number; // AMIGA_PALFREQUENCY_HALF = 3546895
    finetune: number; // -8 to +7 (ProTracker) or -128 to +127 (XM)
    relativeNote?: number; // XM sample relative note (-96 to +95 semitones)
    defaultVolume?: number; // Sample's default volume (0-64) for channel init
    panning?: number; // Sample default panning (0-255, 128 = center)
    fadeout?: number; // Fadeout rate
  };
  envelopes?: Record<number, {
    volumeEnvelope?: EnvelopePoints;
    panningEnvelope?: EnvelopePoints;
    pitchEnvelope?: EnvelopePoints;
    fadeout?: number;
  }>;
  preservedSynth?: {
    synthType: SynthType;
    config: Partial<InstrumentConfig>;
    bakeType?: 'lite' | 'pro';
  };
  /** Optional display label override shown in the instrument list badge (e.g. "ML Sine", "ML Saw") */
  displayType?: string;
  /** MusicLine Editor waveform synth config (smplType > 0) — triggers synth editor instead of sample editor */
  mlSynthConfig?: { waveformType: number; volume: number };
  /** Raw .ml file bytes — set when loading a whole MusicLine song (song mode) */
  mlSongData?: Uint8Array;
  /** 0-based instrument index within the loaded .ml file (preview mode) */
  mlInstIdx?: number;
  /** Richard Joseph (.rjp / .sng) sample metadata stored by RichardJosephParser */
  rjpSample?: {
    loopStart: number;
    loopSize: number;
    hasLoop: boolean;
    lengthBytes: number;
  };
  /** FuturePlayer instrument pointer (from .fp import) */
  fpInstrPtr?: number;
}

export interface SampleConfig {
  audioBuffer?: ArrayBuffer;
  url: string;
  multiMap?: Record<string, string>; // Note (e.g. "C4") -> URL map for multi-sampling
  baseNote: string; // "C-4"
  detune: number; // -100 to +100 cents

  // Regular loop (plays after note-off if sustainLoop is enabled)
  loop: boolean;
  loopType?: 'off' | 'forward' | 'pingpong'; // Loop mode
  loopStart: number; // Sample frame index
  loopEnd: number; // Sample frame index

  // Sustain loop (IT-style: plays while note is held, then switches to regular loop)
  sustainLoop?: boolean;
  sustainLoopType?: 'off' | 'forward' | 'pingpong';
  sustainLoopStart?: number; // Sample frame index
  sustainLoopEnd?: number; // Sample frame index

  sampleRate?: number; // For converting loop points to seconds (default 8363 Hz for MOD)
  reverse: boolean;
  playbackRate: number; // 0.25-4x

  // Beat slicer data
  slices?: BeatSlice[];
  sliceConfig?: BeatSliceConfig;

  // Reference-based slicing (memory optimization)
  sourceInstrumentId?: number; // Reference to the original instrument
  sliceStart?: number; // Start frame in the source buffer
  sliceEnd?: number; // End frame in the source buffer

  /** Amiga chip RAM address for UADE enhanced-mode write-back. */
  uadeSamplePtr?: number;

  /** Future Player raw binary instrument pointer (for per-note preview via WASM) */
  fpInstrPtr?: number;
  /** Future Player instrument is wavetable (true) or PCM sample (false) */
  fpIsWavetable?: boolean;
  /** Future Player PCM sample size in bytes */
  fpSampleSize?: number;
}

// ============================================================================
// InstrumentConfig & Friends
// ============================================================================

export interface InstrumentConfig {
  id: number;                   // 1-128 (XM-compatible range, 1-indexed)
  name: string;                 // Max 22 characters (XM limit)
  type: InstrumentType;         // 'sample' or 'synth' (for XM export handling)
  synthType: SynthType;
  oscillator?: OscillatorConfig;
  envelope?: EnvelopeConfig;
  filter?: FilterConfig;
  filterEnvelope?: FilterEnvelopeConfig;
  pitchEnvelope?: PitchEnvelopeConfig;  // Pitch modulation envelope (for synth basses, kicks, FX)
  tb303?: TB303Config;
  wavetable?: WavetableConfig;
  harmonicSynth?: HarmonicSynthConfig;
  granular?: GranularConfig;
  // New synth configs
  superSaw?: SuperSawConfig;
  polySynth?: PolySynthConfig;
  organ?: OrganConfig;
  drumMachine?: DrumMachineConfig;
  chipSynth?: ChipSynthConfig;
  pwmSynth?: PWMSynthConfig;
  stringMachine?: StringMachineConfig;
  formantSynth?: FormantSynthConfig;
  furnace?: FurnaceConfig;
  // Bass synths
  wobbleBass?: WobbleBassConfig;
  // Dub Siren
  dubSiren?: DubSirenConfig;
  // Dub-derived standalone synths (extracted from DubBus)
  oscBass?: OscBassConfig;
  crushBass?: CrushBassConfig;
  sonarPing?: SonarPingConfig;
  radioRiser?: RadioRiserConfig;
  subSwell?: SubSwellConfig;
  // Space Laser
  spaceLaser?: SpaceLaserConfig;
  v2?: V2Config;
  v2Speech?: V2SpeechConfig;
  sam?: SamConfig;
  pinkTrombone?: PinkTromboneConfig;
  dectalk?: DECtalkConfig;
  synare?: SynareConfig;
  wam?: WAMConfig;
  // MAME synths
  mame?: MAMEConfig;
  // Buzzmachines
  buzzmachine?: BuzzmachineConfig;
  // JUCE WASM Synths
  rdpiano?: RdPianoConfig;
  // MDA Instrument Plugins
  mdaEPiano?: import('../../engine/mda-epiano/MdaEPianoSynth').MdaEPianoConfig;
  mdaJX10?: import('../../engine/mda-jx10/MdaJX10Synth').MdaJX10Config;
  mdaDX10?: import('../../engine/mda-dx10/MdaDX10Synth').MdaDX10Config;
  amsynth?: import('../../engine/amsynth/AMSynthSynth').AMSynthConfig;
  raffo?: import('../../engine/raffo/RaffoSynth').RaffoSynthConfig;
  calfMono?: import('../../engine/calf-mono/CalfMonoSynth').CalfMonoConfig;
  setbfree?: import('../../engine/setbfree/SetBfreeSynth').SetBfreeConfig;
  synthv1?: import('../../engine/synthv1/SynthV1Synth').SynthV1Config;
  monique?: import('../../engine/monique/MoniqueSynth').MoniqueConfig;
  vl1?: import('../../engine/vl1/VL1Synth').VL1Config;
  talNoizeMaker?: import('../../engine/tal-noizemaker/TalNoizeMakerSynth').TalNoizeMakerConfig;
  aeolus?: import('../../engine/aeolus/AeolusSynth').AeolusConfig;
  fluidsynth?: import('../../engine/fluidsynth/FluidSynthSynth').FluidSynthConfig;
  sfizz?: import('../../engine/sfizz/SfizzSynth').SfizzConfig;
  zynaddsubfx?: import('../../engine/zynaddsubfx/ZynAddSubFXSynth').ZynAddSubFXConfig;
  // Drumkit/Keymap (multi-sample)
  drumKit?: DrumKitConfig;
  // Module playback (libopenmpt)
  chiptuneModule?: ChiptuneModuleConfig;
  // HivelyTracker / AHX instrument
  hively?: HivelyConfig;
  // PreTracker (synth tracker by Pink/Abyss)
  pretracker?: PreTrackerConfig;
  // Sawteeth (software synth tracker by Stansen/Sanity)
  sawteeth?: SawteethConfig;
  // FmPlayer (PC-98 YM2608 OPNA — FMP/PLAY6 format)
  fmplayer?: FmplayerConfig;
  // Eupmini (FM Towns Euphony — 4-op FM + PCM)
  eupmini?: FmplayerConfig;
  // GoatTracker Ultra (C64 SID tracker)
  gtUltra?: GTUltraConfig;
  // SID Factory II (C64 SID tracker — driver-defined instrument tables)
  sf2?: SF2Config;
  // JamCracker Pro (AM synth / PCM instruments)
  jamCracker?: JamCrackerConfig;
  // UADE exotic Amiga format (playback-only)
  uade?: UADEConfig;
  // UADE Format-Specific Synths (native DSP via WASM)
  soundMon?: SoundMonConfig;
  sidMon?: SidMonConfig;
  digMug?: DigMugConfig;
  fc?: FCConfig;
  deltaMusic1?: DeltaMusic1Config;
  deltaMusic2?: DeltaMusic2Config;
  sonicArranger?: SonicArrangerConfig;
  inStereo2?: InStereo2Config;
  inStereo1?: InStereo2Config;  // IS10 reuses IS20 config shape
  fred?: FredConfig;
  tfmx?: TFMXConfig;
  hippelCoso?: HippelCoSoConfig;
  robHubbard?: RobHubbardConfig;
  steveTurner?: SteveTurnerConfig;
  sidmon1?: SidMon1Config;
  octamed?: OctaMEDConfig;
  davidWhittaker?: DavidWhittakerConfig;
  futurePlayer?: FuturePlayerConfig;
  symphonie?: SymphonieConfig;
  ronKlaren?: RonKlarenConfig;
  // Geonkick (percussion synthesizer; Quamplex GPL-3 WASM port)
  geonkick?: import('./exotic').GeonkickConfig;
  // SunVox WASM patch
  sunvox?: SunVoxConfig;
  // StarTrekker AM synthesis (from NT companion file)
  startrekkerAM?: import('./exotic').StartrekkerAMConfig;
  // Demoscene 4k/64k intro synths
  tunefish?: import('../tunefishInstrument').TunefishInstrumentConfig;
  oidos?: import('../oidosInstrument').OidosInstrumentConfig;
  wavesabre?: import('../wavesabreInstrument').WaveSabreInstrumentConfig;
  // XRNS imported synth data (raw parameters from Renoise)
  xrns?: {
    synthType: string;
    pluginIdentifier?: string;
    parameters?: number[];
    parameterChunk?: string;
  };
  // Modular Synthesis
  modularSynth?: import('../modular').ModularPatchConfig;
  // SunVox Modular Synthesis
  sunvoxModular?: import('../modular').ModularPatchConfig;
  // SuperCollider scripted synthesis
  superCollider?: SuperColliderConfig;
  openWurli?: OpenWurliConfig;
  opl3?: OPL3Config;
  dx7?: DX7Config;
  // Sampler config
  sample?: SampleConfig;
  effects: EffectConfig[];
  volume: number; // -60 to 0 dB
  pan: number; // -100 to 100
  defaultOctave?: number; // Per-instrument default octave for note entry (e.g. 2 for bass synths)
  monophonic?: boolean; // If true, force monophonic playback (one voice at a time)
  isLive?: boolean; // If true, bypass lookahead buffer for instant triggering during playback
  lfo?: LFOConfig; // Global LFO for filter/pitch/volume modulation
  parameters?: Record<string, unknown>; // Additional synth-specific parameters (e.g., sample URLs)
  metadata?: InstrumentMetadata; // Import metadata and transformation history
  rawBinaryData?: Uint8Array;   // Raw binary instrument data for WASM upload (e.g. native .fur format)
  uadeChipRam?: UADEChipRamInfo;  // present when loaded via UADE native parser
  /** User-assigned instrument role — overrides CED neural + spectral auto-detection. */
  manualInstrumentType?: string;
}

export interface InstrumentPreset {
  id: string;
  name: string;
  category: 'Bass' | 'Lead' | 'Pad' | 'Drum' | 'FX';
  tags: string[];
  author?: string;
  config: DeepPartial<Omit<InstrumentConfig, 'id'>>;
}

export interface InstrumentState {
  instruments: InstrumentConfig[];
  currentInstrumentId: number | null;
  presets: InstrumentPreset[];
}

// ============================================================================
// DEFAULT Constants
// ============================================================================

export const DEFAULT_PITCH_ENVELOPE: PitchEnvelopeConfig = {
  enabled: false,
  amount: 12,           // Start 1 octave up
  attack: 0,            // Instant attack
  decay: 50,            // Quick decay to base pitch
  sustain: 0,           // Return to base pitch
  release: 100,         // Quick release
};

export const DEFAULT_OSCILLATOR: OscillatorConfig = {
  type: 'sawtooth',
  detune: 0,
  octave: 0,
};

export const DEFAULT_ENVELOPE: EnvelopeConfig = {
  attack: 10,
  decay: 500,
  sustain: 0,  // Decay to silence (tracker-style)
  release: 100,
};

export const DEFAULT_FILTER: FilterConfig = {
  type: 'lowpass',
  frequency: 2000,
  Q: 1,
  rolloff: -24,
};

export const DEFAULT_LFO: LFOConfig = {
  enabled: false,
  waveform: 'sine',
  rate: 5,
  sync: false,
  syncDivision: '1/4',
  filterAmount: 0,
  filterTarget: 'cutoff',
  pitchAmount: 0,
  volumeAmount: 0,
  phase: 0,
  retrigger: true,
};

export const DEFAULT_ARPEGGIO: ArpeggioConfig = {
  enabled: false,
  speed: 15,                    // 15 Hz (typical chiptune speed)
  speedUnit: 'hz',
  steps: [
    { noteOffset: 0 },
    { noteOffset: 4 },
    { noteOffset: 7 },
  ],
  mode: 'loop',
  swing: 0,
};

/** Sawtooth harmonic series: 1/n */
const SAW_HARMONICS = Array.from({ length: 32 }, (_, i) => 1 / (i + 1));

export const DEFAULT_HARMONIC_SYNTH: HarmonicSynthConfig = {
  harmonics: SAW_HARMONICS,
  spectralTilt: 0,
  evenOddBalance: 0,
  filter: { type: 'lowpass', cutoff: 8000, resonance: 1 },
  envelope: { attack: 10, decay: 300, sustain: 70, release: 200 },
  lfo: { rate: 2, depth: 0, target: 'pitch' },
  maxVoices: 6,
};

export const DEFAULT_WAVETABLE: WavetableConfig = {
  wavetableId: 'basic-saw',
  morphPosition: 0,
  morphModSource: 'none',
  morphModAmount: 50,
  morphLFORate: 2,
  unison: {
    voices: 1,
    detune: 10,
    stereoSpread: 50,
  },
  envelope: {
    attack: 10,
    decay: 500,
    sustain: 0,  // Decay to silence (tracker-style)
    release: 100,
  },
  filter: {
    type: 'lowpass',
    cutoff: 8000,
    resonance: 20,
    envelopeAmount: 0,
  },
  filterEnvelope: {
    attack: 10,
    decay: 500,
    sustain: 0,  // Decay to silence
    release: 100,
  },
};

export const DEFAULT_GRANULAR: GranularConfig = {
  sampleUrl: '',
  grainSize: 100,
  grainOverlap: 50,
  playbackRate: 1,
  detune: 0,
  randomPitch: 0,
  randomPosition: 0,
  scanPosition: 0,
  scanSpeed: 0,
  density: 4,
  reverse: false,
  envelope: {
    attack: 10,
    release: 50,
  },
  filter: {
    type: 'lowpass',
    cutoff: 20000,
    resonance: 0,
  },
};

export const DEFAULT_MAME_VFX: MAMEConfig = {
  type: 'vfx',
  clock: 16000000,
  romsLoaded: false,
  registers: {},
};

export const DEFAULT_MAME_DOC: MAMEConfig = {
  type: 'doc',
  clock: 1000000,
  romsLoaded: false,
  registers: {},
};

export const DEFAULT_MAME_RSA: MAMEConfig = {
  type: 'rsa',
  clock: 20000000,
  romsLoaded: false,
  registers: {},
};

export const DEFAULT_MAME_SWP30: MAMEConfig = {
  type: 'swp30',
  clock: 33868800,
  romsLoaded: false,
  registers: {},
};

export const DEFAULT_CHIPTUNE_MODULE: ChiptuneModuleConfig = {
  moduleData: '',
  format: 'UNKNOWN',
  useLibopenmpt: true,
  repeatCount: 0,
  stereoSeparation: 100,
  interpolationFilter: 0,
};

export const DEFAULT_HIVELY: HivelyConfig = {
  volume: 64,
  waveLength: 3,               // 32-sample square wave
  filterLowerLimit: 0,
  filterUpperLimit: 0,
  filterSpeed: 0,
  squareLowerLimit: 32,
  squareUpperLimit: 63,
  squareSpeed: 1,
  vibratoDelay: 0,
  vibratoSpeed: 0,
  vibratoDepth: 0,
  hardCutRelease: false,
  hardCutReleaseFrames: 0,
  envelope: {
    aFrames: 1, aVolume: 64,
    dFrames: 8, dVolume: 50,
    sFrames: 50,
    rFrames: 6, rVolume: 0,
  },
  performanceList: {
    speed: 1,
    entries: [{ note: 0, waveform: 2, fixed: false, fx: [0, 0], fxParam: [0, 0] }],
  },
};

export const DEFAULT_PRETRACKER: PreTrackerConfig = {
  waves: [],
  instruments: [],
  waveNames: [],
  instrumentNames: [],
  numPositions: 0,
  numSteps: 0,
  subsongCount: 1,
  title: '',
  author: '',
};

export const DEFAULT_FMPLAYER: FmplayerConfig = {
  fmChannels: [],
  ssgChannels: [],
  title: '',
};

export const DEFAULT_SAWTEETH: SawteethConfig = {
  instruments: [],
  instrumentNames: [],
  title: '',
  author: '',
  numChannels: 0,
};

export const DEFAULT_GTULTRA: GTUltraConfig = {
  ad: 0x09,            // Attack=0, Decay=9
  sr: 0x00,            // Sustain=0, Release=0
  vibdelay: 0,
  gatetimer: 2,
  firstwave: 0x41,     // Pulse + gate bit
  name: '',
  wavePtr: 0,
  pulsePtr: 0,
  filterPtr: 0,
  speedPtr: 0,
};

export const DEFAULT_SF2: SF2Config = {
  rawBytes: new Uint8Array(0),
  name: 'SF2 Instrument',
  instIndex: 0,
  columnCount: 0,
};

export const DEFAULT_JAMCRACKER: JamCrackerConfig = {
  name: 'JC Instrument',
  flags: 0,
  phaseDelta: 0,
  volume: 64,
  sampleSize: 0,
  isAM: false,
  hasLoop: false,
};

export const DEFAULT_SOUNDMON: SoundMonConfig = {
  type: 'synth',
  waveType: 0,
  waveSpeed: 0,
  arpTable: new Array(16).fill(0),
  arpSpeed: 0,
  attackVolume: 64,
  decayVolume: 32,
  sustainVolume: 32,
  releaseVolume: 0,
  attackSpeed: 4,
  decaySpeed: 4,
  sustainLength: 16,
  releaseSpeed: 4,
  vibratoDelay: 0,
  vibratoSpeed: 0,
  vibratoDepth: 0,
  portamentoSpeed: 0,
};

export const DEFAULT_SIDMON: SidMonConfig = {
  type: 'synth',
  waveform: 1,               // sawtooth
  pulseWidth: 128,
  attack: 2,
  decay: 4,
  sustain: 8,
  release: 4,
  arpTable: new Array(8).fill(0),
  arpSpeed: 0,
  vibDelay: 0,
  vibSpeed: 0,
  vibDepth: 0,
  filterCutoff: 255,
  filterResonance: 0,
  filterMode: 0,
};

export const DEFAULT_DIGMUG: DigMugConfig = {
  wavetable: [0, 2, 4, 6],
  waveBlend: 0,
  waveSpeed: 0,
  volume: 64,
  arpTable: new Array(8).fill(0),
  arpSpeed: 0,
  vibSpeed: 0,
  vibDepth: 0,
};

export const DEFAULT_FC: FCConfig = {
  waveNumber: 0,
  synthTable: Array.from({ length: 16 }, () => ({ waveNum: 0, transposition: 0, effect: 0 })),
  synthSpeed: 1,
  atkLength: 4,
  atkVolume: 64,
  decLength: 8,
  decVolume: 32,
  sustVolume: 32,
  relLength: 8,
  vibDelay: 0,
  vibSpeed: 0,
  vibDepth: 0,
  arpTable: new Array(16).fill(0),
};

export const DEFAULT_DELTAMUSIC1: DeltaMusic1Config = {
  volume: 64,
  attackStep: 4,
  attackDelay: 1,
  decayStep: 2,
  decayDelay: 2,
  sustain: 0,
  releaseStep: 2,
  releaseDelay: 2,
  vibratoWait: 0,
  vibratoStep: 0,
  vibratoLength: 0,
  bendRate: 0,
  portamento: 0,
  tableDelay: 0,
  arpeggio: new Array(8).fill(0),
  isSample: false,
  table: null,
};

export const DEFAULT_DELTAMUSIC2: DeltaMusic2Config = {
  volTable: Array.from({ length: 5 }, () => ({ speed: 0, level: 0, sustain: 0 })),
  vibTable: Array.from({ length: 5 }, () => ({ speed: 0, delay: 0, sustain: 0 })),
  pitchBend: 0,
  table: new Uint8Array(48).fill(0xFF),
  isSample: false,
};

export const DEFAULT_SONIC_ARRANGER: SonicArrangerConfig = {
  volume: 64,
  fineTuning: 0,
  waveformNumber: 0,
  waveformLength: 64,  // 64 words = 128 bytes (full buffer)

  portamentoSpeed: 0,

  vibratoDelay: 0xFF,  // disabled
  vibratoSpeed: 0,
  vibratoLevel: 0,

  amfNumber: 0,
  amfDelay: 1,
  amfLength: 0,
  amfRepeat: 0,

  adsrNumber: 0,
  adsrDelay: 1,
  adsrLength: 0,
  adsrRepeat: 0,
  sustainPoint: 0,
  sustainDelay: 0,

  effect: 0,           // None
  effectArg1: 0,
  effectArg2: 0,
  effectArg3: 0,
  effectDelay: 1,

  arpeggios: [
    { length: 0, repeat: 0, values: new Array(14).fill(0) },
    { length: 0, repeat: 0, values: new Array(14).fill(0) },
    { length: 0, repeat: 0, values: new Array(14).fill(0) },
  ],

  waveformData: new Array(128).fill(0),
  adsrTable: new Array(128).fill(255),  // flat max volume
  amfTable: new Array(128).fill(0),     // no pitch mod
  allWaveforms: [],

  name: 'SA Synth',
};

export const DEFAULT_INSTEREO2: InStereo2Config = {
  volume: 64,
  waveformLength: 256,
  portamentoSpeed: 0,
  vibratoDelay: 0,
  vibratoSpeed: 0,
  vibratoLevel: 0,
  adsrLength: 0,
  adsrRepeat: 0,
  sustainPoint: 0,
  sustainSpeed: 0,
  amfLength: 0,
  amfRepeat: 0,
  egMode: 0,        // disabled
  egStartLen: 0,
  egStopRep: 0,
  egSpeedUp: 0,
  egSpeedDown: 0,
  arpeggios: [
    { length: 0, repeat: 0, values: new Array(14).fill(0) },
    { length: 0, repeat: 0, values: new Array(14).fill(0) },
    { length: 0, repeat: 0, values: new Array(14).fill(0) },
  ],
  adsrTable: new Array(128).fill(255),   // flat max volume
  lfoTable: new Array(128).fill(0),      // no pitch mod
  egTable: new Array(128).fill(0),       // no EG
  waveform1: new Array(256).fill(0),
  waveform2: new Array(256).fill(0),
  name: 'IS20 Synth',
};

export const DEFAULT_FRED: FredConfig = {
  envelopeVol:   64,
  attackSpeed:   1,
  attackVol:     64,
  decaySpeed:    1,
  decayVol:      32,
  sustainTime:   16,
  releaseSpeed:  1,
  releaseVol:    0,
  vibratoDelay:  0,
  vibratoSpeed:  0,
  vibratoDepth:  0,
  arpeggio:      new Array(16).fill(0),
  arpeggioLimit: 0,
  arpeggioSpeed: 1,
  pulseRateNeg:  -1,
  pulseRatePos:  1,
  pulseSpeed:    4,
  pulsePosL:     16,
  pulsePosH:     48,
  pulseDelay:    0,
  relative:      1024,
};

export const DEFAULT_TFMX: TFMXConfig = {
  sndSeqsCount:  1,
  sndModSeqData: new Uint8Array(64),
  volModSeqData: new Uint8Array(64),
  sampleCount:   0,
  sampleHeaders: new Uint8Array(0),
  sampleData:    new Uint8Array(0),
};

export const DEFAULT_HIPPEL_COSO: HippelCoSoConfig = {
  fseq:     [0],
  vseq:     [32, -31],
  volSpeed: 1,
  vibSpeed: 0,
  vibDepth: 0,
  vibDelay: 0,
};

export const DEFAULT_ROB_HUBBARD: RobHubbardConfig = {
  sampleLen: 0,
  loopOffset: -1,
  sampleVolume: 64,
  relative: 256,
  divider: 0,
  vibratoIdx: 0,
  hiPos: 0,
  loPos: 0,
  vibTable: [],
  sampleData: [],
};

export const DEFAULT_STEVE_TURNER: SteveTurnerConfig = {
  priority: 0,
  sampleIdx: 0,
  initDelay: 0,
  env1Duration: 8,
  env1Delta: 32,
  env2Duration: 8,
  env2Delta: -8,
  pitchShift: 6,
  oscCount: 64,
  oscDelta: 0,
  oscLoop: 1,
  decayDelta: -8,
  numVibrato: 1,
  vibratoDelay: 0,
  vibratoSpeed: 0,
  vibratoMaxDepth: 0,
  chain: 0,
};

export const DEFAULT_SIDMON1: SidMon1Config = {
  arpeggio: new Array(16).fill(0),
  attackSpeed: 8,
  attackMax: 64,
  decaySpeed: 4,
  decayMin: 32,
  sustain: 0,
  releaseSpeed: 4,
  releaseMin: 0,
  phaseShift: 0,
  phaseSpeed: 0,
  finetune: 0,
  pitchFall: 0,
  mainWave: [
    127, 100, 71, 41, 9, -22, -53, -82, -108, -127, -127, -127,
    -108, -82, -53, -22, 9, 41, 71, 100, 127, 100, 71, 41,
    9, -22, -53, -82, -108, -127, -127, -127,
  ],
  phaseWave: new Array(32).fill(0),
};

export const DEFAULT_OCTAMED: OctaMEDConfig = {
  volume: 64,
  voltblSpeed: 0,
  wfSpeed: 0,
  vibratoSpeed: 0,
  loopStart: 0,
  loopLen: 0,
  voltbl: new Uint8Array(128).fill(0xFF),   // single FF = loop at current volume
  wftbl: new Uint8Array(128).fill(0xFF),    // single FF = loop on waveform 0
  waveforms: [new Int8Array(256)],          // one silent waveform
};

export const DEFAULT_DAVID_WHITTAKER: DavidWhittakerConfig = {
  defaultVolume: 64,
  relative: 8364,           // 3579545 / 428 — standard A-440 tuning
  vibratoSpeed: 0,
  vibratoDepth: 0,
  volseq: [64, -128, 0],   // constant volume, loop at 0
  frqseq: [-128, 0],        // static pitch, loop at 0
};

export const DEFAULT_SYMPHONIE: SymphonieConfig = {
  type: 0,              // Normal (one-shot)
  volume: 100,          // Full volume
  tune: 0,              // No transpose
  fineTune: 0,          // No fine-tune
  noDsp: false,         // DSP enabled
  multiChannel: 0,      // Mono
  loopStart: 0,
  loopLen: 0,
  numLoops: 0,          // Infinite
  newLoopSystem: false,
  sampledFrequency: 8363,
};

export const DEFAULT_RONKLAREN: RonKlarenConfig = {
  isSample: false,
  phaseSpeed: 0,
  phaseLengthInWords: 0,
  vibratoSpeed: 0,
  vibratoDepth: 0,
  vibratoDelay: 0,
  adsr: [
    { point: 64, increment: 4 },
    { point: 32, increment: 4 },
    { point: 32, increment: 0 },
    { point: 0,  increment: 4 },
  ],
  phaseValue: 0,
  phaseDirection: false,
  phasePosition: 0,
};

export const DEFAULT_SUNVOX: SunVoxConfig = {
  patchData: null,
  patchName: '',
  controlValues: {},
};

export const DEFAULT_FUTUREPLAYER: FuturePlayerConfig = {
  isWavetable: false,
  volume: 64,
  attackRate: 16,
  attackPeak: 255,
  decayRate: 4,
  sustainLevel: 128,
  sustainRate: 0,
  sustainTarget: 128,
  releaseRate: 8,
  pitchMod1Delay: 0,
  pitchMod1Shift: 0,
  pitchMod1Mode: 0,
  pitchMod1Negate: false,
  hasPitchMod1: false,
  pitchMod2Delay: 0,
  pitchMod2Shift: 0,
  pitchMod2Mode: 0,
  pitchMod2Negate: false,
  hasPitchMod2: false,
  sampleMod1Delay: 0,
  sampleMod1Shift: 0,
  sampleMod1Mode: 0,
  hasSampleMod1: false,
  sampleMod2Delay: 0,
  sampleMod2Shift: 0,
  sampleMod2Mode: 0,
  hasSampleMod2: false,
  sampleSize: 0,
};

export const DEFAULT_SUNVOX_MODULAR_PATCH: import('../modular').ModularPatchConfig = {
  modules: [
    { id: 'sv_out', descriptorId: 'sv_output', parameters: {}, position: { x: 400, y: 200 } },
    { id: 'sv_gen1', descriptorId: 'sv_analog_generator', parameters: {}, position: { x: 100, y: 100 } },
    { id: 'sv_flt1', descriptorId: 'sv_filter', parameters: {}, position: { x: 250, y: 150 } },
  ],
  connections: [
    { id: 'c1', source: { moduleId: 'sv_gen1', portId: 'output' }, target: { moduleId: 'sv_flt1', portId: 'input' }, amount: 1 },
    { id: 'c2', source: { moduleId: 'sv_flt1', portId: 'output' }, target: { moduleId: 'sv_out', portId: 'input' }, amount: 1 },
  ],
  polyphony: 1,
  viewMode: 'canvas',
  backend: 'sunvox',
};

export const DEFAULT_SUPERSAW: SuperSawConfig = {
  voices: 7,
  detune: 30,
  mix: 50,
  stereoSpread: 80,
  envelope: {
    attack: 10,
    decay: 500,
    sustain: 0,  // Decay to silence (tracker-style)
    release: 100,
  },
  filter: {
    type: 'lowpass',
    cutoff: 8000,
    resonance: 20,
    envelopeAmount: 0,
  },
  filterEnvelope: {
    attack: 10,
    decay: 500,
    sustain: 0,  // Decay to silence
    release: 100,
  },
};

export const DEFAULT_POLYSYNTH: PolySynthConfig = {
  voiceCount: 8,
  voiceType: 'Synth',
  stealMode: 'oldest',
  oscillator: {
    type: 'sawtooth',
    detune: 0,
    octave: 0,
  },
  envelope: {
    attack: 50,
    decay: 500,
    sustain: 0,  // Decay to silence (tracker-style)
    release: 100,
  },
  portamento: 0,
};

export const DEFAULT_ORGAN: OrganConfig = {
  drawbars: [8, 8, 8, 0, 0, 0, 0, 0, 0], // Classic rock organ
  percussion: {
    enabled: false,
    volume: 50,
    decay: 'fast',
    harmonic: 'third',
  },
  keyClick: 30,
  vibrato: {
    type: 'C3',
    depth: 50,
  },
  rotary: {
    enabled: true,
    speed: 'slow',
  },
};

export const DEFAULT_DRUM_MACHINE: DrumMachineConfig = {
  drumType: 'kick',
  machineType: '909', // Default to 909 for backwards compatibility
  kick: {
    pitch: 80,
    pitchDecay: 50,
    tone: 50,
    toneDecay: 20,
    decay: 300,
    drive: 50,
    envAmount: 2.5,
    envDuration: 50,
    filterFreq: 3000,
  },
  snare: {
    pitch: 220,
    pitchHigh: 476,
    tone: 25,
    toneDecay: 250,
    snappy: 70,
    decay: 100,
    envAmount: 4.0,
    envDuration: 10,
    filterType: 'notch',
    filterFreq: 1000,
  },
  hihat: {
    tone: 50,
    decay: 100,
    metallic: 50,
  },
  clap: {
    tone: 55,
    decay: 80,
    toneDecay: 250,
    spread: 10,
    filterFreqs: [900, 1200],
    modulatorFreq: 40,
  },
  tom: {
    pitch: 200,
    decay: 200,
    tone: 5,
    toneDecay: 100,
    envAmount: 2.0,
    envDuration: 100,
  },
  conga: {
    pitch: 310,
    decay: 180,
    tuning: 50,
  },
  cowbell: {
    decay: 400,
    filterFreq: 2640,
  },
  rimshot: {
    decay: 30,
    filterFreqs: [220, 500, 950],
    filterQ: 10.5,
    saturation: 3.0,
  },
  clave: {
    decay: 40,
    pitch: 2450,
    pitchSecondary: 1750,
    filterFreq: 2450,
  },
  maracas: {
    decay: 30,
    filterFreq: 5000,
  },
  cymbal: {
    tone: 50,
    decay: 2000,
  },
};

export const DEFAULT_CHIP_SYNTH: ChipSynthConfig = {
  channel: 'pulse1',
  pulse: {
    duty: 50,
  },
  bitDepth: 8,
  sampleRate: 22050,
  envelope: {
    attack: 5,
    decay: 300,
    sustain: 0,  // Decay to silence (tracker-style)
    release: 50,
  },
  vibrato: {
    speed: 6,
    depth: 0,
    delay: 200,
  },
  arpeggio: {
    enabled: false,
    speed: 15,
    speedUnit: 'hz',
    steps: [
      { noteOffset: 0 },
      { noteOffset: 4 },
      { noteOffset: 7 },
    ],
    mode: 'loop',
    swing: 0,
  },
};

export const DEFAULT_PWM_SYNTH: PWMSynthConfig = {
  pulseWidth: 50,
  pwmDepth: 30,
  pwmRate: 2,
  pwmWaveform: 'sine',
  oscillators: 2,
  detune: 10,
  envelope: {
    attack: 50,
    decay: 500,
    sustain: 0,  // Decay to silence (tracker-style)
    release: 100,
  },
  filter: {
    type: 'lowpass',
    cutoff: 4000,
    resonance: 20,
    envelopeAmount: 30,
    keyTracking: 50,
  },
  filterEnvelope: {
    attack: 10,
    decay: 500,
    sustain: 0,  // Decay to silence
    release: 100,
  },
};

export const DEFAULT_STRING_MACHINE: StringMachineConfig = {
  sections: {
    violin: 100,
    viola: 70,
    cello: 50,
    bass: 30,
  },
  ensemble: {
    depth: 60,
    rate: 3,
    voices: 4,
  },
  attack: 200,
  release: 1000,
  brightness: 60,
};

export const DEFAULT_FORMANT_SYNTH: FormantSynthConfig = {
  vowel: 'A',
  vowelMorph: {
    target: 'O',
    amount: 0,
    rate: 1,
    mode: 'manual',
  },
  oscillator: {
    type: 'sawtooth',
  },
  formants: {
    ...VOWEL_FORMANTS.A,
    bandwidth: 100,
  },
  envelope: {
    attack: 50,
    decay: 500,
    sustain: 0,  // Decay to silence (tracker-style)
    release: 100,
  },
  brightness: 70,
};

export const DEFAULT_WOBBLE_BASS: WobbleBassConfig = {
  mode: 'classic',

  osc1: {
    type: 'sawtooth',
    octave: -1,
    detune: 0,
    level: 100,
  },
  osc2: {
    type: 'sawtooth',
    octave: -1,
    detune: 7,              // Slight detune for thickness
    level: 80,
  },

  sub: {
    enabled: true,
    octave: -2,
    level: 60,
  },

  fm: {
    enabled: false,
    amount: 30,
    ratio: 2,
    envelope: 50,
  },

  unison: {
    voices: 4,
    detune: 15,
    stereoSpread: 50,
  },

  filter: {
    type: 'lowpass',
    cutoff: 800,
    resonance: 60,
    rolloff: -24,
    drive: 30,
    keyTracking: 0,
  },

  filterEnvelope: {
    amount: 70,
    attack: 5,
    decay: 300,
    sustain: 20,
    release: 200,
  },

  wobbleLFO: {
    enabled: true,
    sync: '1/4',
    rate: 4,
    shape: 'sine',
    amount: 80,
    pitchAmount: 0,
    fmAmount: 0,
    phase: 0,
    retrigger: true,
  },

  envelope: {
    attack: 5,
    decay: 200,
    sustain: 80,
    release: 300,
  },

  distortion: {
    enabled: true,
    type: 'soft',
    drive: 40,
    tone: 70,
  },

  formant: {
    enabled: false,
    vowel: 'A',
    morph: 0,
    lfoAmount: 0,
  },
};

export const DEFAULT_BUZZMACHINE: BuzzmachineConfig = {
  machineType: 'ArguruDistortion',
  parameters: {},
};

export const DEFAULT_FURNACE: FurnaceConfig = {
  chipType: 1, // FM (OPN2/Genesis)
  algorithm: 4,
  feedback: 4,
  fms: 0,
  ams: 0,
  fms2: 0,
  ams2: 0,
  ops: 4,
  opllPreset: 0,
  fixedDrums: false,
  operators: [
    // OP1 - Modulator
    {
      enabled: true, mult: 2, tl: 40, ar: 31, dr: 8, d2r: 2, sl: 4, rr: 6,
      dt: 0, dt2: 0, rs: 0, am: false, ksr: false, ksl: 0, sus: false,
      vib: false, ws: 0, ssg: 0, dam: 0, dvb: 0, egt: false, kvs: 0,
    },
    // OP2 - Modulator
    {
      enabled: true, mult: 1, tl: 50, ar: 28, dr: 6, d2r: 2, sl: 4, rr: 6,
      dt: 0, dt2: 0, rs: 0, am: false, ksr: false, ksl: 0, sus: false,
      vib: false, ws: 0, ssg: 0, dam: 0, dvb: 0, egt: false, kvs: 0,
    },
    // OP3 - Carrier
    {
      enabled: true, mult: 1, tl: 0, ar: 31, dr: 10, d2r: 4, sl: 2, rr: 6,
      dt: 0, dt2: 0, rs: 0, am: false, ksr: false, ksl: 0, sus: false,
      vib: false, ws: 0, ssg: 0, dam: 0, dvb: 0, egt: false, kvs: 0,
    },
    // OP4 - Carrier
    {
      enabled: true, mult: 1, tl: 0, ar: 31, dr: 8, d2r: 3, sl: 3, rr: 5,
      dt: 0, dt2: 0, rs: 0, am: false, ksr: false, ksl: 0, sus: false,
      vib: false, ws: 0, ssg: 0, dam: 0, dvb: 0, egt: false, kvs: 0,
    },
  ],
  macros: [],
  opMacros: Array.from({ length: 4 }, () => ({})),
  wavetables: [],
};

export const DEFAULT_RDPIANO: RdPianoConfig = {
  patch: 0,
  chorusEnabled: true,
  chorusRate: 5,
  chorusDepth: 14,
  efxEnabled: false,
  phaserRate: 0.4,
  phaserDepth: 0.8,
  tremoloEnabled: false,
  tremoloRate: 6,
  tremoloDepth: 6,
  volume: 1.0,
};

export const DEFAULT_DRUMKIT: DrumKitConfig = {
  keymap: [],
  polyphony: 'poly',
  maxVoices: 8,
  noteCut: false,
};

export const DEFAULT_DUB_SIREN: DubSirenConfig = {
  oscillator: {
    type: 'sine',
    frequency: 440,
  },
  lfo: {
    enabled: true,
    type: 'square',
    rate: 2,
    depth: 100,
  },
  delay: {
    enabled: true,
    time: 0.3,
    feedback: 0.4,
    wet: 0.3,
  },
  filter: {
    enabled: true,
    type: 'lowpass',
    frequency: 2000,
    rolloff: -24,
  },
  reverb: {
    enabled: true,
    decay: 1.5,
    wet: 0.1,
  },
};

/** Dub-derived standalone synths extracted from DubBus. Defaults mirror
 *  the original `bus.startXxx(...)` default args so the extracted synth
 *  sounds identical to the dub-bus version out of the box. */
export const DEFAULT_OSC_BASS: OscBassConfig = {
  level: 0.45,
  resonance: 18,
  attackMs: 80,
  releaseMs: 200,
};

export const DEFAULT_CRUSH_BASS: CrushBassConfig = {
  level: 0.55,
  bits: 3,
  attackMs: 60,
  releaseMs: 200,
  lpHz: 2000,
};

export const DEFAULT_SONAR_PING: SonarPingConfig = {
  level: 0.8,
  durationMs: 140,
  decayRatio: 0.35,
};

export const DEFAULT_RADIO_RISER: RadioRiserConfig = {
  level: 0.7,
  startHz: 200,
  endHz: 5000,
  sweepSec: 1.2,
  bandwidth: 6,
};

export const DEFAULT_SUB_SWELL: SubSwellConfig = {
  level: 0.8,
  durationMs: 400,
  pitchOctaves: 0,
};

export const DEFAULT_SPACE_LASER: SpaceLaserConfig = {
  laser: {
    startFreq: 4000,
    endFreq: 150,
    sweepTime: 150,
    sweepCurve: 'exponential',
  },
  fm: {
    amount: 40,
    ratio: 2.5,
  },
  noise: {
    amount: 10,
    type: 'white',
  },
  filter: {
    type: 'bandpass',
    cutoff: 2000,
    resonance: 40,
  },
  delay: {
    enabled: true,
    time: 0.3,
    feedback: 0.5,
    wet: 0.4,
  },
  reverb: {
    enabled: true,
    decay: 2.0,
    wet: 0.2,
  },
};

export const DEFAULT_SYNARE: SynareConfig = {
  oscillator: {
    type: 'square',
    tune: 200,
    fine: 0,
  },
  oscillator2: {
    enabled: false,
    detune: 0,
    mix: 0.5,
  },
  noise: {
    enabled: true,
    type: 'white',
    mix: 0.2,
    color: 100,
  },
  filter: {
    cutoff: 800,
    resonance: 60,
    envMod: 70,
    decay: 200,
  },
  lfo: {
    enabled: false,
    rate: 5,
    depth: 0,
    target: 'pitch',
  },
  envelope: {
    decay: 300,
    sustain: 0,
  },
  sweep: {
    enabled: true,
    amount: 24,
    time: 150,
  },
};

export const DEFAULT_SAM: SamConfig = {
  text: 'COMMODORE SIXTY FOUR',
  pitch: 64,
  speed: 72,
  mouth: 128,
  throat: 128,
  singmode: true,
  phonetic: false,
  vowelSequence: [],
  vowelLoopSingle: true,
};

export const DEFAULT_WAM: WAMConfig = {
  moduleUrl: '',
  pluginState: null,
  pluginStateVersion: 1,
  pluginStateTimestamp: 0,
};

export const DEFAULT_V2_SPEECH: V2SpeechConfig = {
  text: '!kwIH_k !fAA_ks',
  speed: 64,
  pitch: 64,
  formantShift: 64,
  singMode: true,
  vowelSequence: [],
  vowelLoopSingle: true,
};

export const DEFAULT_V2: V2Config = {
  osc1: { mode: 1, transpose: 0, detune: 0, color: 64, level: 127 },
  osc2: { mode: 0, ringMod: false, transpose: 0, detune: 10, color: 64, level: 0 },
  osc3: { mode: 0, ringMod: false, transpose: 0, detune: -10, color: 64, level: 0 },
  filter1: { mode: 1, cutoff: 127, resonance: 0 },
  filter2: { mode: 0, cutoff: 127, resonance: 0 },
  routing: { mode: 0, balance: 64 },
  envelope: { attack: 0, decay: 64, sustain: 127, release: 32 },
  envelope2: { attack: 0, decay: 64, sustain: 127, release: 32 },
  lfo1: { rate: 64, depth: 0 },
  voiceDistortion: { mode: 0, inGain: 32, param1: 0, param2: 64 },
  channelDistortion: { mode: 0, inGain: 32, param1: 100, param2: 64 },
  chorusFlanger: { amount: 64, feedback: 64, delayL: 32, delayR: 32, modRate: 0, modDepth: 0, modPhase: 64 },
  compressor: { mode: 0, stereoLink: false, autoGain: true, lookahead: 2, threshold: 90, ratio: 32, attack: 20, release: 64, outGain: 64 },
  lfo2: { mode: 1, keySync: true, envMode: false, rate: 64, phase: 2, polarity: 0, amplify: 127 },
};

export const DEFAULT_TB303: TB303Config = {
  engineType: 'db303',  // Use db303 engine by default for better sound
  volume: 1.0,          // Reference never calls setVolume — WASM default is 1.0.
                        // Lower values starve internal nonlinearities, making sound tame.
  oscillator: {
    type: 'sawtooth',   // db303 default: waveform=0 (sawtooth)
    pulseWidth: 0,      // 0 = 50% duty cycle (true square). Reference default is 1 (99% thin pulse)
                        // but we use 0 so SAW/SQR toggle produces a proper square wave.
    subOscGain: 0,      // db303 default: subOscGain=0
    subOscBlend: 1,     // db303 default: subOscBlend=1 (100% blend)
  },
  filter: {
    cutoff: 0.5,        // db303 default: cutoff=0.5 (normalized 0-1)
    resonance: 0.5,     // db303 default: resonance=0.5 (normalized 0-1)
  },
  filterEnvelope: {
    envMod: 0.5,        // db303 default: envMod=0.5 (normalized 0-1)
    decay: 0.5,         // default-preset.xml: 0.5 (normalized 0-1)
  },
  accent: {
    amount: 0.5,        // db303 default: accent=0.5 (normalized 0-1)
  },
  slide: {
    time: 0.162,        // Real 303: 60ms. Formula: linToLin(v, 0, 1, 2, 360)
    mode: 'exponential',
  },
  overdrive: {
    amount: 0,
  },
  // Devil Fish parameters — always enabled (matching reference db303.pages.dev).
  // The WASM has no "DF off" mode — it always uses these params internally.
  // Source of truth: db303-local/default-preset.xml (loaded by reference app on init).
  // Conversion: JC303.cpp::setParameter() converts 0-1 → real values inside WASM.
  devilFish: {
    enabled: true,
    normalDecay: 0.404,          // Real 303: 1230ms. Formula: linToLin(v, 0, 1, 30, 3000)
    accentDecay: 0.057,          // Real 303: 200ms (FIXED on hardware). Was 0.006 (47ms) - too harsh/clicky
    softAttack: 0.25,            // Real 303: 3ms attack. Was 0 (0.3ms) - caused clicks. Formula: linToExp(v, 0, 1, 0.3, 3000)
    accentSoftAttack: 0.1,       // default-preset.xml: 0.1 (punch on accented notes)
    passbandCompensation: 0.09,  // default-preset.xml: 0.09. App inverts → WASM gets 1-0.09=0.91
    resTracking: 0.257,           // default-preset.xml: 0.743 (inverted on read: 1-0.743=0.257). App inverts → WASM gets 0.743
    filterInputDrive: 0.169,     // default-preset.xml: 0.169 (subtle warmth/drive)
    filterSelect: 0,             // 0=DiodeLadder (only valid: 0 or 5=Korg). Reference init uses 0.
    diodeCharacter: 1,           // default-preset.xml: 1 (nonlinear character)
    duffingAmount: 0.03,         // default-preset.xml: 0.03 (subtle saturation)
    filterFmDepth: 0,            // db303 app default: filterFmDepth=0
    lpBpMix: 0,                  // db303 app default: lpBpMix=0
    filterTracking: 0,           // db303 app default: filterTracking=0
    stageNLAmount: 0,            // db303 app default: stageNLAmount=0
    ensembleAmount: 0,           // db303 app default: ensembleAmount=0
    korgEnabled: false,          // Korg filter params off by default
    oversamplingOrder: 2,        // db303 app default: oversamplingOrder=2 (4x)
    // Required defaults for other Devil Fish parameters
    accentSweepEnabled: true,
    sweepSpeed: 'normal',
    highResonance: false,
    muffler: 'off',
    vegDecay: 0.5,               // db303 default: vegDecay=0.5
    vegSustain: 0,
  },
  lfo: {
    enabled: false,     // LFO off by default (not standard 303)
    waveform: 0,        // db303 default: lfoWaveform=0 (triangle)
    rate: 0,            // db303 default: lfoRate=0
    contour: 0,         // db303 default: lfoContour=0
    pitchDepth: 0,      // db303 default: lfoPitchDepth=0
    pwmDepth: 0,        // db303 default: lfoPwmDepth=0
    filterDepth: 0,     // db303 default: lfoFilterDepth=0
    stiffDepth: 0,      // db303 default: lfoStiffDepth=0
  },
  chorus: {
    enabled: false,     // db303 default: chorusMode=0 (off)
    mode: 0,
    mix: 0.5,           // db303 default: chorusMix=0.5
  },
  phaser: {
    enabled: false,     // db303 default: phaserMix=0 (disabled)
    rate: 0.5,          // db303 default: phaserRate=0.5
    depth: 0.7,         // db303 default: phaserWidth=0.7
    feedback: 0,        // db303 default: phaserFeedback=0
    mix: 0,
  },
  delay: {
    enabled: false,     // db303 default: delayMix=0 (disabled)
    time: 3,            // default-preset.xml: 3 (WASM raw 0-16, 16th note subdivisions)
    feedback: 0.3,      // default-preset.xml: 0.3
    tone: 0.5,          // default-preset.xml: 0.5
    mix: 0,
    stereo: 0.5,        // default-preset.xml: 0.5 (spread)
  },
};

export const DEFAULT_SUPERCOLLIDER: SuperColliderConfig = {
  synthDefName: 'mySynth',
  source: `SynthDef(\\mySynth, { |freq=440, amp=0.5, gate=1|
  var sig = SinOsc.ar(freq) * amp;
  var env = EnvGen.kr(Env.adsr(0.01, 0.1, 0.7, 0.5), gate, doneAction: 2);
  Out.ar(0, (sig * env).dup);
})`,
  binary: 'U0NnZgAAAAIAAQdteVN5bnRoAAAACwAAAAA/gAAAQAAAAEBAAADCxgAAPCPXCkCgAADAgAAAPzMzMz3MzM0/AAAAAAAAA0PcAAA/AAAAP4AAAAAAAAMEZnJlcQAAAAADYW1wAAAAAQRnYXRlAAAAAgAAAAYHQ29udHJvbAEAAAAAAAAAAwAAAQEBBlNpbk9zYwIAAAACAAAAAQAAAAAAAAAAAAD/////AAAAAAIMQmluYXJ5T3BVR2VuAgAAAAIAAAABAAIAAAABAAAAAAAAAAAAAAABAgZFbnZHZW4BAAAAFQAAAAEAAAAAAAAAAAAC/////wAAAAH/////AAAAAP////8AAAAB/////wAAAAL/////AAAAAP////8AAAAD/////wAAAAL/////AAAABP////8AAAAB/////wAAAAX/////AAAABv////8AAAAH/////wAAAAj/////AAAACf////8AAAAG/////wAAAAf/////AAAAAP////8AAAAK/////wAAAAb/////AAAABwEMQmluYXJ5T3BVR2VuAgAAAAIAAAABAAIAAAACAAAAAAAAAAMAAAAAAgNPdXQCAAAAAwAAAAAAAP////8AAAAAAAAABAAAAAAAAAAEAAAAAAAA',
  params: [],
};

export const DEFAULT_OPENWURLI: OpenWurliConfig = {
  volume: 0.8,
  tremoloDepth: 0.5,
  speakerCharacter: 0.5,
  mlpEnabled: true,
  velocityCurve: 2,
};

export const DEFAULT_OPL3: OPL3Config = {
  op1Attack: 1, op1Decay: 4, op1Sustain: 2, op1Release: 5,
  op1Level: 32, op1Multi: 1, op1Waveform: 0,
  op1Tremolo: 0, op1Vibrato: 0, op1SustainHold: 0, op1KSR: 0, op1KSL: 0,
  op2Attack: 1, op2Decay: 4, op2Sustain: 2, op2Release: 5,
  op2Level: 63, op2Multi: 1, op2Waveform: 0,
  op2Tremolo: 0, op2Vibrato: 0, op2SustainHold: 0, op2KSR: 0, op2KSL: 0,
  feedback: 0, connection: 0,
};

export const DEFAULT_DX7: DX7Config = {
  volume: 1,
  bank: 0,
  program: 0,
};
