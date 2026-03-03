/**
 * Exotic instrument types — UADE, Hively, MAME, ChiptuneModule, and various
 * Amiga tracker synth formats (SoundMon, SidMon, Fred, TFMX, etc.)
 */

/**
 * ChiptuneModule Configuration
 * Uses libopenmpt WASM for sample-accurate MOD/XM/IT/S3M playback
 */
export interface ChiptuneModuleConfig {
  moduleData: string;             // Base64-encoded original module file
  format: 'MOD' | 'XM' | 'IT' | 'S3M' | 'UNKNOWN';
  sourceFile?: string;            // Original filename for reference
  useLibopenmpt?: boolean;        // If true, use libopenmpt for playback (default: true)
  repeatCount?: number;           // -1 = infinite, 0 = once, >0 = n times
  stereoSeparation?: number;      // 0-200% stereo separation (100 = default)
  interpolationFilter?: number;   // 0 = none, 1 = linear, 2 = cubic, 8 = sinc
}

// ── HivelyTracker / AHX Configuration ───────────────────────────────────────

export interface HivelyEnvelopeConfig {
  aFrames: number;
  aVolume: number;
  dFrames: number;
  dVolume: number;
  sFrames: number;
  rFrames: number;
  rVolume: number;
}

export interface HivelyPerfEntryConfig {
  note: number;
  waveform: number;        // 0=triangle, 1=sawtooth, 2=square, 3=noise (+4 for filtered variants)
  fixed: boolean;
  fx: [number, number];
  fxParam: [number, number];
}

export interface HivelyConfig {
  volume: number;              // 0-64
  waveLength: number;          // 0-5 (maps to 4,8,16,32,64,128 samples)
  filterLowerLimit: number;    // 0-127
  filterUpperLimit: number;    // 0-63
  filterSpeed: number;         // 0-63
  squareLowerLimit: number;    // 0-255
  squareUpperLimit: number;    // 0-255
  squareSpeed: number;         // 0-63
  vibratoDelay: number;        // 0-255
  vibratoSpeed: number;        // 0-255
  vibratoDepth: number;        // 0-15
  hardCutRelease: boolean;
  hardCutReleaseFrames: number; // 0-7
  envelope: HivelyEnvelopeConfig;
  performanceList: {
    speed: number;
    entries: HivelyPerfEntryConfig[];
  };
}

// ── JamCracker Pro Configuration ────────────────────────────────────────────

export interface JamCrackerConfig {
  /** Instrument name (up to 31 chars) */
  name: string;
  /** Instrument flags: bit 0 = loop, bit 1 = AM synth (vs PCM) */
  flags: number;
  /** AM synthesis: waveform data (64 bytes per waveform chunk) */
  waveformData?: Uint8Array;
  /** AM synthesis: phase modulation delta (controls blend rate) */
  phaseDelta: number;
  /** Volume (0-64, Amiga standard) */
  volume: number;
  /** Sample size in bytes */
  sampleSize: number;
  /** Is this an AM/synthesis instrument? */
  isAM: boolean;
  /** Has sample loop? */
  hasLoop: boolean;
}

/**
 * UADE (Universal Amiga Dead-player Engine) configuration.
 * Stores the raw file bytes + metadata for playback-only exotic Amiga formats.
 */
export interface UADEConfig {
  type: 'uade';
  filename: string;
  fileData: ArrayBuffer;
  subsongCount: number;
  currentSubsong: number;
  metadata: {
    player: string;        // Detected eagleplayer name (e.g. "JochenHippel")
    formatName: string;    // Human-readable format name
    minSubsong: number;
    maxSubsong: number;
  };
}

// =============================================================================
// UADE Format-Specific Synth Configs
// =============================================================================

/**
 * SoundMon II (Brian Postma) instrument configuration.
 */
