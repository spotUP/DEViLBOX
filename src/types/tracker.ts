/**
 * Tracker Types - Pattern Editor Data Structures
 * Aligned with FastTracker II / XM format with DEViLBOX extensions
 */

/**
 * XM-Compatible Note Value
 * 0 = no note (empty)
 * 1-96 = notes (1 = C-0, 13 = C-1, 25 = C-2, ..., 97 = C-8)
 * 97 = note off (key release)
 *
 * Note encoding: (octave * 12) + semitone + 1
 * Example: C-4 = (4 * 12) + 0 + 1 = 49
 */
export type NoteValue = number; // 0-97 (XM format)

/**
 * XM-Compatible Instrument Value
 * 0 = no instrument
 * 1-128 = instrument number (XM range)
 */
export type InstrumentValue = number; // 0-128 (XM format)

/**
 * XM-Compatible Volume Column Value
 * 0x00-0x0F = nothing
 * 0x10-0x50 = set volume 0-64
 * 0x60-0x6F = volume slide down
 * 0x70-0x7F = volume slide up
 * 0x80-0x8F = fine volume down
 * 0x90-0x9F = fine volume up
 * 0xA0-0xAF = set vibrato speed
 * 0xB0-0xBF = vibrato
 * 0xC0-0xCF = set panning
 * 0xD0-0xDF = pan slide left
 * 0xE0-0xEF = pan slide right
 * 0xF0-0xFF = tone portamento
 */
export type VolumeValue = number; // 0x00-0xFF (XM volume column)

/**
 * XM-Compatible Effect Type
 * 0-35 = FastTracker II effect types
 */
export type EffectType = number; // 0-35 (XM effect type)

/**
 * XM-Compatible Effect Parameter
 * 0x00-0xFF = effect parameter value
 */
export type EffectParam = number; // 0x00-0xFF

/**
 * TrackerCell - Core pattern data cell
 *
 * XM-Compatible Core (5 bytes):
 * - note: Note value (0-97)
 * - instrument: Instrument number (0-128)
 * - volume: Volume column (0x00-0xFF)
 * - effTyp: Effect type (0-35)
 * - eff: Effect parameter (0x00-0xFF)
 *
 * DEViLBOX Extensions:
 * - effect2: Second effect (string format for now)
 * - accent/slide: TB-303 controls
 * - cutoff/resonance/envMod/pan: Automation lanes
 * - period: Amiga period for accurate MOD playback
 */
export interface TrackerCell {
  // XM-compatible core (5 bytes)
  note: NoteValue;              // 0 = empty, 1-96 = notes, 97 = note off
  instrument: InstrumentValue;  // 0 = no instrument, 1-128 = instrument
  volume: VolumeValue;          // 0x00-0xFF (volume column effects)
  effTyp: EffectType;           // 0-35 (effect type)
  eff: EffectParam;             // 0x00-0xFF (effect parameter)

  // DEViLBOX extensions (stored in extended format)
  effect?: string;              // Legacy string format (e.g., "E01", "300") - combines effTyp+eff
  effTyp2: EffectType;          // Second effect type (0-35)
  eff2: EffectParam;            // Second effect parameter (0x00-0xFF)
  effect2?: string;             // Legacy string format (migration only)
  // Extra effect slots 3-8 (optional; populated from Furnace imports)
  effTyp3?: EffectType;  eff3?: EffectParam;
  effTyp4?: EffectType;  eff4?: EffectParam;
  effTyp5?: EffectType;  eff5?: EffectParam;
  effTyp6?: EffectType;  eff6?: EffectParam;
  effTyp7?: EffectType;  eff7?: EffectParam;
  effTyp8?: EffectType;  eff8?: EffectParam;

  // TB-303 specific columns (flexible like effect columns)
  // 0 = empty, 1 = accent, 2 = slide
  flag1?: number;
  flag2?: number;

  // Automation columns (optional)
  cutoff?: number;              // 0x00-0xFF
  resonance?: number;           // 0x00-0xFF
  envMod?: number;              // 0x00-0xFF
  pan?: number;                 // 0x00-0xFF

  // MOD/XM period (for accurate Amiga playback)
  period?: number;              // Amiga period (113-856 for MOD)

