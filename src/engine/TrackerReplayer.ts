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
import type { Pattern, TrackerCell, FurnaceNativeData, HivelyNativeData, FurnaceSubsongPlayback } from '@/types';
import type { InstrumentConfig, FurnaceMacro } from '@/types/instrument';
import { FurnaceMacroType } from '@/types/instrument';
import { PatternAccessor } from './PatternAccessor';
import { getToneEngine } from './ToneEngine';
import { StereoSeparationNode } from './StereoSeparationNode';
import { getNativeAudioNode } from '@utils/audio-context';
import { getPatternScheduler } from './PatternScheduler';
import { useTransportStore, cancelPendingRowUpdate } from '@/stores/useTransportStore';
import { getGrooveOffset, getGrooveVelocity, GROOVE_TEMPLATES } from '@/types/audio';
import type { GrooveTemplate } from '@/types/audio';
import { unlockIOSAudio } from '@utils/ios-audio-unlock';
import { ft2NoteToPeriod, ft2Period2Hz, ft2GetSampleC4Rate, ft2ArpeggioPeriod, ft2Period2NotePeriod, FT2_ARPEGGIO_TAB } from './effects/FT2Tables';
import { HivelyEngine } from './hively/HivelyEngine';
import { MusicLineEngine } from './musicline/MusicLineEngine';
// ============================================================================
// CONSTANTS
// ============================================================================

const AMIGA_PAL_FREQUENCY = 3546895;
const PLAYERS_PER_CHANNEL = 2; // Double-buffered pool for overlap-free note transitions

// PERF: Pre-computed finetune multipliers (finetune -8..+7 = 16 values)
// Avoids Math.pow() per note trigger. finetune in 1/8 semitone units.
const FINETUNE_MULTIPLIERS: number[] = new Array(16);
for (let ft = -8; ft <= 7; ft++) {
  FINETUNE_MULTIPLIERS[ft + 8] = Math.pow(2, ft / (8 * 12));
}

// PERF: Pre-computed semitone ratios for arpeggio macro and pitch slide
// Covers -128..+127 semitones (full signed byte range). Index = semitones + 128.
const SEMITONE_RATIOS: number[] = new Array(256);
for (let s = -128; s <= 127; s++) {
  SEMITONE_RATIOS[s + 128] = Math.pow(2, s / 12);
}

// PERF: Pre-computed octave multipliers for period conversion
// Covers octave shifts 0..10 (more than enough for any tracker format)
const OCTAVE_UP: number[] = new Array(11);
const OCTAVE_DOWN: number[] = new Array(11);
for (let o = 0; o <= 10; o++) {
  OCTAVE_UP[o] = Math.pow(2, o);
  OCTAVE_DOWN[o] = Math.pow(2, -o);
}

// FT2 auto-vibrato sine table (256 entries, -64..+64)
// From ft2_replayer.c: autoVibSineTab[256]
const AUTO_VIB_SINE_TAB: Int8Array = new Int8Array(256);
for (let i = 0; i < 256; i++) {
  AUTO_VIB_SINE_TAB[i] = Math.round(Math.sin((i * 2 * Math.PI) / 256) * 64);
}

// PERF: Module-level constants to avoid per-call allocation
const DEBUG_NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTE_STRING_MAP: { [key: string]: number } = {
  'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5,
  'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11,
};

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

// FurnaceChipEngine synthTypes — these use the register-write path and need TS-side macros.
// All other Furnace* synthTypes use FurnaceDispatchEngine (WASM processes macros internally).
const FURNACE_CHIP_ENGINE_TYPES = new Set([
  'Furnace', 'FurnaceOPN', 'FurnaceOPM', 'FurnaceOPL', 'FurnaceOPLL', 'FurnaceOPZ',
  'FurnaceOPNA', 'FurnaceOPNB', 'FurnaceOPL4', 'FurnaceY8950', 'FurnaceESFM',
  'FurnaceVRC7', 'FurnaceOPN2203', 'FurnaceOPNBB',
]);

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

