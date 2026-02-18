/**
 * Effect System Types
 *
 * Format-aware effect processing for MOD, XM, S3M, and IT modules
 */

// Supported module formats
export type ModuleFormat =
  | 'MOD' | 'XM' | 'S3M' | 'IT'
  | 'DBM' | 'DIGI' | 'MTM' | 'MED'
  | 'OKT' | '669' | 'FAR' | 'ULT'
  | 'STM' | 'STX' | 'PT36' | 'SFX'
  | 'FUR' | 'NATIVE';

// Format-specific configuration
export interface FormatConfig {
  format: ModuleFormat;
  emulatePTBugs?: boolean;    // MOD: Emulate ProTracker quirks
  linearSlides?: boolean;     // XM: Use linear frequency slides (vs Amiga)
  amigaLimits?: boolean;      // S3M/IT: Clamp periods to 113-856 range
  initialSpeed: number;       // Ticks per row (default 6)
  initialTempo: number;       // BPM (default 125)
  numChannels: number;        // Number of channels
}

// Vibrato/Tremolo waveform types
export type WaveformType = 'sine' | 'rampDown' | 'rampUp' | 'square' | 'random';

// Metadata attached to the active instrument (auto-vibrato, MOD defaults, IT envelopes)
export interface ActiveInstrumentMeta {
  autoVibrato?: {
    type: 'sine' | 'square' | 'rampDown' | 'rampUp';
    sweep: number;
    depth: number;
    rate: number;
  };
  defaultVolume?: number;
  finetune?: number;
  envelopes?: Record<string, unknown>;
  [key: string]: unknown;
}

// Per-channel state for effect processing
export interface ChannelState {
  // Pitch
  period: number;             // Amiga period value (MOD/S3M)
  frequency: number;          // Linear frequency in Hz (XM/IT)
  finetune: number;           // Finetune value (-8 to +7 for MOD, -128 to +127 for XM)

  // Volume
  volume: number;             // Channel volume 0-64
  fadeOutVolume: number;      // For instrument fade-out

  // Panning
  pan: number;                // Pan position 0-255 (0=left, 128=center, 255=right)

  // Vibrato state
  vibratoPos: number;         // Vibrato waveform position 0-63
  vibratoSpeed: number;       // Vibrato speed
  vibratoDepth: number;       // Vibrato depth
  vibratoWaveform: WaveformType;
  vibratoRetrigger: boolean;  // Reset on new note?

  // Tremolo state
  tremoloPos: number;         // Tremolo waveform position 0-63
  tremoloSpeed: number;       // Tremolo speed
  tremoloDepth: number;       // Tremolo depth
  tremoloWaveform: WaveformType;
  tremoloRetrigger: boolean;  // Reset on new note?

  // Portamento
  portamentoSpeed: number;    // Tone portamento speed
  portamentoTarget: number;   // Target period/frequency
  glissando: boolean;         // Glissando control (E3x) - snap to semitones

  // Tremor (Ixy/Txy)
  tremorOnTime: number;       // Ticks sound is on
  tremorOffTime: number;      // Ticks sound is off
  tremorPos: number;          // Current position in cycle

  // Retrigger (E9x/Qxy)
  retrigTick: number;         // Retrigger interval
  retrigVolChange: number;    // Volume change type (0-15)

  // Pattern loop (E6x)
  loopRow: number;            // Loop start row
  loopCount: number;          // Remaining loop iterations

  // Note delay/cut
  noteCutTick: number;        // Tick to cut note (-1 = disabled)
  noteDelayTick: number;      // Tick to trigger note (-1 = disabled)
  keyOffTick: number;         // Tick to key-off (XM Kxx)

  // Filter state
  filterCutoff?: number;      // 0-127
  filterResonance?: number;   // 0-127

  // Envelope state (for compliance testing)
  envelopeVolume?: number;    // 0-64
  envelopePanning?: number;   // 0-64
  envelopePitch?: number;     // For filter/pitch envelopes
  fadeoutVolume?: number;     // 0-65536