  // DEViLBOX: Probability/maybe (0-100, percentage chance note plays)
  probability?: number;         // undefined/0 = always play, 1-99 = percentage

  // Sonic Arranger: per-row instrument arpeggio table selector
  // 0 = no instrument arp (use XM 0xy if present), 1-3 = SA arp table 0-2
  saArpTable?: number;

  // Sonic Arranger: raw SA effect/arg for WASM-direct routing
  // Effects 1,2,4,7,8,A are handled by WASM synth, not XM replayer
  saEffect?: number;
  saEffectArg?: number;

  // ── Renoise-style multi-note columns (up to 4 notes per cell) ──
  // Extra note columns for chord support. Column 1 uses the primary
  // note/instrument/volume fields above. Columns 2-4 are optional.
  // Each column has independent note-off, instrument, volume, and delay.
  note2?: NoteValue;              // 0 = empty, 1-96 = notes, 97 = note off
  instrument2?: InstrumentValue;
  volume2?: VolumeValue;
  delay2?: number;                // 0-255 sub-row delay (for strum effects)

  note3?: NoteValue;
  instrument3?: InstrumentValue;
  volume3?: VolumeValue;
  delay3?: number;

  note4?: NoteValue;
  instrument4?: InstrumentValue;
  volume4?: VolumeValue;
  delay4?: number;
}

export interface TrackerRow {
  cells: TrackerCell[];
}

export interface ChannelData {
  id: string;
  name: string;
  shortName?: string;
  rows: TrackerCell[];
  muted: boolean;
  solo: boolean;
  collapsed: boolean; // Collapse channel to narrow width
  volume: number; // 0-100
  pan: number; // -100 to 100
  instrumentId: number | null;
  color: string | null; // Channel background color (CSS color value)
  recordGroup?: 0 | 1 | 2; // OpenMPT-style record group (0 = none, 1 = group 1, 2 = group 2)
  channelMeta?: {
    importedFromMOD: boolean;
    originalIndex?: number; // Original position in MOD/XM
    addedAfterImport?: boolean;
    channelType?: 'sample' | 'synth' | 'hybrid' | 'sunvox';
    furnaceType?: number; // Furnace DivChanType for system presets
    hardwareName?: string; // Hardware-specific channel name
    shortName?: string; // Short display name for channel headers
    effectCols?: number; // Number of effect columns (default 2)
    noteCols?: number;   // Number of note columns per track (default 1, max 4) — Renoise-style chords
    maxVoices?: number;  // Max simultaneous voices per channel (default unlimited; 1-16)
    systemId?: number | string; // System preset identifier (number for Furnace fileID)
    sunvoxModuleId?: number; // SunVox module ID for SunVox channels
  };
}

// Channel color palette - muted colors that work on dark backgrounds
export const CHANNEL_COLORS = [
  null, // No color (default)
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#14b8a6', // Teal
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#6b7280', // Gray
] as const;

export interface Pattern {
  id: string;
  name: string;
  length: number; // 16, 32, 64, 128
  channels: ChannelData[];
  bpm?: number; // Optional override
  importMetadata?: ImportMetadata; // MOD/XM import metadata
}

/**
 * Envelope point structure for XM/IT envelopes
 * Point-based envelope with sustain/loop support
 */
export interface EnvelopePoint {
  tick: number; // X position (tick count)
  value: number; // Y position (0-64 for volume, 0-64 for pan where 32=center)
}

export interface EnvelopePoints {
  enabled: boolean;
  points: EnvelopePoint[];
  sustainPoint: number | null; // Index of sustain point
  loopStartPoint: number | null; // Index of loop start
  loopEndPoint: number | null; // Index of loop end
}

export interface AutoVibrato {
  type: 'sine' | 'square' | 'rampDown' | 'rampUp';
  sweep: number; // 0-255 - Speed of vibrato ramp-up
  depth: number; // 0-15 - Vibrato depth
  rate: number; // 0-63 - Vibrato rate
}

export interface ParsedSample {
  id: number;
  name: string;
  pcmData: ArrayBuffer;
  loopStart: number; // Sample frame index
  loopLength: number; // Loop length in frames
  loopType: 'none' | 'forward' | 'pingpong';
  volume: number; // 0-64
  finetune: number; // -128 to +127
  relativeNote: number; // -48 to +48 semitones
  panning: number; // 0-255 (128=center)
  bitDepth: 8 | 16;
  sampleRate: number;
  length: number; // Total sample length in frames
}

