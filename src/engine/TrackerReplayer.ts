/**
 * TrackerReplayer - Real-time tick-based tracker playback
 *
 * This replaces PatternScheduler with a proper tick-based architecture
 * that works for ALL tracker formats (MOD, XM, IT, S3M).
 *
 * All trackers use the same fundamental architecture:
 * - CIA/timer fires every tick (2.5 / BPM seconds)
 * - Speed = ticks per row
 * - Tick 0: read row data, trigger notes
 * - Ticks 1+: process continuous effects
 *
 * Format-specific behavior is handled by effect handlers.
 */

import * as Tone from 'tone';
import type { Pattern, TrackerCell } from '@/types';
import type { InstrumentConfig, FurnaceMacro } from '@/types/instrument';
import { FurnaceMacroType } from '@/types/instrument';
import { getToneEngine } from './ToneEngine';
import { getPatternScheduler } from './PatternScheduler';
import { useTransportStore, cancelPendingRowUpdate } from '@/stores/useTransportStore';
import { getGrooveOffset, getGrooveVelocity, GROOVE_TEMPLATES } from '@/types/audio';
import type { GrooveTemplate } from '@/types/audio';
import { unlockIOSAudio } from '@utils/ios-audio-unlock';

// ============================================================================
// CONSTANTS
// ============================================================================

const AMIGA_PAL_FREQUENCY = 3546895;
const PLAYERS_PER_CHANNEL = 2; // Double-buffered pool for overlap-free note transitions

// Complete period table with all 16 finetune variations
const PERIOD_TABLE = [
  // Finetune 0
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,
  // Finetune 1
  850, 802, 757, 715, 674, 637, 601, 567, 535, 505, 477, 450,
  425, 401, 379, 357, 337, 318, 300, 284, 268, 253, 239, 225,
  213, 201, 189, 179, 169, 159, 150, 142, 134, 126, 119, 113,
  // Finetune 2
  844, 796, 752, 709, 670, 632, 597, 563, 532, 502, 474, 447,
  422, 398, 376, 355, 335, 316, 298, 282, 266, 251, 237, 224,
  211, 199, 188, 177, 167, 158, 149, 141, 133, 125, 118, 112,
  // Finetune 3
  838, 791, 746, 704, 665, 628, 592, 559, 528, 498, 470, 444,
  419, 395, 373, 352, 332, 314, 296, 280, 264, 249, 235, 222,
  209, 198, 187, 176, 166, 157, 148, 140, 132, 125, 118, 111,
  // Finetune 4
  832, 785, 741, 699, 660, 623, 588, 555, 524, 495, 467, 441,
  416, 392, 370, 350, 330, 312, 294, 278, 262, 247, 233, 220,
  208, 196, 185, 175, 165, 156, 147, 139, 131, 124, 117, 110,
  // Finetune 5
  826, 779, 736, 694, 655, 619, 584, 551, 520, 491, 463, 437,
  413, 390, 368, 347, 328, 309, 292, 276, 260, 245, 232, 219,
  206, 195, 184, 174, 164, 155, 146, 138, 130, 123, 116, 109,
  // Finetune 6
  820, 774, 730, 689, 651, 614, 580, 547, 516, 487, 460, 434,
  410, 387, 365, 345, 325, 307, 290, 274, 258, 244, 230, 217,
  205, 193, 183, 172, 163, 154, 145, 137, 129, 122, 115, 109,
  // Finetune 7
  814, 768, 725, 684, 646, 610, 575, 543, 513, 484, 457, 431,
  407, 384, 363, 342, 323, 305, 288, 272, 256, 242, 228, 216,
  204, 192, 181, 171, 161, 152, 144, 136, 128, 121, 114, 108,
  // Finetune -8
  907, 856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480,
  453, 428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240,
  226, 214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120,
  // Finetune -7
  900, 850, 802, 757, 715, 675, 636, 601, 567, 535, 505, 477,
  450, 425, 401, 379, 357, 337, 318, 300, 284, 268, 253, 238,
  225, 212, 200, 189, 179, 169, 159, 150, 142, 134, 126, 119,
  // Finetune -6
  894, 844, 796, 752, 709, 670, 632, 597, 563, 532, 502, 474,
  447, 422, 398, 376, 355, 335, 316, 298, 282, 266, 251, 237,
  223, 211, 199, 188, 177, 167, 158, 149, 141, 133, 125, 118,
  // Finetune -5
  887, 838, 791, 746, 704, 665, 628, 592, 559, 528, 498, 470,
  444, 419, 395, 373, 352, 332, 314, 296, 280, 264, 249, 235,
  222, 209, 198, 187, 176, 166, 157, 148, 140, 132, 125, 118,
  // Finetune -4
  881, 832, 785, 741, 699, 660, 623, 588, 555, 524, 494, 467,
  441, 416, 392, 370, 350, 330, 312, 294, 278, 262, 247, 233,
  220, 208, 196, 185, 175, 165, 156, 147, 139, 131, 123, 117,
  // Finetune -3
  875, 826, 779, 736, 694, 655, 619, 584, 551, 520, 491, 463,
  437, 413, 390, 368, 347, 328, 309, 292, 276, 260, 245, 232,
  219, 206, 195, 184, 174, 164, 155, 146, 138, 130, 123, 116,
  // Finetune -2
  868, 820, 774, 730, 689, 651, 614, 580, 547, 516, 487, 460,
  434, 410, 387, 365, 345, 325, 307, 290, 274, 258, 244, 230,
  217, 205, 193, 183, 172, 163, 154, 145, 137, 129, 122, 115,
  // Finetune -1
  862, 814, 768, 725, 684, 646, 610, 575, 543, 513, 484, 457,
  431, 407, 384, 363, 342, 323, 305, 288, 272, 256, 242, 228,
  216, 203, 192, 181, 171, 161, 152, 144, 136, 128, 121, 114,
];

// Note names for period-to-note conversion
const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
const NOTE_NAMES_CLEAN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Pre-computed XM note → note name lookup (avoids string allocation per call)
// Index 0 = invalid/unused, indices 1-96 = valid note names
const XM_NOTE_NAMES: string[] = new Array(97);
XM_NOTE_NAMES[0] = 'C4'; // Default for invalid note
for (let i = 1; i <= 96; i++) {
  const midi = i + 11;
  const octave = Math.floor(midi / 12) - 1;
  const semitone = midi % 12;
  XM_NOTE_NAMES[i] = `${NOTE_NAMES_CLEAN[semitone]}${octave}`;
}

// Pre-computed Amiga period → note name lookup (avoids iteration + string alloc per call)
const PERIOD_NOTE_MAP = new Map<number, string>();
for (let oct = 0; oct < 3; oct++) {
  for (let note = 0; note < 12; note++) {
    const idx = oct * 12 + note;
    if (idx < 36) {
      const period = PERIOD_TABLE[idx];
      if (!PERIOD_NOTE_MAP.has(period)) {
        PERIOD_NOTE_MAP.set(period, `${NOTE_NAMES[note].replace('-', '')}${oct + 1}`);
      }
    }
  }
}

/** Convert XM note number to note name (e.g. "C2")
 * XM note format: 1 = C-0, 13 = C-1, 25 = C-2, etc.
 * Maps to MIDI: XM + 11 = MIDI (so XM 25 = MIDI 36 = C2)
 */
function xmNoteToNoteName(xmNote: number): string {
  return XM_NOTE_NAMES[xmNote] || 'C4';
}

/** Convert Amiga period to note name (e.g. "C4") */
function periodToNoteName(period: number): string {
  // Fast path: exact match in pre-computed map
  const cached = PERIOD_NOTE_MAP.get(period);
  if (cached) return cached;
  // Slow path: find closest period (rarely hit — only for non-standard periods)
  for (let oct = 0; oct < 8; oct++) {
    for (let note = 0; note < 12; note++) {
      const idx = oct * 12 + note;
      if (idx < 36 && PERIOD_TABLE[idx] <= period) {
        const name = `${NOTE_NAMES[note].replace('-', '')}${oct + 1}`;
        // Cache for next hit
        PERIOD_NOTE_MAP.set(period, name);
        return name;
      }
    }
  }
  return 'C4';
}

// Vibrato/Tremolo sine table
const VIBRATO_TABLE = [
  0, 24, 49, 74, 97, 120, 141, 161, 180, 197, 212, 224, 235, 244, 250, 253,
  255, 253, 250, 244, 235, 224, 212, 197, 180, 161, 141, 120, 97, 74, 49, 24
];

// Pre-computed groove template lookup (avoids linear scan per call)
const GROOVE_MAP = new Map<string, GrooveTemplate>(GROOVE_TEMPLATES.map(t => [t.id, t]));

// ============================================================================
// TYPES
// ============================================================================

export type TrackerFormat = 'MOD' | 'XM' | 'IT' | 'S3M';

/**
 * Channel state - all the per-channel data needed for playback
 */
interface ChannelState {
  // Note state
  note: number;                  // Current note (period for MOD, note number for XM)
  period: number;                // Current period (after effects)
  volume: number;                // Current volume (0-64)
  panning: number;               // Current panning (0-255, 128=center)
  basePan: number;               // Original LRRL pan position (-1 to +1) before separation

  // Sample state
  sampleNum: number;             // Current sample/instrument number
  sampleOffset: number;          // Sample offset memory (9xx)
  finetune: number;              // Finetune (-8 to +7)

  // Effect memory
  portaSpeed: number;            // Portamento speed (1xx, 2xx)
  portaTarget: number;           // Tone portamento target (3xx)
  tonePortaSpeed: number;        // Tone portamento speed
  vibratoPos: number;            // Vibrato position
  vibratoCmd: number;            // Vibrato speed/depth
  tremoloPos: number;            // Tremolo position
  tremoloCmd: number;            // Tremolo speed/depth
  waveControl: number;           // Waveform control
  retrigCount: number;           // Retrigger counter
  retrigVolSlide: number;        // Retrigger volume slide (IT Rxy)
  patternLoopRow: number;        // Pattern loop start row
  patternLoopCount: number;      // Pattern loop counter
  globalVolSlide: number;        // Global volume slide memory (Hxx)
  panSlide: number;              // Pan slide memory (Pxx)

  // Macro state (Furnace instruments)
  macroPos: number;              // Current position in macros
  macroReleased: boolean;        // Whether note has been released
  macroPitchOffset: number;      // Current pitch offset from macros
  macroArpNote: number;          // Current arpeggio note offset
  macroDuty: number;             // Current duty cycle from macro
  macroWaveform: number;         // Current waveform from macro

  // TB-303 specific state
  previousSlideFlag: boolean;    // Previous row's slide flag (for proper 303 slide semantics)
  gateHigh: boolean;             // Current gate state for 303-style gate handling
  lastPlayedNoteName: string | null; // Last triggered note name for same-pitch slide detection
  xmNote: number;                // Original XM note number (for synth instruments, avoids period conversion)

  // Audio nodes - player pool (pre-allocated, pre-connected)
  player: Tone.Player | null;       // Active player reference (for updatePeriod compatibility)
  playerPool: Tone.Player[];        // Pre-allocated player pool
  activePlayerIdx: number;           // Current active player index in pool
  gainNode: Tone.Gain;
  panNode: Tone.Panner;

  // Instrument reference
  instrument: InstrumentConfig | null;
}

/**
 * Song data for playback
 */
export interface TrackerSong {
  name: string;
  format: TrackerFormat;
  patterns: Pattern[];
  instruments: InstrumentConfig[];
  songPositions: number[];       // Pattern order
  songLength: number;
  restartPosition: number;
  numChannels: number;
  initialSpeed: number;
  initialBPM: number;
  // Furnace-specific timing/compat (optional)
  speed2?: number;
  hz?: number;
  virtualTempoN?: number;
  virtualTempoD?: number;
  compatFlags?: Record<string, unknown>;
  grooves?: number[][];
}

// ============================================================================
// TRACKER REPLAYER
// ============================================================================

/**
 * Display state for audio-synced UI updates (BassoonTracker pattern)
 */
export interface DisplayState {
  time: number;      // Web Audio time when this state becomes active
  row: number;       // Pattern row
  pattern: number;   // Pattern number
  position: number;  // Song position index
  tick: number;      // Current tick within row
}

export class TrackerReplayer {
  // Song data
  private song: TrackerSong | null = null;

  // Playback state
  private playing = false;
  private songPos = 0;           // Current position in song order
  private pattPos = 0;           // Current row in pattern
  private currentTick = 0;       // Current tick (0 to speed-1)
  private speed = 6;             // Ticks per row
  private bpm = 125;             // Beats per minute
  private globalVolume = 64;     // Global volume (0-64)

  // Global pitch shift (Wxx effect) - DJ-style smooth sliding
  private globalPitchTarget = 0;      // Target semitones (-12 to +12)
  private globalPitchCurrent = 0;     // Current semitones (slides toward target)
  private globalPitchSlideSpeed = 0.5; // Semitones per tick (fixed speed for smooth slides)

  // Timing drift diagnostics
  private totalRowsProcessed = 0;    // Total rows processed since start
  private totalTicksProcessed = 0;   // Total ticks processed (tracks actual time regardless of speed changes)