export interface SoundMonConfig {
  type: 'synth' | 'pcm';
  // Synth fields (type === 'synth')
  waveType: number;          // 0-15: oscillator waveform
  waveSpeed: number;         // 0-15: waveform morph rate
  arpTable: number[];        // 16 entries: semitone offsets per tick
  arpSpeed: number;          // 0-15: ticks per arpeggio step
  attackVolume: number;      // 0-64
  decayVolume: number;       // 0-64
  sustainVolume: number;     // 0-64
  releaseVolume: number;     // 0-64
  attackSpeed: number;       // 0-63
  decaySpeed: number;        // 0-63
  sustainLength: number;     // 0-255 ticks
  releaseSpeed: number;      // 0-63
  vibratoDelay: number;      // 0-255 ticks before vibrato starts
  vibratoSpeed: number;      // 0-63
  vibratoDepth: number;      // 0-63
  portamentoSpeed: number;   // 0-63 (0 = disabled)
  // PCM fields (type === 'pcm')
  pcmData?: Uint8Array;      // Raw 8-bit signed PCM
  loopStart?: number;        // Loop start in samples
  loopLength?: number;       // Loop length in samples (0 = no loop)
  finetune?: number;         // -8..+7
  volume?: number;           // 0-64
  transpose?: number;        // -12..+12 semitones
}

/**
 * SidMon II instrument configuration.
 */
export interface SidMonConfig {
  type: 'synth' | 'pcm';
  // Synth fields
  waveform: 0 | 1 | 2 | 3;  // 0=triangle, 1=sawtooth, 2=pulse, 3=noise
  pulseWidth: number;         // 0-255 (for pulse waveform)
  attack: number;             // 0-15 (SID ADSR format)
  decay: number;              // 0-15
  sustain: number;            // 0-15
  release: number;            // 0-15
  arpTable: number[];         // 8 entries: semitone offsets
  arpSpeed: number;           // 0-15 ticks per step
  vibDelay: number;           // 0-255 ticks
  vibSpeed: number;           // 0-63
  vibDepth: number;           // 0-63
  filterCutoff: number;       // 0-255
  filterResonance: number;    // 0-15
  filterMode: number;         // 0=LP, 1=HP, 2=BP
  // PCM fields
  pcmData?: Uint8Array;
  loopStart?: number;
  loopLength?: number;
  finetune?: number;          // -8..+7
}

/**
 * Digital Mugician (V1/V2) instrument configuration.
 */
export interface DigMugConfig {
  wavetable: [number, number, number, number]; // 4 waveform indices
  waveBlend: number;         // 0-63: blend position across 4 waves
  waveSpeed: number;         // 0-63: morph rate
  volume: number;            // 0-64
  arpTable: number[];        // 8 entries: semitone offsets
  arpSpeed: number;          // 0-15
  vibSpeed: number;          // 0-63
  vibDepth: number;          // 0-63
  waveformData?: Uint8Array;
  pcmData?: Uint8Array;
  loopStart?: number;
  loopLength?: number;
}

/**
 * Future Composer 1.3/1.4 instrument configuration.
 */
export interface FCConfig {
  waveNumber: number;        // 0-46: initial waveform
  synthTable: Array<{        // 16 synth macro steps
    waveNum: number;
    transposition: number;
    effect: number;
  }>;
  synthSpeed: number;        // 0-15: ticks per synth macro step
  atkLength: number;         // 0-255: attack length in ticks
  atkVolume: number;         // 0-64: attack peak volume
  decLength: number;         // 0-255: decay length in ticks
  decVolume: number;         // 0-64: decay end volume (= sustain level)
  sustVolume: number;        // 0-64: sustain volume
  relLength: number;         // 0-255: release length in ticks
  vibDelay: number;          // 0-255: ticks before vibrato starts
  vibSpeed: number;          // 0-63
  vibDepth: number;          // 0-63
  arpTable: number[];        // 16 entries: semitone offsets
}

/**
 * Delta Music 1.0 instrument configuration.
 */
export interface DeltaMusic1Config {
  volume: number;
  attackStep: number;
  attackDelay: number;
  decayStep: number;
  decayDelay: number;
  sustain: number;
  releaseStep: number;
  releaseDelay: number;
  vibratoWait: number;
  vibratoStep: number;
  vibratoLength: number;
  bendRate: number;
  portamento: number;
  tableDelay: number;
  arpeggio: number[];
  isSample: boolean;
  table: number[] | null;
}

export interface DeltaMusic2VolEntry {
  speed: number;   // 0-255
  level: number;   // 0-255 (volume level)
  sustain: number; // 0-255 (ticks at this level)
}

export interface DeltaMusic2VibEntry {
  speed: number;   // 0-255
  delay: number;   // 0-255 (ticks before this vibrato starts)
  sustain: number; // 0-255 (ticks at this vibrato)
}