/**
 * Furnace macro data for playback
 * Macros control instrument parameters per-tick (volume, arpeggio, duty, etc.)
 */
export interface FurnaceMacroData {
  type: number;      // Macro type code (0=vol, 1=arp, 2=duty, 3=wave, 4=pitch, etc.)
  data: number[];    // Macro values (up to 256 steps)
  loop: number;      // Loop point (-1 = no loop)
  release: number;   // Release point (-1 = none)
  speed: number;     // Macro speed (1 = every tick, 2 = every 2 ticks, etc.)
  mode?: number;     // Macro mode (0=sequence, 1=ADSR, 2=LFO)
  delay?: number;    // Macro start delay in ticks
}

/**
 * Furnace wavetable data for wavetable chips (GB, N163, PCE, SCC, etc.)
 */
export interface FurnaceWavetableData {
  id: number;
  data: number[];    // Waveform samples (4-bit to 8-bit depending on chip)
  len?: number;      // Length (if different from data.length)
  max?: number;      // Max value (height)
}

/**
 * Furnace-specific instrument data
 * Preserves chip-specific parameters for authentic playback
 */
export interface FurnaceInstrumentData {
  chipType: number;              // DIV_INS_* type
  synthType: string;             // Mapped SynthType for DEViLBOX engine

  // FM parameters (for FM chips: OPN, OPM, OPL, OPLL, etc.)
  fm?: {
    algorithm: number;
    feedback: number;
    fms?: number;
    ams?: number;
    fms2?: number;
    ams2?: number;
    ops?: number;
    opllPreset?: number;
    block?: number;
    fixedDrums?: boolean;
    kickFreq?: number;
    snareHatFreq?: number;
    tomTopFreq?: number;
    x1BankSlot?: number;
    powerNoiseOctave?: number;
    ws?: unknown;
    sid3?: unknown;
    nes?: unknown;
    operators: Array<{
      enabled: boolean;
      mult: number;
      tl: number;
      ar: number;
      dr: number;
      d2r: number;
      sl: number;
      rr: number;
      dt: number;
      dt2?: number;
      rs?: number;
      am?: boolean;
      ksr?: boolean;
      ksl?: number;
      sus?: boolean;
      vib?: boolean;
      ws?: number;
      ssg?: number;
      egt?: boolean;
      kvs?: number;
      dvb?: number;
      dam?: number;
    }>;
  };

  // Macros for per-tick parameter changes
  macros: FurnaceMacroData[];

  // Wavetables for wavetable chips
  wavetables: FurnaceWavetableData[];

  // Amiga/sample config (initSample, noteMap, useSample, useWave)
  amiga?: {
    initSample: number;
    useNoteMap: boolean;
    useSample: boolean;
    useWave: boolean;
    waveLen?: number;
    noteMap?: Array<{ freq: number; map: number }>;
  };

  // Per-operator macros from Furnace O1-O4 feature blocks [4 operators][N macros each]
  opMacroArrays?: FurnaceMacroData[][];

  // Chip-specific config (optional)
  chipConfig?: Record<string, unknown>;
}

export interface ParsedInstrument {
  id: number;
  name: string;
  samples: ParsedSample[];
  volumeEnvelope?: EnvelopePoints;
  panningEnvelope?: EnvelopePoints;
  autoVibrato?: AutoVibrato;
  fadeout: number; // Volume fadeout speed (0-4095)
  sampleMap?: number[]; // XM note-to-sample mapping (96 entries)
  volumeType: 'envelope' | 'none';
  panningType: 'envelope' | 'none';

  // Furnace-specific data (for .fur imports)
  furnace?: FurnaceInstrumentData;
  rawBinaryData?: Uint8Array;  // Raw binary instrument data for upload to WASM

  // XRNS/demoscene synth data (for .xrns imports)
  xrnsSynth?: {
    synthType: string;  // 'wavesabre-slaughter', 'wavesabre-falcon', 'oidos', 'tunefish'
    pluginIdentifier?: string;
    parameters: number[];
    parameterChunk?: string;
  };
}