  // Furnace speed alternation (speed1/speed2)
  private speed2: number | null = null;  // null = no alternation (XM/MOD mode)
  private speedAB = false;               // false = use speed1 next, true = use speed2 next

  // Pattern break/jump
  private pBreakPos = 0;
  private pBreakFlag = false;
  private posJumpFlag = false;
  private posJumpPos = 0;
  private patternDelay = 0;      // EEx pattern delay

  // Channels
  private channels: ChannelState[] = [];

  // Master output
  private masterGain: Tone.Gain;

  // Audio-synced state ring buffer for smooth scrolling (BassoonTracker pattern)
  // States are queued with Web Audio timestamps during scheduling,
  // then dequeued in render loop as audioContext.currentTime advances.
  // Ring buffer avoids O(n) shift() and per-push object allocation.
  private static readonly MAX_STATE_QUEUE_SIZE = 256; // ~5 seconds at 50Hz
  private stateRing: DisplayState[] = Array.from({ length: 256 }, () => ({ time: 0, row: 0, pattern: 0, position: 0, tick: 0 }));
  private stateRingHead = 0;   // Next write index
  private stateRingTail = 0;   // Next read index
  private stateRingCount = 0;  // Number of items in ring
  private lastDequeuedState: DisplayState | null = null;

  // Cache for ToneAudioBuffer wrappers (keyed by instrument ID)
  // Avoids re-wrapping the same decoded AudioBuffer on every note trigger
  private bufferCache: Map<number, Tone.ToneAudioBuffer> = new Map();
  private _warnedMissingInstruments: Set<number> | undefined;

  // Instrument lookup map (keyed by instrument ID) — avoids linear scan per note
  private instrumentMap: Map<number, InstrumentConfig> = new Map();

  // Per-channel meter staging + reusable callbacks (avoids closure allocation per note)
  private meterStaging: Float64Array = new Float64Array(64);
  private meterCallbacks: (() => void)[] | null = null;

  // Callbacks
  public onRowChange: ((row: number, pattern: number, position: number) => void) | null = null;
  public onSongEnd: (() => void) | null = null;
  public onTickProcess: ((tick: number, row: number) => void) | null = null;

  // DJ mode state
  private nudgeOffset = 0;            // Temporary BPM offset for DJ nudge
  private nudgeTicksRemaining = 0;    // Auto-reset counter for nudge
  private lineLoopStart = -1;         // Line loop start row (-1 = off)
  private lineLoopEnd = -1;           // Line loop end row
  private lineLoopActive = false;
  private patternLoopStartPos = -1;   // Pattern loop start song position
  private patternLoopEndPos = -1;     // Pattern loop end song position
  private patternLoopActive = false;
  private slipEnabled = false;
  private slipSongPos = 0;            // Ghost position (advances while looping)
  private slipPattPos = 0;

  // Per-deck pitch isolation (DJ mode only)
  private isDJDeck = false;           // True when created with outputNode
  private tempoMultiplier = 1.0;      // Scheduler BPM multiplier (from pitch slider)
  private pitchMultiplier = 1.0;      // Sample playback rate multiplier
  private deckDetuneCents = 0;        // Per-deck synth detune

  // Per-deck channel mute mask (DJ mode only)
  // Bit N = 1 means channel N is ENABLED, 0 means MUTED.
  // Kept separate from ToneEngine's global mute states so each deck is independent.
  private channelMuteMask = 0xFFFF;   // All 16 channels enabled by default

  // Stereo separation (0-100): controls how wide the stereo image is.
  // 100 = full Amiga hard-pan (LRRL), 0 = mono, 20 = pt2-clone default for MOD.
  // Based on per-channel pan narrowing: actual_pan = basePan * (separation / 100)
  // Reference: pt2-clone (8bitbubsy), MilkyTracker, Schism Tracker
  private stereoSeparation = 100;

  /**
   * Optional callback set by DeckEngine to handle DJ scratch effect commands (Xnn).
   * High nibble 0: scratch pattern (0=stop, 1=Baby, 2=Trans, 3=Flare, 4=Hydro, 5=Crab, 6=Orbit)
   * High nibble 1: fader LFO (0=off, 1=¼, 2=⅛, 3=⅟₁₆, 4=⅟₃₂)
   */
  onScratchEffect?: (param: number) => void;

  constructor(outputNode?: Tone.ToneAudioNode) {
    // Connect to provided output node (for DJ decks) or default to
    // ToneEngine's masterInput (existing behavior for tracker view).
    this.masterGain = new Tone.Gain(1);
    if (outputNode) {
      this.masterGain.connect(outputNode);
      this.isDJDeck = true;
    } else {
      const engine = getToneEngine();
      this.masterGain.connect(engine.masterInput);
    }
  }

  // ==========================================================================
  // DJ MODE METHODS
  // ==========================================================================

  /** Get the master gain node for external routing (DJ mixer, etc.) */
  getMasterGain(): Tone.Gain {
    return this.masterGain;
  }

  /** Get current song position */
  getSongPos(): number { return this.songPos; }

  /** Get current pattern row position */
  getPattPos(): number { return this.pattPos; }

  /** Get total song positions */
  getTotalPositions(): number { return this.song?.songLength ?? 0; }

  /** Get loaded song data */
  getSong(): TrackerSong | null { return this.song; }

  /** Jump to a specific position while playing */
  jumpToPosition(songPos: number, pattPos: number = 0): void {
    this.seekTo(songPos, pattPos);
  }

  /** Set BPM directly without going through transport store */
  setBPMDirect(bpm: number): void {
    this.bpm = Math.max(32, Math.min(255, bpm));
  }

  /** Temporary BPM offset for DJ nudge — auto-resets after tickCount ticks */
  setNudge(offset: number, tickCount: number = 8): void {
    this.nudgeOffset = offset;
    this.nudgeTicksRemaining = tickCount;
  }

  /** Set line-level loop (quantized to rows within current pattern) */
  setLineLoop(startRow: number, size: number): void {
    this.lineLoopStart = startRow;
    this.lineLoopEnd = startRow + size - 1;
    this.lineLoopActive = true;
    // Save ghost position for slip mode
    if (this.slipEnabled) {
      this.slipSongPos = this.songPos;
      this.slipPattPos = this.pattPos;
    }
  }

  /** Clear line loop */
  clearLineLoop(): void {
    this.lineLoopActive = false;
    this.lineLoopStart = -1;
    this.lineLoopEnd = -1;
    // If slip mode, jump to ghost position
    if (this.slipEnabled) {
      this.seekTo(this.slipSongPos, this.slipPattPos);
    }
  }

  /** Set pattern-level loop (loop between song positions) */
  setPatternLoop(startPos: number, endPos: number): void {
    this.patternLoopStartPos = startPos;
    this.patternLoopEndPos = endPos;
    this.patternLoopActive = true;
    if (this.slipEnabled) {
      this.slipSongPos = this.songPos;
      this.slipPattPos = this.pattPos;
    }
  }

  /** Clear pattern loop */
  clearPatternLoop(): void {
    this.patternLoopActive = false;
    this.patternLoopStartPos = -1;
    this.patternLoopEndPos = -1;
    if (this.slipEnabled) {
      this.seekTo(this.slipSongPos, this.slipPattPos);
    }
  }

  /** Enable/disable slip mode */
  setSlipEnabled(enabled: boolean): void {
    this.slipEnabled = enabled;
    if (enabled) {
      this.slipSongPos = this.songPos;
      this.slipPattPos = this.pattPos;
    }
  }

  /** Get slip (ghost) position state */
  getSlipState(): { enabled: boolean; songPos: number; pattPos: number } {
    return {
      enabled: this.slipEnabled,
      songPos: this.slipSongPos,
      pattPos: this.slipPattPos,
    };
  }

  // ==========================================================================
  // PER-DECK PITCH/TEMPO (DJ mode isolation)
  // ==========================================================================

  /** Set the tempo multiplier (changes scheduler speed without touching ToneEngine globals) */
  setTempoMultiplier(m: number): void {
    this.tempoMultiplier = m;
  }

  /** Get the current tempo multiplier */
  getTempoMultiplier(): number {
    return this.tempoMultiplier;
  }

  /** Set the sample playback rate multiplier + update all currently playing samples */
  setPitchMultiplier(m: number): void {
    this.pitchMultiplier = m;
    this.updateAllPlaybackRates();
  }

  /** Set per-deck synth detune in cents */
  setDetuneCents(cents: number): void {
    this.deckDetuneCents = cents;
  }

  /** Get per-deck detune cents */
  getDetuneCents(): number {
    return this.deckDetuneCents;
  }

  /**
   * Set per-deck channel mute mask (DJ mode only).
   * Bit N = 1 → channel N is audible; bit N = 0 → channel N is muted.
   * Kept isolated per-replayer so Deck A and Deck B don't interfere.
   */
  setChannelMuteMask(mask: number): void {
    this.channelMuteMask = mask;
  }

  // ==========================================================================
  // STEREO SEPARATION
  // ==========================================================================

  /**
   * Set stereo separation percentage (0-100).
   * 0 = mono (all channels center), 100 = full Amiga hard-pan.
   * Default: 20 for MOD (matching pt2-clone), 100 for XM/IT/S3M.
   *
   * Applies per-channel pan narrowing: actual_pan = basePan * (separation / 100)
   * This matches MilkyTracker and Schism Tracker's approach.
   */
  setStereoSeparation(percent: number): void {
    this.stereoSeparation = Math.max(0, Math.min(100, percent));
    // Update all existing channel pan positions
    for (const ch of this.channels) {
      this.applyChannelPan(ch);
    }
  }

  getStereoSeparation(): number {
    return this.stereoSeparation;
  }

  /**
   * Apply stereo separation to a channel's pan node.
   * Uses the channel's basePan (original LRRL position) scaled by separation.
   */
  private applyChannelPan(ch: ChannelState): void {
    const factor = this.stereoSeparation / 100;
    const actualPan = ch.basePan * factor;
    ch.panNode.pan.rampTo(actualPan, 0.02);
  }

  /**
   * Apply a panning value (0-255 tracker range) to a channel,
   * taking stereo separation into account.
   * Used by 8xx (set panning) and Pxx (pan slide) effects.
   */
  private applyPanEffect(ch: ChannelState, pan255: number, time: number): void {
    // Convert 0-255 tracker panning to -1..+1 range
    const normalizedPan = (pan255 - 128) / 128;
    ch.basePan = normalizedPan;
    const factor = this.stereoSeparation / 100;
    const actualPan = normalizedPan * factor;
    ch.panNode.pan.setValueAtTime(actualPan, time);
  }

  /** Get effective playback rate for sample pitch (per-deck in DJ mode, global otherwise) */
  getEffectivePlaybackRate(): number {
    if (this.isDJDeck) {
      return this.pitchMultiplier;
    }
    const engine = getToneEngine();
    return engine.getGlobalPlaybackRate();
  }

  /** Get elapsed time in milliseconds based on rows processed */
  getElapsedMs(): number {
    if (!this.song) return 0;
    // Approximate: each row takes (speed * 2.5 / BPM) seconds
    // In DJ mode, tempo multiplier affects tick duration
    const effectiveBPM = this.bpm * this.tempoMultiplier;
    const tickDuration = 2.5 / effectiveBPM;
    return this.totalRowsProcessed * this.speed * tickDuration * 1000;
  }

  // ==========================================================================
  // SONG LOADING
  // ==========================================================================

  loadSong(song: TrackerSong): void {
    this.stop();
    this.song = song;
    this.bufferCache.clear(); // New song = new samples, invalidate cache
    this._warnedMissingInstruments = undefined;
    this.instrumentMap = new Map(song.instruments.map(i => [i.id, i]));

    // Dispose old channels before creating new ones (prevent Web Audio node leaks)
    for (const ch of this.channels) {
      for (const p of ch.playerPool) {
        try { p.dispose(); } catch { /* ignored */ }
      }
      try { ch.gainNode.dispose(); } catch { /* ignored */ }
      try { ch.panNode.dispose(); } catch { /* ignored */ }
    }

    // Initialize channels
    this.channels = [];
    for (let i = 0; i < song.numChannels; i++) {
      this.channels.push(this.createChannel(i, song.numChannels));
    }

    // Set stereo separation default based on format:
    // MOD (Amiga) = 20% (matching pt2-clone default — the Amiga's hard LRRL
    // sounds harsh on headphones; 20% gives pleasant width without hard panning)
    // XM/IT/S3M = 100% (these formats have their own per-channel panning)
    this.stereoSeparation = song.format === 'MOD' ? 20 : 100;

    // Set initial playback state
    this.songPos = 0;
    this.pattPos = 0;
    this.currentTick = 0;
    this.speed = song.initialSpeed;
    this.bpm = song.initialBPM;
    this.globalVolume = 64;     // Reset global volume (Gxx effect can leave this at 0)
    this.pBreakFlag = false;
    this.pBreakPos = 0;
    this.posJumpFlag = false;
    this.posJumpPos = 0;
    this.patternDelay = 0;

    // Clear stale callbacks from previous song
    this.onRowChange = null;
    this.onSongEnd = null;
    this.onTickProcess = null;

    // Furnace speed alternation: if speed2 differs from speed1, enable alternation
    if (song.speed2 !== undefined && song.speed2 !== song.initialSpeed) {
      this.speed2 = song.speed2;
      this.speedAB = true; // true = after row 0 (speed1), next will be speed2
    } else {
      this.speed2 = null;
      this.speedAB = false;
    }

  }