export interface DeltaMusic2Config {
  volTable: DeltaMusic2VolEntry[];
  vibTable: DeltaMusic2VibEntry[];
  pitchBend: number;
  table: Uint8Array;
  isSample: boolean;
}

/**
 * Sonic Arranger (.sa) synth instrument configuration.
 */
export interface SonicArrangerConfig {
  volume: number;
  fineTuning: number;
  waveformNumber: number;
  waveformLength: number;
  portamentoSpeed: number;
  vibratoDelay: number;
  vibratoSpeed: number;
  vibratoLevel: number;
  amfNumber: number;
  amfDelay: number;
  amfLength: number;
  amfRepeat: number;
  adsrNumber: number;
  adsrDelay: number;
  adsrLength: number;
  adsrRepeat: number;
  sustainPoint: number;
  sustainDelay: number;
  effect: number;
  effectArg1: number;
  effectArg2: number;
  effectArg3: number;
  effectDelay: number;
  arpeggios: [
    { length: number; repeat: number; values: number[] },
    { length: number; repeat: number; values: number[] },
    { length: number; repeat: number; values: number[] },
  ];
  waveformData: number[];
  adsrTable: number[];
  amfTable: number[];
  allWaveforms: number[][];
  name: string;
}

/**
 * Fred Editor instrument configuration (real format — PWM synthesis).
 */
export interface FredConfig {
  envelopeVol:   number;
  attackSpeed:   number;
  attackVol:     number;
  decaySpeed:    number;
  decayVol:      number;
  sustainTime:   number;
  releaseSpeed:  number;
  releaseVol:    number;
  vibratoDelay: number;
  vibratoSpeed: number;
  vibratoDepth: number;
  arpeggio:      number[];
  arpeggioLimit: number;
  arpeggioSpeed: number;
  pulseRateNeg:  number;
  pulseRatePos:  number;
  pulseSpeed:    number;
  pulsePosL:     number;
  pulsePosH:     number;
  pulseDelay:    number;
  relative:      number;
}

/**
 * TFMX (Jochen Hippel) instrument configuration.
 */
export interface TFMXConfig {
  sndSeqsCount:  number;
  sndModSeqData: Uint8Array;
  volModSeqData: Uint8Array;
  sampleCount:   number;
  sampleHeaders: Uint8Array;
  sampleData:    Uint8Array;
}

/**
 * Jochen Hippel CoSo instrument configuration.
 */
export interface HippelCoSoConfig {
  fseq:     number[];
  vseq:     number[];
  volSpeed: number;
  vibSpeed: number;
  vibDepth: number;
  vibDelay: number;
}

/**
 * Rob Hubbard synthesizer configuration.
 */
export interface RobHubbardConfig {
  sampleLen: number;
  loopOffset: number;
  sampleVolume: number;
  relative: number;
  divider: number;
  vibratoIdx: number;
  hiPos: number;
  loPos: number;
  vibTable: number[];
  sampleData: number[];
}

// ── SidMon 1.0 ──────────────────────────────────────────────────────────────

export interface SidMon1Config {
  arpeggio?: number[];
  attackSpeed?: number;
  attackMax?: number;
  decaySpeed?: number;
  decayMin?: number;
  sustain?: number;
  releaseSpeed?: number;
  releaseMin?: number;
  phaseShift?: number;
  phaseSpeed?: number;
  finetune?: number;
  pitchFall?: number;
  mainWave?: number[];
  phaseWave?: number[];
}

/**
 * OctaMED SynthInstr Configuration
 */
export interface OctaMEDConfig {
  volume: number;
  voltblSpeed: number;
  wfSpeed: number;
  vibratoSpeed: number;
  loopStart: number;
  loopLen: number;
  voltbl: Uint8Array;
  wftbl: Uint8Array;
  waveforms: Int8Array[];
}

/**
 * David Whittaker synthesizer configuration.
 */
export interface DavidWhittakerConfig {
  defaultVolume?: number;
  relative?: number;
  vibratoSpeed?: number;
  vibratoDepth?: number;
  volseq?: number[];
  frqseq?: number[];
}

/**
 * SunVox WASM patch configuration.
 */
export interface SunVoxConfig {
  patchData: ArrayBuffer | null;
  patchName: string;
  isSong?: boolean;
  controlValues: Record<string, number>;
}