/**
 * Import metadata for MOD/XM files
 * Preserves original module data for editing and re-export
 */
export interface ImportMetadata {
  sourceFormat:
    | 'MOD' | 'XM' | 'IT' | 'S3M' | 'FUR' | 'HVL' | 'AHX' | 'OKT' | 'MED' | 'DIGI' | 'DBM' | 'FC'
    | 'SFX' | 'SMON' | 'SIDMON2' | 'FRED' | 'DMUG' | 'UADE' | 'TFMX'
    // Chip-dump / CPU-code formats
    | 'SID' | 'VGM' | 'YM' | 'NSF' | 'SAP' | 'AY'
    // Amiga native formats (Phase 2+)
    | '667' | '669' | 'AMOSMusicBank' | 'AON' | 'AST' | 'AVP' | 'BD' | 'C67' | 'CBA'
    | 'DigitalSymphony' | 'DM1' | 'DM2' | 'DSM' | 'DSS' | 'DTM' | 'ETX'
    | 'FaceTheMusic' | 'FMT' | 'GameMusicCreator' | 'GDM' | 'GMC'
    | 'GraoumfTracker' | 'GraoumfTracker2' | 'ICE' | 'IMF' | 'IMS' | 'IS10' | 'IS20'
    | 'JamCracker' | 'KRIS' | 'MFP' | 'MTM' | 'MUS' | 'NRU' | 'PLM' | 'PSF' | 'PTM'
    | 'PumaTracker' | 'QuadraComposer' | 'RK' | 'RTM' | 'SAW' | 'SC'
    | 'SonicArranger' | 'STK' | 'STM' | 'STP' | 'Symphonie' | 'TCBTracker' | 'ULT' | 'UNIC'
    // PC tracker formats
    | 'AMS' | 'DMF' | 'MadTracker2' | 'fmt' | 'xmf' | 'uax' | 'NATIVE' | 'XRNS'
    // Generic fallback
    | string;
  sourceFile: string;
  importedAt: string;
  originalChannelCount: number;
  originalPatternCount: number;
  originalInstrumentCount: number;

  // MOD/XM specific metadata
  modData?: {
    moduleType: string; // 'M.K.', 'FLT4', '6CHN', '8CHN', etc.
    initialSpeed: number; // Ticks per row
    initialBPM: number; // Beats per minute
    amigaPeriods: boolean; // true=Amiga frequency table, false=Linear frequency
    channelNames: string[];
    songMessage?: string; // Module message/comment
    songLength: number; // Number of patterns in order list
    restartPosition: number; // Pattern to restart at on loop
    patternOrderTable: number[]; // Pattern playback order (0-255 entries)
  };

  // Preserve original samples
  originalSamples?: {
    [instrumentId: number]: ParsedSample;
  };

  // Preserve envelope data
  envelopes?: {
    [instrumentId: number]: {
      volumeEnvelope?: EnvelopePoints;
      panningEnvelope?: EnvelopePoints;
      autoVibrato?: AutoVibrato;
      fadeout: number;
    };
  };

  // XM-specific data
  xmData?: {
    frequencyType: 'amiga' | 'linear';
    defaultPanning: number[]; // Per-channel panning (0-255)
  };

  // Furnace-specific data
  furnaceData?: {
    speed2?: number;
    hz?: number;
    virtualTempoN?: number;
    virtualTempoD?: number;
    compatFlags?: Record<string, unknown>;
    grooves?: number[][];
    subsongCount?: number;
    currentSubsong?: number;
    subsongNames?: string[];
    allSubsongs?: Array<{
      subsongIndex: number;
      patterns: unknown[][][];
      patternOrderTable?: number[];
      ordersLen?: number;
      initialBPM?: number;
      initialSpeed?: number;
    }>;
    systems?: number[];
    systemChans?: number[];
    systemName?: string;
    channelShortNames?: string[];
    effectColumns?: number[];
    chipFlags?: string[];
    tuning?: number;
  };
}

export interface PatternSequence {
  patternId: string;
  repeat: number;
}