  private createChannel(index: number, totalChannels: number): ChannelState {
    // Amiga LRRL panning: channels 0,3 = hard left, 1,2 = hard right
    // Uses the Schism Tracker formula: (((n+1)>>1) & 1) gives 0,1,1,0 pattern
    // basePan stores the original position; stereoSeparation scales it for output.
    let basePan: number;
    if (totalChannels <= 4) {
      // Classic 4-channel Amiga: LRRL at full ±1.0
      basePan = (((index + 1) >> 1) & 1) ? 1.0 : -1.0;
    } else {
      // >4 channels: LRRL repeating pattern at full ±1.0
      basePan = (((index + 1) >> 1) & 1) ? 1.0 : -1.0;
    }

    // Apply stereo separation: actual pan = basePan * (separation / 100)
    const factor = this.stereoSeparation / 100;
    const panValue = basePan * factor;

    const panNode = new Tone.Panner(panValue);
    const gainNode = new Tone.Gain(1);
    gainNode.connect(panNode);
    panNode.connect(this.masterGain);

    // Pre-allocate player pool and connect to gain node
    const playerPool: Tone.Player[] = [];
    for (let p = 0; p < PLAYERS_PER_CHANNEL; p++) {
      const player = new Tone.Player();
      player.connect(gainNode);
      playerPool.push(player);
    }

    return {
      note: 0,
      period: 0,
      volume: 64,
      panning: 128,
      basePan,
      sampleNum: 0,
      sampleOffset: 0,
      finetune: 0,
      portaSpeed: 0,
      portaTarget: 0,
      tonePortaSpeed: 0,
      vibratoPos: 0,
      vibratoCmd: 0,
      tremoloPos: 0,
      tremoloCmd: 0,
      waveControl: 0,
      retrigCount: 0,
      retrigVolSlide: 0,
      patternLoopRow: 0,
      patternLoopCount: 0,
      globalVolSlide: 0,
      panSlide: 0,
      macroPos: 0,
      macroReleased: false,
      macroPitchOffset: 0,
      macroArpNote: 0,
      macroDuty: 0,
      macroWaveform: 0,
      previousSlideFlag: false,
      gateHigh: false,
      lastPlayedNoteName: null,
      xmNote: 0,
      player: null,
      playerPool,
      activePlayerIdx: 0,
      gainNode,
      panNode,
      instrument: null,
    };
  }

  // ==========================================================================
  // PLAYBACK CONTROL
  // ==========================================================================

  // Lookahead scheduling state (BassoonTracker pattern)
  // BassoonTracker uses: 200ms initial buffer, 1 SECOND during playback, scheduler every 10ms
  private scheduleAheadTime = 0.1; // Increased to 100ms to support early 'push' grooves
  private schedulerInterval = 0.015; // Check every 15ms (must be < scheduleAheadTime)
  private nextScheduleTime = 0;
  
  private lastGrooveTemplateId = 'straight';
  private lastSwingAmount = 100;
  private lastGrooveSteps = 2;

  // Raw interval timer ID (more reliable than Tone.Loop for scheduling)
  private schedulerTimerId: ReturnType<typeof setInterval> | null = null;

  async play(): Promise<void> {
    if (!this.song || this.playing) return;

    await unlockIOSAudio(); // Play silent MP3 + pump AudioContext for iOS
    await Tone.start();

    // CRITICAL: Wait for AudioContext to actually be running
    // Tone.start() may return before context state changes
    // Use raw AudioContext for state check (Tone.context.state has narrower TS types)
    const rawCtx = Tone.context.rawContext;
    const getState = () => rawCtx.state as string;
    if (getState() !== 'running') {
      await Tone.context.resume();
      // Poll for running state with timeout
      const maxWait = 2000;
      const startTime = Date.now();
      while (getState() !== 'running' && Date.now() - startTime < maxWait) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      if (getState() !== 'running') {
        console.error(`[TrackerReplayer] AudioContext failed to start: ${getState()}`);
        return;
      }
    }

    // Ensure WASM synths (Open303, etc.) are initialized before starting playback.
    const engine = getToneEngine();
    await engine.ensureWASMSynthsReady(this.song.instruments);

    this.playing = true;
    const transportState = useTransportStore.getState();
    this.lastGrooveTemplateId = transportState.grooveTemplateId;
    this.lastSwingAmount = transportState.swing;
    this.lastGrooveSteps = transportState.grooveSteps;
    this.startScheduler();
  }

  stop(): void {
    this.playing = false;

    // Clear the scheduler interval
    if (this.schedulerTimerId !== null) {
      clearInterval(this.schedulerTimerId);
      this.schedulerTimerId = null;
    }

    // Stop all channels (release synth notes + stop sample players)
    for (let i = 0; i < this.channels.length; i++) {
      this.stopChannel(this.channels[i], i);
    }

    // Safety net: release ALL active notes in the engine to prevent any hanging voices
    try {
      const engine = getToneEngine();
      engine.releaseAll();
    } catch { /* ignored */ }

    // Keep position — don't reset songPos/pattPos so playback resumes where it stopped
    this.currentTick = 0;
    this.lastGrooveTemplateId = 'straight';
    this.lastSwingAmount = 100;
    this.lastGrooveSteps = 2;

    // Clear audio-synced state queue
    this.clearStateQueue();

    // Cancel any pending throttled row updates
    cancelPendingRowUpdate();
  }

  pause(): void {
    // Clear the scheduler interval
    if (this.schedulerTimerId !== null) {
      clearInterval(this.schedulerTimerId);
      this.schedulerTimerId = null;
    }
    this.playing = false;
  }

  resume(): void {
    if (this.song && !this.playing) {
      this.playing = true;
      this.startScheduler();
    }
  }

  private startScheduler(): void {
    // BassoonTracker architecture: initialize a continuous timeline that NEVER
    // references Tone.now() again. The `time` variable only ever advances via
    // `+= tickInterval`. Pattern boundaries, breaks, jumps — none of them
    // touch the timeline. This makes cumulative drift impossible.
    this.nextScheduleTime = Tone.now() + 0.02;
    this.totalRowsProcessed = 0;
    this.totalTicksProcessed = 0;

    const schedulerTick = () => {
      if (!this.playing) return;

      const scheduleUntil = Tone.now() + this.scheduleAheadTime;
      const transportState = useTransportStore.getState();

      // Sync groove/swing parameters (never touches timeline)
      if (transportState.grooveTemplateId !== this.lastGrooveTemplateId ||
          transportState.swing !== this.lastSwingAmount ||
          transportState.grooveSteps !== this.lastGrooveSteps) {
        if (typeof window !== 'undefined' && (window as unknown as { GROOVE_DEBUG?: boolean }).GROOVE_DEBUG) {
          console.log(`[Groove] template changed: "${this.lastGrooveTemplateId}" → "${transportState.grooveTemplateId}" swing=${transportState.swing} steps=${transportState.grooveSteps}`);
        }
        this.lastGrooveTemplateId = transportState.grooveTemplateId;
        this.lastSwingAmount = transportState.swing;
        this.lastGrooveSteps = transportState.grooveSteps;
      }

      // Sync BPM from UI (takes effect on next tick naturally)
      if (Math.abs(transportState.bpm - this.bpm) > 0.1) {
        this.bpm = transportState.bpm;
      }
      // Note: speed is NOT synced from UI — it's controlled by Fxx effects
      // and speed2 alternation within the replayer itself.

      // Fill the lookahead buffer — BassoonTracker pattern:
      // Schedule all ticks whose time falls within the look-ahead window.
      // `nextScheduleTime` is a continuous accumulator that never resets.
      while (this.nextScheduleTime < scheduleUntil && this.playing) {
        this.processTick(this.nextScheduleTime);

        // Advance timeline by one tick interval.
        // If BPM changed during processTick (Fxx effect), the new interval
        // takes effect immediately for the next tick — no reset needed.
        // DJ nudge: apply temporary BPM offset for beat matching
        // Tempo multiplier: per-deck pitch slider scales BPM (DJ mode)
        const effectiveBPM = (this.bpm + this.nudgeOffset) * this.tempoMultiplier;
        const tickInterval = 2.5 / effectiveBPM;
        this.nextScheduleTime += tickInterval;
      }
    };

    // Initial fill, then keep filling every 15ms
    schedulerTick();
    this.schedulerTimerId = setInterval(schedulerTick, this.schedulerInterval * 1000);
  }

  private calculateGrooveOffset(row: number, rowDuration: number, state: { grooveTemplateId: string; swing: number; grooveSteps: number }): number {
    const grooveTemplate = GROOVE_MAP.get(state.grooveTemplateId);

    if (grooveTemplate && grooveTemplate.id !== 'straight') {
      // For TEMPLATES: swing is 0-200 where 100 = full template effect
      // This allows scaling the template groove up or down
      const templateIntensity = state.swing / 100;
      // grooveSteps = total cycle length in rows. stride = grooveSteps / template.values.length.
      // e.g. grooveSteps=2, boom-bap(4 vals): stride=1 (natural 16th speed, cycle=4 rows)
      //      grooveSteps=8, boom-bap(4 vals): stride=2 (8th note, cycle=8 rows)
      //      grooveSteps=32, boom-bap(4 vals): stride=8 (cycle=32 rows)
      const stride = Math.max(1, Math.round(state.grooveSteps / grooveTemplate.values.length));
      const stretchedRow = Math.floor(row / stride);
      const offset = getGrooveOffset(grooveTemplate, stretchedRow, rowDuration) * templateIntensity;
      if (typeof window !== 'undefined' && (window as unknown as { GROOVE_DEBUG?: boolean }).GROOVE_DEBUG) {
        console.log(`[Groove] row=${String(row).padStart(2)} template="${state.grooveTemplateId}" stride=${stride} intensity=${templateIntensity.toFixed(2)} offset=${(offset * 1000).toFixed(2)}ms rowDur=${(rowDuration * 1000).toFixed(1)}ms`);
      }
      return offset;
    }
    // Straight template or no template = no timing offset.
    // The legacy manual-swing path that was here applied offsets whenever swing ≠ 100,
    // which caused every other row to be shifted even when the user selected "straight".
    return 0;
  }

  // ==========================================================================
  // TICK PROCESSING - THE HEART OF THE REPLAYER
  // ==========================================================================

  private processTick(time: number): void {
    if (!this.song || !this.playing) return;

    this.totalTicksProcessed++;

    // Handle pattern delay
    if (this.patternDelay > 0) {
      this.patternDelay--;
      return;
    }

    // --- Groove & Swing Support ---
    const transportState = useTransportStore.getState();
    
    // BPM sync from UI is handled by the grooveChanged detector in schedulerTick
    // (checks every 15ms with >0.1 threshold). We do NOT sync here because
    // any mismatch triggers bpmBefore !== this.bpm in the while loop, causing
    // a baseline reset that can accumulate timing errors over long playback.
    // Speed is controlled by Fxx effects during playback, don't override from UI

    const tickInterval = 2.5 / this.bpm;
    let safeTime = time;

    // Apply groove/swing to Tick 0 only
    if (this.currentTick === 0) {
      const rowDuration = tickInterval * this.speed;
      safeTime += this.calculateGrooveOffset(this.pattPos, rowDuration, transportState);
    }

    // Apply micro-timing jitter (Humanization)
    if (transportState.jitter > 0) {
      const jitterMs = (transportState.jitter / 100) * 0.01;
      const jitterOffset = (Math.random() * 2 - 1) * jitterMs;
      safeTime += jitterOffset;
    }

    // Get current pattern
    const patternNum = this.song.songPositions[this.songPos];
    const pattern = this.song.patterns[patternNum];
    if (!pattern) return;

    // Queue display state for audio-synced UI (tick 0 = start of row)
    // Use swung time (safeTime) so visual follows the same timing as audio
    if (this.currentTick === 0) {
      this.queueDisplayState(safeTime, this.pattPos, patternNum, this.songPos, 0);
    }

    // Process all channels
    for (let ch = 0; ch < this.channels.length; ch++) {
      const channel = this.channels[ch];
      const row = pattern.channels[ch]?.rows[this.pattPos];
      if (!row) continue;

      if (this.currentTick === 0) {
        // Tick 0: Read new row data
        this.processRow(ch, channel, row, safeTime);
      } else {
        // Ticks 1+: Process continuous effects
        this.processEffectTick(ch, channel, row, safeTime + (this.currentTick * tickInterval));
      }

      // Process Furnace macros every tick
      this.processMacros(channel, safeTime + (this.currentTick * tickInterval));
    }

    // Process global pitch shift slide (Wxx effect) - once per tick
    this.doGlobalPitchSlide(safeTime);

    // Notify tick processing
    if (this.onTickProcess) {
      this.onTickProcess(this.currentTick, this.pattPos);
    }

    // Advance tick counter
    this.currentTick++;
    if (this.currentTick >= this.speed) {
      this.currentTick = 0;

      // Furnace speed alternation: alternate between speed1 and speed2 each row
      if (this.speed2 !== null) {
        if (this.speedAB) {
          this.speed = this.speed2;
          this.speedAB = false;
        } else {
          this.speed = this.song!.initialSpeed;
          this.speedAB = true;
        }
      }

      this.advanceRow();
    }
  }

