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
    channelType?: 'sample' | 'synth' | 'hybrid';
    furnaceType?: number; // Furnace DivChanType for system presets
    hardwareName?: string; // Hardware-specific channel name
    shortName?: string; // Short display name for channel headers
    effectCols?: number; // Number of effect columns (default 2)
    systemId?: number | string; // System preset identifier (number for Furnace fileID)
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
    ops?: number;
    opllPreset?: number;
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
    }>;
  };

  // Macros for per-tick parameter changes
  macros: FurnaceMacroData[];

  // Wavetables for wavetable chips
  wavetables: FurnaceWavetableData[];

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
}

/**
 * Import metadata for MOD/XM files
 * Preserves original module data for editing and re-export
 */
export interface ImportMetadata {
  sourceFormat: 'MOD' | 'XM' | 'IT' | 'S3M' | 'FUR';
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
  };
}

export interface PatternSequence {
  patternId: string;
  repeat: number;
}

export interface CursorPosition {
  channelIndex: number;
  rowIndex: number;
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