  // Auto-vibrato state
  autoVibratoPos?: number;    // 0-255
  autoVibratoSweep?: number;  // Current depth multiplier (0-255)
  activeInstrument?: ActiveInstrumentMeta; // Metadata for current instrument (XM/IT auto-vibrato)
  nnaMode?: number;           // 0=Cut, 1=Continue, 2=Off, 3=Fade
  
  // Memory values (for effects that remember last parameter)
  lastPortaUp: number;
  lastPortaDown: number;
  lastTonePortaSpeed: number;
  lastVibratoSpeed: number;
  lastVibratoDepth: number;
  lastTremoloSpeed: number;
  lastTremoloDepth: number;
  lastVolumeSlide: number;
  lastPanSlide: number;
  lastSampleOffset: number;
  lastArpeggio: number;
  lastRetrig: number;
  lastTremor: number;
  lastS3MParam?: number;      // Unified memory for S3M effects
  lastGlobalVolumeSlide?: number;
  channelVolume?: number;     // IT separate channel volume
  lastChannelVolumeSlide?: number;

  // Instrument state
  instrumentId: number | null;
  sampleId: number | null;
  noteOn: boolean;            // Is note currently playing?
  funkRepeatPos?: number;     // For EFx Invert Loop
}

// Re-export tracker envelope types
export type { EnvelopePoints, EnvelopePoint } from '../../types/tracker';

// Result of processing an effect tick
export interface TickResult {
  // Pitch changes
  setPeriod?: number;         // Set Amiga period directly
  setFrequency?: number;      // Set frequency in Hz
  frequencySlide?: number;    // Add to frequency (positive = up)
  periodSlide?: number;       // Add to period (positive = down/lower pitch)

  // Volume changes
  setVolume?: number;         // Set volume 0-64
  volumeSlide?: number;       // Add to volume
  setChannelVolume?: number;  // Set channel volume 0-64 (IT)
  setGlobalVolume?: number;   // Set global volume 0-64
  globalVolumeSlide?: number; // Add to global volume

  // Pan changes
  setPan?: number;            // Set pan 0-255
  panSlide?: number;          // Add to pan

  // Note control
  triggerNote?: boolean;      // (Re)trigger note
  cutNote?: boolean;          // Cut note (set volume to 0)
  keyOff?: boolean;           // Key off (start release)
  preventNoteTrigger?: boolean; // Prevent note trigger on tick 0 (for note delay)
  delayedNote?: {             // Delayed note trigger
    tick: number;
    note: string;
    instrument?: number;
  };

  // Sample control
  sampleOffset?: number;      // Start sample at offset
  funkRepeat?: number;        // EFx Invert Loop position

  // Amiga control
  setAmigaFilter?: boolean;   // Enable/disable hardware LED filter

  // Filter control (IT/S3M)
  setFilterCutoff?: number;    // 0-127 (127=bypass)
  setFilterResonance?: number; // 0-127
  nnaAction?: number;         // 0=Cut, 1=Continue, 2=Off, 3=Fade
  pastNoteAction?: number;    // 0=Cut, 2=Off, 3=Fade (IT S77-S79)

  // Transport control
  setBPM?: number;            // Set tempo in BPM
  setSpeed?: number;          // Set speed in ticks per row
  patternBreak?: number;      // Break to row in next pattern
  positionJump?: number;      // Jump to song position
  patternLoop?: {             // Pattern loop
    startRow: number;
    count: number;
  };
  patternDelay?: number;      // Delay pattern by N rows
  stopSong?: boolean;         // Stop song playback (F00)
  setGlobalPitchShift?: number; // Global pitch shift in semitones (DJ pitch fader)
}

// Effect handler interface - implemented by format-specific handlers
export interface FormatHandler {
  readonly format: ModuleFormat;

  // Initialize handler with format config
  init(config: FormatConfig): void;