  /**
   * Queue a display state for audio-synced UI updates.
   * Ring buffer: O(1) enqueue, reuses pre-allocated DisplayState objects.
   */
  private queueDisplayState(time: number, row: number, pattern: number, position: number, tick: number): void {
    const s = this.stateRing[this.stateRingHead];
    s.time = time;
    s.row = row;
    s.pattern = pattern;
    s.position = position;
    s.tick = tick;
    this.stateRingHead = (this.stateRingHead + 1) % TrackerReplayer.MAX_STATE_QUEUE_SIZE;
    if (this.stateRingCount < TrackerReplayer.MAX_STATE_QUEUE_SIZE) {
      this.stateRingCount++;
    } else {
      // Overwrite oldest — advance tail
      this.stateRingTail = (this.stateRingTail + 1) % TrackerReplayer.MAX_STATE_QUEUE_SIZE;
    }
  }

  /**
   * Get display state for audio-synced UI rendering (BassoonTracker pattern).
   * Call this in the render loop with audioContext.currentTime + lookahead.
   * Returns the most recent state that should be displayed at the given time.
   * @param time Web Audio time
   * @param peek If true, just look at the state at that time without dequeuing older states
   */
  public getStateAtTime(time: number, peek: boolean = false): DisplayState | null {
    if (!this.playing) {
      return this.lastDequeuedState;
    }

    if (peek) {
      // Just find the state matching the time in the ring
      let best = this.lastDequeuedState;
      let idx = this.stateRingTail;
      for (let i = 0; i < this.stateRingCount; i++) {
        const state = this.stateRing[idx];
        if (state.time <= time) best = state;
        else break;
        idx = (idx + 1) % TrackerReplayer.MAX_STATE_QUEUE_SIZE;
      }
      return best;
    }

    // Dequeue states that are past the requested time
    let result = this.lastDequeuedState;

    while (this.stateRingCount > 0) {
      const state = this.stateRing[this.stateRingTail];
      if (state.time <= time) {
        result = state;
        this.lastDequeuedState = result;
        this.stateRingTail = (this.stateRingTail + 1) % TrackerReplayer.MAX_STATE_QUEUE_SIZE;
        this.stateRingCount--;
      } else {
        break;
      }
    }

    return result;
  }

  /**
   * Clear the state queue (called on stop/reset)
   */
  private clearStateQueue(): void {
    this.stateRingHead = 0;
    this.stateRingTail = 0;
    this.stateRingCount = 0;
    this.lastDequeuedState = null;
  }

  // ==========================================================================
  // ROW PROCESSING (TICK 0)
  // ==========================================================================

  private processRow(chIndex: number, ch: ChannelState, row: TrackerCell, time: number): void {
    if (!this.song) return;


    // Compute accent/slide/mute/hammer from flexible flag columns
    // Values: 0=none, 1=accent, 2=slide, 3=mute, 4=hammer
    const accent = (row.flag1 === 1 || row.flag2 === 1);
    const slide = (row.flag1 === 2 || row.flag2 === 2);
    const mute = (row.flag1 === 3 || row.flag2 === 3);
    const hammer = (row.flag1 === 4 || row.flag2 === 4);

    // Mute: skip note entirely (TT-303 extension)
    if (mute) {
      // Stop any playing note on this channel by muting the gain
      ch.gainNode.gain.setValueAtTime(0, time);
      // Also stop the active player if one exists
      if (ch.player) {
        try {
          ch.player.stop(time);
        } catch {
          // Ignore errors if already stopped
        }
        ch.player = null;
      }
      return;
    }

    // Get effect info
    const effect = row.effTyp ?? (row.effect ? parseInt(row.effect[0], 16) : 0);
    const param = row.eff ?? (row.effect ? parseInt(row.effect.substring(1), 16) : 0);
    const x = (param >> 4) & 0x0F;
    const y = param & 0x0F;
    void x; void y; // Effect parameters used in extended effect handling below

    // Handle instrument change
    const instNum = row.instrument ?? 0;
    if (instNum > 0) {
      const instrument = this.instrumentMap.get(instNum);
      if (instrument) {
        ch.instrument = instrument;
        ch.sampleNum = instNum;
        ch.volume = 64; // Reset volume on instrument change
        ch.finetune = instrument.metadata?.modPlayback?.finetune ?? 0;

        // Apply volume immediately
        ch.gainNode.gain.setValueAtTime(ch.volume / 64, time);
      } else {
        // Throttle: only warn once per missing instrument ID per song
        if (!this._warnedMissingInstruments) this._warnedMissingInstruments = new Set();
        if (!this._warnedMissingInstruments.has(instNum)) {
          this._warnedMissingInstruments.add(instNum);
          console.warn(`[TrackerReplayer] Instrument ${instNum} not found (empty slot). Available IDs: (${this.song.instruments.length})`, this.song.instruments.map(i => i.id).sort((a,b) => a-b));
        }
      }
    }

    // Handle note
    const noteValue = row.note;
    const rawPeriod = row.period;

    // Probability/maybe: skip note if random check fails
    const prob = row.probability;
    const probabilitySkip = prob !== undefined && prob > 0 && prob < 100 && Math.random() * 100 >= prob;

    // Hammer: legato without pitch glide (TT-303 extension)
    // For hammer: gate stays high (like slide) but pitch jumps instantly
    // effectiveSlide controls gate timing (true for both slide and hammer)
    // We need to track hammer separately for the synth to skip pitch glide
    const effectiveSlide = slide || hammer; // Gate stays high for both

    if (noteValue && noteValue !== 0 && noteValue !== 97 && !probabilitySkip) {
      // Store the original XM note for synth instruments (avoids period table issues)
      ch.xmNote = noteValue;
      
      // Derive period for playback.
      // Priority: rawPeriod (accurate Amiga period from MOD import) → noteToPeriod (XM/user notes).
      // MOD import stores both note (2-octave-shifted XM number) and period (original Amiga period).
      // Using noteToPeriod first would double-shift the pitch — period 428 → XM 49 → period 107.
      const usePeriod = rawPeriod || this.noteToPeriod(noteValue, ch.finetune) || 0;

      // Check for tone portamento (3xx or 5xx) - don't trigger, just set target
      if (effect === 3 || effect === 5) {
        ch.portaTarget = usePeriod;
        if (param !== 0 && effect === 3) {
          ch.tonePortaSpeed = param;
        }
      } else {
        // Normal note - trigger
        ch.note = usePeriod;
        ch.period = ch.note;

        // Handle sample offset (9xx)
        let offset = 0;
        if (effect === 9) {
          offset = param > 0 ? param * 256 : ch.sampleOffset * 256;
          ch.sampleOffset = param > 0 ? param : ch.sampleOffset;
          /* eslint-disable no-console */
          console.log('[9xx] row=' + this.pattPos + ' ch=' + chIndex + ' param=0x' + param.toString(16).padStart(2, '0') + ' offset=' + offset + ' period=' + usePeriod + ' xmNote=' + noteValue + ' finetune=' + ch.finetune + ' inst=' + (ch.instrument?.id ?? '?') + ':' + (ch.instrument?.name || '?') + ' sampleRate=' + (ch.instrument?.sample?.sampleRate || '?') + ' pcmLen=' + ((ch.instrument?.sample as any)?.pcmData?.length || '?'));
          /* eslint-enable no-console */
        }

        // TB-303 SLIDE SEMANTICS:
        // "Slide is ON on a step if the PREVIOUSLY played step had Slide AND the current step is a valid Note"
        // This means the slide flag on step N affects the transition FROM step N TO step N+1
        // So we check if the PREVIOUS row had slide, not the current row
        // For hammer: pitch should jump, not glide - use slideActive only if not hammer
        const slideActive = ch.previousSlideFlag && noteValue !== null && !hammer;

        // Check for 303 synth type early (needed for logging and same-pitch slide detection)
        const is303Synth = ch.instrument?.synthType === 'TB303' ||
                           ch.instrument?.synthType === 'Buzz3o3';

        // DEBUG LOGGING - Enable with window.TB303_DEBUG_ENABLED = true in browser console
        if (typeof window !== 'undefined' && (window as unknown as { TB303_DEBUG_ENABLED?: boolean }).TB303_DEBUG_ENABLED && is303Synth) {
          const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
          const midi = noteValue ? noteValue + 11 : 0;
          const octave = Math.floor(midi / 12) - 1;
          const semitone = midi % 12;
          const noteName = noteValue ? `${noteNames[semitone]}${octave}` : '...';
          console.log(
            `%c[Row ${this.pattPos.toString().padStart(2)}] %c${noteName.padEnd(5)} %c${accent ? '●ACC' : '    '} %c${slideActive ? '►SLD' : '    '} %c[prev:${ch.previousSlideFlag ? '1' : '0'} curr:${slide ? '1' : '0'}] %c→ ${slideActive ? 'SLIDE' : 'TRIGGER'}`,
            'color: #888',
            'color: #0ff; font-weight: bold',
            accent ? 'color: #f0f' : 'color: #444',
            slideActive ? 'color: #ff0' : 'color: #444',
            'color: #666',
            'color: #0f0'
          );
        }

        // FIX: Detect same-pitch slides for TB-303 synths
        // When sliding to the same note, we need to:
        // 1. Cancel any pending release from the previous note
        // 2. NOT retrigger the envelope (let note sustain)
        // We do this by still calling triggerNote with slide=true - the worklet
        // will just keep the note going without retriggering.
        // Use xmNoteToNoteName for 303 synths (avoids period table issues)
        const newNoteName = is303Synth ? xmNoteToNoteName(noteValue ?? 0) : periodToNoteName(usePeriod);
        const isSamePitchSlide = slideActive &&
                                  ch.lastPlayedNoteName !== null &&
                                  newNoteName === ch.lastPlayedNoteName;

        if (is303Synth && isSamePitchSlide) {
          // Same pitch slide on 303: trigger with slide=true to cancel pending release
          // The synth will receive noteOn for the same pitch with slide, which sustains the note
        }

        // Update last played note name for next comparison
        ch.lastPlayedNoteName = newNoteName;

        // Trigger the note with proper 303 slide semantics
        // Pass accent directly (accent applies to current note)
        // Pass slideActive (computed from previous row's slide flag) for pitch glide
        //   - For hammer: slideActive is forced false so pitch doesn't glide
        // Pass effectiveSlide for gate timing:
        //   - slide: gate stays high, pitch glides to next note
        //   - hammer: gate stays high, but NO pitch glide (just legato)
        // Pass hammer flag so synth can handle it specially
        // NOTE: For same-pitch slides, slideActive=true ensures the synth doesn't retrigger
        this.triggerNote(ch, time, offset, chIndex, accent, slideActive, effectiveSlide, hammer);

        // Reset vibrato/tremolo positions
        if ((ch.waveControl & 0x04) === 0) ch.vibratoPos = 0;
        if ((ch.waveControl & 0x40) === 0) ch.tremoloPos = 0;
      }
    }

    // Update previous slide flag for next row (TB-303 semantics)
    // Store current row's slide flag to be used when processing the next note
    // For hammer: keep gate high (like slide) but don't glide pitch
    //
    // DB303 BEHAVIOR: A rest (empty row) breaks the slide chain.
    // When gate=false, the note is released and previousSlideFlag is cleared.
    // Only rows with valid notes (not note-off) can have slide flags that affect the next row.
    if (noteValue && noteValue !== 97) {
      ch.previousSlideFlag = (slide || hammer) ?? false;
    }

    // Handle note off
    if (noteValue === 97) {
      // Clear slide flag - note-off breaks the slide chain
      ch.previousSlideFlag = false;
      
      // DEBUG LOGGING for note-off
      const is303ForLog = ch.instrument?.synthType === 'TB303' || ch.instrument?.synthType === 'Buzz3o3';
      if (typeof window !== 'undefined' && (window as unknown as { TB303_DEBUG_ENABLED?: boolean }).TB303_DEBUG_ENABLED && is303ForLog) {
        console.log(
          `%c[Row ${this.pattPos.toString().padStart(2)}] %c===   %cNOTE OFF %c(prevSlide cleared)`,
          'color: #888',
          'color: #f00; font-weight: bold',
          'color: #f88',
          'color: #666'
        );
      }
      this.releaseMacros(ch);
      this.stopChannel(ch, chIndex, time);
    }

    // Handle volume column (XM)
    if (row.volume !== undefined && row.volume >= 0x10 && row.volume <= 0x50) {
      ch.volume = row.volume - 0x10;
      ch.gainNode.gain.setValueAtTime(ch.volume / 64, time);
    }

    // Process tick-0 effects
    this.processEffect0(chIndex, ch, effect, param, time);

    // Process second effect column (effTyp2/eff2)
    const effect2 = row.effTyp2 ?? 0;
    const param2 = row.eff2 ?? 0;
    if (effect2 !== 0 || param2 !== 0) {
      this.processEffect0(chIndex, ch, effect2, param2, time);
    }
  }

  // ==========================================================================
  // EFFECT PROCESSING (TICK 0)
  // ==========================================================================