export interface CursorPosition {
  channelIndex: number;
  rowIndex: number;
  noteColumnIndex: number; // 0-3: which note column the cursor is in (0 = primary)
  columnType: 'note' | 'instrument' | 'volume' | 'effTyp' | 'effParam' | 'effTyp2' | 'effParam2' | 'flag1' | 'flag2' | 'cutoff' | 'resonance' | 'envMod' | 'pan' | 'probability' | 'automation';
  digitIndex: number; // For hex input (0-2 depending on column)
}

export interface BlockSelection {
  startChannel: number;
  endChannel: number;
  startRow: number;
  endRow: number;
  startColumn: CursorPosition['columnType'];
  endColumn: CursorPosition['columnType'];
  columnTypes: CursorPosition['columnType'][];
}

export interface ClipboardData {
  channels: number;
  rows: number;
  data: TrackerCell[][];
  columnTypes?: CursorPosition['columnType'][];
}

export type ColumnVisibility = {
  note: boolean;
  instrument: boolean;
  volume: boolean;
  effect: boolean;
  effect2: boolean;
  flag1: boolean;  // Flexible column: can be accent or slide
  flag2: boolean;  // Flexible column: can be accent or slide
  cutoff: boolean;
  resonance: boolean;
  envMod: boolean;
  pan: boolean;
  probability: boolean;
};

export interface TrackerState {
  patterns: Pattern[];
  sequence: PatternSequence[];
  currentPatternId: string;
  currentSequenceIndex: number;
  cursor: CursorPosition;
  selection: BlockSelection | null;
  clipboard: ClipboardData | null;
  followPlayback: boolean;
  columnVisibility: ColumnVisibility;
}

export const DEFAULT_COLUMN_VISIBILITY: ColumnVisibility = {
  note: true,
  instrument: true,
  volume: true,
  effect: true,
  effect2: true,
  flag1: false,
  flag2: false,
  cutoff: false,
  resonance: false,
  envMod: false,
  pan: false,
  probability: false,
};

export const EMPTY_CELL: TrackerCell = {
  note: 0,        // 0 = no note
  instrument: 0,  // 0 = no instrument
  volume: 0,      // 0x00 = nothing
  effTyp: 0,      // 0 = no effect (arpeggio with 00 param = no effect)
  eff: 0,         // 0x00 = no parameter
  effTyp2: 0,     // 0 = no second effect
  eff2: 0,        // 0x00 = no second parameter
};

export const NOTE_OFF: TrackerCell = {
  note: 97,       // 97 = note off (key release)
  instrument: 0,  // 0 = no instrument
  volume: 0,      // 0x00 = nothing
  effTyp: 0,      // 0 = no effect
  eff: 0,         // 0x00 = no parameter
  effTyp2: 0,     // 0 = no second effect
  eff2: 0,        // 0x00 = no second parameter
};

// ── Editor Mode ─────────────────────────────────
export type EditorMode = 'classic' | 'furnace' | 'hively' | 'musicline' | 'goattracker' | 'klystrack' | 'jamcracker' | 'sc68' | 'tfmx' | 'sidfactory2' | 'cheesecutter';

// ── Furnace Native Data ─────────────────────────
export interface FurnaceNativeData {
  subsongs: FurnaceSubsong[];
  activeSubsong: number;
  chipIds: number[];  // Furnace system IDs (= FurnaceDispatchPlatform values) for each chip
  systemChans?: number[];  // Per-chip channel counts from parser (sysDef; may differ from dispatch runtime)
  compatFlags?: Record<string, unknown>;  // Furnace compat flags (passed to WASM sequencer)
  grooves?: Array<{ len: number; val: number[] }>;  // Groove patterns for 09xx effect
  chipFlags?: string[];  // Per-chip flag strings (key=value\n format) for clock/model selection
  tuning?: number;  // A-4 tuning in Hz (default 440.0)
}

export interface FurnaceSubsong {
  name: string;
  patLen: number;                    // Rows per pattern (default 64)
  ordersLen: number;                 // Number of positions
  orders: number[][];                // orders[channel][position] = pattern_index
  channels: FurnaceChannelData[];    // Per-channel pattern pools
  speed1: number;
  speed2: number;
  hz: number;
  virtualTempoN: number;
  virtualTempoD: number;
  speedPattern?: number[];           // Groove-style speed pattern (1-16 entries)
}

