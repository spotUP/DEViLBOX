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
  wavePCM?: number[];        // Signed 8-bit PCM of the synth waveform (64 bytes)
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
  wavePCM?: number[];        // Signed 8-bit PCM of the initial waveform (32-64 bytes)
  volMacroData?: number[];   // Raw vol macro bytes (5..63): volume values + control codes
  volMacroSpeed?: number;    // Vol macro speed (ticks per step)
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
  /** Raw waveform pool bytes (sampleData from parser) for XM waveform extraction */
  sampleData?: number[];
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
  /** Selected waveform PCM (signed 8-bit, up to 256 bytes) for XM export */
  waveformPCM?: number[];
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
 * InStereo! 2.0 synth instrument configuration.
 * Wavetable synthesis with ADSR, LFO, EG (envelope generator), arpeggios,
 * vibrato, and portamento. Two 256-byte waveforms per instrument.
 */
export interface InStereo2Config {
  volume: number;           // 0-64
  waveformLength: number;   // effective waveform length (2-256)
  portamentoSpeed: number;  // 0-255
  vibratoDelay: number;     // 0-255
  vibratoSpeed: number;     // 0-255
  vibratoLevel: number;     // 0-255
  adsrLength: number;       // 0-127 (table playback length)
  adsrRepeat: number;       // 0-127 (loop point within table)
  sustainPoint: number;     // 0-127 (sustain hold position in ADSR)
  sustainSpeed: number;     // 0-255 (sustain countdown speed)
  amfLength: number;        // 0-127 (LFO/AMF table playback length)
  amfRepeat: number;        // 0-127 (LFO/AMF loop point)
  // Envelope Generator (EG)
  egMode: number;           // 0=disabled, 1=calc, 2=free
  egStartLen: number;       // EG start/length (calc mode)
  egStopRep: number;        // EG stop/repeat (calc mode)
  egSpeedUp: number;        // EG speed up (calc mode)
  egSpeedDown: number;      // EG speed down (calc mode)
  // Arpeggios (3 sub-tables, 14 values each)
  arpeggios: [
    { length: number; repeat: number; values: number[] },
    { length: number; repeat: number; values: number[] },
    { length: number; repeat: number; values: number[] },
  ];
  // Table data
  adsrTable: number[];      // 128 unsigned bytes (volume envelope)
  lfoTable: number[];       // 128 signed bytes (pitch modulation)
  egTable: number[];        // 128 unsigned bytes (waveform envelope generator)
  waveform1: number[];      // 256 signed bytes
  waveform2: number[];      // 256 signed bytes
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
 * One entry in the Hippel CoSo sample bank. Extracted from the sample header
 * table between `headersOff` and `samplesData` in the COSO file format. In the
 * COSO variant each header is 10 bytes: pointer(u32 BE), length*2(u16 BE),
 * loopPtr(u16 BE), repeat*2(u16 BE) — no name, no volume (those only appear in
 * the non-COSO Hippel variant). See FlodJS JHPlayer.js and HippelCoSoParser.
 */
export interface HippelCoSoSampleEntry {
  /** Zero-based index into the sample bank. */
  index: number;
  /** File-relative pointer into the samples data area. */
  pointer: number;
  /** Sample length in bytes (already ×2 from the raw word in the header). */
  length: number;
  /** Loop start pointer (raw loopPtr as stored, NOT yet ORed with `pointer`). */
  loopStart: number;
  /** Repeat length in bytes (already ×2 from the raw word in the header). */
  repeatLength: number;
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
  /**
   * The entire CoSo sample bank, copied onto every instrument's config so the
   * editor can render a sample browser without pulling from a separate store.
   * Shared across all instruments in the same song — HC samples are not
   * owned by a single instrument (they're selected at runtime via fseq -32
   * opcodes) so this is intentionally redundant. Populated by the parser.
   */
  sampleBank?: HippelCoSoSampleEntry[];
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

// ── Steve Turner ─────────────────────────────────────────────────────────────

/**
 * Steve Turner synthesizer configuration.
 * Parameters correspond to the 48-byte instrument structure in the replayer.
 */
export interface SteveTurnerConfig {
  priority: number;       // instrument priority level (0-255)
  sampleIdx: number;      // sample index (0-29, or negative for synth)
  initDelay: number;      // delay before note starts (0-255 ticks)
  env1Duration: number;   // envelope segment 1 duration (0-255)
  env1Delta: number;      // envelope segment 1 volume delta (-128..127)
  env2Duration: number;   // envelope segment 2 duration (0-255)
  env2Delta: number;      // envelope segment 2 volume delta (-128..127)
  pitchShift: number;     // pitch right-shift amount (0-7)
  oscCount: number;       // oscillation counter (0-65535)
  oscDelta: number;       // oscillation volume delta (-128..127)
  oscLoop: number;        // oscillation direction toggle count (0-255)
  decayDelta: number;     // decay/release volume delta (-128..127)
  numVibrato: number;     // number of vibrato table entries (0-5)
  vibratoDelay: number;   // ticks before vibrato starts (0-255)
  vibratoSpeed: number;   // ticks between vibrato depth changes (0-255)
  vibratoMaxDepth: number;// maximum vibrato depth (0-255)
  chain: number;          // instrument chain (0=none, 1-32=next instrument)
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
 * Symphonie Pro instrument configuration.
 * Editable per-instrument parameters from the .symmod format.
 * Volume, tuning, loop, DSP bypass, and multichannel settings.
 */
export interface SymphonieConfig {
  /** Instrument type: 0=Normal(one-shot), 4=Loop, 8=Sustain, -4=Kill, -8=Silent */
  type: number;
  /** Instrument volume (0-100) */
  volume: number;
  /** Signed semitone offset (includes downsample correction) */
  tune: number;
  /** Signed fine-tune adjustment */
  fineTune: number;
  /** If true, voice bypasses DSP ring buffer */
  noDsp: boolean;
  /** 0=mono, 1=stereoL, 2=stereoR, 3=lineSrc */
  multiChannel: number;
  /** Loop start as percentage x 65536 (0%=0, 100%=6553600) */
  loopStart: number;
  /** Loop length as percentage x 65536 (same encoding as loopStart) */
  loopLen: number;
  /** Number of loop repetitions (0=infinite) */
  numLoops: number;
  /** New loop system flag (bit 4 of LineSampleFlags) */
  newLoopSystem: boolean;
  /** Original sample rate in Hz (0 = assume 8363) */
  sampledFrequency: number;
}

/**
 * StarTrekker AM synthesis configuration.
 * 5-phase ADSR envelope + vibrato + waveform selection.
 * Derived from the NT companion file (120-byte instrument blocks).
 */
export interface StartrekkerAMConfig {
  waveform: number;         // 0=sine, 1=sawtooth, 2=square, 3=noise
  basePeriod: number;       // NT[6]: initial amplitude (0-65535)
  attackTarget: number;     // NT[8]: phase 1 target (signed 16-bit)
  attackRate: number;       // NT[10]: phase 1 rate (signed 16-bit)
  attack2Target: number;    // NT[12]: phase 2 target (signed 16-bit)
  attack2Rate: number;      // NT[14]: phase 2 rate (signed 16-bit)
  decayTarget: number;      // NT[16]: phase 3 target (signed 16-bit)
  decayRate: number;        // NT[18]: phase 3 rate (signed 16-bit)
  sustainCount: number;     // NT[20]: sustain duration in ticks
  releaseRate: number;      // NT[24]: release rate (signed 16-bit)
  vibFreqStep: number;      // NT[28]: vibrato frequency step
  vibAmplitude: number;     // NT[30]: vibrato amplitude (signed 16-bit)
  periodShift: number;      // NT[34]: period left-shift amount (0-15)
}

/**
 * Future Player (Paul van der Valk) instrument configuration.
 *
 * The instrument "detail" structure in the binary holds envelope, modulation,
 * and sample parameters. These fields correspond to the offsets in the
 * FuturePlayer.c update_audio() function.
 */
export interface FuturePlayerConfig {
  /** Whether the instrument uses wavetable mode or PCM sample */
  isWavetable: boolean;
  /** Instrument volume (0-255, detail+0x08) */
  volume: number;
  /** Attack rate — added to envelope level each tick (0-255, detail+0x12) */
  attackRate: number;
  /** Attack peak — envelope target for attack phase (0-255, detail+0x13) */
  attackPeak: number;
  /** Decay rate — subtracted from envelope level each tick (0-255, detail+0x14) */
  decayRate: number;
  /** Sustain level — decay stops here (0-255, detail+0x15) */
  sustainLevel: number;
  /** Sustain rate — rate of change toward sustain target (0-127, bit 7 = subtract; detail+0x16) */
  sustainRate: number;
  /** Sustain target — envelope converges to this level (0-255, detail+0x17) */
  sustainTarget: number;
  /** Release rate — subtracted from envelope on note-off (0-255, detail+0x18) */
  releaseRate: number;
  /** Pitch mod 1 delay in ticks before modulation starts (0-255, detail+0x1F) */
  pitchMod1Delay: number;
  /** Pitch mod 1 shift — left-shift amount for modulation depth (0-7, detail+0x1E) */
  pitchMod1Shift: number;
  /** Pitch mod 1 mode: 0=loop, 1=continue, 0x80=one-shot (detail+0x20) */
  pitchMod1Mode: number;
  /** Pitch mod 1 negate flag (detail+0x21) */
  pitchMod1Negate: boolean;
  /** Whether pitch mod 1 table is present */
  hasPitchMod1: boolean;
  /** Pitch mod 2 delay in ticks (0-255, detail+0x27) */
  pitchMod2Delay: number;
  /** Pitch mod 2 shift (0-7, detail+0x26) */
  pitchMod2Shift: number;
  /** Pitch mod 2 mode (detail+0x28) */
  pitchMod2Mode: number;
  /** Pitch mod 2 negate flag (detail+0x29) */
  pitchMod2Negate: boolean;
  /** Whether pitch mod 2 table is present */
  hasPitchMod2: boolean;
  /** Sample mod 1 delay in ticks (0-255, detail+0x2F) */
  sampleMod1Delay: number;
  /** Sample mod 1 shift (0-7, detail+0x2E) */
  sampleMod1Shift: number;
  /** Sample mod 1 mode (detail+0x30) */
  sampleMod1Mode: number;
  /** Whether sample mod 1 table is present */
  hasSampleMod1: boolean;
  /** Sample mod 2 delay in ticks (0-255, detail+0x37) */
  sampleMod2Delay: number;
  /** Sample mod 2 shift (0-7, detail+0x36) */
  sampleMod2Shift: number;
  /** Sample mod 2 mode (detail+0x38) */
  sampleMod2Mode: number;
  /** Whether sample mod 2 table is present */
  hasSampleMod2: boolean;
  /** PCM sample size in bytes (0 for wavetable instruments) */
  sampleSize: number;
  /**
   * Absolute byte offset of this instrument's "detail" struct inside the
   * loaded module buffer. The editor uses this to compute write addresses
   * (detailPtr + 0x12 = attackRate, detailPtr + 0x13 = attackPeak, etc.)
   * for `FuturePlayerEngine.writeByte()` so knob changes take effect on
   * the next note trigger. Undefined if the parser couldn't locate the
   * detail struct (returns the basic-config fallback path).
   */
  detailPtr?: number;
}

/**
 * SunVox WASM patch configuration.
 */
export interface SunVoxConfig {
  patchData: ArrayBuffer | null;
  patchName: string;
  isSong?: boolean;
  controlValues: Record<string, number>;
  /** SunVox module ID to send note events to (for per-instrument targeting) */
  noteTargetModuleId?: number;
}

/**
 * Geonkick (percussion synthesizer) instrument configuration.
 *
 * MVP shape: stores the entire .gkick preset as an opaque JSON object so
 * the runtime can apply it via GeonkickPresetLoader. The full parameter
 * surface is exposed by GeonkickEngine; this config is just the
 * persistable shape that round-trips through project save/load.
 */
export interface GeonkickConfig {
  /** Display name (matches the preset's `kick.name`, if any). */
  name?: string;
  /** Parsed `.gkick` preset JSON, applied via applyGeonkickPreset. */
  preset?: Record<string, unknown>;
}

/**
 * GoatTracker Ultra (C64 SID tracker) instrument configuration.
 *
 * All values are raw bytes matching the GT Ultra WASM engine's internal format.
 * AD/SR bytes encode SID ADSR: upper nibble = attack/sustain, lower = decay/release.
 * Firstwave encodes initial waveform (bits 4-7) + gate bit (bit 0).
 * Table pointers index into 4 global shared tables (wave/pulse/filter/speed).
 */
export interface GTUltraConfig {
  ad: number;           // Attack/Decay byte (0-255): upper nibble=attack, lower=decay
  sr: number;           // Sustain/Release byte (0-255): upper nibble=sustain, lower=release
  vibdelay: number;     // Vibrato delay frames (0-255)
  gatetimer: number;    // Gate timer control (0-255)
  firstwave: number;    // Initial waveform + gate bit (0-255)
  name: string;         // Instrument name (max 16 chars)
  wavePtr: number;      // Index into global wave table (0-255)
  pulsePtr: number;     // Index into global pulse table (0-255)
  filterPtr: number;    // Index into global filter table (0-255)
  speedPtr: number;     // Index into global speed table (0-255)
}

// ── SID Factory II Configuration ─────────────────────────────────────────────
// SF2 instruments are driver-defined byte tables; shape varies by driver version.
// We store the raw bytes + table definition metadata from the header blocks.

export interface SF2Config {
  rawBytes: Uint8Array;       // Raw instrument bytes from driver table
  name: string;               // Instrument name (from instrument descriptor block)
  instIndex: number;          // 0-based index in the driver's instrument table
  columnCount: number;        // Number of bytes per instrument (from table definition)
  /** Optional column labels from the driver's table descriptor */
  columnLabels?: string[];
}

/**
 * Ron Klaren Sound Module instrument configuration.
 * Parameters extracted from the 32-byte instrument header in the Amiga HUNK binary.
 */
export interface RonKlarenConfig {
  /** true = sample-based, false = synthesis */
  isSample: boolean;
  /** Oscillator phase speed (0-255) */
  phaseSpeed: number;
  /** Wavetable length in words */
  phaseLengthInWords: number;
  /** LFO/vibrato speed (0-255) */
  vibratoSpeed: number;
  /** LFO/vibrato depth (0-255) */
  vibratoDepth: number;
  /** Ticks before vibrato starts (0-255) */
  vibratoDelay: number;
  /** 4-point envelope: each entry has point (target level) and increment (rate) */
  adsr: Array<{ point: number; increment: number }>;
  /** Signed phase value (-128..127) */
  phaseValue: number;
  /** Phase direction: true = reverse */
  phaseDirection: boolean;
  /** Phase position within waveform (0-255) */
  phasePosition: number;
  /** Optional: waveform PCM data for display (signed 8-bit) */
  waveformData?: number[];
}

// ── PreTracker Configuration ───────────────────────────────────────────────
// PreTracker by Pink/Abyss — 4-channel Amiga synth tracker with wavetable
// oscillators, filters, ADSR envelopes, chord support, and instrument command
// sequences. Architecturally similar to AHX/HivelyTracker.

export interface PreTrackerWaveConfig {
  loopStart: number;
  loopEnd: number;
  subloopLen: number;
  allow9xx: number;
  subloopWait: number;
  subloopStep: number;
  chipram: number;
  loopOffset: number;
  chordNote1: number;
  chordNote2: number;
  chordNote3: number;
  chordShift: number;
  oscPhaseSpd: number;
  oscType: number;        // 0=saw, 1=tri, 2=sqr, 3=noise
  oscPhaseMin: number;
  oscPhaseMax: number;
  oscBasenote: number;
  oscGain: number;
  samLen: number;
  mixWave: number;
  volAttack: number;
  volDelay: number;
  volDecay: number;
  volSustain: number;
  fltType: number;        // 0=none, 1=LP, 2=HP, 3=BP, 4=notch
  fltResonance: number;
  pitchRamp: number;
  fltStart: number;
  fltMin: number;
  fltMax: number;
  fltSpeed: number;
  modWetness: number;
  modLength: number;
  modPredelay: number;
  modDensity: number;
  boost: boolean;
  pitchLinear: boolean;
  volFast: boolean;
  extraOctaves: boolean;
}

export interface PreTrackerInstConfig {
  vibratoDelay: number;
  vibratoDepth: number;
  vibratoSpeed: number;
  adsrAttack: number;
  adsrDecay: number;
  adsrSustain: number;
  adsrRelease: number;
  patternSteps: number;
}

export interface PreTrackerConfig {
  waves: PreTrackerWaveConfig[];
  instruments: PreTrackerInstConfig[];
  waveNames: string[];
  instrumentNames: string[];
  numPositions: number;
  numSteps: number;
  subsongCount: number;
  title: string;
  author: string;
}