  private processEffect0(chIndex: number, ch: ChannelState, effect: number, param: number, time: number): void {
    const x = (param >> 4) & 0x0F;
    const y = param & 0x0F;

    // Route effects to Furnace synths (if applicable)
    // Global effects (position jump, pattern break, speed/tempo) are still processed below
    if (ch.instrument?.synthType?.startsWith('Furnace')) {
      const engine = getToneEngine();
      // Route chip-specific effects to Furnace engine
      // Skip ONLY global effects that affect playback state, not the chip:
      // 0x0B = Position jump, 0x0D = Pattern break, 0x0F = Set speed/tempo
      // Note: 0x10+ are platform-specific in Furnace (FM LFO, TL, etc.) - NOT global
      const isGlobalEffect = effect === 0x0B || effect === 0x0D || effect === 0x0F;
      if (!isGlobalEffect) {
        if (effect === 0x0E) {
          // Extended effects use Exy format
          engine.applyFurnaceExtendedEffect(ch.instrument.id, x, y, chIndex);
        } else {
          engine.applyFurnaceEffect(ch.instrument.id, effect, param, chIndex);
        }
      }
    }

    switch (effect) {
      case 0x0: // Arpeggio - nothing on tick 0
        break;

      case 0x1: // Portamento up - store speed
        if (param !== 0) ch.portaSpeed = param;
        break;

      case 0x2: // Portamento down - store speed
        if (param !== 0) ch.portaSpeed = param;
        break;

      case 0x3: // Tone portamento - store speed
        if (param !== 0) ch.tonePortaSpeed = param;
        break;

      case 0x4: // Vibrato - store params
        if (x !== 0) ch.vibratoCmd = (ch.vibratoCmd & 0x0F) | (x << 4);
        if (y !== 0) ch.vibratoCmd = (ch.vibratoCmd & 0xF0) | y;
        break;

      case 0x5: // Tone porta + volume slide
        break;

      case 0x6: // Vibrato + volume slide
        break;

      case 0x7: // Tremolo
        if (x !== 0) ch.tremoloCmd = (ch.tremoloCmd & 0x0F) | (x << 4);
        if (y !== 0) ch.tremoloCmd = (ch.tremoloCmd & 0xF0) | y;
        break;

      case 0x8: // Set panning
        ch.panning = param;
        this.applyPanEffect(ch, param, time);
        break;

      case 0x9: // Sample offset - handled in note processing
        if (param !== 0) ch.sampleOffset = param;
        break;

      case 0xA: // Volume slide - nothing on tick 0
        break;

      case 0xB: // Position jump
        this.posJumpPos = param;
        this.posJumpFlag = true;
        this.pBreakFlag = true;
        break;

      case 0xC: // Set volume
        ch.volume = Math.min(64, param);
        ch.gainNode.gain.setValueAtTime(ch.volume / 64, time);
        break;

      case 0xD: // Pattern break
        // MOD uses BCD (binary-coded decimal), XM/IT/S3M/FUR use hex
        if (this.song?.format === 'MOD') {
          this.pBreakPos = x * 10 + y; // BCD: 0x15 = row 15
          if (this.pBreakPos > 63) this.pBreakPos = 0;
        } else {
          this.pBreakPos = param; // Hex: 0x10 = row 16
          // XM/Furnace patterns can be up to 256 rows
          if (this.pBreakPos > 255) this.pBreakPos = 0;
        }
        this.pBreakFlag = true;
        break;

      case 0xE: // Extended effects
        this.processExtendedEffect0(chIndex, ch, x, y, time);
        break;

      case 0xF: // Set speed/tempo
        if (param === 0) {
          // F00 = stop in some trackers
        } else if (param < 0x20) {
          if (this.speed !== param) {
            this.speed = param;
            // Fxx disables Furnace speed alternation (sets both speeds to same value)
            if (this.speed2 !== null) {
              this.speed2 = null;
            }
            // Update UI to reflect the speed change from the module
            useTransportStore.getState().setSpeed(param);
          }
        } else {
          if (this.bpm !== param) {
            this.bpm = param;
            // Update UI to reflect the BPM change from the module
            useTransportStore.getState().setBPM(param);
          }
        }
        break;

      // === IT/Furnace Extended Effects ===
      case 0x10: // Global volume (Gxx)
        this.globalVolume = Math.min(64, param);
        this.updateAllChannelVolumes(time);
        break;

      case 0x11: // Global volume slide (Hxx)
        // Store for per-tick processing
        if (param !== 0) ch.globalVolSlide = param;
        break;

      case 0x19: // Pan slide (Pxx) - also used for Furnace panning effects
        if (param !== 0) ch.panSlide = param;
        break;

      case 0x1B: // Retrigger with volume slide (Rxy) - IT style
        ch.retrigCount = param & 0x0F;
        ch.retrigVolSlide = (param >> 4) & 0x0F;
        break;

      case 0x20: // Global pitch shift (Wxx) - DJ-style smooth slide
        // W00 = -12 semitones, W80 = 0 semitones, WFF = +12 semitones
        // Set target - actual slide happens on ticks 1+
        this.globalPitchTarget = ((param - 128) / 128) * 12;
        break;

      case 0x21: // DJ Scratch (Xnn)
        // High nibble 0: scratch pattern (X00=stop, X01=Baby, X02=Trans, X03=Flare, X04=Hydro, X05=Crab, X06=Orbit)
        // High nibble 1: fader LFO (X10=off, X11=¼, X12=⅛, X13=⅟₁₆, X14=⅟₃₂)
        if (this.onScratchEffect) {
          this.onScratchEffect(param);
        }
        break;
    }
  }

  private processExtendedEffect0(_chIndex: number, ch: ChannelState, x: number, y: number, time: number): void {
    switch (x) {
      case 0x1: // Fine porta up
        ch.period = Math.max(113, ch.period - y);
        this.updatePeriod(ch);
        break;

      case 0x2: // Fine porta down
        ch.period = Math.min(856, ch.period + y);
        this.updatePeriod(ch);
        break;

      case 0x4: // Vibrato waveform
        ch.waveControl = (ch.waveControl & 0xF0) | (y & 0x0F);
        break;

      case 0x5: // Set finetune
        ch.finetune = y > 7 ? y - 16 : y;
        break;

      case 0x6: // Pattern loop
        if (y === 0) {
          ch.patternLoopRow = this.pattPos;
        } else {
          if (ch.patternLoopCount === 0) {
            ch.patternLoopCount = y;
          } else {
            ch.patternLoopCount--;
          }
          if (ch.patternLoopCount !== 0) {
            this.pBreakPos = ch.patternLoopRow;
            this.pBreakFlag = true;
          }
        }
        break;

      case 0x7: // Tremolo waveform
        ch.waveControl = (ch.waveControl & 0x0F) | ((y & 0x0F) << 4);
        break;

      case 0x9: // Retrigger
        ch.retrigCount = y;
        break;

      case 0xA: // Fine volume up
        ch.volume = Math.min(64, ch.volume + y);
        ch.gainNode.gain.setValueAtTime(ch.volume / 64, time);
        break;

      case 0xB: // Fine volume down
        ch.volume = Math.max(0, ch.volume - y);
        ch.gainNode.gain.setValueAtTime(ch.volume / 64, time);
        break;

      case 0xE: // Pattern delay
        this.patternDelay = y * this.speed;
        break;
    }
  }

  // ==========================================================================
  // EFFECT PROCESSING (TICKS 1+)
  // ==========================================================================

  private processEffectTick(chIndex: number, ch: ChannelState, row: TrackerCell, time: number): void {
    // Compute accent/slide/mute/hammer from flexible flag columns
    // Values: 0=none, 1=accent, 2=slide, 3=mute, 4=hammer
    const accent = (row.flag1 === 1 || row.flag2 === 1);
    const slide = (row.flag1 === 2 || row.flag2 === 2);
    const mute = (row.flag1 === 3 || row.flag2 === 3);
    const hammer = (row.flag1 === 4 || row.flag2 === 4);

    // Mute: no effect processing for muted steps
    if (mute) return;

    // Hammer: treat as non-slide for effect processing
    const effectiveSlide = hammer ? false : slide;
    void effectiveSlide; // May be used in extended slide handling

    const effect = row.effTyp ?? (row.effect ? parseInt(row.effect[0], 16) : 0);
    const param = row.eff ?? (row.effect ? parseInt(row.effect.substring(1), 16) : 0);
    const x = (param >> 4) & 0x0F;
    const y = param & 0x0F;

    // Process second effect column
    const effect2 = row.effTyp2 ?? 0;
    const param2 = row.eff2 ?? 0;
    if (effect2 !== 0 || param2 !== 0) {
      this.processEffectTickSingle(chIndex, ch, row, effect2, param2, time);
    }

    // Route continuous effects to Furnace dispatch engine (ticks 1+)
    // The dispatch engine needs per-tick commands for pitch slides, vibrato, etc.
    if (ch.instrument?.synthType?.startsWith('Furnace')) {
      this.forwardEffectToFurnace(ch, chIndex, effect, param, x, y);
    }

    switch (effect) {
      case 0x0: // Arpeggio
        if (param !== 0) this.doArpeggio(ch, param);
        break;

      case 0x1: // Portamento up
        ch.period = Math.max(113, ch.period - ch.portaSpeed);
        this.updatePeriod(ch);
        break;

      case 0x2: // Portamento down
        ch.period = Math.min(856, ch.period + ch.portaSpeed);
        this.updatePeriod(ch);
        break;

      case 0x3: // Tone portamento
        this.doTonePortamento(ch);
        break;

      case 0x4: // Vibrato
        this.doVibrato(ch);
        break;

      case 0x5: // Tone porta + volume slide
        this.doTonePortamento(ch);
        this.doVolumeSlide(ch, param, time);
        break;

      case 0x6: // Vibrato + volume slide
        this.doVibrato(ch);
        this.doVolumeSlide(ch, param, time);
        break;

      case 0x7: // Tremolo
        this.doTremolo(ch, time);
        break;

      case 0xA: // Volume slide
        this.doVolumeSlide(ch, param, time);
        break;

      case 0xE: // Extended effects
        if (x === 0x9 && y > 0) {
          // Retrigger - does NOT slide (it's retriggering the same note)
          ch.retrigCount--;
          if (ch.retrigCount <= 0) {
            ch.retrigCount = y;
            this.triggerNote(ch, time, 0, chIndex, accent, false, false);
          }
        } else if (x === 0xC && y === this.currentTick) {
          // Note cut
          ch.volume = 0;
          ch.gainNode.gain.setValueAtTime(0, time);
        } else if (x === 0xD && y === this.currentTick) {
          // Note delay - uses the computed slide from processRow (stored in ch.previousSlideFlag context)
          // Since this is a delayed trigger of the same note, use the slide state computed at row start
          const slideActive = ch.previousSlideFlag;
          this.triggerNote(ch, time, 0, chIndex, accent, slideActive, slide);
        }
        break;

      // === IT/Furnace Extended Effects (per-tick) ===
      case 0x11: // Global volume slide (Hxx)
        this.doGlobalVolumeSlide(ch.globalVolSlide, time);
        break;

      case 0x19: // Pan slide (Pxx)
        this.doPanSlide(ch, ch.panSlide, time);
        break;

      case 0x1B: // Retrigger with volume slide (Rxy)
        if (ch.retrigCount > 0) {
          ch.retrigCount--;
          if (ch.retrigCount <= 0) {
            ch.retrigCount = param & 0x0F;
            // Apply volume slide based on retrigVolSlide
            this.applyRetrigVolSlide(ch, ch.retrigVolSlide, time);
            // Retrigger - does NOT slide (it's retriggering the same note)
            this.triggerNote(ch, time, 0, chIndex, accent, false, false);
          }
        }
        break;
    }
  }

  /**
   * Process a single effect on ticks 1+ (reusable for effect2 column)
   */
  private processEffectTickSingle(chIndex: number, ch: ChannelState, row: TrackerCell, effect: number, param: number, time: number): void {
    // Compute accent/slide from flexible flag columns
    const accent = (row.flag1 === 1 || row.flag2 === 1);
    const slide = (row.flag1 === 2 || row.flag2 === 2);

    const x = (param >> 4) & 0x0F;
    const y = param & 0x0F;

    // Route continuous effects to Furnace dispatch engine (ticks 1+)
    if (ch.instrument?.synthType?.startsWith('Furnace')) {
      this.forwardEffectToFurnace(ch, chIndex, effect, param, x, y);
    }

    switch (effect) {
      case 0x0: if (param !== 0) this.doArpeggio(ch, param); break;
      case 0x1: ch.period = Math.max(113, ch.period - ch.portaSpeed); this.updatePeriod(ch); break;
      case 0x2: ch.period = Math.min(856, ch.period + ch.portaSpeed); this.updatePeriod(ch); break;
      case 0x3: this.doTonePortamento(ch); break;
      case 0x4: this.doVibrato(ch); break;
      case 0x5: this.doTonePortamento(ch); this.doVolumeSlide(ch, param, time); break;
      case 0x6: this.doVibrato(ch); this.doVolumeSlide(ch, param, time); break;
      case 0x7: this.doTremolo(ch, time); break;
      case 0xA: this.doVolumeSlide(ch, param, time); break;
      case 0xE:
        if (x === 0x9 && y > 0) {
          ch.retrigCount--;
          if (ch.retrigCount <= 0) {
            ch.retrigCount = y;
            this.triggerNote(ch, time, 0, chIndex, accent, false, false);
          }
        } else if (x === 0xC && y === this.currentTick) {
          ch.volume = 0;
          ch.gainNode.gain.setValueAtTime(0, time);
        } else if (x === 0xD && y === this.currentTick) {
          const slideActive = ch.previousSlideFlag;
          this.triggerNote(ch, time, 0, chIndex, accent, slideActive, slide);
        }
        break;
      case 0x11: this.doGlobalVolumeSlide(ch.globalVolSlide, time); break;
      case 0x19: this.doPanSlide(ch, ch.panSlide, time); break;
      case 0x1B:
        if (ch.retrigCount > 0) {
          ch.retrigCount--;
          if (ch.retrigCount <= 0) {
            ch.retrigCount = param & 0x0F;
            this.applyRetrigVolSlide(ch, ch.retrigVolSlide, time);
            this.triggerNote(ch, time, 0, chIndex, accent, false, false);
          }
        }
        break;
    }
  }