export interface FurnaceChannelData {
  name: string;
  effectCols: number;                // 1-8 effect columns
  patterns: Map<number, FurnacePatternData>;  // pattern_index → data
}

export interface FurnacePatternData {
  rows: FurnaceRow[];
}

export interface FurnaceRow {
  note: number;        // -1=empty, 0-179=notes, 252=null, 253=off, 254=release, 255=macro-rel
  ins: number;         // -1=empty, 0-based
  vol: number;         // -1=empty, 0-127
  effects: Array<{ cmd: number; val: number }>;  // Up to 8 effect pairs
}

// ── Furnace subsong playback data (pre-converted for in-editor switching) ──
export interface FurnaceSubsongPlayback {
  name: string;
  patterns: Pattern[];
  songPositions: number[];
  initialSpeed: number;
  initialBPM: number;
  speed2?: number;
  hz?: number;
  virtualTempoN?: number;
  virtualTempoD?: number;
  grooves?: number[][];
}

// ── HivelyTracker Native Data ───────────────────
export interface HivelyNativeData {
  channels: number;              // 4 (AHX) or 4-16 (HVL)
  trackLength: number;           // Rows per track (typically 64)
  tracks: HivelyNativeTrack[];   // Pool of reusable tracks (up to 256)
  positions: HivelyNativePosition[];  // Song arrangement (up to 1000)
  tempo: number;
  speedMultiplier: number;
}

export interface HivelyNativeTrack {
  id: number;
  steps: HivelyNativeStep[];  // trackLength entries
}

export interface HivelyNativeStep {
  note: number;       // 0=empty, 1-60 (C-0 to B-4)
  instrument: number; // 0=empty, 1-63
  fx: number;         // Primary effect 0-15
  fxParam: number;    // Primary effect param 0-255
  fxb: number;        // Secondary effect 0-15
  fxbParam: number;   // Secondary effect param 0-255
}

export interface HivelyNativePosition {
  track: number[];      // track index per channel
  transpose: number[];  // signed transpose per channel (-128 to +127)
}

// ── Klystrack Native Data ──────────────────────────────────────────────────

export interface KlysNativeData {
  channels: number;
  songLength: number;
  loopPoint: number;
  songSpeed: number;
  songSpeed2: number;
  songRate: number;
  masterVolume: number;
  flags: number;
  patterns: KlysNativePattern[];
  sequences: KlysNativeSequence[];  // per-channel
  instruments: KlysNativeInstrument[];
}

export interface KlysNativePattern {
  numSteps: number;
  steps: KlysNativeStep[];
}

export interface KlysNativeStep {
  note: number;        // 0=empty, 1-96 (C-0 to B-7), 97=note-off
  instrument: number;  // 0xFF=empty, 0-254
  ctrl: number;        // bitfield: legato, slide, vibrato
  volume: number;      // 0-128 or special values
  command: number;     // 16-bit effect command (type << 8 | param)
}

export interface KlysNativeSequence {
  entries: KlysNativeSeqEntry[];
}

export interface KlysNativeSeqEntry {
  position: number;    // tick position in the arrangement
  pattern: number;     // pattern index
  noteOffset: number;  // signed transpose
}

export interface KlysNativeInstrument {
  name: string;
  adsr: { a: number; d: number; s: number; r: number };
  flags: number;       // MUS_INST_* bitfield (32-bit)
  cydflags: number;    // CYD_CHN_* bitfield (32-bit)
  baseNote: number;
  finetune: number;    // signed
  slideSpeed: number;
  pw: number;
  volume: number;
  progPeriod: number;
  vibratoSpeed: number;
  vibratoDepth: number;
  pwmSpeed: number;
  pwmDepth: number;
  cutoff: number;
  resonance: number;
  flttype: number;
  ymEnvShape: number;
  buzzOffset: number;  // signed
  fxBus: number;
  vibShape: number;
  vibDelay: number;
  pwmShape: number;
  lfsrType: number;
  wavetableEntry: number;
  ringMod: number;
  syncSource: number;
  fm: {
    flags: number;     // CYD_FM_* bitfield (32-bit)
    modulation: number;
    feedback: number;
    wave: number;
    harmonic: number;
    adsr: { a: number; d: number; s: number; r: number };
    attackStart: number;
  };
  program: number[];  // 32 entries
}