export type TrackerFormat =
  | 'MOD' | 'XM' | 'IT' | 'S3M' | 'HVL' | 'AHX' | 'ML'
  // Exotic Amiga formats (Phase 2 full editing)
  | 'OKT'   // Oktalyzer
  | 'MED'   // OctaMED / MED
  | 'DIGI'  // DigiBooster
  | 'DBM'   // DigiBooster Pro (.dbm)
  | 'FC'    // Future Composer 1.3/1.4
  // FlodJS-enhanced native parsers
  | 'SFX'   // Sound-FX
  | 'SMON'  // SoundMon (Brian Postma)
  | 'SIDMON2' // SidMon II
  | 'FRED'  // Fred Editor
  | 'DMUG'  // Digital Mugician
  // UADE catch-all (playback-only, 130+ formats)
  | 'UADE'
  // Chip-dump / CPU-code formats (metadata + stub patterns)
  | 'VGM'  // Video Game Music (OPN2/OPL/SN register dumps)
  | 'YM'   // Atari ST AY/YM2149 register dumps
  | 'NSF'  // NES Sound Format (2A03 + expansion chips)
  | 'SID'  // Commodore 64 SID (PSID/RSID)
  | 'SAP'  // Atari 8-bit POKEY
  | 'AY';  // ZX Spectrum AY (ZXAYEMUL)

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
  finetune: number;              // Finetune: -8 to +7 (MOD) or -128 to +127 (XM)
  relativeNote: number;          // XM sample relative note (-96 to +95)

  // Effect memory
  portaSpeed: number;            // Portamento speed (1xx, 2xx) - MOD shared
  portaUpSpeed: number;          // FT2: separate portamento up speed memory
  portaDownSpeed: number;        // FT2: separate portamento down speed memory
  fPortaUpSpeed: number;         // FT2: fine portamento up speed memory (E1x)
  fPortaDownSpeed: number;       // FT2: fine portamento down speed memory (E2x)
  portaTarget: number;           // Tone portamento target (3xx)
  tonePortaSpeed: number;        // Tone portamento speed
  vibratoPos: number;            // Vibrato position
  vibratoCmd: number;            // Vibrato speed/depth
  tremoloPos: number;            // Tremolo position
  tremoloCmd: number;            // Tremolo speed/depth (MOD)
  tremoloSpeed: number;          // FT2: stored separately, = (param & 0xF0) >> 2
  tremoloDepth: number;          // FT2: stored separately
  waveControl: number;           // Waveform control
  retrigCount: number;           // Retrigger counter
  retrigVolSlide: number;        // Retrigger volume slide (IT Rxy)
  patternLoopRow: number;        // Pattern loop start row
  patternLoopCount: number;      // Pattern loop counter
  glissandoMode: boolean;        // E3x: true = semitone portamento
  tremorPos: number;             // Tremor state: bit 7 = on/off, bits 0-6 = counter
  tremorParam: number;           // Tremor parameter memory (Txy)
  efPitchSlideUpSpeed: number;   // Extra fine porta up speed memory (X1x)
  efPitchSlideDownSpeed: number; // Extra fine porta down speed memory (X2x)
  prevEffTyp: number;            // Previous row's effect type (for arpeggio/vibrato period reset)
  prevEffParam: number;          // Previous row's effect parameter
  noteRetrigSpeed: number;       // FT2 Rxy: retrigger speed memory
  noteRetrigVol: number;         // FT2 Rxy: retrigger volume slide memory
  noteRetrigCounter: number;     // FT2 Rxy: retrigger tick counter
  volColumnVol: number;          // FT2: volume column byte from current row (for Rxy quirk)
  oldVol: number;                // FT2: sample default volume from last triggerNote (for resetVolumes)
  oldPan: number;                // FT2: sample default panning from last triggerNote (for resetVolumes)
  rowInst: number;               // FT2: instrument number from current row (for EDx noteDelay)
  volSlideSpeed: number;         // FT2: volume slide speed memory (Axx)
  fVolSlideUpSpeed: number;      // FT2: fine volume slide up memory (EAx)
  fVolSlideDownSpeed: number;    // FT2: fine volume slide down memory (EBx)
  globalVolSlide: number;        // Global volume slide memory (Hxx)
  panSlide: number;              // Pan slide memory (Pxx)

  // Macro state (Furnace instruments)
  macroPos: number;              // Current position in macros
  macroReleased: boolean;        // Whether note has been released
  macroPitchOffset: number;      // Current pitch offset from macros
  macroArpNote: number;          // Current arpeggio note offset
  macroDuty: number;             // Current duty cycle from macro
  macroWaveform: number;         // Current waveform from macro

  // XM envelope state (FT2's fixaEnvelopeVibrato)
  keyOff: boolean;               // Key-off flag — triggers fadeout + envelope release
  fadeoutVol: number;            // Fadeout volume (0-32768, starts at 32768 on note trigger)
  fadeoutSpeed: number;          // Fadeout speed from instrument (0-4095)
  volEnvTick: number;            // Volume envelope tick counter
  volEnvPos: number;             // Volume envelope point index
  fVolEnvValue: number;          // Volume envelope interpolated value (0-64)
  fVolEnvDelta: number;          // Volume envelope per-tick delta
  panEnvTick: number;            // Panning envelope tick counter
  panEnvPos: number;             // Panning envelope point index
  fPanEnvValue: number;          // Panning envelope interpolated value (0-64)
  fPanEnvDelta: number;          // Panning envelope per-tick delta
  autoVibPos: number;            // Auto-vibrato position (0-255 wrapping)
  autoVibAmp: number;            // Auto-vibrato amplitude (fixed point, upper 8 bits = depth)
  autoVibSweep: number;         // Auto-vibrato sweep increment
  outVol: number;                // FT2 output volume = ch.volume (0-64)
  outPan: number;                // FT2 output panning (0-255)
  fFinalVol: number;             // Final computed volume after envelopes (0-1)
  finalPan: number;              // Final computed panning after envelopes (0-255)
  finalPeriod: number;           // Final period after auto-vibrato

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
  muteGain: Tone.Gain;              // Dedicated mute/solo gain (always 0 or 1)

  // Instrument reference
  instrument: InstrumentConfig | null;

  // Mute/solo tracking for gain sync
  _muteState: boolean;
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
  // XM frequency mode: true = linear periods (most XMs), false = amiga periods
  linearPeriods?: boolean;
  // Furnace-specific timing/compat (optional)
  speed2?: number;
  hz?: number;
  virtualTempoN?: number;
  virtualTempoD?: number;
  compatFlags?: Record<string, unknown>;
  grooves?: number[][];
  // Furnace module-level wavetables/samples for WASM dispatch upload
  furnaceWavetables?: Array<{ data: number[]; width: number; height: number }>;
  furnaceSamples?: Array<{ data: Int16Array | Int8Array | Uint8Array; rate: number; depth: number;
    loopStart: number; loopEnd: number; loopMode: number; name: string }>;
  // HVL/AHX metadata
  hivelyMeta?: {
    stereoMode: number;
    mixGain: number;
    speedMultiplier: number;
    version: number;
  };
  /** Raw HVL/AHX binary for loading into the HivelyEngine WASM */
  hivelyFileData?: ArrayBuffer;
  /** Raw MusicLine binary for loading into the MusicLineEngine WASM */
  musiclineFileData?: Uint8Array;
  // Native format data (preserved for format-specific editors)
  furnaceNative?: FurnaceNativeData;
  hivelyNative?: HivelyNativeData;
  // Pre-converted subsong data for in-editor subsong switching
  furnaceSubsongs?: FurnaceSubsongPlayback[];
  furnaceActiveSubsong?: number;

  // Per-channel independent sequencing (MusicLine Editor and similar formats)
  // When present, each channel uses its own pattern sequence instead of the global songPositions.
  // channelTrackTables[chIdx][posIdx] = patternIndex  (analogous to Furnace orders matrix)
  channelTrackTables?: number[][];
  // Per-channel ticks-per-row (overrides initialSpeed for each channel independently)
  channelSpeeds?: number[];
  // Per-channel groove speed (alternates with channelSpeeds each row; 0 = no groove)
  channelGrooves?: number[];
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
  // Format-dispatching pattern accessor (for native Furnace/Hively data)
  private accessor = new PatternAccessor();

  // PERF: Cached transport state — set once per scheduler interval (15ms),
  // reused by processTick() and triggerNote() to avoid repeated getState() calls
  private _cachedTransportState: ReturnType<typeof useTransportStore.getState> | null = null;

  // Playback state
  private playing = false;
  private _songEndFiredThisBatch = false;
  private songPos = 0;           // Current position in song order
  private pattPos = 0;           // Current row in pattern
  private currentTick = 0;       // Current tick (0 to speed-1)
  private speed = 6;             // Ticks per row
  private bpm = 125;             // Beats per minute
  private globalVolume = 64;     // Global volume (0-64)

  // FT2 XM period mode: true = linear periods, false = amiga periods
  // Set from song.linearPeriods when loading. MOD always uses amiga.
  private linearPeriods = false;
  // Whether to use FT2's period system (true for XM, false for MOD)
  private useXMPeriods = false;

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

  // Per-channel independent sequencing (MusicLine Editor and similar formats)
  // Each channel has its own tick counter and position, advancing at its own speed.
  private channelTickCounters: number[] = [];   // Per-channel tick counter (0 .. effectiveSpeed-1)
  private channelPattPos: number[] = [];         // Per-channel row within current pattern
  private channelSongPos: number[] = [];         // Per-channel index into its track table
  private channelGrooveToggle: boolean[] = [];   // Per-channel groove phase (alternates each row)

  // Pattern break/jump
  private pBreakPos = 0;
  private pBreakFlag = false;
  private posJumpFlag = false;
  private patternDelay = 0;      // EEx pattern delay (legacy, non-XM)
  // FT2 two-stage pattern delay
  private pattDelTime = 0;       // Set by EEx on tick 0, copied to pattDelTime2 at row boundary
  private pattDelTime2 = 0;      // Decremented each row; while > 0, row repeats (no new notes read)

  // Channels
  private channels: ChannelState[] = [];

  // Master output
  private masterGain: Tone.Gain;
  private readonly separationNode: StereoSeparationNode;
  private stereoMode: 'pt2' | 'modplug' = 'pt2';
  private modplugSeparation = 0;

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
  // Cache for multi-sample decoded AudioBuffers (keyed by "instId:sampleIdx")
  private multiSampleBufferCache: Map<string, AudioBuffer> = new Map();
  private _warnedMissingInstruments: Set<number> | undefined;

  // Instrument lookup map (keyed by instrument ID) — avoids linear scan per note
  private instrumentMap: Map<number, InstrumentConfig> = new Map();

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

  // Scratch note suppression: when true, the sequencer advances (position tracking)
  // but processRow/processEffectTick are skipped so no new notes trigger.
  // Used by DeckEngine during pattern scratches to prevent "extra notes" while
  // still allowing the pattern view to follow the scratch position.
  private _suppressNotes = false;

  // Per-deck channel mute mask (DJ mode only)
  // Bit N = 1 means channel N is ENABLED, 0 means MUTED.
  // Kept separate from ToneEngine's global mute states so each deck is independent.
  private channelMuteMask = 0xFFFF;   // All 16 channels enabled by default

  // Pre-allocated VU meter trigger callbacks (avoid closure allocation per note)
  private meterCallbacks: (() => void)[] | null = null;
  private meterStaging = new Float64Array(64);

  // Stereo separation (0-100): controls how wide the stereo image is.
  // 100 = full Amiga hard-pan (LRRL), 0 = mono, 20 = pt2-clone default for MOD.
  // Based on per-channel pan narrowing: actual_pan = basePan * (separation / 100)
  // Reference: pt2-clone (8bitbubsy), MilkyTracker, Schism Tracker
  private stereoSeparation = 100;

  // Track native engines (UADE/Hively) rerouted to separation chain (for cleanup on song change)
  private routedNativeEngines: Set<string> = new Set();

  // Whether the replayer is muted (DJ mode visuals-only)
  private _muted = false;

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
    this.separationNode = new StereoSeparationNode();
    // Chain: masterGain → separationNode → destination
    this.masterGain.connect(this.separationNode.inputTone);
    if (outputNode) {
      this.separationNode.outputTone.connect(outputNode);
      this.isDJDeck = true;
    } else {
      const engine = getToneEngine();
      this.separationNode.outputTone.connect(engine.masterInput);
    }
  }

  // ==========================================================================
  // DJ MODE METHODS
  // ==========================================================================

  /** Get the master gain node for external routing (DJ mixer, etc.) */
  getMasterGain(): Tone.Gain {
    return this.masterGain;
  }

  /** Mute/unmute all audio from this replayer (including native engines). */
  setMuted(mute: boolean): void {
    this._muted = mute;
    this.masterGain.gain.value = mute ? 0 : 1;
  }

  /** Get the stereo separation node's input for routing external native audio sources.
   *  UADE/Hively outputs connect here so stereo separation applies to their pre-mixed output. */
  getSeparationInput(): Tone.Gain {
    return this.separationNode.inputTone;
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

  /**
   * Suppress note/effect processing while still advancing the sequencer.
   * Used during DJ scratch patterns so the pattern view follows the scratch
   * without triggering new note events.
   */
  setSuppressNotes(suppress: boolean): void {
    this._suppressNotes = suppress;
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

  /** Re-sync the scheduler timeline to now so the next tick fires immediately.
   *  Call after restoring tempoMultiplier from a very low scratch value,
   *  otherwise nextScheduleTime may be seconds/minutes in the future. */
  resyncSchedulerToNow(): void {
    this.nextScheduleTime = Tone.now();
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
    if (this.stereoMode === 'pt2') {
      for (const ch of this.channels) {
        this.applyChannelPan(ch);
      }
    }
  }

  getStereoSeparation(): number {
    return this.stereoSeparation;
  }

  /**
   * Switch between PT2-clone and ModPlug stereo separation algorithms.
   * PT2:    per-channel pan positions are scaled toward center.
   * ModPlug: mid-side decomposition applied post-mix (OpenMPT algorithm).
   */
  setStereoSeparationMode(mode: 'pt2' | 'modplug'): void {
    this.stereoMode = mode;
    if (mode === 'pt2') {
      // Bypass the post-mix node (identity) and restore per-channel pan scaling
      this.separationNode.setSeparation(100);
      for (const ch of this.channels) {
        this.applyChannelPan(ch);
      }
    } else {
      // Activate post-mix node; set all channels to full (unscaled) basePan
      this.separationNode.setSeparation(this.modplugSeparation);
      for (const ch of this.channels) {
        ch.panNode.pan.rampTo(ch.basePan, 0.02);
      }
    }
  }

  /**
   * Set ModPlug separation percentage (0–200).
   * Only has effect when stereoMode === 'modplug'.
   */
  setModplugSeparation(percent: number): void {
    this.modplugSeparation = Math.max(0, Math.min(200, percent));
    if (this.stereoMode === 'modplug') {
      this.separationNode.setSeparation(this.modplugSeparation);
    }
  }

  getModplugSeparation(): number {
    return this.modplugSeparation;
  }

  getStereoSeparationMode(): 'pt2' | 'modplug' {
    return this.stereoMode;
  }

  /**
   * Apply stereo separation to a channel's pan node.
   * Uses the channel's basePan (original LRRL position) scaled by separation.
   */
  private applyChannelPan(ch: ChannelState): void {
    const actualPan = this.stereoMode === 'pt2'
      ? ch.basePan * (this.stereoSeparation / 100)
      : ch.basePan;
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
    const actualPan = this.stereoMode === 'pt2'
      ? normalizedPan * (this.stereoSeparation / 100)
      : normalizedPan;
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

    // Restore any native engines rerouted to separation chain (UADE/Hively)
    if (this.routedNativeEngines.size > 0) {
      const engine = getToneEngine();
      for (const key of this.routedNativeEngines) {
        engine.restoreNativeEngineRouting(key);
      }
      this.routedNativeEngines.clear();
    }

    this.song = song;


    // Configure format-dispatching pattern accessor
    if (song.furnaceNative) {
      this.accessor.setFurnace(song.furnaceNative, song.patterns, song.songPositions);
    } else if (song.hivelyNative) {
      this.accessor.setHively(song.hivelyNative, song.patterns, song.songPositions);
    } else {
      this.accessor.setClassic(song.patterns, song.songPositions);
    }

    this.bufferCache.clear();
    this.multiSampleBufferCache.clear(); // New song = new samples, invalidate cache
    this._warnedMissingInstruments = undefined;
    this.instrumentMap = new Map(song.instruments.map(i => [i.id, i]));

    // Pre-load any embedded-buffer Sampler instruments so ToneEngine begins decoding
    // immediately on song load rather than lazily on first note trigger.
    // Without this, the first note fired per instrument is always dropped while
    // decodeAudioData() runs asynchronously.
    {
      const engine = getToneEngine();
      for (const inst of song.instruments) {
        if (inst.synthType === 'Sampler' && inst.sample?.audioBuffer && !engine.getDecodedBuffer(inst.id)) {
          engine.getInstrument(inst.id, inst);
        }
      }
    }

    // Dispose old channels before creating new ones (prevent Web Audio node leaks)
    for (const ch of this.channels) {
      for (const p of ch.playerPool) {
        try { p.dispose(); } catch { /* ignored */ }
      }
      try { ch.gainNode.dispose(); } catch { /* ignored */ }
      try { ch.panNode.dispose(); } catch { /* ignored */ }
      try { ch.muteGain.dispose(); } catch { /* ignored */ }
    }

    // Initialize channels
    this.channels = [];
    for (let i = 0; i < song.numChannels; i++) {
      this.channels.push(this.createChannel(i, song.numChannels));
    }

    // Set stereo separation default based on format:
    // MOD/AHX (Amiga) = 20% (matching pt2-clone default — the Amiga's hard LRRL
    // sounds harsh on headphones; 20% gives pleasant width without hard panning)
    // HVL = derived from stereo mode in file header (0=center, 1-4=increasing separation)
    // XM/IT/S3M = 100% (these formats have their own per-channel panning)
    if (song.format === 'MOD' || song.format === 'AHX' || song.format === 'FC') {
      this.stereoSeparation = 20; // Amiga LRRL with pt2-clone-style narrowing
    } else if (song.format === 'HVL') {
      // HVL stereo mode 0=center, 1-4 = increasing separation
      this.stereoSeparation = song.hivelyMeta?.stereoMode
        ? (song.hivelyMeta.stereoMode * 25) : 50;
    } else {
      this.stereoSeparation = 100;
    }

    // FT2 XM period system: use for XM/IT/S3M files, not for MOD/HVL/AHX
    // XM, IT, and S3M all use note numbers (1-96/120) instead of Amiga periods
    this.useXMPeriods = song.format === 'XM' || song.format === 'IT' || song.format === 'S3M';
    this.linearPeriods = song.linearPeriods ?? (song.format === 'XM'); // Default XM to linear

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
    this.patternDelay = 0;
    this.pattDelTime = 0;
    this.pattDelTime2 = 0;

    // Reset per-deck pitch/tempo state (prevents carry-over between songs & views)
    this.globalPitchCurrent = 0;
    this.globalPitchTarget = 0;
    this.tempoMultiplier = 1.0;
    this.pitchMultiplier = 1.0;
    this.deckDetuneCents = 0;

    // For the global tracker replayer, also reset ToneEngine globals
    // (Wxx effects modify these, and they persist across song loads otherwise)
    if (!this.isDJDeck) {
      const engine = getToneEngine();
      engine.setGlobalPlaybackRate(1.0);
      engine.setGlobalDetune(0);
      // Reset Tone.js transport BPM and store display to match the new song
      Tone.getTransport().bpm.value = song.initialBPM;
      useTransportStore.getState().setBPM(song.initialBPM);
      useTransportStore.getState().setGlobalPitch(0);
    }

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

    // Per-channel sequencing state (MusicLine Editor and similar formats)
    if (song.channelTrackTables) {
      const n = song.numChannels;
      this.channelTickCounters  = Array.from({ length: n }, () => 0);
      this.channelPattPos       = Array.from({ length: n }, () => 0);
      this.channelSongPos       = Array.from({ length: n }, () => 0);
      this.channelGrooveToggle  = Array.from({ length: n }, () => false);
    } else {
      this.channelTickCounters  = [];
      this.channelPattPos       = [];
      this.channelSongPos       = [];
      this.channelGrooveToggle  = [];
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

    const panValue = this.stereoMode === 'pt2'
      ? basePan * (this.stereoSeparation / 100)
      : basePan;

    const panNode = new Tone.Panner(panValue);
    const gainNode = new Tone.Gain(1);
    const muteGain = new Tone.Gain(1); // Dedicated mute/solo gain
    gainNode.connect(panNode);
    panNode.connect(muteGain);
    muteGain.connect(this.masterGain);

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
      relativeNote: 0,
      portaSpeed: 0,
      portaUpSpeed: 0,
      portaDownSpeed: 0,
      fPortaUpSpeed: 0,
      fPortaDownSpeed: 0,
      portaTarget: 0,
      tonePortaSpeed: 0,
      vibratoPos: 0,
      vibratoCmd: 0,
      tremoloPos: 0,
      tremoloCmd: 0,
      tremoloSpeed: 0,
      tremoloDepth: 0,
      waveControl: 0,
      retrigCount: 0,
      retrigVolSlide: 0,
      patternLoopRow: 0,
      patternLoopCount: 0,
      glissandoMode: false,
      tremorPos: 0,
      tremorParam: 0,
      efPitchSlideUpSpeed: 0,
      efPitchSlideDownSpeed: 0,
      prevEffTyp: 0,
      prevEffParam: 0,
      noteRetrigSpeed: 0,
      noteRetrigVol: 0,
      noteRetrigCounter: 0,
      volColumnVol: 0,
      oldVol: 64,
      oldPan: 128,
      rowInst: 0,
      volSlideSpeed: 0,
      fVolSlideUpSpeed: 0,
      fVolSlideDownSpeed: 0,
      globalVolSlide: 0,
      panSlide: 0,
      macroPos: 0,
      macroReleased: false,
      macroPitchOffset: 0,
      macroArpNote: 0,
      macroDuty: 0,
      macroWaveform: 0,
      keyOff: false,
      fadeoutVol: 32768,
      fadeoutSpeed: 0,
      volEnvTick: 0,
      volEnvPos: 0,
      fVolEnvValue: 0,
      fVolEnvDelta: 0,
      panEnvTick: 0,
      panEnvPos: 0,
      fPanEnvValue: 0,
      fPanEnvDelta: 0,
      autoVibPos: 0,
      autoVibAmp: 0,
      autoVibSweep: 0,
      outVol: 64,
      outPan: 128,
      fFinalVol: 1.0,
      finalPan: 128,
      finalPeriod: 0,
      previousSlideFlag: false,
      gateHigh: false,
      lastPlayedNoteName: null,
      xmNote: 0,
      player: null,
      playerPool,
      activePlayerIdx: 0,
      gainNode,
      panNode,
      muteGain,
      instrument: null,
      _muteState: false,
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

    // HVL/AHX: Load the raw tune binary into the HivelyEngine WASM before playback.
    // The WASM engine does all synthesis; TrackerReplayer just triggers play/stop.
    // We pre-create ONE HivelySynth here so the audio graph is connected BEFORE
    // play() is called — otherwise the first few rows could be silent.
    if (this.song.hivelyFileData && (this.song.format === 'HVL' || this.song.format === 'AHX')) {
      try {
        const hivelyEngine = HivelyEngine.getInstance();
        await hivelyEngine.ready();
        const stereoMode = this.song.hivelyMeta?.stereoMode ?? 2;
        await hivelyEngine.loadTune(this.song.hivelyFileData.slice(0), stereoMode);

        // Pre-create a HivelySynth so its output is routed through the audio graph
        // before we call play(). This ensures engine.output → synthBus is connected.
        const firstHVL = this.song.instruments.find(i => i.synthType === 'HivelySynth');
        if (firstHVL) {
          engine.getInstrument(firstHVL.id, firstHVL);
        }

        // Start WASM playback immediately — skip if muted (DJ mode visuals)
        if (!this._muted) {
          hivelyEngine.play();
          console.log('[TrackerReplayer] HivelyEngine tune loaded & playing for', this.song.format);
        } else {
          console.log('[TrackerReplayer] HivelyEngine tune loaded but skipping play (muted for DJ visuals)');
        }
      } catch (err) {
        console.error('[TrackerReplayer] Failed to load HVL tune into WASM engine:', err);
      }
    }

    // MusicLine Editor: load raw binary into MusicLineEngine WASM before playback.
    if (this.song.musiclineFileData) {
      // WASM handles all audio for ML songs — suppress Sampler note triggers to avoid double audio.
      this._suppressNotes = true;
      try {
        const mlEngine = MusicLineEngine.getInstance();
        await mlEngine.ready();
        await mlEngine.loadSong(this.song.musiclineFileData.slice(0));
        if (!this._muted) {
          mlEngine.play();
          console.log('[TrackerReplayer] MusicLineEngine loaded & playing');

          // Route ML engine audio through the stereo separation chain.
          // ML songs don't have a 'MusicLineSynth' instrument in their instrument list
          // (parser uses Sampler instruments for display), so we route directly here
          // instead of relying on the instrument-iteration block below.
          if (!this.isDJDeck && !this.routedNativeEngines.has('MusicLineSynth')) {
            engine.routeNativeEngineOutput({ name: 'MusicLineSynth', output: mlEngine.output } as any);
            const nativeInput = getNativeAudioNode(this.separationNode.inputTone as any);
            if (nativeInput) {
              engine.rerouteNativeEngine('MusicLineSynth', nativeInput);
              this.routedNativeEngines.add('MusicLineSynth');
            }
          }
        }
      } catch (err) {
        console.error('[TrackerReplayer] Failed to load ML tune into WASM:', err);
      }
    }

    // Route UADE/Hively native engine output through the stereo separation chain
    // so the Amiga stereo mix (hard-pan LRRL) gets narrowed by stereoSeparation.
    // In DJ mode, DeckEngine.loadSong() handles this; only do it for tracker view.
    if (!this.isDJDeck) {
      for (const inst of this.song.instruments) {
        const st = inst.synthType;
        if ((st === 'UADESynth' || st === 'HivelySynth' || st === 'MusicLineSynth') && !this.routedNativeEngines.has(st)) {
          const nativeInput = getNativeAudioNode(this.separationNode.inputTone as any);
          if (nativeInput) {
            engine.rerouteNativeEngine(st, nativeInput);
            this.routedNativeEngines.add(st);
          }
        }
      }
    }

    this.playing = true;
    const transportState = useTransportStore.getState();
    this.lastGrooveTemplateId = transportState.grooveTemplateId;
    this.lastSwingAmount = transportState.swing;
    this.lastGrooveSteps = transportState.grooveSteps;

    // Wait for any pending Sampler/Player buffer decodes before starting the tick loop.
    // Without this, the first note on each sample-based instrument is dropped because
    // decodeAudioData() hasn't completed by the time the first tick fires.
    await engine.awaitPendingLoads();

    this.startScheduler();
  }

  stop(): void {
    this.playing = false;

    // Clear the scheduler interval
    if (this.schedulerTimerId !== null) {
      clearInterval(this.schedulerTimerId);
      this.schedulerTimerId = null;
    }

    // Stop routed native engines (UADE/Hively)
    if (this.routedNativeEngines.size > 0) {
      const engine = getToneEngine();
      for (const st of this.routedNativeEngines) {
        try {
          engine.stopNativeEngine(st);
        } catch { /* ignored */ }
      }
    }

    // Stop HivelyEngine if this is an HVL/AHX song
    if (this.song?.hivelyFileData && (this.song.format === 'HVL' || this.song.format === 'AHX')) {
      try {
        if (HivelyEngine.hasInstance()) {
          HivelyEngine.getInstance().stop();
        }
      } catch { /* HivelyEngine may not be loaded */ }
    }

    // Stop MusicLineEngine if this is an ML song
    if (this.song?.musiclineFileData && this.song.format === 'ML') {
      try {
        if (MusicLineEngine.hasInstance()) {
          MusicLineEngine.getInstance().stop();
        }
      } catch { /* MusicLineEngine may not be loaded */ }
    }

    // Stop all channels (release synth notes + stop sample players)
    for (let i = 0; i < this.channels.length; i++) {
      this.stopChannel(this.channels[i], i);
    }

    // Cancel any scheduled VU meter triggers (look-ahead scheduling enqueues callbacks
    // into Tone.Draw that would otherwise fire after stop, causing lingering VU bouncing)
    try {
      Tone.Draw.cancel(0);
    } catch { /* ignored */ }

    // Clear all pending channel trigger levels so VU meters read zero immediately
    try {
      const engine = getToneEngine();
      engine.clearChannelTriggerLevels();
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

    // Pause routed native engines (UADE/Hively) on pause
    if (this.routedNativeEngines.size > 0) {
      const engine = getToneEngine();
      for (const st of this.routedNativeEngines) {
        try {
          if (st === 'HivelySynth') {
            // Use pause() — not stop() — so the ring buffer is preserved and
            // resume() can restart playback without reloading the tune.
            HivelyEngine.getInstance().pause();
          } else {
            engine.stopNativeEngine(st);
          }
        } catch { /* ignored */ }
      }
    }
  }

  resume(): void {
    if (this.song && !this.playing) {
      this.playing = true;

      // Restart WASM playback for HVL/AHX — the worklet won't output audio
      // until play() is called after a pause().
      if (this.routedNativeEngines.has('HivelySynth') && !this._muted) {
        HivelyEngine.getInstance().play();
      }

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
      this._songEndFiredThisBatch = false;

      const scheduleUntil = Tone.now() + this.scheduleAheadTime;
      const transportState = useTransportStore.getState();
      // PERF: Cache for reuse in processTick/triggerNote (avoids 3-4 extra getState calls)
      this._cachedTransportState = transportState;

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

    // Per-channel path: each channel advances at its own speed (MusicLine Editor)
    if (this.song.channelTrackTables && this.accessor.getMode() === 'classic') {
      this.processTickPerChannel(time);
      return;
    }

    // Handle pattern delay (legacy MOD behavior — skips entire tick)
    if (!this.useXMPeriods && this.patternDelay > 0) {
      this.patternDelay--;
      return;
    }

    // FT2 pattern delay: determine if we should read new notes this tick
    // pattDelTime2 > 0 means we're repeating the row — effects still process
    // but no new note data is read
    const readNewNote = this.currentTick === 0 && this.pattDelTime2 === 0;

    // --- Groove & Swing Support ---
    // PERF: Use cached state from scheduler tick (avoids redundant getState())
    const transportState = this._cachedTransportState ?? useTransportStore.getState();

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

    // Get current pattern (classic path) or use accessor for native formats
    const useNativeAccessor = this.accessor.getMode() !== 'classic';
    const patternNum = this.song.songPositions[this.songPos];
    const pattern = useNativeAccessor ? null : this.song.patterns[patternNum];
    if (!useNativeAccessor && !pattern) return;

    // Queue display state for audio-synced UI (tick 0 = start of row)
    // Use swung time (safeTime) so visual follows the same timing as audio
    if (this.currentTick === 0) {
      this.queueDisplayState(safeTime, this.pattPos, patternNum, this.songPos, 0);
    }

    // Process all channels (skipped during scratch note suppression —
    // sequencer still advances for visual tracking but no audio events fire)
    if (!this._suppressNotes) {
      // Sync mute/solo state: use dedicated muteGain node so effect processing
      // (Cxx, volume slides, etc.) on gainNode is not overridden.
      // DJ decks use their own bitmask, tracker view uses ToneEngine's state.
      if (!this.isDJDeck) {
        const muteEngine = getToneEngine();
        for (let m = 0; m < this.channels.length; m++) {
          const muted = muteEngine.isChannelMuted(m);
          if (this.channels[m]._muteState !== muted) {
            this.channels[m]._muteState = muted;
            this.channels[m].muteGain.gain.setValueAtTime(muted ? 0 : 1, safeTime);
          }
        }
      }

      for (let ch = 0; ch < this.channels.length; ch++) {
        const channel = this.channels[ch];
        let row: TrackerCell | undefined;
        if (useNativeAccessor) {
          row = this.accessor.getRow(this.songPos, this.pattPos, ch);
        } else {
          row = pattern!.channels[ch]?.rows[this.pattPos];
        }
        if (!row) continue;

        if (readNewNote) {
          // Tick 0 + no pattern delay: Read new row data
          this.processRow(ch, channel, row, safeTime);
        } else if (this.currentTick !== 0) {
          // Ticks 1+: Process continuous effects
          this.processEffectTick(ch, channel, row, safeTime + (this.currentTick * tickInterval));
        }
        // When pattDelTime2 > 0 and tick == 0: skip note reading but effects still run on subsequent ticks

        // Process Furnace macros every tick
        this.processMacros(channel, safeTime + (this.currentTick * tickInterval));

        // Process XM envelopes + auto-vibrato every tick (FT2's fixaEnvelopeVibrato)
        this.processEnvelopesAndVibrato(channel, safeTime + (this.currentTick * tickInterval));
      }

      // Process global pitch shift slide (Wxx effect) - once per tick
      this.doGlobalPitchSlide(safeTime);
    }

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

    // FT2: store volume column byte (needed for Rxy quirk)
    ch.volColumnVol = row.volume ?? 0;

    // FT2: Period reset when arpeggio or vibrato from previous row ends
    // Reference: ft2_replayer.c getNewNote() lines 1333-1349
    if (this.useXMPeriods) {
      if (ch.prevEffTyp === 0) {
        if (ch.prevEffParam > 0) {
          // Previous row had arpeggio — reset period
          this.updatePeriod(ch);
        }
      } else if ((ch.prevEffTyp === 4 || ch.prevEffTyp === 6) && effect !== 4 && effect !== 6) {
        // Previous row had vibrato (4/6), current row doesn't — reset period
        this.updatePeriod(ch);
      }
      // Store current effect for next row's check
      ch.prevEffTyp = effect;
      ch.prevEffParam = param;
    }

    // Handle instrument number
    // FT2 getNewNote: only stores ch->instrNum here, does NOT load samples or set volume.
    // Volume/finetune/relativeNote are set later by triggerNote (which resolves sampleMap).
    // resetVolumes uses oldVol/oldPan from the PREVIOUS triggerNote.
    const instNum = row.instrument ?? 0;
    let inst = 0; // FT2's local `inst` variable: valid instrument number, or 0
    if (instNum > 0) {
      const instrument = this.instrumentMap.get(instNum);
      if (instrument) {
        ch.instrument = instrument;
        ch.sampleNum = instNum;
        inst = instNum;
        if (!this.useXMPeriods) {
          // MOD: set volume/finetune/relativeNote immediately
          const sampleVol = instrument.metadata?.modPlayback?.defaultVolume;
          ch.volume = sampleVol !== undefined ? Math.min(64, sampleVol) : 64;
          ch.finetune = instrument.metadata?.modPlayback?.finetune ?? 0;
          ch.relativeNote = instrument.metadata?.modPlayback?.relativeNote ?? 0;
          ch.gainNode.gain.setValueAtTime(ch.volume / 64, time);
        }
        // XM: DON'T set volume/finetune/relativeNote. FT2 defers this to triggerNote.
      } else {
        inst = 0; // Invalid instrument
        if (!this._warnedMissingInstruments) this._warnedMissingInstruments = new Set();
        if (!this._warnedMissingInstruments.has(instNum)) {
          this._warnedMissingInstruments.add(instNum);
          console.warn(`[TrackerReplayer] Instrument ${instNum} not found (empty slot). Available IDs: (${this.song.instruments.length})`, this.song.instruments.map(i => i.id).sort((a,b) => a-b));
        }
      }
    }

    // Store row instrument for EDx noteDelay (FT2's copyOfInstrAndNote >> 8)
    ch.rowInst = inst;

    // FT2: Note delay (EDx, y >= 1) — defer ALL processing to the delay tick.
    // FT2 skips handleEffects_TickZero entirely on EDx early return.
    if (this.useXMPeriods && effect === 0xE && (param & 0xF0) === 0xD0 && (param & 0x0F) >= 1) {
      return;
    }

    // Probability/maybe: skip note if random check fails
    const noteValue = row.note;
    const rawPeriod = row.period;
    const prob = row.probability;
    const probabilitySkip = prob !== undefined && prob > 0 && prob < 100 && Math.random() * 100 >= prob;

    // TB-303 extensions
    const effectiveSlide = slide || hammer; // Gate stays high for both

    // ========================================================================
    // FT2 getNewNote flow (XM mode)
    // Reference: ft2_replayer.c lines 1329-1435
    // Matches FT2's exact ordering: portamento/K00/no-note early returns,
    // then note trigger, then instrument handling (resetVolumes + triggerInstrument).
    // ========================================================================
    if (this.useXMPeriods) {
      const isE90 = effect === 0xE && param === 0x90;

      // FT2: Only check portamento/K00/no-note when NOT E90
      // E90 bypasses these checks, falling through to normal note trigger.
      if (!isE90) {
        const volCol = row.volume ?? 0;
        const hasVolPorta = (volCol & 0xF0) === 0xF0;
        const hasPortaEffect = effect === 3 || effect === 5;

        // --- Fxy volume column portamento OR 3xx/5xx portamento ---
        // FT2: preparePortamento handles note target + instrument reset
        if (hasVolPorta || hasPortaEffect) {
          // Set portamento speed
          if (hasVolPorta) {
            const vp = volCol & 0x0F;
            if (vp > 0) ch.tonePortaSpeed = vp * 64;
          }
          if (hasPortaEffect && effect !== 5 && param !== 0) {
            ch.tonePortaSpeed = param * 4;
          }
          // FT2's preparePortamento: set target from note (using CURRENT finetune/relativeNote,
          // not the new instrument's, since triggerNote hasn't run)
          if (noteValue > 0 && !probabilitySkip) {
            if (noteValue === 97) {
              // NOTE_OFF during portamento → keyOff (FT2: preparePortamento line 1301)
              this.xmKeyOff(ch);
              ch.previousSlideFlag = false;
              this.releaseMacros(ch);
            } else {
              ch.xmNote = noteValue;
              const usePeriod = this.noteToPlaybackPeriod(noteValue, rawPeriod, ch);
              ch.portaTarget = usePeriod;
            }
          }
          // FT2 preparePortamento lines 1321-1326: instrument handling
          // resetVolumes is UNCONDITIONAL (runs even for NOTE_OFF)
          // triggerInstrument is CONDITIONAL (skipped for NOTE_OFF)
          if (inst > 0) {
            this.resetXMVolumes(ch, time);
            if (noteValue !== 97) {
              this.triggerEnvelopes(ch);
            }
          }
          this.processAllEffectsTick0(chIndex, ch, row, effect, param, time);
          return;
        }

        // --- K00: key-off at tick 0 ---
        // Reference: ft2_replayer.c getNewNote() lines 1398-1407
        if (effect === 0x14 && param === 0) {
          this.xmKeyOff(ch);
          if (inst > 0) this.resetXMVolumes(ch, time);
          this.processAllEffectsTick0(chIndex, ch, row, effect, param, time);
          return;
        }

        // --- No note (note == 0) ---
        // FT2: instrument without note → resetVolumes + triggerInstrument
        if (!noteValue || noteValue === 0) {
          if (inst > 0) {
            this.resetXMVolumes(ch, time);
            this.triggerEnvelopes(ch);
          }
          this.processAllEffectsTick0(chIndex, ch, row, effect, param, time);
          return;
        }
      }

      // Falls through: has a note, and either:
      // - E90 bypassed the checks above, or
      // - Note is present and not portamento/K00/no-note

      if (noteValue === 97) {
        // Note-off: FT2 does keyOff FIRST, then resetVolumes (instrument volume wins)
        this.xmKeyOff(ch);
        ch.previousSlideFlag = false;
        this.releaseMacros(ch);
      } else if (noteValue > 0 && !probabilitySkip) {
        // Normal note trigger — resolve sample, calculate period, trigger
        ch.xmNote = noteValue;

        // XM multi-sample lookup: resolve which sample to use via sampleMap
        // FT2's triggerNote: note2SampleLUT → sets relativeNote, finetune, oldVol, oldPan
        if (ch.instrument?.metadata?.sampleMap && ch.instrument.metadata.multiSamples) {
          const noteIdx = Math.max(0, Math.min(95, noteValue - 1));
          const sampleIdx = ch.instrument.metadata.sampleMap[noteIdx] ?? 0;
          const multiSamples = ch.instrument.metadata.multiSamples;
          if (sampleIdx < multiSamples.length) {
            const ms = multiSamples[sampleIdx];
            ch.instrument = { ...ch.instrument, sample: ms.sample };
            ch.finetune = ms.finetune;
            ch.relativeNote = ms.relativeNote;
            // FT2's triggerNote: set oldVol/oldPan from resolved sample
            ch.oldVol = ms.defaultVolume !== undefined ? Math.min(64, ms.defaultVolume) : 64;
            ch.oldPan = ms.panning ?? 128;
          }
        } else {
          // Single sample: set oldVol/oldPan and finetune/relativeNote from instrument
          const mp = ch.instrument?.metadata?.modPlayback;
          ch.finetune = mp?.finetune ?? 0;
          ch.relativeNote = mp?.relativeNote ?? 0;
          ch.oldVol = mp?.defaultVolume !== undefined ? Math.min(64, mp.defaultVolume) : 64;
          ch.oldPan = mp?.panning ?? 128;
        }

        // FT2: E5x effect overrides finetune for this note
        if (effect === 0xE && (param & 0xF0) === 0x50) {
          ch.finetune = ((param & 0x0F) * 16) - 128;
        }

        // Derive period for playback
        const usePeriod = this.noteToPlaybackPeriod(noteValue, rawPeriod, ch);
        ch.note = usePeriod;
        ch.period = ch.note;

        // Handle sample offset (9xx)
        let offset = 0;
        if (effect === 9) {
          offset = param > 0 ? param * 256 : ch.sampleOffset * 256;
          ch.sampleOffset = param > 0 ? param : ch.sampleOffset;
        }

        // TB-303 SLIDE SEMANTICS (preserved from existing code)
        const slideActive = ch.previousSlideFlag && noteValue !== null && !hammer;
        const is303Synth = ch.instrument?.synthType === 'TB303' ||
                           ch.instrument?.synthType === 'Buzz3o3';

        // DEBUG LOGGING - Enable with window.TB303_DEBUG_ENABLED = true
        if (typeof window !== 'undefined' && (window as unknown as { TB303_DEBUG_ENABLED?: boolean }).TB303_DEBUG_ENABLED && is303Synth) {
          const midi = noteValue ? noteValue + 11 : 0;
          const octave = Math.floor(midi / 12) - 1;
          const semitone = midi % 12;
          const noteName = noteValue ? `${DEBUG_NOTE_NAMES[semitone]}${octave}` : '...';
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

        // Same-pitch slide detection for 303 synths
        // XM uses note numbers directly; MOD uses Amiga periods
        const newNoteName = (this.useXMPeriods || is303Synth) ? xmNoteToNoteName(noteValue ?? 0) : periodToNoteName(usePeriod);
        ch.lastPlayedNoteName = newNoteName;

        // Trigger note
        this.triggerNote(ch, time, offset, chIndex, accent, slideActive, effectiveSlide, hammer);

        // Update slide flag for next row
        ch.previousSlideFlag = (slide || hammer) ?? false;
      }

      // FT2: instrument handling AFTER note trigger/keyOff
      // resetVolumes restores volume/panning from sample defaults (oldVol/oldPan).
      // triggerInstrument resets envelopes (not on NOTE_OFF).
      if (inst > 0) {
        this.resetXMVolumes(ch, time);
        if (noteValue !== 97) this.triggerEnvelopes(ch);
      }

      // Process volume column + all effect columns (handleEffects_TickZero)
      this.processAllEffectsTick0(chIndex, ch, row, effect, param, time);
      return;
    }

    // ========================================================================
    // MOD flow (non-XM, existing behavior preserved)
    // ========================================================================

    if (noteValue && noteValue !== 0 && noteValue !== 97 && !probabilitySkip) {
      ch.xmNote = noteValue;

      // E5x finetune override (MOD: 0-15 → signed -8..+7, matching PT2's SetFineTone)
      if (effect === 0xE && (param & 0xF0) === 0x50) {
        const raw = param & 0x0F;
        ch.finetune = raw > 7 ? raw - 16 : raw;
      }

      const usePeriod = this.noteToPlaybackPeriod(noteValue, rawPeriod, ch);

      // MOD portamento: 3xx and 5xx set target, don't trigger
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
        }

        // TB-303 slide semantics
        const slideActive = ch.previousSlideFlag && noteValue !== null && !hammer;
        const is303Synth = ch.instrument?.synthType === 'TB303' ||
                           ch.instrument?.synthType === 'Buzz3o3';

        // DEBUG LOGGING
        if (typeof window !== 'undefined' && (window as unknown as { TB303_DEBUG_ENABLED?: boolean }).TB303_DEBUG_ENABLED && is303Synth) {
          const midi = noteValue ? noteValue + 11 : 0;
          const octave = Math.floor(midi / 12) - 1;
          const semitone = midi % 12;
          const noteName = noteValue ? `${DEBUG_NOTE_NAMES[semitone]}${octave}` : '...';
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

        // XM uses note numbers directly; MOD uses Amiga periods
        const newNoteName = (this.useXMPeriods || is303Synth) ? xmNoteToNoteName(noteValue ?? 0) : periodToNoteName(usePeriod);
        ch.lastPlayedNoteName = newNoteName;

        this.triggerNote(ch, time, offset, chIndex, accent, slideActive, effectiveSlide, hammer);
        this.triggerEnvelopes(ch);
        ch.outVol = ch.volume;
        ch.outPan = ch.panning;
      }
    }

    // Update previous slide flag for next row (TB-303 semantics)
    if (noteValue && noteValue !== 97) {
      ch.previousSlideFlag = (slide || hammer) ?? false;
    }

    // Handle note off (MOD path)
    if (noteValue === 97) {
      ch.previousSlideFlag = false;

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

    // Handle volume column + effects (MOD path)
    this.processAllEffectsTick0(chIndex, ch, row, effect, param, time);
  }

  /**
   * Process volume column effects on tick 0.
   * Extracted from processRow for reuse in FT2 getNewNote early-return paths.
   */
  private processVolColumnTick0(ch: ChannelState, row: TrackerCell, time: number): void {
    if (row.volume === undefined || row.volume <= 0) return;
    const vc = row.volume;
    const vcType = vc >> 4;
    const vcParam = vc & 0x0F;

    if (vcType >= 1 && vcType <= 5) {
      // 0x10-0x50: Set volume (vol = vc - 0x10, clamp 0-64)
      const vol = vc - 0x10;
      ch.volume = vol > 64 ? 64 : vol;
      ch.gainNode.gain.setValueAtTime(ch.volume / 64, time);
    } else if (vcType === 8) {
      // 0x80-0x8F: Fine volume slide down (tick 0 only)
      ch.volume = Math.max(0, ch.volume - vcParam);
      ch.gainNode.gain.setValueAtTime(ch.volume / 64, time);
    } else if (vcType === 9) {
      // 0x90-0x9F: Fine volume slide up (tick 0 only)
      ch.volume = Math.min(64, ch.volume + vcParam);
      ch.gainNode.gain.setValueAtTime(ch.volume / 64, time);
    } else if (vcType === 0xA) {
      // 0xA0-0xAF: Set vibrato speed (tick 0 only)
      if (vcParam !== 0) ch.vibratoCmd = (ch.vibratoCmd & 0x0F) | (vcParam << 4);
    } else if (vcType === 0xC) {
      // 0xC0-0xCF: Set panning (tick 0 only)
      ch.panning = vcParam << 4;
      this.applyPanEffect(ch, ch.panning, time);
    }
    // 0x60-0x7F, 0xB0-0xFF: handled on ticks 1+ only (see processEffectTick)
  }

  /**
   * Process all tick-0 effects (both effect columns).
   * Extracted for reuse in FT2 getNewNote early-return paths.
   */
  private processAllEffectsTick0(chIndex: number, ch: ChannelState, row: TrackerCell, effect: number, param: number, time: number): void {
    this.processVolColumnTick0(ch, row, time);
    this.processEffect0(chIndex, ch, effect, param, time);
    // Second effect column — skip if derived from volume column
    const effect2 = row.effTyp2 ?? 0;
    const param2 = row.eff2 ?? 0;
    const volColDerived = (row.volume ?? 0) >= 0x60;
    if ((effect2 !== 0 || param2 !== 0) && !volColDerived) {
      this.processEffect0(chIndex, ch, effect2, param2, time);
    }
    // Extra effect slots 3-8 (Furnace imports)
    if (row.effTyp3 || row.eff3) this.processEffect0(chIndex, ch, row.effTyp3 ?? 0, row.eff3 ?? 0, time);
    if (row.effTyp4 || row.eff4) this.processEffect0(chIndex, ch, row.effTyp4 ?? 0, row.eff4 ?? 0, time);
    if (row.effTyp5 || row.eff5) this.processEffect0(chIndex, ch, row.effTyp5 ?? 0, row.eff5 ?? 0, time);
    if (row.effTyp6 || row.eff6) this.processEffect0(chIndex, ch, row.effTyp6 ?? 0, row.eff6 ?? 0, time);
    if (row.effTyp7 || row.eff7) this.processEffect0(chIndex, ch, row.effTyp7 ?? 0, row.eff7 ?? 0, time);
    if (row.effTyp8 || row.eff8) this.processEffect0(chIndex, ch, row.effTyp8 ?? 0, row.eff8 ?? 0, time);
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
        if (param !== 0) {
          ch.portaSpeed = param;
          ch.portaUpSpeed = param; // FT2: separate memory
        }
        break;

      case 0x2: // Portamento down - store speed
        if (param !== 0) {
          ch.portaSpeed = param;
          ch.portaDownSpeed = param; // FT2: separate memory
        }
        break;

      case 0x3: // Tone portamento - store speed
        if (param !== 0) ch.tonePortaSpeed = this.useXMPeriods ? param * 4 : param;
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
        // FT2: store speed/depth separately; speed = (param & 0xF0) >> 2 (not >> 4)
        if (y !== 0) ch.tremoloDepth = y;
        if (x !== 0) ch.tremoloSpeed = x << 2; // FT2: (param >> 4) << 2 = shift right 2 total
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
        // FT2: songPos = param - 1 (incremented later in advanceRow)
        // Reference: ft2_replayer.c positionJump() lines 757-772
        this.songPos = param - 1; // Will be ++songPos in advanceRow
        this.pBreakPos = 0;
        this.posJumpFlag = true;
        break;

      case 0xC: // Set volume
        ch.volume = Math.min(64, param);
        ch.gainNode.gain.setValueAtTime(ch.volume / 64, time);
        break;

      case 0xD: // Pattern break
        // MOD and XM both use BCD (binary-coded decimal): 0x15 = row 15
        // IT/S3M use hex, Furnace uses hex
        if (this.song?.format === 'MOD' || this.song?.format === 'XM') {
          this.pBreakPos = x * 10 + y; // BCD decode
          if (this.pBreakPos > 63) this.pBreakPos = 0;
        } else {
          this.pBreakPos = param; // Hex for IT/S3M/Furnace
          if (this.pBreakPos > 255) this.pBreakPos = 0;
        }
        // FT2: pattern break sets posJumpFlag (NOT pBreakFlag)
        // pBreakFlag is reserved for E6x pattern loop
        this.posJumpFlag = true;
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

      case 0x15: { // Set envelope position (Lxx)
        // FT2: setEnvelopePos — sets both volume and panning envelope tick/pos with interpolation
        // Reference: ft2_replayer.c lines 817-960
        if (!this.useXMPeriods || !ch.instrument?.metadata) break;
        const meta = ch.instrument.metadata;

        // Volume envelope
        const volEnv = meta.originalEnvelope;
        if (volEnv?.enabled && volEnv.points.length > 0) {
          ch.volEnvTick = param - 1;
          let point = 0;
          let tick = param;
          let envUpdate = true;
          if (volEnv.points.length > 1) {
            point = 1;
            for (let i = 0; i < volEnv.points.length - 1; i++) {
              if (tick < volEnv.points[point].tick) {
                point--;
                tick -= volEnv.points[point].tick;
                if (tick === 0) { envUpdate = false; break; }
                const xDiff = volEnv.points[point + 1].tick - volEnv.points[point].tick;
                if (xDiff <= 0) { envUpdate = true; break; }
                const y0 = volEnv.points[point].value & 0xFF;
                const y1 = volEnv.points[point + 1].value & 0xFF;
                ch.fVolEnvDelta = (y1 - y0) / xDiff;
                ch.fVolEnvValue = y0 + ch.fVolEnvDelta * (tick - 1);
                point++;
                envUpdate = false;
                break;
              }
              point++;
            }
            if (envUpdate) point--;
          }
          if (envUpdate) {
            ch.fVolEnvDelta = 0;
            ch.fVolEnvValue = volEnv.points[Math.max(0, Math.min(point, volEnv.points.length - 1))].value & 0xFF;
          }
          ch.volEnvPos = Math.max(0, Math.min(point, volEnv.points.length - 1));
        }

        // Panning envelope — FT2 BUG: checks volEnvFlags instead of panEnvFlags
        // Reference: ft2_replayer.c line 897
        const panEnv = meta.panningEnvelope;
        if (volEnv?.enabled && panEnv?.enabled && panEnv.points.length > 0) {
          ch.panEnvTick = param - 1;
          let point = 0;
          let tick = param;
          let envUpdate = true;
          if (panEnv.points.length > 1) {
            point = 1;
            for (let i = 0; i < panEnv.points.length - 1; i++) {
              if (tick < panEnv.points[point].tick) {
                point--;
                tick -= panEnv.points[point].tick;
                if (tick === 0) { envUpdate = false; break; }
                const xDiff = panEnv.points[point + 1].tick - panEnv.points[point].tick;
                if (xDiff <= 0) { envUpdate = true; break; }
                const y0 = panEnv.points[point].value & 0xFF;
                const y1 = panEnv.points[point + 1].value & 0xFF;
                ch.fPanEnvDelta = (y1 - y0) / xDiff;
                ch.fPanEnvValue = y0 + ch.fPanEnvDelta * (tick - 1);
                point++;
                envUpdate = false;
                break;
              }
              point++;
            }
            if (envUpdate) point--;
          }
          if (envUpdate) {
            ch.fPanEnvDelta = 0;
            ch.fPanEnvValue = panEnv.points[Math.max(0, Math.min(point, panEnv.points.length - 1))].value & 0xFF;
          }
          ch.panEnvPos = Math.max(0, Math.min(point, panEnv.points.length - 1));
        }
        break;
      }

      case 0x19: // Pan slide (Pxx) - also used for Furnace panning effects
        if (param !== 0) ch.panSlide = param;
        break;

      case 0x1B: { // Multi note retrigger (Rxy) — FT2 multiNoteRetrig
        // Reference: ft2_replayer.c lines 1253-1271
        // FT2: uses speed/vol memories + retriggers on tick 0 when volColumnData == 0
        let rSpeed = param & 0x0F;
        if (rSpeed === 0) rSpeed = ch.noteRetrigSpeed;
        ch.noteRetrigSpeed = rSpeed;

        let rVol = (param >> 4) & 0x0F;
        if (rVol === 0) rVol = ch.noteRetrigVol;
        ch.noteRetrigVol = rVol;

        // FT2: retrigger on tick 0 when volume column data is 0 (no volume column effect)
        if (ch.volColumnVol === 0) {
          this.doMultiNoteRetrig(ch, chIndex, time);
        }
        break;
      }

      case 0x20: // Global pitch shift (Wxx) - DJ-style smooth slide
        // W00 = -12 semitones, W80 = 0 semitones, WFF = +12 semitones
        // Set target - actual slide happens on ticks 1+
        this.globalPitchTarget = ((param - 128) / 128) * 12;
        break;

      case 0x21: // FT2: Extra fine portamento (X1x up, X2x down) / DJ Scratch (Xnn)
        if (this.useXMPeriods) {
          // FT2 extra fine portamento — tick 0 only
          const slideType = (param >> 4) & 0x0F;
          const slideParam = param & 0x0F;
          if (slideType === 1) {
            // X1x: Extra fine porta up
            const spd = slideParam !== 0 ? slideParam : ch.efPitchSlideUpSpeed;
            ch.efPitchSlideUpSpeed = spd;
            ch.period -= spd;
            if (ch.period < 1) ch.period = 1;
            this.updatePeriod(ch);
          } else if (slideType === 2) {
            // X2x: Extra fine porta down
            const spd = slideParam !== 0 ? slideParam : ch.efPitchSlideDownSpeed;
            ch.efPitchSlideDownSpeed = spd;
            ch.period += spd;
            if (ch.period > 31999) ch.period = 31999;
            this.updatePeriod(ch);
          }
        } else if (this.onScratchEffect) {
          // DJ Scratch (non-XM mode)
          this.onScratchEffect(param);
        }
        break;
    }
  }

  private processExtendedEffect0(_chIndex: number, ch: ChannelState, x: number, y: number, time: number): void {
    switch (x) {
      case 0x1: // Fine porta up
        if (this.useXMPeriods) {
          // FT2: uses speed memory, param * 4
          if (y !== 0) ch.fPortaUpSpeed = y;
          ch.period -= ch.fPortaUpSpeed * 4;
          if (ch.period < 1) ch.period = 1;
        } else {
          ch.period = Math.max(113, ch.period - y);
        }
        this.updatePeriod(ch);
        break;

      case 0x2: // Fine porta down
        if (this.useXMPeriods) {
          // FT2: uses speed memory, param * 4
          if (y !== 0) ch.fPortaDownSpeed = y;
          ch.period += ch.fPortaDownSpeed * 4;
          if (ch.period > 31999) ch.period = 31999;
        } else {
          ch.period = Math.min(856, ch.period + y);
        }
        this.updatePeriod(ch);
        break;

      case 0x3: // Glissando control (E3x) — semitone portamento mode
        ch.glissandoMode = y !== 0;
        break;

      case 0x4: // Vibrato waveform
        ch.waveControl = (ch.waveControl & 0xF0) | (y & 0x0F);
        break;

      case 0x5: // Set finetune
        if (this.useXMPeriods) {
          // FT2: finetune = (nibble * 16) - 128, range -128 to +112
          ch.finetune = (y * 16) - 128;
        } else {
          // MOD: finetune -8 to +7
          ch.finetune = y > 7 ? y - 16 : y;
        }
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

      case 0xC: // Note cut — EC0 handled on tick 0 (param == 0 only)
        // FT2: noteCut0 only cuts when param is exactly 0
        // Reference: ft2_replayer.c line 701-709
        if (y === 0) {
          ch.volume = 0;
          ch.outVol = 0;
          ch.gainNode.gain.setValueAtTime(0, time);
        }
        break;

      case 0xA: { // Fine volume up (FT2: speed memory)
        const fvUp = y !== 0 ? y : ch.fVolSlideUpSpeed;
        ch.fVolSlideUpSpeed = fvUp;
        ch.volume = Math.min(64, ch.volume + fvUp);
        ch.gainNode.gain.setValueAtTime(ch.volume / 64, time);
        break;
      }

      case 0xB: { // Fine volume down (FT2: speed memory)
        const fvDn = y !== 0 ? y : ch.fVolSlideDownSpeed;
        ch.fVolSlideDownSpeed = fvDn;
        ch.volume = Math.max(0, ch.volume - fvDn);
        ch.gainNode.gain.setValueAtTime(ch.volume / 64, time);
        break;
      }

      case 0xE: // Pattern delay
        if (this.useXMPeriods) {
          // FT2 two-stage: only set if pattDelTime2 is not active
          if (this.pattDelTime2 === 0) {
            this.pattDelTime = y + 1; // FT2: param + 1
          }
        } else {
          // Legacy MOD behavior
          this.patternDelay = y * this.speed;
        }
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

    // FT2: Volume column effects (ticks 1+)
    const vc = row.volume ?? 0;
    if (this.useXMPeriods && vc >= 0x60) {
      const vcType = vc >> 4;
      const vcParam = vc & 0x0F;
      switch (vcType) {
        case 0x6: // Volume slide down
          ch.volume = Math.max(0, ch.volume - vcParam);
          ch.gainNode.gain.setValueAtTime(ch.volume / 64, time);
          break;
        case 0x7: // Volume slide up
          ch.volume = Math.min(64, ch.volume + vcParam);
          ch.gainNode.gain.setValueAtTime(ch.volume / 64, time);
          break;
        case 0xB: { // Vibrato (depth only, then run vibrato)
          if (vcParam > 0) ch.vibratoCmd = (ch.vibratoCmd & 0xF0) | vcParam;
          this.doVibrato(ch);
          break;
        }
        case 0xD: { // Panning slide left (FT2 bug: slide of 0 = set pan to 0)
          // FT2: uint16_t tmp = outPan + (uint8_t)(0 - param); if (tmp < 256) tmp = 0;
          // When param=0: (uint8_t)(0-0)=0, outPan+0 < 256 always, so pan=0 (the bug)
          // When param>0: (uint8_t)(0-x) = 256-x, so tmp = outPan+256-x
          //   If outPan >= x: tmp >= 256, result = (uint8_t)tmp = outPan-x (correct slide)
          //   If outPan < x: tmp < 256, result = 0 (clamped)
          const negParam = (256 - vcParam) & 0xFF; // (uint8_t)(0 - param)
          const panTmp = ch.panning + negParam;
          ch.panning = panTmp < 256 ? 0 : (panTmp & 0xFF);
          this.applyPanEffect(ch, ch.panning, time);
          break;
        }
        case 0xE: // Panning slide right
          ch.panning = Math.min(255, ch.panning + vcParam);
          this.applyPanEffect(ch, ch.panning, time);
          break;
        case 0xF: // Tone portamento (uses existing speed)
          this.doTonePortamento(ch);
          break;
      }
    }

    // Process second effect column — skip if derived from volume column
    const effect2 = row.effTyp2 ?? 0;
    const param2 = row.eff2 ?? 0;
    const volColDerived = vc >= 0x60;
    if ((effect2 !== 0 || param2 !== 0) && !volColDerived) {
      this.processEffectTickSingle(chIndex, ch, row, effect2, param2, time);
    }
    // Extra effect slots 3-8 (Furnace imports)
    if (row.effTyp3 || row.eff3) this.processEffectTickSingle(chIndex, ch, row, row.effTyp3 ?? 0, row.eff3 ?? 0, time);
    if (row.effTyp4 || row.eff4) this.processEffectTickSingle(chIndex, ch, row, row.effTyp4 ?? 0, row.eff4 ?? 0, time);
    if (row.effTyp5 || row.eff5) this.processEffectTickSingle(chIndex, ch, row, row.effTyp5 ?? 0, row.eff5 ?? 0, time);
    if (row.effTyp6 || row.eff6) this.processEffectTickSingle(chIndex, ch, row, row.effTyp6 ?? 0, row.eff6 ?? 0, time);
    if (row.effTyp7 || row.eff7) this.processEffectTickSingle(chIndex, ch, row, row.effTyp7 ?? 0, row.eff7 ?? 0, time);
    if (row.effTyp8 || row.eff8) this.processEffectTickSingle(chIndex, ch, row, row.effTyp8 ?? 0, row.eff8 ?? 0, time);

    // Route continuous effects to Furnace dispatch engine (ticks 1+)
    // The dispatch engine needs per-tick commands for pitch slides, vibrato, etc.
    if (ch.instrument?.synthType?.startsWith('Furnace')) {
      this.forwardEffectToFurnace(ch, chIndex, effect, param, x, y);
    }

    switch (effect) {
      case 0x0: // Arpeggio
        if (param !== 0) this.doArpeggio(ch, param);
        break;

      case 0x1: // Portamento up (decrease period = raise pitch)
        if (this.useXMPeriods) {
          // FT2: separate speed memory, speed * 4, clamp to min 1
          ch.period -= ch.portaUpSpeed * 4;
          if (ch.period < 1) ch.period = 1;
        } else {
          ch.period = Math.max(113, ch.period - ch.portaSpeed);
        }
        this.updatePeriod(ch);
        break;

      case 0x2: // Portamento down (increase period = lower pitch)
        if (this.useXMPeriods) {
          // FT2: separate speed memory, speed * 4, clamp to max 31999
          ch.period += ch.portaDownSpeed * 4;
          if (ch.period > 31999) ch.period = 31999;
        } else {
          ch.period = Math.min(856, ch.period + ch.portaSpeed);
        }
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
          // FT2 retrigNote: triggerNote(0,0,0,ch) + triggerInstrument(ch)
          // Reference: ft2_replayer.c lines 2119-2129
          ch.retrigCount--;
          if (ch.retrigCount <= 0) {
            ch.retrigCount = y;
            this.triggerNote(ch, time, 0, chIndex, false, false, false);
            this.triggerEnvelopes(ch);
          }
        } else if (x === 0xC && y === this.currentTick) {
          // Note cut
          ch.volume = 0;
          ch.gainNode.gain.setValueAtTime(0, time);
        } else if (x === 0xD && y === this.currentTick) {
          // FT2 noteDelay: triggers note, resets volumes (if inst), triggers instrument, applies vol column
          // Reference: ft2_replayer.c lines 2140-2162
          const slideActive = ch.previousSlideFlag;
          this.triggerNote(ch, time, 0, chIndex, accent, slideActive, slide);
          // FT2: resetVolumes only if instrument was specified on the delayed row
          if (ch.rowInst > 0) this.resetXMVolumes(ch, time);
          // FT2: triggerInstrument is ALWAYS called (regardless of instrument)
          this.triggerEnvelopes(ch);

          // FT2: apply volume column on delayed trigger (set volume / set panning)
          const dvc = ch.volColumnVol;
          if (dvc >= 0x10 && dvc <= 0x50) {
            ch.outVol = dvc - 0x10;
            ch.volume = ch.outVol;
            ch.gainNode.gain.setValueAtTime(ch.volume / 64, time);
          } else if (dvc >= 0xC0 && dvc <= 0xCF) {
            ch.outPan = (dvc & 0x0F) << 4;
            ch.panning = ch.outPan;
            this.applyPanEffect(ch, ch.panning, time);
          }
        }
        break;

      // === IT/Furnace Extended Effects (per-tick) ===
      case 0x11: // Global volume slide (Hxx)
        this.doGlobalVolumeSlide(ch.globalVolSlide, time);
        break;

      case 0x19: // Pan slide (Pxx)
        this.doPanSlide(ch, ch.panSlide, time);
        break;

      case 0x14: { // Kxx - Key-off at tick (FT2: effect 20)
        // FT2: triggers keyOff when (speed - tick) == (param & 31)
        if (this.useXMPeriods) {
          if (this.currentTick === (param & 31)) {
            this.xmKeyOff(ch);
          }
        } else {
          if (this.currentTick === (param & 31)) {
            this.stopChannel(ch, chIndex, time);
          }
        }
        break;
      }

      case 0x1B: // Multi note retrigger (Rxy) — tick N
        // FT2: uses doMultiNoteRetrig with counter (noteRetrigCounter/Speed/Vol)
        this.doMultiNoteRetrig(ch, chIndex, time);
        break;

      case 0x1D: { // Txy - Tremor (FT2: effect 29)
        // FT2: alternates between volume on/off over time
        // x = on-time ticks, y = off-time ticks
        const tp = param !== 0 ? param : ch.tremorParam;
        ch.tremorParam = tp;

        let tremorSign = ch.tremorPos & 0x80; // bit 7: on/off state
        let tremorData = ch.tremorPos & 0x7F; // bits 0-6: counter

        tremorData--;
        if (tremorData < 0 || (tremorData & 0x80) !== 0) {
          // Counter underflow — toggle state
          if (tremorSign === 0x80) {
            tremorSign = 0x00; // switch to OFF
            tremorData = tp & 0x0F; // off-time = low nibble
          } else {
            tremorSign = 0x80; // switch to ON
            tremorData = (tp >> 4) & 0x0F; // on-time = high nibble
          }
        }

        ch.tremorPos = tremorSign | (tremorData & 0x7F);
        const tremorVol = tremorSign === 0x80 ? ch.volume : 0;
        ch.gainNode.gain.setValueAtTime(tremorVol / 64, time);
        break;
      }
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
      case 0x1: // Portamento up
        if (this.useXMPeriods) {
          ch.period -= ch.portaUpSpeed * 4;
          if (ch.period < 1) ch.period = 1;
        } else {
          ch.period = Math.max(113, ch.period - ch.portaSpeed);
        }
        this.updatePeriod(ch);
        break;
      case 0x2: // Portamento down
        if (this.useXMPeriods) {
          ch.period += ch.portaDownSpeed * 4;
          if (ch.period > 31999) ch.period = 31999;
        } else {
          ch.period = Math.min(856, ch.period + ch.portaSpeed);
        }
        this.updatePeriod(ch);
        break;
      case 0x3: this.doTonePortamento(ch); break;
      case 0x4: this.doVibrato(ch); break;
      case 0x5: this.doTonePortamento(ch); this.doVolumeSlide(ch, param, time); break;
      case 0x6: this.doVibrato(ch); this.doVolumeSlide(ch, param, time); break;
      case 0x7: this.doTremolo(ch, time); break;
      case 0xA: this.doVolumeSlide(ch, param, time); break;
      case 0xE:
        if (x === 0x9 && y > 0) {
          // FT2 retrigNote: triggerNote(0,0,0,ch) + triggerInstrument(ch)
          // Reference: ft2_replayer.c lines 2119-2129
          if (this.currentTick % y === 0) {
            this.triggerNote(ch, time, 0, chIndex, false, false, false);
            this.triggerEnvelopes(ch);
          }
        } else if (x === 0xC && y === this.currentTick) {
          ch.volume = 0;
          ch.gainNode.gain.setValueAtTime(0, time);
        } else if (x === 0xD && y === this.currentTick) {
          // FT2 noteDelay: triggers note, resets volumes (if inst), triggers instrument, applies volume column
          // Reference: ft2_replayer.c lines 2140-2162
          const slideActive = ch.previousSlideFlag;
          this.triggerNote(ch, time, 0, chIndex, accent, slideActive, slide);
          // FT2: resetVolumes only if instrument was specified on the delayed row
          if (ch.rowInst > 0) this.resetXMVolumes(ch, time);
          // FT2: triggerInstrument is ALWAYS called (regardless of instrument)
          this.triggerEnvelopes(ch);

          // FT2: apply volume column on delayed trigger (set volume / set panning)
          const dvc = ch.volColumnVol;
          if (dvc >= 0x10 && dvc <= 0x50) {
            ch.outVol = dvc - 0x10;
            ch.volume = ch.outVol;
            ch.gainNode.gain.setValueAtTime(ch.volume / 64, time);
          } else if (dvc >= 0xC0 && dvc <= 0xCF) {
            ch.outPan = (dvc & 0x0F) << 4;
            ch.panning = ch.outPan;
            this.applyPanEffect(ch, ch.panning, time);
          }
        }
        break;
      case 0x11: this.doGlobalVolumeSlide(ch.globalVolSlide, time); break;

      case 0x14: { // Kxx - Key-off at tick (FT2: effect 20)
        // FT2: triggers keyOff when (speed - tick) == (param & 31)
        // In FT2 tick model: speed-tick = currentTick in our upward-counting model
        if (this.useXMPeriods) {
          if (this.currentTick === (param & 31)) {
            this.xmKeyOff(ch);
          }
        } else {
          if (this.currentTick === (param & 31)) {
            this.stopChannel(ch, chIndex, time);
          }
        }
        break;
      }

      case 0x19: this.doPanSlide(ch, ch.panSlide, time); break;
      case 0x1B: // Multi note retrigger (Rxy) — tick N
        // FT2: uses doMultiNoteRetrig with counter
        this.doMultiNoteRetrig(ch, chIndex, time);
        break;

      case 0x1D: { // Txx - Tremor (FT2: effect 29)
        // FT2: alternates between volume on/off over time
        // x = on-time ticks, y = off-time ticks
        const tp = param !== 0 ? param : ch.tremorParam;
        ch.tremorParam = tp;

        let tremorSign = ch.tremorPos & 0x80; // bit 7: on/off state
        let tremorData = ch.tremorPos & 0x7F; // bits 0-6: counter

        tremorData--;
        if (tremorData < 0 || (tremorData & 0x80) !== 0) {
          // Counter underflow — toggle state
          if (tremorSign === 0x80) {
            tremorSign = 0x00; // switch to OFF
            tremorData = tp & 0x0F; // off-time = low nibble
          } else {
            tremorSign = 0x80; // switch to ON
            tremorData = (tp >> 4) & 0x0F; // on-time = high nibble
          }
        }

        ch.tremorPos = tremorSign | (tremorData & 0x7F);
        const tremorVol = tremorSign === 0x80 ? ch.volume : 0;
        ch.gainNode.gain.setValueAtTime(tremorVol / 64, time);
        break;
      }
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
    if (this.useXMPeriods) {
      // FT2 arpeggio: uses arpeggioTab to select tick offset, then binary search on LUT
      const tick = FT2_ARPEGGIO_TAB[this.currentTick & 31];
      if (tick === 0) {
        this.updatePeriodDirect(ch, ch.period);
      } else {
        const noteOffset = tick === 1 ? (param >> 4) & 0x0F : param & 0x0F;
        const newPeriod = ft2ArpeggioPeriod(ch.period, noteOffset, ch.finetune, this.linearPeriods);
        this.updatePeriodDirect(ch, newPeriod);
      }
    } else {
      // MOD arpeggio: simple tick % 3 cycle with period table lookup
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

    // FT2: E3x glissando — quantize output period to nearest note
    // Reference: ft2_replayer.c portamento() line 1901-1904
    if (ch.glissandoMode && this.useXMPeriods) {
      const quantized = ft2Period2NotePeriod(ch.period, ch.finetune, this.linearPeriods);
      this.updatePeriodDirect(ch, quantized);
    } else {
      this.updatePeriod(ch);
    }
  }

  private doVibrato(ch: ChannelState): void {
    const speed = (ch.vibratoCmd >> 4) & 0x0F;
    const depth = ch.vibratoCmd & 0x0F;

    if (this.useXMPeriods) {
      // FT2 vibrato: phase is uint8_t (0-255), extracted as (pos>>2) & 0x1F
      const waveform = ch.waveControl & 0x03;
      let tmpVib = (ch.vibratoPos >> 2) & 0x1F;

      if (waveform === 0) {
        tmpVib = VIBRATO_TABLE[tmpVib];
      } else if (waveform === 1) {
        tmpVib <<= 3;
        if ((ch.vibratoPos & 0x80) !== 0) tmpVib = ~tmpVib & 0xFF;
      } else {
        tmpVib = 255;
      }

      tmpVib = (tmpVib * depth) >> 5; // FT2 uses >> 5 (not >> 7)

      if ((ch.vibratoPos & 0x80) !== 0)
        this.updatePeriodDirect(ch, ch.period - tmpVib);
      else
        this.updatePeriodDirect(ch, ch.period + tmpVib);

      // FT2 stores vibratoSpeed as (param >> 4) << 2, i.e. 4x our extracted speed
      ch.vibratoPos = (ch.vibratoPos + (speed * 4)) & 0xFF; // uint8_t wrapping
    } else {
      // MOD vibrato: original ProTracker style
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
  }

  private doTremolo(ch: ChannelState, time: number): void {
    if (this.useXMPeriods) {
      // FT2 tremolo: phase is uint8_t (0-255), same extraction as vibrato
      const waveform = (ch.waveControl >> 4) & 0x03;
      let tmpTrem = (ch.tremoloPos >> 2) & 0x1F;

      if (waveform === 0) {
        tmpTrem = VIBRATO_TABLE[tmpTrem];
      } else if (waveform === 1) {
        tmpTrem <<= 3;
        // FT2 BUG: checks vibratoPos instead of tremoloPos for ramp direction
        if ((ch.vibratoPos & 0x80) !== 0) tmpTrem = ~tmpTrem & 0xFF;
      } else {
        tmpTrem = 255;
      }

      tmpTrem = (tmpTrem * ch.tremoloDepth) >> 6;

      let tremVol: number;
      if ((ch.tremoloPos & 0x80) !== 0) {
        tremVol = ch.volume - tmpTrem;
        if (tremVol < 0) tremVol = 0;
      } else {
        tremVol = ch.volume + tmpTrem;
        if (tremVol > 64) tremVol = 64;
      }

      ch.gainNode.gain.setValueAtTime(tremVol / 64, time);
      ch.tremoloPos = (ch.tremoloPos + ch.tremoloSpeed) & 0xFF;
    } else {
      // MOD tremolo: original ProTracker style
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
  }

  private doVolumeSlide(ch: ChannelState, param: number, time: number): void {
    // FT2: use speed memory when param is 0
    if (param === 0) param = ch.volSlideSpeed;
    ch.volSlideSpeed = param;

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
    const pitchIdx = Math.min(255, Math.max(0, Math.round(this.globalPitchCurrent) + 128));
    const playbackRate = SEMITONE_RATIOS[pitchIdx];

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
  /**
   * FT2 doMultiNoteRetrig — counter-based retrigger with volume slide
   * Reference: ft2_replayer.c lines 1202-1251
   */
  private doMultiNoteRetrig(ch: ChannelState, chIndex: number, time: number): void {
    const cnt = ch.noteRetrigCounter + 1;
    if (cnt < ch.noteRetrigSpeed) {
      ch.noteRetrigCounter = cnt;
      return;
    }
    ch.noteRetrigCounter = 0;

    // Apply volume slide
    let vol = ch.volume;
    switch (ch.noteRetrigVol) {
      case 0x1: vol -= 1; break;
      case 0x2: vol -= 2; break;
      case 0x3: vol -= 4; break;
      case 0x4: vol -= 8; break;
      case 0x5: vol -= 16; break;
      case 0x6: vol = (vol >> 1) + (vol >> 3) + (vol >> 4); break; // FT2: 11/16 = 0.6875
      case 0x7: vol >>= 1; break;
      case 0x8: break;
      case 0x9: vol += 1; break;
      case 0xA: vol += 2; break;
      case 0xB: vol += 4; break;
      case 0xC: vol += 8; break;
      case 0xD: vol += 16; break;
      case 0xE: vol = (vol >> 1) + vol; break; // 1.5x
      case 0xF: vol += vol; break; // 2x
      default: break;
    }
    if (vol < 0) vol = 0;
    if (vol > 64) vol = 64;
    ch.volume = vol;
    ch.outVol = vol;

    // FT2: apply volume column set-volume / set-panning overrides
    if (ch.volColumnVol >= 0x10 && ch.volColumnVol <= 0x50) {
      ch.outVol = ch.volColumnVol - 0x10;
      ch.volume = ch.outVol;
    } else if (ch.volColumnVol >= 0xC0 && ch.volColumnVol <= 0xCF) {
      ch.outPan = (ch.volColumnVol & 0x0F) << 4;
    }

    ch.gainNode.gain.setValueAtTime(ch.volume / 64, time);
    this.triggerNote(ch, time, 0, chIndex, false, false, false);
  }

  // ==========================================================================
  // MACRO PROCESSING (Furnace instruments)
  // ==========================================================================

  // ==========================================================================
  // FT2 ENVELOPE + AUTO-VIBRATO PROCESSING (fixaEnvelopeVibrato)
  // Called every tick for every channel. Handles:
  // - Fadeout on key-off
  // - Volume envelope (interpolated, with sustain + loop)
  // - Panning envelope (interpolated, with sustain + loop)
  // - Auto-vibrato (with sweep ramp-up)
  // Reference: ft2_replayer.c lines 1440-1755
  // ==========================================================================

  /**
   * Reset envelope state on note trigger (FT2's triggerInstrument)
   * Called from processRow when a new note is triggered.
   */
  private triggerEnvelopes(ch: ChannelState): void {
    // FT2 triggerInstrument: reset vibrato/tremolo positions (conditional on waveControl)
    if ((ch.waveControl & 0x04) === 0) ch.vibratoPos = 0;
    if ((ch.waveControl & 0x40) === 0) ch.tremoloPos = 0;
    ch.noteRetrigCounter = 0;
    ch.tremorPos = 0;

    ch.keyOff = false;

    if (!ch.instrument?.metadata) return;
    const meta = ch.instrument.metadata;

    // Reset volume envelope
    const volEnv = meta.originalEnvelope;
    if (volEnv?.enabled) {
      ch.volEnvTick = 65535; // Will be incremented to 0 on first envelope tick
      ch.volEnvPos = 0;
    }

    // Reset panning envelope
    const panEnv = meta.panningEnvelope;
    if (panEnv?.enabled) {
      ch.panEnvTick = 65535;
      ch.panEnvPos = 0;
    }

    // Reset fadeout
    ch.fadeoutSpeed = meta.fadeout ?? meta.modPlayback?.fadeout ?? 0;
    ch.fadeoutVol = 32768;

    // Reset auto-vibrato
    const av = meta.autoVibrato;
    if (av && av.depth > 0) {
      ch.autoVibPos = 0;
      if (av.sweep > 0) {
        ch.autoVibAmp = 0;
        ch.autoVibSweep = ((av.depth << 8) / av.sweep) | 0;
      } else {
        ch.autoVibAmp = av.depth << 8;
        ch.autoVibSweep = 0;
      }
    }
  }

  /**
   * FT2's resetVolumes(): restore volume and panning from sample defaults (oldVol/oldPan).
   * Called when instrument is specified in the row: portamento+inst, inst-without-note,
   * note+inst (after triggerNote sets oldVol/oldPan from the new sample).
   * Reference: ft2_replayer.c lines 364-371
   */
  private resetXMVolumes(ch: ChannelState, time: number): void {
    ch.volume = ch.oldVol;
    ch.outVol = ch.oldVol;
    ch.panning = ch.oldPan;
    ch.outPan = ch.oldPan;
    ch.gainNode.gain.setValueAtTime(ch.volume / 64, time);
  }

  /**
   * Handle key-off for XM (FT2's keyOff)
   * Sets keyOff flag and adjusts envelope position.
   * With volume envelope: continues playing through release.
   * Without volume envelope: cuts volume to 0.
   */
  private xmKeyOff(ch: ChannelState): void {
    ch.keyOff = true;

    const meta = ch.instrument?.metadata;
    if (!meta) return;

    const volEnv = meta.originalEnvelope;
    if (volEnv?.enabled) {
      // Clamp envelope tick to current point's x value (FT2 behavior)
      const points = volEnv.points;
      if (points && ch.volEnvPos < points.length) {
        const pointTick = points[ch.volEnvPos].tick;
        if (ch.volEnvTick >= pointTick) {
          ch.volEnvTick = pointTick > 0 ? pointTick - 1 : 0;
        }
      }
    } else {
      // No volume envelope: hard-cut volume
      ch.outVol = 0;
      ch.volume = 0;
    }

    // FT2 BUG: panEnvFlags check is inverted in the original source!
    // The condition is: if (!(ins->panEnvFlags & ENV_ENABLED))
    // This means pan envelope tick adjustment only runs when pan env is DISABLED.
    // We replicate this bug for FT2 binary compatibility.
    const panEnv = meta.panningEnvelope;
    if (!panEnv?.enabled) {
      const points = panEnv?.points;
      if (points && ch.panEnvPos < points.length) {
        const pointTick = points[ch.panEnvPos].tick;
        if (ch.panEnvTick >= pointTick) {
          ch.panEnvTick = pointTick > 0 ? pointTick - 1 : 0;
        }
      }
    }
  }

  /**
   * Process envelopes and auto-vibrato for a channel (FT2's fixaEnvelopeVibrato)
   * Called every tick for every channel during XM playback.
   */
  private processEnvelopesAndVibrato(ch: ChannelState, time: number): void {
    if (!this.useXMPeriods) return; // Only for XM format
    if (!ch.instrument?.metadata) return;
    const meta = ch.instrument.metadata;

    // Sync outVol/outPan from current effect-modified values
    ch.outVol = ch.volume;
    ch.outPan = ch.panning;

    // *** FADEOUT ON KEY OFF ***
    if (ch.keyOff) {
      if (ch.fadeoutSpeed > 0) {
        ch.fadeoutVol -= ch.fadeoutSpeed;
        if (ch.fadeoutVol <= 0) {
          ch.fadeoutVol = 0;
          ch.fadeoutSpeed = 0;
        }
      }
    }

    // *** VOLUME ENVELOPE ***
    const volEnv = meta.originalEnvelope;
    let fEnvVal = 0;

    if (volEnv?.enabled && volEnv.points && volEnv.points.length > 0) {
      let envDidInterpolate = false;
      let envPos = ch.volEnvPos;

      ch.volEnvTick++;

      if (ch.volEnvTick === volEnv.points[envPos]?.tick) {
        ch.fVolEnvValue = (volEnv.points[envPos].value ?? 0) & 0xFF;

        envPos++;

        // Loop handling
        if (volEnv.loopEndPoint !== null && volEnv.loopStartPoint !== null) {
          envPos--;
          if (envPos === volEnv.loopEndPoint) {
            // FT2: if no sustain at this point OR keyOff is set, jump to loop start
            if (volEnv.sustainPoint === null || envPos !== volEnv.sustainPoint || ch.keyOff) {
              envPos = volEnv.loopStartPoint;
              ch.volEnvTick = volEnv.points[envPos].tick;
              ch.fVolEnvValue = (volEnv.points[envPos].value ?? 0) & 0xFF;
            }
          }
          envPos++;
        }

        if (envPos < volEnv.points.length) {
          let envInterpolateFlag = true;

          // Sustain handling: hold at sustain point while note is held
          if (volEnv.sustainPoint !== null && !ch.keyOff) {
            if (envPos - 1 === volEnv.sustainPoint) {
              envPos--;
              ch.fVolEnvDelta = 0;
              envInterpolateFlag = false;
            }
          }

          if (envInterpolateFlag) {
            ch.volEnvPos = envPos;

            const x0 = volEnv.points[envPos - 1].tick;
            const x1 = volEnv.points[envPos].tick;
            const xDiff = x1 - x0;

            if (xDiff > 0) {
              const y0 = (volEnv.points[envPos - 1].value ?? 0) & 0xFF;
              const y1 = (volEnv.points[envPos].value ?? 0) & 0xFF;
              ch.fVolEnvDelta = (y1 - y0) / xDiff;
              fEnvVal = ch.fVolEnvValue;
              envDidInterpolate = true;
            } else {
              ch.fVolEnvDelta = 0;
            }
          }
        } else {
          ch.fVolEnvDelta = 0;
        }
      }

      if (!envDidInterpolate) {
        ch.fVolEnvValue += ch.fVolEnvDelta;
        fEnvVal = ch.fVolEnvValue;
        if (fEnvVal < 0 || fEnvVal > 64) {
          fEnvVal = fEnvVal < 0 ? 0 : 64;
          ch.fVolEnvDelta = 0;
        }
      }

      // FT2 volume formula: (globalVol * outVol * fadeoutVol) / (64 * 64 * 32768) * (envVal / 64)
      const vol = this.globalVolume * ch.outVol * ch.fadeoutVol;
      let fVol = vol * (1.0 / (64 * 64 * 32768));
      fVol *= fEnvVal * (1.0 / 64);
      ch.fFinalVol = Math.max(0, Math.min(1, fVol));
    } else {
      // No volume envelope — still apply fadeout
      const vol = this.globalVolume * ch.outVol * ch.fadeoutVol;
      ch.fFinalVol = Math.max(0, Math.min(1, vol * (1.0 / (64 * 64 * 32768))));
    }

    // Apply final volume to gain node
    try {
      ch.gainNode.gain.setValueAtTime(ch.fFinalVol, time);
    } catch { /* ignored */ }

    // *** PANNING ENVELOPE ***
    const panEnv = meta.panningEnvelope;
    let fPanEnvVal = 0;

    if (panEnv?.enabled && panEnv.points && panEnv.points.length > 0) {
      let envDidInterpolate = false;
      let envPos = ch.panEnvPos;

      ch.panEnvTick++;

      if (ch.panEnvTick === panEnv.points[envPos]?.tick) {
        ch.fPanEnvValue = (panEnv.points[envPos].value ?? 0) & 0xFF;

        envPos++;

        // Loop handling
        if (panEnv.loopEndPoint !== null && panEnv.loopStartPoint !== null) {
          envPos--;
          if (envPos === panEnv.loopEndPoint) {
            if (panEnv.sustainPoint === null || envPos !== panEnv.sustainPoint || ch.keyOff) {
              envPos = panEnv.loopStartPoint;
              ch.panEnvTick = panEnv.points[envPos].tick;
              ch.fPanEnvValue = (panEnv.points[envPos].value ?? 0) & 0xFF;
            }
          }
          envPos++;
        }

        if (envPos < panEnv.points.length) {
          let envInterpolateFlag = true;

          if (panEnv.sustainPoint !== null && !ch.keyOff) {
            if (envPos - 1 === panEnv.sustainPoint) {
              envPos--;
              ch.fPanEnvDelta = 0;
              envInterpolateFlag = false;
            }
          }

          if (envInterpolateFlag) {
            ch.panEnvPos = envPos;
            const x0 = panEnv.points[envPos - 1].tick;
            const x1 = panEnv.points[envPos].tick;
            const xDiff = x1 - x0;

            if (xDiff > 0) {
              const y0 = (panEnv.points[envPos - 1].value ?? 0) & 0xFF;
              const y1 = (panEnv.points[envPos].value ?? 0) & 0xFF;
              ch.fPanEnvDelta = (y1 - y0) / xDiff;
              fPanEnvVal = ch.fPanEnvValue;
              envDidInterpolate = true;
            } else {
              ch.fPanEnvDelta = 0;
            }
          }
        } else {
          ch.fPanEnvDelta = 0;
        }
      }

      if (!envDidInterpolate) {
        ch.fPanEnvValue += ch.fPanEnvDelta;
        fPanEnvVal = ch.fPanEnvValue;
        if (fPanEnvVal < 0 || fPanEnvVal > 64) {
          fPanEnvVal = fPanEnvVal < 0 ? 0 : 64;
          ch.fPanEnvDelta = 0;
        }
      }

      // Center envelope value: 0..64 → -32..+32
      fPanEnvVal -= 32;
      const pan = 128 - Math.abs(ch.outPan - 128);
      const fPanAdd = (pan * fPanEnvVal) / 32;
      ch.finalPan = Math.max(0, Math.min(255, (ch.outPan + fPanAdd) | 0));

      // Apply panning
      this.applyPanEffect(ch, ch.finalPan, time);
    } else {
      ch.finalPan = ch.outPan;
    }

    // *** AUTO VIBRATO ***
    const av = meta.autoVibrato;
    if (av && av.depth > 0) {
      let autoVibAmp: number;

      if (ch.autoVibSweep > 0) {
        autoVibAmp = ch.autoVibSweep;
        if (!ch.keyOff) {
          autoVibAmp += ch.autoVibAmp;
          if ((autoVibAmp >> 8) > av.depth) {
            autoVibAmp = av.depth << 8;
            ch.autoVibSweep = 0;
          }
          ch.autoVibAmp = autoVibAmp;
        }
      } else {
        autoVibAmp = ch.autoVibAmp;
      }

      ch.autoVibPos = (ch.autoVibPos + av.rate) & 0xFF;

      let autoVibVal: number;
      if (av.type === 'square') {
        autoVibVal = ch.autoVibPos > 127 ? 64 : -64;
      } else if (av.type === 'rampUp') {
        autoVibVal = (((ch.autoVibPos >> 1) + 64) & 127) - 64;
      } else if (av.type === 'rampDown') {
        autoVibVal = (((-(ch.autoVibPos >> 1)) + 64) & 127) - 64;
      } else {
        // sine (default)
        autoVibVal = AUTO_VIB_SINE_TAB[ch.autoVibPos & 0xFF];
      }

      // Scale: (autoVibVal * autoVibAmp) >> (6+8) = >> 14
      autoVibVal = (autoVibVal * autoVibAmp) >> 14;

      let tmpPeriod = ch.period + autoVibVal;
      if (tmpPeriod < 0) tmpPeriod = 0;
      if (tmpPeriod >= 32000) tmpPeriod = 0;

      ch.finalPeriod = tmpPeriod;

      // Apply the vibrato-modified period
      if (ch.player && tmpPeriod > 0) {
        this.updatePeriodDirect(ch, tmpPeriod);
      }
    } else {
      ch.finalPeriod = ch.period;
    }

    // If fadeout has reached 0, stop the channel (note has fully faded out)
    if (ch.keyOff && ch.fadeoutVol === 0 && ch.fadeoutSpeed === 0) {
      this.stopChannel(ch, undefined, time);
    }
  }

  /**
   * Process Furnace instrument macros for a channel
   * Called every tick to apply macro values
   */
  private processMacros(ch: ChannelState, time: number): void {
    if (!ch.instrument?.furnace?.macros) return;

    // Skip TS-side macros for FurnaceDispatch instruments — the WASM worklet runs
    // furnace_dispatch_tick() at 60Hz which processes macros natively in C++.
    // Only FurnaceChipEngine (FM) instruments need TS-side macro processing.
    const st = ch.instrument.synthType;
    if (st && st.startsWith('Furnace') && !FURNACE_CHIP_ENGINE_TYPES.has(st)) return;

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
          const semitoneRatio = SEMITONE_RATIOS[Math.min(255, Math.max(0, ch.macroArpNote + 128))];
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
          const minP = this.useXMPeriods ? 1 : 113;
          const maxP = this.useXMPeriods ? 31999 : 856;
          this.updatePeriodDirect(ch, Math.max(minP, Math.min(maxP, newPeriod)));
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
    
    // For XM files or synth instruments, use XM note directly (avoids period table issues)
    // For MOD sample-based, use period-to-note conversion
    const isSynthInstrument = ch.instrument.synthType && ch.instrument.synthType !== 'Sampler';
    const useXMNote = (this.useXMPeriods || isSynthInstrument) && ch.xmNote > 0 && ch.xmNote < 97;
    const noteName = useXMNote
      ? xmNoteToNoteName(ch.xmNote)
      : periodToNoteName(ch.period);
    
    // --- Groove Velocity/Dynamics ---
    // PERF: Use cached state from scheduler tick (avoids redundant getState())
    const transportState = this._cachedTransportState ?? useTransportStore.getState();
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
    // Uses Tone.Draw.schedule to defer the visual trigger to the nearest
    // animation frame matching the audio time. Pre-allocated per-channel
    // callbacks avoid closure allocation per note.
    if (channelIndex !== undefined) {
      if (!this.meterCallbacks) {
        this.meterCallbacks = [];
        this.meterStaging = new Float64Array(64);
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
    // Get decoded AudioBuffer — either from ToneEngine cache (primary sample)
    // or from multiSampleBufferCache (multi-sample XM instruments)
    let decodedBuffer = engine.getDecodedBuffer(ch.instrument.id);

    // Resolve the per-sample decoded buffer for MOD/XM playback.
    // For XM multi-sample instruments the sampleMap lookup (above) has already
    // replaced ch.instrument.sample with the resolved sample; we need the buffer
    // for THAT specific sample, not the primary instrument buffer.
    //
    // Three paths:
    //   1. Cache hit   — per-sample buffer already decoded; use it.
    //   2. ArrayBuffer — fresh load; decode from embedded PCM data (async, skip tick).
    //   3. URL only    — post-reload (audioBuffer was stripped on save); decode from
    //                    data URL (async); fall through with primary as approximation.
    const sample = ch.instrument.sample;
    // Guard: after JSON round-trip, audioBuffer can be {} (empty object), not ArrayBuffer.
    const hasValidAudioBuffer = sample?.audioBuffer instanceof ArrayBuffer;
    const isMultiSample = !!(ch.instrument?.metadata?.sampleMap && ch.instrument.metadata.multiSamples);

    if (sample?.url) {
      const cacheKey = `${ch.instrument.id}:${sample.url}`;
      const cachedMulti = this.multiSampleBufferCache.get(cacheKey);
      if (cachedMulti) {
        // Cache hit: use the per-sample decoded buffer (overrides primary decodedBuffer)
        decodedBuffer = cachedMulti;
      } else if (!decodedBuffer || hasValidAudioBuffer) {
        // No primary buffer yet, or ArrayBuffer is available for a better decode
        if (hasValidAudioBuffer) {
          // Decode from embedded ArrayBuffer (fresh load path)
          try {
            const ctx = Tone.getContext().rawContext;
            if (ctx instanceof AudioContext) {
              ctx.decodeAudioData((sample.audioBuffer as ArrayBuffer).slice(0)).then(ab => {
                this.multiSampleBufferCache.set(cacheKey, ab);
              }).catch(() => { /* ignored */ });
            }
          } catch { /* ignored */ }
        } else {
          // Decode from data URL (post-reload path — audioBuffer was stripped on save)
          const urlToLoad = sample.url;
          const ctx = Tone.getContext().rawContext;
          if (ctx instanceof AudioContext) {
            fetch(urlToLoad).then(r => r.arrayBuffer())
              .then(ab => ctx.decodeAudioData(ab))
              .then(decoded => { this.multiSampleBufferCache.set(cacheKey, decoded); })
              .catch(() => { /* ignored */ });
          }
        }
        if (!decodedBuffer) return; // Skip this trigger — buffer will be ready next time
      } else if (isMultiSample) {
        // Primary buffer is set but this multi-sample hasn't been decoded yet.
        // Queue URL decode so future triggers use the correct per-note sample.
        const urlToLoad = sample.url;
        const ctx = Tone.getContext().rawContext;
        if (ctx instanceof AudioContext) {
          fetch(urlToLoad).then(r => r.arrayBuffer())
            .then(ab => ctx.decodeAudioData(ab))
            .then(decoded => { this.multiSampleBufferCache.set(cacheKey, decoded); })
            .catch(() => { /* ignored */ });
        }
        // Fall through: use primary buffer as rough approximation for this tick
      }
    }

    if (!decodedBuffer) {
      // URL-based sample (e.g. from samplepack or post-reload data URL) — trigger engine to load it.
      // getInstrument() creates a Tone.Sampler/Player which loads the URL,
      // and stores the decoded buffer in decodedAudioBuffers when ready.
      if (sample?.url) {
        engine.getInstrument(ch.instrument.id, ch.instrument);
      }
      console.warn('[TrackerReplayer] No decoded buffer for instrument:', ch.instrument.id, ch.instrument.name);
      return;
    }

    // Check if period is valid (non-zero)
    if (!ch.period || ch.period <= 0) {
      console.warn('[TrackerReplayer] Invalid period, skipping playback:', ch.period);
      return;
    }

    // Calculate playback rate from period
    let playbackRate: number;
    if (this.useXMPeriods) {
      // XM mode: FT2 period→Hz, then divide by C-4 sample rate
      // This gives us the ratio needed to pitch the sample correctly.
      // c4Rate = Hz that C-4 + relativeNote + finetune plays at.
      // playbackRate = desiredHz / c4Rate
      const hz = ft2Period2Hz(ch.period, this.linearPeriods);
      const c4Rate = ft2GetSampleC4Rate(ch.relativeNote, ch.finetune, this.linearPeriods);
      playbackRate = c4Rate > 0 ? hz / c4Rate : 1.0;
    } else {
      // MOD mode: Amiga period → frequency → playback rate.
      // Finetune is already baked into ch.period via rawPeriodToFinetuned().
      // Uses the same formula as updatePeriodDirect() for consistency —
      // otherwise there's a ~15 cent pitch jump when effects start on tick 1.
      // Clamp period to minimum 113 (PT2 Paula behavior)
      const clampedPeriod = ch.period < 113 ? 113 : ch.period;
      const sampleRate = ch.instrument?.sample?.sampleRate || 8363;
      playbackRate = AMIGA_PAL_FREQUENCY / clampedPeriod / sampleRate;
    }

    // Get or create cached ToneAudioBuffer wrapper (avoids re-wrapping per note)
    // For multi-sample instruments, check if the cached buffer matches the current decodedBuffer
    let toneBuffer = this.bufferCache.get(ch.instrument.id);
    if (!toneBuffer || toneBuffer.get() !== decodedBuffer) {
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

    // FT2/PT2 loop validation: if loop points exceed sample length, disable loop entirely
    // (reference implementations never clamp — they reset to no-loop)
    //
    // CRITICAL: Loop points are in ORIGINAL sample rate units, but decodedBuffer has been
    // resampled to AudioContext rate (44100 Hz). We must convert back to get original length.
    const originalSampleLength = Math.round(duration * originalSampleRate);
    const loopStartSmp = sample?.loopStart ?? 0;
    const loopEndSmp = sample?.loopEnd ?? 0;
    const hasLoop = sample?.loop && loopEndSmp > loopStartSmp && loopEndSmp <= originalSampleLength;
    if (hasLoop) {
      const lsTime = loopStartSmp / originalSampleRate;
      const leTime = loopEndSmp / originalSampleRate;
      // Validate converted times against buffer duration
      const timeValid = lsTime >= 0 && lsTime < duration && leTime > lsTime && leTime <= duration + 0.001;
      if (timeValid) {
        player.loop = true;
        player.loopStart = Math.max(0, Math.min(lsTime, duration));
        player.loopEnd = Math.min(leTime, duration);
      } else {
        player.loop = false;
      }
    } else {
      player.loop = false;
    }

    // Apply playback rate multiplier for pitch shifting (DJ slider, etc.)
    // In DJ mode, use per-deck multiplier; otherwise use ToneEngine global
    const pitchRate = this.getEffectivePlaybackRate();
    player.playbackRate = playbackRate * pitchRate;

    ch.player = player; // Keep reference for updatePeriod compatibility

    // Quick volume ramp on note start (FT2-style click prevention)
    // Start at 0, ramp to target volume over ~2ms
    try {
      ch.gainNode.gain.setValueAtTime(0, safeTime);
      ch.gainNode.gain.linearRampToValueAtTime(ch.fFinalVol > 0 ? ch.fFinalVol : ch.volume / 64, safeTime + 0.002);
    } catch { /* ignored */ }

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
      }
      player.start(safeTime, startOffset);
    } catch (e) {
      console.error('[TrackerReplayer] Playback start failed:', e);
    }
  }

  private stopChannel(ch: ChannelState, channelIndex?: number, time?: number): void {
    // Quick volume ramp down before stop (click prevention, ~2ms)
    if (time !== undefined && time > 0) {
      try {
        ch.gainNode.gain.setValueAtTime(ch.gainNode.gain.value, time);
        ch.gainNode.gain.linearRampToValueAtTime(0, time + 0.002);
      } catch { /* ignored */ }
    }

    // Stop all pooled players (no disposal - they're reused)
    // Break loop FIRST to prevent looped samples from continuing after stop.
    // Then call stop(). Always call without checking player.state first —
    // Source.stop() internally handles future-scheduled starts via getNextState().
    const stopTime = time !== undefined ? time + 0.003 : undefined; // Stop slightly after ramp
    for (const player of ch.playerPool) {
      try {
        player.loop = false;
        if (stopTime !== undefined) {
          player.stop(stopTime);
        } else {
          player.stop();
        }
      } catch { /* ignored */ }
    }
    ch.player = null;

    // Zero the gain node (after ramp or immediately if no time)
    try {
      if (time === undefined || time <= 0) {
        ch.gainNode.gain.cancelScheduledValues(0);
        ch.gainNode.gain.setValueAtTime(0, 0);
      }
    } catch { /* ignored */ }

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

  /**
   * Convert period to playback rate and apply to the channel's player.
   *
   * For XM: Uses ft2Period2Hz() to get Hz, then rate = Hz / c4Rate
   *   where c4Rate is the sample's natural C-4 frequency.
   * For MOD: Uses AMIGA_PAL_FREQUENCY / period to get Hz, then rate = Hz / sampleRate
   */
  private updatePeriodDirect(ch: ChannelState, period: number): void {
    if (!ch.player || period === 0) return;

    const rate = this.getEffectivePlaybackRate();

    if (this.useXMPeriods) {
      // XM mode: use FT2's period→Hz conversion
      const hz = ft2Period2Hz(period, this.linearPeriods);
      if (hz <= 0) return;
      // c4Rate = the Hz that C-4 with this sample's relativeNote+finetune produces.
      // playbackRate = desiredHz / c4Rate gives us the correct pitch relative to the sample's natural pitch.
      const c4Rate = ft2GetSampleC4Rate(
        ch.relativeNote,
        ch.finetune,
        this.linearPeriods,
      );
      ch.player.playbackRate = (hz / c4Rate) * rate;
    } else {
      // MOD mode: original Amiga conversion
      // Clamp period to minimum 113 (PT2 Paula behavior)
      const clampedPeriod = period < 113 ? 113 : period;
      const sampleRate = ch.instrument?.sample?.sampleRate || 8363;
      const frequency = AMIGA_PAL_FREQUENCY / clampedPeriod;
      ch.player.playbackRate = (frequency / sampleRate) * rate;
    }
  }

  /**
   * Update all active players' playback rates when global playback rate changes
   * Called by DJ pitch slider to apply pitch shift to already-playing samples
   */
  public updateAllPlaybackRates(): void {
    const rate = this.getEffectivePlaybackRate();

    for (const ch of this.channels) {
      if (ch.player && ch.period > 0) {
        if (this.useXMPeriods) {
          const hz = ft2Period2Hz(ch.period, this.linearPeriods);
          if (hz <= 0) continue;
          const c4Rate = ft2GetSampleC4Rate(ch.relativeNote, ch.finetune, this.linearPeriods);
          ch.player.playbackRate = (hz / c4Rate) * rate;
        } else {
          const clampedPeriod = ch.period < 113 ? 113 : ch.period;
          const sampleRate = ch.instrument?.sample?.sampleRate || 8363;
          const frequency = AMIGA_PAL_FREQUENCY / clampedPeriod;
          ch.player.playbackRate = (frequency / sampleRate) * rate;
        }
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

  /**
   * Unified note-to-period conversion that handles both MOD and XM formats.
   *
   * For XM files: Uses FT2's 1936-entry period LUTs with relativeNote support.
   * For MOD files: Uses ProTracker's 3-octave period table with rawPeriod priority.
   */
  private noteToPlaybackPeriod(noteValue: number, rawPeriod: number | undefined, ch: ChannelState): number {
    if (this.useXMPeriods && noteValue > 0 && noteValue < 97) {
      // XM mode: Use FT2 period system
      // Add relativeNote to note BEFORE period lookup (FT2 triggerNote behavior)
      let note = noteValue + ch.relativeNote;

      // FT2: if note >= 10*12 (120), it's out of range — return 0
      if (note < 1 || note >= 10 * 12) return 0;

      return ft2NoteToPeriod(note, ch.finetune, this.linearPeriods);
    }

    // MOD mode: Priority rawPeriod → old noteToPeriod
    // MOD import stores both note (2-octave-shifted XM number) and period (original Amiga period).
    // Using noteToPeriod first would double-shift the pitch — period 428 → XM 49 → period 107.
    //
    // PT2's setPeriod: MOD pattern data stores finetune-0 periods. Convert to
    // the finetune-specific period so that ALL downstream code (triggerNote,
    // updatePeriodDirect, arpeggio tick-0, vibrato centre) uses the right pitch.
    if (rawPeriod) {
      return this.rawPeriodToFinetuned(rawPeriod, ch.finetune);
    }
    return this.noteToPeriod(noteValue, ch.finetune) || 0;
  }

  /**
   * PT2's setPeriod equivalent: convert a raw pattern period (finetune-0) to
   * the correct period from the finetune-specific table.
   *
   * MOD pattern data always stores periods from the finetune-0 table.
   * The replayer must re-lookup the note index in finetune-0 and then pull
   * the period from the sample's finetune table.
   */
  private rawPeriodToFinetuned(rawPeriod: number, finetune: number): number {
    if (finetune === 0 || rawPeriod <= 0) return rawPeriod;

    // Search finetune-0 table (first 36 entries) for the note index
    let noteIndex = 0;
    for (let i = 0; i < 36; i++) {
      if (rawPeriod >= PERIOD_TABLE[i]) {
        noteIndex = i;
        break;
      }
    }

    // Look up the period from the finetune-specific table section
    const ftIndex = finetune >= 0 ? finetune : finetune + 16;
    return PERIOD_TABLE[ftIndex * 36 + noteIndex];
  }

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
            period = Math.round(period / (OCTAVE_UP[Math.min(10, octaveShift)] ?? Math.pow(2, octaveShift)));
          } else if (octaveShift < 0) {
            period = Math.round(period * (OCTAVE_UP[Math.min(10, -octaveShift)] ?? Math.pow(2, -octaveShift)));
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

    const match = note.match(/^([A-G][#]?)-?(\d)$/);
    if (!match) return 0;

    const noteIndex = NOTE_STRING_MAP[match[1]] ?? 0;
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
  // PER-CHANNEL TICK (MusicLine Editor and similar formats)
  // ==========================================================================

  /**
   * Tick handler for formats with per-channel independent track tables.
   * Each channel maintains its own tick counter, row position, and song position.
   * Channels with different speeds advance their rows at different rates.
   * Groove per channel: effectiveSpeed alternates between channelSpeeds[ch] and
   * channelGrooves[ch] each row when groove > 0.
   */
  private processTickPerChannel(time: number): void {
    if (!this.song) return;

    const tables    = this.song.channelTrackTables!;
    const speeds    = this.song.channelSpeeds;
    const grooves   = this.song.channelGrooves;
    const fallback  = this.song.initialSpeed;
    const tickInterval = 2.5 / this.bpm;

    // Queue display state and notify row change for channel 0 at row start
    if (this.channelTickCounters[0] === 0) {
      const ch0Song = this.channelSongPos[0];
      const ch0Patt = this.channelPattPos[0];
      const ch0Pat  = tables[0]?.[ch0Song] ?? 0;
      this.queueDisplayState(time, ch0Patt, ch0Pat, ch0Song, 0);
      if (this.onRowChange) this.onRowChange(ch0Patt, ch0Pat, ch0Song);
    }

    // Sync mute state
    if (!this.isDJDeck) {
      const muteEngine = getToneEngine();
      for (let m = 0; m < this.channels.length; m++) {
        const muted = muteEngine.isChannelMuted(m);
        if (this.channels[m]._muteState !== muted) {
          this.channels[m]._muteState = muted;
          this.channels[m].muteGain.gain.setValueAtTime(muted ? 0 : 1, time);
        }
      }
    }

    for (let ch = 0; ch < this.channels.length; ch++) {
      const channel  = this.channels[ch];
      const chTick   = this.channelTickCounters[ch];
      const chSong   = this.channelSongPos[ch];
      const chPatt   = this.channelPattPos[ch];

      // Effective speed alternates between base speed and groove each row
      const baseSpeed     = speeds?.[ch]  ?? fallback;
      const groove        = grooves?.[ch] ?? 0;
      const effectiveSpeed = (groove > 0 && this.channelGrooveToggle[ch]) ? groove : baseSpeed;

      // Look up row from this channel's current pattern
      const chPatIdx = tables[ch]?.[chSong] ?? 0;
      const row = this.song.patterns[chPatIdx]?.channels[0]?.rows[chPatt];

      // Trigger audio only when notes are not suppressed (ML WASM handles its own audio)
      if (!this._suppressNotes && row) {
        if (chTick === 0) {
          this.processRow(ch, channel, row, time);
        } else {
          this.processEffectTick(ch, channel, row, time + (chTick * tickInterval));
        }
        this.processMacros(channel, time + (chTick * tickInterval));
        this.processEnvelopesAndVibrato(channel, time + (chTick * tickInterval));
      }

      // Advance this channel's counter; when it overflows, advance its position.
      // Always runs regardless of _suppressNotes so the display position tracks correctly.
      this.channelTickCounters[ch]++;
      if (this.channelTickCounters[ch] >= effectiveSpeed) {
        this.channelTickCounters[ch] = 0;
        if (groove > 0) this.channelGrooveToggle[ch] = !this.channelGrooveToggle[ch];

        // Advance row within pattern
        this.channelPattPos[ch]++;
        const chPattern = this.song.patterns[chPatIdx];
        const patLen    = chPattern?.channels[0]?.rows.length ?? 128;
        if (this.channelPattPos[ch] >= patLen) {
          this.channelPattPos[ch] = 0;
          // Advance to next track table entry
          this.channelSongPos[ch]++;
          const chTable = tables[ch]!;
          if (this.channelSongPos[ch] >= chTable.length) {
            this.channelSongPos[ch] = 0;
            // Channel 0 looping = song end
            if (ch === 0 && !this._songEndFiredThisBatch) {
              this._songEndFiredThisBatch = true;
              this.onSongEnd?.();
            }
          }
        }
      }
    }

    if (this.onTickProcess) {
      this.onTickProcess(this.channelTickCounters[0], this.channelPattPos[0]);
    }
    this.totalRowsProcessed++;
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

    // FT2-accurate row advancement (matches getNextPos in ft2_replayer.c)
    // Reference: ft2_replayer.c lines 2245-2294
    this.pattPos++;

    // FT2 two-stage pattern delay (after row increment, before position checks)
    if (this.useXMPeriods) {
      if (this.pattDelTime > 0) {
        this.pattDelTime2 = this.pattDelTime;
        this.pattDelTime = 0;
      }
      if (this.pattDelTime2 > 0) {
        this.pattDelTime2--;
        if (this.pattDelTime2 > 0) {
          this.pattPos--; // Repeat the same row
        }
      }
    }

    // E6x pattern loop: just sets row position, no song position change
    // FT2: pBreakFlag is ONLY set by E6x (pattern loop), NOT by Dxx
    if (this.pBreakFlag) {
      this.pBreakFlag = false;
      this.pattPos = this.pBreakPos;
    }

    // Pattern end or position jump (Bxx / Dxx / natural end of pattern)
    const patternNum = this.song.songPositions[this.songPos];
    const patternLength = this.accessor.getMode() !== 'classic'
      ? this.accessor.getPatternLength(this.songPos)
      : (this.song.patterns[patternNum]?.length ?? 64);

    if (this.pattPos >= patternLength || this.posJumpFlag) {
      this.pattPos = this.pBreakPos; // Dxx target row, or 0 if Bxx/natural
      this.pBreakPos = 0;
      this.posJumpFlag = false;

      // FT2: ++song.songPos (Bxx already set songPos = param-1, so net = param)
      this.songPos++;

      // Overflow / song end
      if (this.songPos >= this.song.songLength) {
        this.songPos = this.song.restartPosition < this.song.songLength
          ? this.song.restartPosition
          : 0;
        // Debounce: only fire onSongEnd once per actual song loop (not per scheduler batch)
        if (!this._songEndFiredThisBatch) {
          this._songEndFiredThisBatch = true;
          this.onSongEnd?.();
        }
      }
    }

    // DJ pattern loop: wrap song position within loop boundaries
    if (this.patternLoopActive && this.patternLoopStartPos >= 0) {
      if (this.songPos > this.patternLoopEndPos) {
        this.songPos = this.patternLoopStartPos;
        this.pattPos = 0;
      }
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

      // Per-channel seek: all channels jump to the requested position
      if (this.song.channelTrackTables) {
        for (let ch = 0; ch < this.channelTickCounters.length; ch++) {
          const tbl = this.song.channelTrackTables[ch];
          this.channelSongPos[ch]    = Math.max(0, Math.min(songPos, tbl.length - 1));
          this.channelPattPos[ch]    = pattPos;
          this.channelTickCounters[ch] = 0;
          this.channelGrooveToggle[ch] = false;
        }
      }

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
    this.pattDelTime = 0;
    this.pattDelTime2 = 0;

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

    // Per-channel seek: all channels jump to the requested position
    if (this.song.channelTrackTables) {
      for (let ch = 0; ch < this.channelTickCounters.length; ch++) {
        const tbl = this.song.channelTrackTables[ch];
        this.channelSongPos[ch]    = Math.max(0, Math.min(songPos, tbl.length - 1));
        this.channelPattPos[ch]    = pattPos;
        this.channelTickCounters[ch] = 0;
        this.channelGrooveToggle[ch] = false;
      }
    }

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
    this.pattDelTime = 0;
    this.pattDelTime2 = 0;

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

  /** Update Furnace speed alternation for live subsong switching (no song reload needed). */
  setSpeed2(value: number | null): void {
    this.speed2 = value;
    this.speedAB = value !== null;
  }

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

    // Restore any native engines rerouted to separation chain
    if (this.routedNativeEngines.size > 0) {
      const engine = getToneEngine();
      for (const key of this.routedNativeEngines) {
        engine.restoreNativeEngineRouting(key);
      }
      this.routedNativeEngines.clear();
    }

    for (const ch of this.channels) {
      // Dispose all pooled players
      for (const player of ch.playerPool) {
        try { player.dispose(); } catch { /* ignored */ }
      }
      ch.gainNode.dispose();
      ch.panNode.dispose();
      ch.muteGain.dispose();
    }
    // Clear buffer cache
    this.bufferCache.clear();
    this.multiSampleBufferCache.clear();
    this.separationNode.dispose();
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