  /**
   * Forward a continuous effect (ticks 1+) to the Furnace dispatch engine.
   * Skip global effects that only affect playback state (position jump, pattern break, speed).
   */
  private forwardEffectToFurnace(ch: ChannelState, chIndex: number, effect: number, param: number, x: number, y: number): void {
    const isGlobalEffect = effect === 0x0B || effect === 0x0D || effect === 0x0F;
    if (isGlobalEffect || (effect === 0 && param === 0)) return;

    const engine = getToneEngine();
    if (effect === 0x0E) {
      engine.applyFurnaceExtendedEffect(ch.instrument!.id, x, y, chIndex);
    } else {
      engine.applyFurnaceEffect(ch.instrument!.id, effect, param, chIndex);
    }
  }

  // ==========================================================================
  // EFFECT IMPLEMENTATIONS
  // ==========================================================================

  private doArpeggio(ch: ChannelState, param: number): void {
    const x = (param >> 4) & 0x0F;
    const y = param & 0x0F;

    const tick = this.currentTick % 3;
    let period = ch.note;

    if (tick === 1) {
      period = this.periodPlusSemitones(ch.note, x, ch.finetune);
    } else if (tick === 2) {
      period = this.periodPlusSemitones(ch.note, y, ch.finetune);
    }

    this.updatePeriodDirect(ch, period);
  }

  private doTonePortamento(ch: ChannelState): void {
    if (ch.portaTarget === 0 || ch.period === ch.portaTarget) return;

    if (ch.period < ch.portaTarget) {
      ch.period += ch.tonePortaSpeed;
      if (ch.period > ch.portaTarget) ch.period = ch.portaTarget;
    } else {
      ch.period -= ch.tonePortaSpeed;
      if (ch.period < ch.portaTarget) ch.period = ch.portaTarget;
    }

    this.updatePeriod(ch);
  }

  private doVibrato(ch: ChannelState): void {
    const speed = (ch.vibratoCmd >> 4) & 0x0F;
    const depth = ch.vibratoCmd & 0x0F;

    const waveform = ch.waveControl & 0x03;
    let value: number;

    if (waveform === 0) {
      value = VIBRATO_TABLE[ch.vibratoPos & 31];
    } else if (waveform === 1) {
      value = (ch.vibratoPos & 31) * 8;
      if (ch.vibratoPos >= 32) value = 255 - value;
    } else {
      value = 255;
    }

    let delta = (value * depth) >> 7;
    if (ch.vibratoPos >= 32) delta = -delta;

    this.updatePeriodDirect(ch, ch.period + delta);
    ch.vibratoPos = (ch.vibratoPos + speed) & 63;
  }

  private doTremolo(ch: ChannelState, time: number): void {
    const speed = (ch.tremoloCmd >> 4) & 0x0F;
    const depth = ch.tremoloCmd & 0x0F;

    const waveform = (ch.waveControl >> 4) & 0x03;
    let value: number;

    if (waveform === 0) {
      value = VIBRATO_TABLE[ch.tremoloPos & 31];
    } else if (waveform === 1) {
      value = (ch.tremoloPos & 31) * 8;
      if (ch.tremoloPos >= 32) value = 255 - value;
    } else {
      value = 255;
    }

    let delta = (value * depth) >> 6;
    if (ch.tremoloPos >= 32) delta = -delta;

    const newVol = Math.max(0, Math.min(64, ch.volume + delta));
    ch.gainNode.gain.setValueAtTime(newVol / 64, time);

    ch.tremoloPos = (ch.tremoloPos + speed) & 63;
  }

  private doVolumeSlide(ch: ChannelState, param: number, time: number): void {
    const x = (param >> 4) & 0x0F;
    const y = param & 0x0F;

    if (x > 0) {
      ch.volume = Math.min(64, ch.volume + x);
    } else if (y > 0) {
      ch.volume = Math.max(0, ch.volume - y);
    }

    ch.gainNode.gain.setValueAtTime(ch.volume / 64, time);
  }

  /**
   * Global volume slide (effect Hxx)
   * x = slide up, y = slide down
   */
  private doGlobalVolumeSlide(param: number, time: number): void {
    const x = (param >> 4) & 0x0F;
    const y = param & 0x0F;

    if (x > 0) {
      this.globalVolume = Math.min(64, this.globalVolume + x);
    } else if (y > 0) {
      this.globalVolume = Math.max(0, this.globalVolume - y);
    }

    this.updateAllChannelVolumes(time);
  }

  /**
   * Global pitch shift slide (Wxx effect) - DJ-style smooth sliding
   * Slides current pitch toward target at fixed speed (0.5 semitones per tick)
   */
  private doGlobalPitchSlide(_time: number): void {
    // Skip if already at target
    if (Math.abs(this.globalPitchCurrent - this.globalPitchTarget) < 0.01) {
      this.globalPitchCurrent = this.globalPitchTarget;
      return;
    }

    // Slide toward target at fixed speed
    if (this.globalPitchCurrent < this.globalPitchTarget) {
      this.globalPitchCurrent += this.globalPitchSlideSpeed;
      if (this.globalPitchCurrent > this.globalPitchTarget) {
        this.globalPitchCurrent = this.globalPitchTarget;
      }
    } else {
      this.globalPitchCurrent -= this.globalPitchSlideSpeed;
      if (this.globalPitchCurrent < this.globalPitchTarget) {
        this.globalPitchCurrent = this.globalPitchTarget;
      }
    }

    // Apply the new pitch shift
    const playbackRate = Math.pow(2, this.globalPitchCurrent / 12);

    if (this.isDJDeck) {
      // DJ mode: use per-replayer state only — don't touch ToneEngine globals
      // (The DJ pitch slider is authoritative; Wxx just adjusts sample rates)
      this.updateAllPlaybackRates();
    } else {
      // Normal tracker mode: write to ToneEngine globals
      const engine = getToneEngine();
      engine.setGlobalPlaybackRate(playbackRate);

      // Update all currently playing samples
      this.updateAllPlaybackRates();

      // Update all currently playing synths (detune in cents = semitones * 100)
      engine.setGlobalDetune(this.globalPitchCurrent * 100);

      // Update BPM to reflect pitch shift
      const effectiveBPM = Math.round(this.bpm * playbackRate * 100) / 100;
      useTransportStore.getState().setBPM(effectiveBPM);
      Tone.getTransport().bpm.value = effectiveBPM;

      // Update global pitch in store (makes DJ slider move to reflect W command)
      useTransportStore.getState().setGlobalPitch(this.globalPitchCurrent);

      // Update PatternScheduler to stay in sync
      const scheduler = getPatternScheduler();
      scheduler.setGlobalPitchOffset(this.globalPitchCurrent);
    }
  }

  /**
   * Pan slide (effect Pxx)
   * x = slide right, y = slide left
   */
  private doPanSlide(ch: ChannelState, param: number, time: number): void {
    const x = (param >> 4) & 0x0F;
    const y = param & 0x0F;

    if (x > 0) {
      ch.panning = Math.min(255, ch.panning + x);
    } else if (y > 0) {
      ch.panning = Math.max(0, ch.panning - y);
    }

    this.applyPanEffect(ch, ch.panning, time);
  }

  /**
   * Apply volume slide for IT-style retrigger (Rxy)
   * Based on the y nibble value
   */
  private applyRetrigVolSlide(ch: ChannelState, slideType: number, time: number): void {
    switch (slideType) {
      case 0: break; // No change
      case 1: ch.volume = Math.max(0, ch.volume - 1); break;
      case 2: ch.volume = Math.max(0, ch.volume - 2); break;
      case 3: ch.volume = Math.max(0, ch.volume - 4); break;
      case 4: ch.volume = Math.max(0, ch.volume - 8); break;
      case 5: ch.volume = Math.max(0, ch.volume - 16); break;
      case 6: ch.volume = Math.floor(ch.volume * 2 / 3); break;
      case 7: ch.volume = Math.floor(ch.volume / 2); break;
      case 8: break; // No change
      case 9: ch.volume = Math.min(64, ch.volume + 1); break;
      case 10: ch.volume = Math.min(64, ch.volume + 2); break;
      case 11: ch.volume = Math.min(64, ch.volume + 4); break;
      case 12: ch.volume = Math.min(64, ch.volume + 8); break;
      case 13: ch.volume = Math.min(64, ch.volume + 16); break;
      case 14: ch.volume = Math.min(64, Math.floor(ch.volume * 3 / 2)); break;
      case 15: ch.volume = Math.min(64, ch.volume * 2); break;
    }
    ch.gainNode.gain.setValueAtTime(ch.volume / 64, time);
  }

  // ==========================================================================
  // MACRO PROCESSING (Furnace instruments)
  // ==========================================================================

  /**
   * Process Furnace instrument macros for a channel
   * Called every tick to apply macro values
   */
  private processMacros(ch: ChannelState, time: number): void {
    if (!ch.instrument?.furnace?.macros) return;

    const macros = ch.instrument.furnace.macros as FurnaceMacro[];
    if (macros.length === 0) return;



    for (const macro of macros) {
      if (!macro.data || macro.data.length === 0) continue;

      // Get current macro position, handling loop/release
      let pos = ch.macroPos;
      const speed = macro.speed || 1;

      // Only advance every 'speed' ticks
      if (this.currentTick % speed !== 0) continue;

      // Handle release point
      if (ch.macroReleased && macro.release >= 0 && pos < macro.release) {
        pos = macro.release;
      }

      // Handle loop
      if (pos >= macro.data.length) {
        if (macro.loop >= 0 && macro.loop < macro.data.length) {
          // If released and loop is before release, stay at end
          if (ch.macroReleased && macro.release >= 0 && macro.loop < macro.release) {
            pos = macro.data.length - 1;
          } else {
            pos = macro.loop;
          }
        } else {
          pos = macro.data.length - 1; // Stay at last value
        }
      }

      const value = macro.data[pos] ?? 0;
      this.applyMacroValue(ch, macro.type, value, time);
    }

    // Advance macro position
    ch.macroPos++;
  }

  /**
   * Apply a macro value to a channel based on macro type
   */
  private applyMacroValue(ch: ChannelState, macroType: number, value: number, time: number): void {
    switch (macroType) {
      case FurnaceMacroType.VOL: // Volume (0-15 for most chips, scale to 0-64)
        ch.volume = Math.round((value / 15) * 64);
        ch.gainNode.gain.setValueAtTime(ch.volume / 64 * (this.globalVolume / 64), time);
        break;

      case FurnaceMacroType.ARP: // Arpeggio (note offset, can be negative)
        ch.macroArpNote = value > 127 ? value - 256 : value; // Handle signed
        if (ch.period > 0) {
          // Apply arpeggio as period change
          const semitoneRatio = Math.pow(2, ch.macroArpNote / 12);
          const newPeriod = Math.round(ch.note / semitoneRatio);
          this.updatePeriodDirect(ch, newPeriod);
        }
        break;

      case FurnaceMacroType.DUTY: // Duty cycle
        ch.macroDuty = value;
        // Note: duty changes need to be handled by the synth engine
        // For now, store for potential use
        break;

      case FurnaceMacroType.WAVE: // Waveform
        ch.macroWaveform = value;
        // Note: waveform changes need wavetable support
        break;

      case FurnaceMacroType.PITCH: // Pitch offset (fine pitch)
        ch.macroPitchOffset = value > 127 ? value - 256 : value; // Signed
        if (ch.period > 0) {
          // Apply as small period adjustment
          const pitchAdjust = ch.macroPitchOffset / 64; // Scale to reasonable range
          const newPeriod = Math.round(ch.period * (1 - pitchAdjust * 0.01));
          this.updatePeriodDirect(ch, Math.max(113, Math.min(856, newPeriod)));
        }
        break;

      case FurnaceMacroType.EX1: // Extra 1 (chip-specific)
      case FurnaceMacroType.EX2: // Extra 2
      case FurnaceMacroType.EX3: // Extra 3
      case FurnaceMacroType.EX4: // Extra 4
      case FurnaceMacroType.EX5: // Extra 5
      case FurnaceMacroType.EX6: // Extra 6
      case FurnaceMacroType.EX7: // Extra 7
      case FurnaceMacroType.EX8: // Extra 8
        // Chip-specific macros - would need per-chip handling
        break;

      case FurnaceMacroType.ALG: // Algorithm (FM)
      case FurnaceMacroType.FB: // Feedback (FM)
      case FurnaceMacroType.FMS: // FM LFO speed
      case FurnaceMacroType.AMS: // AM LFO speed
        // FM macros - need FurnaceSynth integration
        break;

      case FurnaceMacroType.PAN_L: // Pan left
        ch.panning = Math.max(0, 128 - value * 8);
        this.applyPanEffect(ch, ch.panning, time);
        break;

      case FurnaceMacroType.PAN_R: // Pan right
        ch.panning = Math.min(255, 128 + value * 8);
        this.applyPanEffect(ch, ch.panning, time);
        break;

      case FurnaceMacroType.PHASE_RESET: // Phase reset
        // Would need synth integration
        break;
    }
  }