  // Process effect at row start (tick 0)
  processRowStart(
    channel: number,
    note: string | null,
    instrument: number | null,
    volume: number | null,
    effect: string | null,
    state: ChannelState
  ): TickResult;

  // Process effect on subsequent ticks (1 to speed-1)
  processTick(
    channel: number,
    tick: number,
    state: ChannelState
  ): TickResult;

  // Get channel state
  getChannelState(channel: number): ChannelState;

  // Reset channel state
  resetChannel(channel: number): void;

  // Reset all state
  resetAll(): void;
}

// Default channel state factory
export function createDefaultChannelState(): ChannelState {
  return {
    period: 0,
    frequency: 440,
    finetune: 0,
    volume: 64,
    fadeOutVolume: 65536,
    pan: 128,

    vibratoPos: 0,
    vibratoSpeed: 0,
    vibratoDepth: 0,
    vibratoWaveform: 'sine',
    vibratoRetrigger: true,

    tremoloPos: 0,
    tremoloSpeed: 0,
    tremoloDepth: 0,
    tremoloWaveform: 'sine',
    tremoloRetrigger: true,

    portamentoSpeed: 0,
    portamentoTarget: 0,
    glissando: false,

    tremorOnTime: 1,
    tremorOffTime: 1,
    tremorPos: 0,

    retrigTick: 0,
    retrigVolChange: 0,

    loopRow: 0,
    loopCount: 0,

    noteCutTick: -1,
    noteDelayTick: -1,
    keyOffTick: -1,

    lastPortaUp: 0,
    lastPortaDown: 0,
    lastTonePortaSpeed: 0,
    lastVibratoSpeed: 0,
    lastVibratoDepth: 0,
    lastTremoloSpeed: 0,
    lastTremoloDepth: 0,
    lastVolumeSlide: 0,
    lastPanSlide: 0,
    lastSampleOffset: 0,
    lastArpeggio: 0,
    lastRetrig: 0,
    lastTremor: 0,

    instrumentId: null,
    sampleId: null,
    noteOn: false,
  };
}

// XM Volume column effect types
export const XMVolumeEffect = {
  None: 0,
  SetVolume: 0x10,       // 0x10-0x50: Set volume 0-64
  VolumeSlideDown: 0x60, // 0x60-0x6F: Volume slide down
  VolumeSlideUp: 0x70,   // 0x70-0x7F: Volume slide up
  FineVolDown: 0x80,     // 0x80-0x8F: Fine volume slide down
  FineVolUp: 0x90,       // 0x90-0x9F: Fine volume slide up
  VibratoSpeed: 0xA0,    // 0xA0-0xAF: Set vibrato speed
  Vibrato: 0xB0,         // 0xB0-0xBF: Vibrato with depth
  SetPanning: 0xC0,      // 0xC0-0xCF: Set panning
  PanSlideLeft: 0xD0,    // 0xD0-0xDF: Pan slide left
  PanSlideRight: 0xE0,   // 0xE0-0xEF: Pan slide right
  TonePortamento: 0xF0,  // 0xF0-0xFF: Tone portamento
} as const;
export type XMVolumeEffect = typeof XMVolumeEffect[keyof typeof XMVolumeEffect];

// Multi-retrigger volume operations (for Rxy/Qxy effect)
export const RETRIG_VOLUME_OPS: ((v: number) => number)[] = [
  (v) => v,             // 0: No change
  (v) => v - 1,         // 1: -1
  (v) => v - 2,         // 2: -2
  (v) => v - 4,         // 3: -4
  (v) => v - 8,         // 4: -8
  (v) => v - 16,        // 5: -16
  (v) => v * 2 / 3,     // 6: *2/3
  (v) => v / 2,         // 7: /2
  (v) => v,             // 8: No change
  (v) => v + 1,         // 9: +1
  (v) => v + 2,         // A: +2
  (v) => v + 4,         // B: +4
  (v) => v + 8,         // C: +8
  (v) => v + 16,        // D: +16
  (v) => v * 3 / 2,     // E: *3/2
  (v) => v * 2,         // F: *2
];