  /**
   * Handle note release for macros
   */
  private releaseMacros(ch: ChannelState): void {
    ch.macroReleased = true;
  }

  // ==========================================================================
  // VOICE CONTROL
  // ==========================================================================

  private triggerNote(ch: ChannelState, time: number, offset: number, channelIndex?: number, accent?: boolean, slideActive?: boolean, currentRowSlide?: boolean, hammer?: boolean): void {
    // Skip note trigger if channel is muted.
    // slideActive = from PREVIOUS row's slide flag, determines pitch glide behavior
    // currentRowSlide = CURRENT row's slide flag, determines gate timing (sustain into next note)
    if (channelIndex !== undefined) {
      if (this.isDJDeck) {
        // DJ decks use a per-replayer bitmask so each deck is independent.
        // Bit N = 1 → channel N audible; bit N = 0 → muted.
        if ((this.channelMuteMask & (1 << channelIndex)) === 0) return;
      } else {
        // Tracker view uses ToneEngine's global mute state.
        const engine = getToneEngine();
        if (engine.isChannelMuted(channelIndex)) return;
      }
    }

    const safeTime = time ?? Tone.now();

    // Stop the current active player at the new note's start time
    // Uses pool: old player stops, we switch to the next pooled player
    if (ch.player) {
      try {
        ch.player.stop(safeTime);
      } catch {
        // Player might already be stopped
      }
    }

    // Reset macro state on note trigger
    ch.macroPos = 0;
    ch.macroReleased = false;
    ch.macroPitchOffset = 0;
    ch.macroArpNote = 0;

    if (!ch.instrument) {
      // No instrument assigned - try to use the first available instrument
      if (this.song && this.song.instruments.length > 0) {
        // No instrument assigned - assign default instrument silently
        ch.instrument = this.song.instruments[0];
        ch.sampleNum = this.song.instruments[0].id;
        ch.volume = 64;
        ch.finetune = ch.instrument.metadata?.modPlayback?.finetune ?? 0;
      } else {
        console.warn('[TrackerReplayer] No instrument assigned to channel and no instruments available');
        return;
      }
    }

    const engine = getToneEngine();
    
    // For synth instruments, use XM note directly (avoids period table issues)
    // For sample-based, use period-to-note conversion
    const isSynthInstrument = ch.instrument.synthType && ch.instrument.synthType !== 'Sampler';
    const noteName = isSynthInstrument && ch.xmNote > 0 && ch.xmNote < 97
      ? xmNoteToNoteName(ch.xmNote)
      : periodToNoteName(ch.period);
    
    // --- Groove Velocity/Dynamics ---
    const transportState = useTransportStore.getState();
    const grooveTemplateId = transportState.grooveTemplateId;
    const grooveTemplate = GROOVE_MAP.get(grooveTemplateId);
    const intensity = transportState.swing / 100;
    
    let velocityOffset = 0;
    if (grooveTemplate) {
      const stride = Math.max(1, Math.round(transportState.grooveSteps / grooveTemplate.values.length));
      const stretchedRow = Math.floor(this.pattPos / stride);
      velocityOffset = getGrooveVelocity(grooveTemplate, stretchedRow) * intensity;
    }

    const velocity = Math.max(0, Math.min(1, (ch.volume / 64) + velocityOffset));

    if (typeof window !== 'undefined' && (window as unknown as { GROOVE_DEBUG?: boolean }).GROOVE_DEBUG && grooveTemplate && grooveTemplate.id !== 'straight') {
      console.log(`[Groove] row=${String(this.pattPos).padStart(2)} ch=${channelIndex} velOffset=${velocityOffset >= 0 ? '+' : ''}${velocityOffset.toFixed(3)} velocity=${velocity.toFixed(3)}`);
    }

    // Schedule VU meter trigger at exact audio playback time for tight sync.
    // Uses pre-allocated per-channel callbacks to avoid closure allocation per note.
    if (channelIndex !== undefined) {
      if (!this.meterCallbacks) {
        this.meterCallbacks = [];
        for (let i = 0; i < 64; i++) {
          const ch = i;
          this.meterCallbacks[i] = () => {
            engine.triggerChannelMeter(ch, this.meterStaging[ch]);
          };
        }
      }
      this.meterStaging[channelIndex] = velocity;
      Tone.Draw.schedule(this.meterCallbacks[channelIndex], safeTime);
    }

    // Check if this is a synth instrument (has synthType) or sample-based
    if (ch.instrument.synthType && ch.instrument.synthType !== 'Sampler') {
      
      // Use ToneEngine for synth instruments (TB303, drums, etc.)
      // Calculate duration based on speed/BPM (one row duration as default)
      const rowDuration = (2.5 / this.bpm) * this.speed;

      // TB-303 MID-STEP GATE TIMING:
      // Real 303 lowers gate at ~50-80% of step, unless sliding to next note.
      // Slide on CURRENT row means gate stays high until next note starts.
      const is303Synth = ch.instrument.synthType === 'TB303' ||
                         ch.instrument.synthType === 'Buzz3o3';
      
      // For 303 synths: use 80% duration for standard notes to ensure the gate
      // drops before the next tick starts (prevents unintentional slides).
      // Use 105% (slight overlap) for sliding notes to guarantee legato.
      // Note: currentRowSlide controls gate timing, slideActive controls pitch glide
      const noteDuration = is303Synth && !currentRowSlide
        ? rowDuration * 0.8  // 80% gate for punchy retrigger
        : rowDuration * 1.05; // 105% gate for guaranteed slide overlap

      engine.triggerNote(
        ch.instrument.id,
        noteName,
        noteDuration,
        safeTime,
        velocity,
        ch.instrument,
        accent,      // accent: applies to current note
        slideActive, // slide: from PREVIOUS row's slide flag - controls pitch glide!
        channelIndex,   // channelIndex: pass tracker channel to chip engine
        ch.period,   // period for MOD playback
        undefined,   // sampleOffset
        0,           // nnaAction
        hammer       // TT-303 hammer: legato without pitch glide (synth sets slideTime=0)
      );
      return;
    }

    // Sample-based playback (MOD/XM imports with embedded samples)
    // Get decoded AudioBuffer from ToneEngine (which decodes WAV to AudioBuffer during loading)
    const decodedBuffer = engine.getDecodedBuffer(ch.instrument.id);


    if (!decodedBuffer) {
      console.warn('[TrackerReplayer] No decoded buffer for instrument:', ch.instrument.id, ch.instrument.name);
      return;
    }

    const sample = ch.instrument.sample;

    // Check if period is valid (non-zero)
    if (!ch.period || ch.period <= 0) {
      console.warn('[TrackerReplayer] Invalid period, skipping playback:', ch.period);
      return;
    }

    // Calculate playback rate from period
    //
    // MOD samples are recorded at 8363 Hz for C-2 (period 428)
    // The WAV file has sample rate 8363 in its header
    // Browser decodes WAV to 44100 Hz but PRESERVES PITCH
    // So playing at rate 1.0 = original pitch (C-2, period 428)
    //
    // For other periods: rate = basePeriod / currentPeriod
    // Example: C-3 (period 214) = 428/214 = 2.0x (one octave up)
    //
    // Using finetune: each finetune unit shifts by ~1/8 semitone
    const basePeriod = 428; // C-2 base period
    const finetune = ch.finetune;
    const finetuneMultiplier = Math.pow(2, finetune / (8 * 12)); // finetune in 1/8 semitones
    const playbackRate = (basePeriod / ch.period) * finetuneMultiplier;

    // Get or create cached ToneAudioBuffer wrapper (avoids re-wrapping per note)
    let toneBuffer = this.bufferCache.get(ch.instrument.id);
    if (!toneBuffer) {
      toneBuffer = new Tone.ToneAudioBuffer(decodedBuffer);
      this.bufferCache.set(ch.instrument.id, toneBuffer);
    }

    // Advance to next player in the pool (round-robin double-buffer)
    const nextIdx = (ch.activePlayerIdx + 1) % ch.playerPool.length;
    const player = ch.playerPool[nextIdx];
    ch.activePlayerIdx = nextIdx;

    // Safety: ensure the next pool player is stopped before reuse.
    // With fast retrigger (E91) + lookahead, the pool can cycle back to a player
    // that has future-scheduled events from a previously scheduled note.
    // Always call stop() — Source.stop() handles all cases internally via
    // getNextState(), including future-scheduled starts that player.state misses.
    try { player.stop(safeTime); } catch { /* ignored */ }

    // Configure the pooled player (no allocation, no connect - already done)
    player.buffer = toneBuffer;

    // Set playback parameters
    // CRITICAL: Use the ORIGINAL sample rate (usually 8363 Hz for MOD) for time-based loop calculations
    // to ensure loop points align exactly with sample positions.
    // Using buffer.sampleRate (44100+) would be wrong if the WAV header metadata was different.
    const originalSampleRate = sample?.sampleRate || 8363;
    const duration = decodedBuffer.duration;

    const hasLoop = sample?.loop && (sample.loopEnd ?? 0) > (sample.loopStart ?? 0);
    if (hasLoop) {
      player.loop = true;
      // Loop points are in samples, convert to seconds using original sample rate
      // Clamp to duration to avoid Tone.js RangeError
      player.loopStart = Math.min((sample.loopStart ?? 0) / originalSampleRate, duration - 0.0001);
      player.loopEnd = Math.min((sample.loopEnd ?? 0) / originalSampleRate, duration);

      if (player.loopEnd <= player.loopStart) {
        player.loopEnd = duration;
      }
    } else {
      player.loop = false;
    }

    // Apply playback rate multiplier for pitch shifting (DJ slider, etc.)
    // In DJ mode, use per-deck multiplier; otherwise use ToneEngine global
    const pitchRate = this.getEffectivePlaybackRate();
    player.playbackRate = playbackRate * pitchRate;

    ch.player = player; // Keep reference for updatePeriod compatibility

    // Start playback - buffer is already loaded, player already connected
    try {
      // pt2-clone bounds check: if offset >= total sample length, play from beginning.
      let startOffset = 0;
      if (offset > 0) {
        const durationFrames = duration * originalSampleRate;
        if (offset < durationFrames) {
          startOffset = Math.min(offset / originalSampleRate, duration - 0.0001);
        }
        // else: offset >= sample length → play from beginning (pt2-clone behavior)
        /* eslint-disable no-console */
        console.log('[9xx:play] offset=' + offset + ' origRate=' + originalSampleRate + ' bufferDur=' + duration.toFixed(4) + 's bufferFrames=' + Math.round(durationFrames) + ' period=' + ch.period + ' rate=' + player.playbackRate.toFixed(4) + ' startOffset=' + startOffset.toFixed(4) + 's loop=' + player.loop + (offset >= durationFrames ? ' (CLAMPED TO 0!)' : ''));
        /* eslint-enable no-console */
      }
      player.start(safeTime, startOffset);
    } catch (e) {
      console.error('[TrackerReplayer] Playback start failed:', e);
    }
  }

  private stopChannel(ch: ChannelState, channelIndex?: number, time?: number): void {
    // Stop all pooled players (no disposal - they're reused)
    // Always call stop() without checking player.state first — Source.stop()
    // internally handles future-scheduled starts via getNextState().
    // The old guard `if (player.state === 'started')` checked state at Tone.now(),
    // missing players started in the lookahead window (future-scheduled events).
    for (const player of ch.playerPool) {
      try {
        if (time !== undefined) {
          player.stop(time);
        } else {
          player.stop();
        }
      } catch { /* ignored */ }
    }
    ch.player = null;

    // Release any active synth notes on this channel
    // Use the scheduled time so NOTE_OFF arrives at the correct moment
    // (time=0 means "immediately", which fails if NOTE_ON is still queued for a future time)
    if (ch.instrument && ch.instrument.synthType && ch.instrument.synthType !== 'Sampler' && ch.lastPlayedNoteName) {
      try {
        const engine = getToneEngine();
        engine.triggerNoteRelease(ch.instrument.id, ch.lastPlayedNoteName, time ?? 0, ch.instrument, channelIndex);
      } catch { /* ignored */ }
    }
    ch.lastPlayedNoteName = null; // Clear for next note sequence
  }

  private updatePeriod(ch: ChannelState): void {
    this.updatePeriodDirect(ch, ch.period);
  }

  private updatePeriodDirect(ch: ChannelState, period: number): void {
    if (!ch.player || period === 0) return;

    const sampleRate = ch.instrument?.sample?.sampleRate || 8363;
    const frequency = AMIGA_PAL_FREQUENCY / period;
    // Apply playback rate multiplier for pitch shifting (DJ slider, etc.)
    // In DJ mode, use per-deck multiplier; otherwise use ToneEngine global
    const rate = this.getEffectivePlaybackRate();
    ch.player.playbackRate = (frequency / sampleRate) * rate;
  }

  /**
   * Update all active players' playback rates when global playback rate changes
   * Called by DJ pitch slider to apply pitch shift to already-playing samples
   */
  public updateAllPlaybackRates(): void {
    // In DJ mode, use per-deck multiplier; otherwise use ToneEngine global
    const rate = this.getEffectivePlaybackRate();

    for (const ch of this.channels) {
      if (ch.player && ch.period > 0) {
        const sampleRate = ch.instrument?.sample?.sampleRate || 8363;
        const frequency = AMIGA_PAL_FREQUENCY / ch.period;
        ch.player.playbackRate = (frequency / sampleRate) * rate;
      }
    }
  }

  /**
   * Update all channel volumes based on current global volume
   * Used when global volume changes (effect Gxx)
   */
  private updateAllChannelVolumes(time: number): void {
    const globalScale = this.globalVolume / 64;
    for (const ch of this.channels) {
      const effectiveVolume = (ch.volume / 64) * globalScale;
      ch.gainNode.gain.setValueAtTime(effectiveVolume, time);
    }
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private noteToPeriod(note: number | string, finetune: number): number {
    if (typeof note === 'number' && note > 0) {
      // MOD files use period values directly (113-856), XM uses note numbers (1-96)
      if (note >= 113 && note <= 856) {
        // Already a period value (MOD format)
        return note;
      } else if (note < 97) {
        // Note number (1-96): convert to period
        // Note 1 = C-0, Note 13 = C-1, Note 25 = C-2, etc.
        // Period table covers C-1 to B-3 (notes 13-48 in 1-based, or 12-47 in 0-based)

        const noteIndex = note - 1; // Convert to 0-based

        // Find which note within the period table's 3-octave range
        // Period table: 0-11 = C-1 to B-1, 12-23 = C-2 to B-2, 24-35 = C-3 to B-3
        let tableIndex = noteIndex;
        let octaveShift = 0;

        // If note is below C-1 (index 12), shift up
        while (tableIndex < 12) {
          tableIndex += 12;
          octaveShift--;
        }

        // If note is above B-3 (index 47), shift down to table range
        while (tableIndex > 47) {
          tableIndex -= 12;
          octaveShift++;
        }

        // Adjust to 0-35 range (C-1 = 0, B-3 = 35)
        tableIndex -= 12;

        if (tableIndex >= 0 && tableIndex < 36) {
          let period = this.getPeriod(tableIndex, finetune);

          // Adjust for octaves: period halves for each octave up, doubles for each octave down
          if (octaveShift > 0) {
            period = Math.round(period / Math.pow(2, octaveShift));
          } else if (octaveShift < 0) {
            period = Math.round(period * Math.pow(2, -octaveShift));
          }

          return period;
        }
      }
    } else if (typeof note === 'string') {
      // String note to period
      return this.noteStringToPeriod(note, finetune);
    }
    return 0;
  }

  private noteStringToPeriod(note: string, finetune: number): number {
    const noteMap: { [key: string]: number } = {
      'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5,
      'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11,
    };

    const match = note.match(/^([A-G][#]?)-?(\d)$/);
    if (!match) return 0;

    const noteIndex = noteMap[match[1]] ?? 0;
    const octave = parseInt(match[2], 10);
    const absIndex = (octave - 1) * 12 + noteIndex;

    if (absIndex < 0 || absIndex >= 36) return 0;
    return this.getPeriod(absIndex, finetune);
  }

  private getPeriod(noteIndex: number, finetune: number): number {
    const ftIndex = finetune >= 0 ? finetune : finetune + 16;
    const offset = ftIndex * 36;
    return PERIOD_TABLE[offset + Math.min(35, Math.max(0, noteIndex))];
  }

  private periodPlusSemitones(period: number, semitones: number, finetune: number): number {
    // Find note index
    const ftIndex = finetune >= 0 ? finetune : finetune + 16;
    const offset = ftIndex * 36;

    let noteIndex = 0;
    for (let i = 0; i < 36; i++) {
      if (PERIOD_TABLE[offset + i] <= period) {
        noteIndex = i;
        break;
      }
    }

    const newIndex = Math.min(35, Math.max(0, noteIndex + semitones));
    return PERIOD_TABLE[offset + newIndex];
  }

  // ==========================================================================
  // ROW ADVANCEMENT
  // ==========================================================================

  private advanceRow(): void {
    if (!this.song) return;

    // DJ nudge: apply temporary BPM offset and decrement counter
    if (this.nudgeTicksRemaining > 0) {
      this.nudgeTicksRemaining--;
      if (this.nudgeTicksRemaining === 0) {
        this.nudgeOffset = 0;
      }
    }

    // DJ slip mode: advance ghost position even while looping
    if (this.slipEnabled && (this.lineLoopActive || this.patternLoopActive)) {
      this.slipPattPos++;
      const slipPatternNum = this.song.songPositions[this.slipSongPos];
      const slipPattern = this.song.patterns[slipPatternNum];
      const slipLength = slipPattern?.length ?? 64;
      if (this.slipPattPos >= slipLength) {
        this.slipPattPos = 0;
        this.slipSongPos++;
        if (this.slipSongPos >= this.song.songLength) {
          this.slipSongPos = this.song.restartPosition < this.song.songLength
            ? this.song.restartPosition : 0;
        }
      }
    }

    // DJ line loop: if active, wrap within loop boundaries
    if (this.lineLoopActive && this.lineLoopStart >= 0) {
      this.pattPos++;
      if (this.pattPos > this.lineLoopEnd) {
        this.pattPos = this.lineLoopStart;
      }
      // Notify and return early — don't do normal advancement
      if (this.onRowChange && this.song) {
        const pattNum = this.song.songPositions[this.songPos];
        this.onRowChange(this.pattPos, pattNum, this.songPos);
      }
      this.totalRowsProcessed++;
      return;
    }

    // Pattern break
    if (this.pBreakFlag) {
      this.pattPos = this.pBreakPos;
      this.pBreakFlag = false;
      this.pBreakPos = 0;

      if (!this.posJumpFlag) {
        this.songPos++;
      }
    } else {
      this.pattPos++;
    }

    // Position jump
    if (this.posJumpFlag) {
      this.songPos = this.posJumpPos;
      this.posJumpFlag = false;
    }

    // Pattern end
    const patternNum = this.song.songPositions[this.songPos];
    const pattern = this.song.patterns[patternNum];
    const patternLength = pattern?.length ?? 64;

    if (this.pattPos >= patternLength) {
      this.pattPos = 0;
      this.songPos++;
    }

    // DJ pattern loop: wrap song position within loop boundaries
    if (this.patternLoopActive && this.patternLoopStartPos >= 0) {
      if (this.songPos > this.patternLoopEndPos) {
        this.songPos = this.patternLoopStartPos;
        this.pattPos = 0;
      }
    }

    // Song end
    if (this.songPos >= this.song.songLength) {
      this.songPos = this.song.restartPosition < this.song.songLength
        ? this.song.restartPosition
        : 0;
      this.onSongEnd?.();
    }

    // Notify
    if (this.onRowChange && this.song) {
      const pattNum = this.song.songPositions[this.songPos];
      this.onRowChange(this.pattPos, pattNum, this.songPos);
    }

    this.totalRowsProcessed++;
  }

  // ==========================================================================
  // GETTERS
  // ==========================================================================

  /**
   * Seek to a specific song position and pattern row.
   * Stops all channels, resets state, then resumes if playing.
   */
  seekTo(songPos: number, pattPos: number): void {
    if (!this.song) return;

    // ---- Seamless seek while playing ----
    // Don't stop channels or restart the scheduler — just update the position
    // pointers so the next scheduled tick picks up from the new location.
    // This prevents the audible pause that would occur from releasing all
    // active notes and restarting the scheduler.
    if (this.playing) {
      this.songPos = Math.max(0, Math.min(songPos, this.song.songLength - 1));
      this.pattPos = Math.max(0, pattPos);
      this.currentTick = 0;

      // Clamp pattern position
      const patternNum = this.song.songPositions[this.songPos];
      const pattern = this.song.patterns[patternNum];
      if (pattern && this.pattPos >= pattern.length) {
        this.pattPos = 0;
      }

      // Reset pattern break/jump flags so stale jumps don't fire
      this.pBreakFlag = false;
      this.posJumpFlag = false;
      this.patternDelay = 0;

      // Re-sync speed alternation to match target row parity
      if (this.speed2 !== null) {
        // Furnace alternates: row 0 = speed1, row 1 = speed2, row 2 = speed1, ...
        // speedAB=false means "next row will use speed1", so for the CURRENT row:
        // even rows → currently using speed1, speedAB should be true (next = speed2)
        // odd rows → currently using speed2, speedAB should be false (next = speed1)
        this.speedAB = (this.pattPos % 2 === 0);
        this.speed = (this.pattPos % 2 === 0) ? this.song.initialSpeed : this.speed2;
      }

      // Re-sync scheduler timing to NOW so the next tick fires immediately
      // from the new position instead of waiting for the old schedule.
      // This is the ONLY place nextScheduleTime is set to Tone.now() — and
      // only for user-initiated seeks, never for natural pattern advancement.
      this.nextScheduleTime = Tone.now();

      // Clear queued display states so old position updates don't flicker the UI
      this.clearStateQueue();
      cancelPendingRowUpdate();

      // Notify UI of the new position immediately
      if (this.onRowChange) {
        this.onRowChange(this.pattPos, patternNum, this.songPos);
      }

      return;
    }

    // ---- Full seek while stopped ----
    // Stop all channels (release synth notes + stop sample players)
    for (let i = 0; i < this.channels.length; i++) {
      this.stopChannel(this.channels[i], i);
    }

    // Clear state queue
    this.clearStateQueue();

    // Cancel any pending throttled row updates to prevent UI reverting to old position
    cancelPendingRowUpdate();

    // Set new position
    this.songPos = Math.max(0, Math.min(songPos, this.song.songLength - 1));
    this.pattPos = Math.max(0, pattPos);
    this.currentTick = 0;

    // Re-sync speed alternation for stopped seek too
    if (this.speed2 !== null) {
      this.speedAB = (this.pattPos % 2 === 0);
      this.speed = (this.pattPos % 2 === 0) ? this.song.initialSpeed : this.speed2;
    }

    // Clamp pattern position
    const patternNum = this.song.songPositions[this.songPos];
    const pattern = this.song.patterns[patternNum];
    if (pattern && this.pattPos >= pattern.length) {
      this.pattPos = 0;
    }

    // Reset pattern break/jump flags
    this.pBreakFlag = false;
    this.posJumpFlag = false;
    this.patternDelay = 0;

    // Notify UI
    if (this.onRowChange) {
      this.onRowChange(this.pattPos, patternNum, this.songPos);
    }

  }

  /**
   * Jump to a specific pattern by index (not song position).
   * Finds the first song position that references this pattern and seeks there.
   * If the pattern is not in the song order, it won't jump.
   */
  jumpToPattern(patternIndex: number, row: number = 0): void {
    if (!this.song) return;
    
    // Find the first song position that plays this pattern
    const songPos = this.song.songPositions.findIndex(p => p === patternIndex);
    if (songPos !== -1) {
      this.seekTo(songPos, row);
    } else {
      // Pattern not in song order - just update the display state
      // Clear the state queue so old states don't override
      this.clearStateQueue();
      // Pattern not in song order — just clear the state queue, don't seek
    }
  }

  isPlaying(): boolean { return this.playing; }
  getBPM(): number { return this.bpm; }
  getSpeed(): number { return this.speed; }
  getCurrentRow(): number { return this.pattPos; }
  getCurrentPosition(): number { return this.songPos; }
  getCurrentTick(): number { return this.currentTick; }

  /**
   * Hot-swap pattern data without stopping playback.
   * The scheduler reads this.song.patterns on every tick, so updating the
   * reference is enough for edits (transpose, cell edits, fills) to take
   * effect immediately — no stop/reload/play cycle needed.
   */
  updatePatterns(patterns: Pattern[]): void {
    if (this.song) {
      this.song.patterns = patterns;
    }
  }

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  dispose(): void {
    this.stop();
    for (const ch of this.channels) {
      // Dispose all pooled players
      for (const player of ch.playerPool) {
        try { player.dispose(); } catch { /* ignored */ }
      }
      ch.gainNode.dispose();
      ch.panNode.dispose();
    }
    // Clear buffer cache
    this.bufferCache.clear();
    this.masterGain.dispose();
    this.channels = [];
    this.song = null;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: TrackerReplayer | null = null;

export function getTrackerReplayer(): TrackerReplayer {
  if (!instance) {
    instance = new TrackerReplayer();
  }
  return instance;
}

export function disposeTrackerReplayer(): void {
  if (instance) {
    instance.dispose();
    instance = null;
  }
}
