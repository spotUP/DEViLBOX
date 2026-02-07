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
import { useTransportStore } from '@/stores/useTransportStore';
import { getGrooveOffset } from '@/types/audio';

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

/** Convert Amiga period to note name (e.g. "C4") */
function periodToNoteName(period: number): string {
  for (let oct = 0; oct < 8; oct++) {
    for (let note = 0; note < 12; note++) {
      const idx = oct * 12 + note;
      if (idx < 36 && PERIOD_TABLE[idx] <= period) {
        return `${NOTE_NAMES[note].replace('-', '')}${oct + 1}`;
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

  // Pattern break/jump
  private pBreakPos = 0;
  private pBreakFlag = false;
  private posJumpFlag = false;
  private posJumpPos = 0;
  private patternDelay = 0;      // EEx pattern delay

  // Channels
  private channels: ChannelState[] = [];

  // Tick timer
  private tickLoop: Tone.Loop | null = null;

  // Master output
  private masterGain: Tone.Gain;

  // Audio-synced state queue for smooth scrolling (BassoonTracker pattern)
  // States are queued with Web Audio timestamps during scheduling,
  // then dequeued in render loop as audioContext.currentTime advances
  private stateQueue: DisplayState[] = [];
  private lastDequeuedState: DisplayState | null = null;
  private static readonly MAX_STATE_QUEUE_SIZE = 256; // ~5 seconds at 50Hz

  // Cache for ToneAudioBuffer wrappers (keyed by instrument ID)
  // Avoids re-wrapping the same decoded AudioBuffer on every note trigger
  private bufferCache: Map<number, Tone.ToneAudioBuffer> = new Map();

  // Callbacks
  public onRowChange: ((row: number, pattern: number, position: number) => void) | null = null;
  public onSongEnd: (() => void) | null = null;
  public onTickProcess: ((tick: number, row: number) => void) | null = null;

  constructor() {
    this.masterGain = new Tone.Gain(1).toDestination();
  }

  // ==========================================================================
  // SONG LOADING
  // ==========================================================================

  loadSong(song: TrackerSong): void {
    this.stop();
    this.song = song;
    this.bufferCache.clear(); // New song = new samples, invalidate cache

    // Dispose old channels before creating new ones (prevent Web Audio node leaks)
    for (const ch of this.channels) {
      for (const p of ch.playerPool) {
        try { p.dispose(); } catch (e) {}
      }
      try { ch.gainNode.dispose(); } catch (e) {}
      try { ch.panNode.dispose(); } catch (e) {}
    }

    // Initialize channels
    this.channels = [];
    for (let i = 0; i < song.numChannels; i++) {
      this.channels.push(this.createChannel(i, song.numChannels));
    }

    // Set initial playback state
    this.songPos = 0;
    this.pattPos = 0;
    this.currentTick = 0;
    this.speed = song.initialSpeed;
    this.bpm = song.initialBPM;
    this.pBreakFlag = false;
    this.posJumpFlag = false;
    this.patternDelay = 0;

    console.log(`[TrackerReplayer] Loaded: ${song.name} (${song.format}), ${song.numChannels}ch, ${song.patterns.length} patterns`);
    console.log(`[TrackerReplayer] Song positions: [${song.songPositions.join(', ')}], length: ${song.songLength}`);
    console.log(`[TrackerReplayer] Pattern lengths: ${song.patterns.map((p, i) => `${i}:${p?.length ?? 'null'}`).join(', ')}`);
    console.log(`[TrackerReplayer] Instruments:`, song.instruments.map(i => ({ id: i.id, name: i.name, hasSample: !!i.sample?.url })));
  }

  private createChannel(index: number, totalChannels: number): ChannelState {
    // Amiga-style panning: 0,3 = left, 1,2 = right (for 4ch)
    let panValue = 0;
    if (totalChannels === 4) {
      panValue = (index === 0 || index === 3) ? -0.7 : 0.7;
    } else {
      // For >4 channels, alternate L/R
      panValue = (index % 2 === 0) ? -0.5 : 0.5;
    }

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
  private scheduleAheadTime = 0.05; // Schedule 50ms ahead (tight stop, glitch-free)
  private schedulerInterval = 0.015; // Check every 15ms (must be < scheduleAheadTime)
  private nextScheduleTime = 0;
  
  // Drift-free timing state
  private startTime = 0;
  private totalTicksScheduled = 0;

  // Raw interval timer ID (more reliable than Tone.Loop for scheduling)
  private schedulerTimerId: ReturnType<typeof setInterval> | null = null;

  async play(): Promise<void> {
    if (!this.song || this.playing) return;

    await Tone.start();
    this.playing = true;
    this.startScheduler();

    console.log(`[TrackerReplayer] Playing at ${this.bpm} BPM, speed ${this.speed} (lookahead=${this.scheduleAheadTime}s)`);
  }

  stop(): void {
    this.playing = false;

    // Clear the scheduler interval
    if (this.schedulerTimerId !== null) {
      clearInterval(this.schedulerTimerId);
      this.schedulerTimerId = null;
    }

    // Legacy Tone.Loop cleanup (if any)
    if (this.tickLoop) {
      this.tickLoop.stop();
      this.tickLoop.dispose();
      this.tickLoop = null;
    }

    // Stop all channels (stops pool players without disposing)
    for (const ch of this.channels) {
      this.stopChannel(ch);
    }

    // Reset position
    this.songPos = 0;
    this.pattPos = 0;
    this.currentTick = 0;
    this.totalTicksScheduled = 0;

    // Clear audio-synced state queue
    this.clearStateQueue();

    console.log('[TrackerReplayer] Stopped');
  }

  pause(): void {
    // Clear the scheduler interval
    if (this.schedulerTimerId !== null) {
      clearInterval(this.schedulerTimerId);
      this.schedulerTimerId = null;
    }
    if (this.tickLoop) {
      this.tickLoop.stop();
    }
    this.playing = false;
  }

  resume(): void {
    if (this.song && !this.playing) {
      this.playing = true;
      this.startScheduler();
    }
  }

  /**
   * Start the lookahead scheduler. Used by both play() and resume().
   * Uses raw setInterval instead of Tone.Loop for more reliable scheduling.
   */
  private startScheduler(): void {
    this.startTime = Tone.now() + 0.02;
    this.nextScheduleTime = this.startTime;
    this.totalTicksScheduled = 0;

    const schedulerTick = () => {
      if (!this.playing) return;

      const currentTime = Tone.now();
      const scheduleUntil = currentTime + this.scheduleAheadTime;
      const tickInterval = 2.5 / this.bpm;

      // Fill the buffer - schedule all ticks within look-ahead window
      while (this.nextScheduleTime < scheduleUntil && this.playing) {
        this.processTick(this.nextScheduleTime);
        this.totalTicksScheduled++;
        // Calculate NEXT time based on total ticks since START to avoid cumulative drift
        this.nextScheduleTime = this.startTime + (this.totalTicksScheduled * tickInterval);
      }
    };

    // Initial fill, then keep filling every 15ms
    schedulerTick();
    this.schedulerTimerId = setInterval(schedulerTick, this.schedulerInterval * 1000);
  }

  // ==========================================================================
  // TICK PROCESSING - THE HEART OF THE REPLAYER
  // ==========================================================================

  private processTick(time: number): void {
    if (!this.song || !this.playing) return;

    // Handle pattern delay
    if (this.patternDelay > 0) {
      this.patternDelay--;
      return;
    }

    // --- Groove & Swing Support ---
    // PERFORMANCE: Use cached values where possible
    const transportState = useTransportStore.getState();
    const bpm = this.bpm;
    const speed = this.speed;
    const tickInterval = 2.5 / bpm;
    const rowDuration = tickInterval * speed;
    
    let grooveOffset = 0;
    const grooveTemplate = transportState.grooveTemplateId !== 'straight' ? 
      transportState.getGrooveTemplate() : null;
    
    if (grooveTemplate) {
      grooveOffset = getGrooveOffset(grooveTemplate, this.pattPos, rowDuration);
    } else {
      const swingAmount = transportState.swing;
      if (swingAmount !== 0 && swingAmount !== 50 && (this.pattPos % 2) === 1) {
        const maxSwingOffset = rowDuration * 0.5;
        const normalizedSwing = (swingAmount - 50) / 50;
        grooveOffset = normalizedSwing * maxSwingOffset;
      }
    }

    // Apply offset to safeTime
    const safeTime = (time ?? Tone.now()) + grooveOffset;

    // Get current pattern
    const patternNum = this.song.songPositions[this.songPos];
    const pattern = this.song.patterns[patternNum];
    if (!pattern) return;

    // Queue display state for audio-synced UI (tick 0 = start of row)
    // Use shifted time so cursor follows the groove
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
        this.processEffectTick(ch, channel, row, safeTime);
      }

      // Process Furnace macros every tick
      this.processMacros(channel, safeTime);
    }

    // Notify tick processing
    if (this.onTickProcess) {
      this.onTickProcess(this.currentTick, this.pattPos);
    }

    // Advance tick counter
    this.currentTick++;
    if (this.currentTick >= this.speed) {
      this.currentTick = 0;
      this.advanceRow();
    }
  }

  /**
   * Queue a display state for audio-synced UI updates.
   * States are queued with Web Audio timestamps and dequeued in render loop.
   */
  private queueDisplayState(time: number, row: number, pattern: number, position: number, tick: number): void {
    const state: DisplayState = { time, row, pattern, position, tick };

    // Limit queue size to prevent memory issues
    if (this.stateQueue.length >= TrackerReplayer.MAX_STATE_QUEUE_SIZE) {
      this.stateQueue.shift(); // Remove oldest
    }

    this.stateQueue.push(state);
  }

  /**
   * Get display state for audio-synced UI rendering (BassoonTracker pattern).
   * Call this in the render loop with audioContext.currentTime + lookahead.
   * Returns the most recent state that should be displayed at the given time.
   */
  public getStateAtTime(time: number): DisplayState | null {
    if (!this.playing) {
      return this.lastDequeuedState;
    }

    // Dequeue states that are past the requested time
    let result = this.lastDequeuedState;

    while (this.stateQueue.length > 0) {
      const state = this.stateQueue[0];
      if (state.time <= time) {
        result = this.stateQueue.shift()!;
        this.lastDequeuedState = result;
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
    this.stateQueue = [];
    this.lastDequeuedState = null;
  }

  // ==========================================================================
  // ROW PROCESSING (TICK 0)
  // ==========================================================================

  private processRow(chIndex: number, ch: ChannelState, row: TrackerCell, time: number): void {
    if (!this.song) return;

    // Get effect info
    const effect = row.effTyp ?? (row.effect ? parseInt(row.effect[0], 16) : 0);
    const param = row.eff ?? (row.effect ? parseInt(row.effect.substring(1), 16) : 0);
    const x = (param >> 4) & 0x0F;
    const y = param & 0x0F;
    void x; void y; // Effect parameters used in extended effect handling below

    // Handle instrument change
    const instNum = row.instrument ?? 0;
    if (instNum > 0) {
      const instrument = this.song.instruments.find(i => i.id === instNum);
      if (instrument) {
        ch.instrument = instrument;
        ch.sampleNum = instNum;
        ch.volume = 64; // Reset volume on instrument change
        ch.finetune = instrument.metadata?.modPlayback?.finetune ?? 0;

        // Apply volume immediately
        ch.gainNode.gain.setValueAtTime(ch.volume / 64, time);
      } else {
        console.log(`[TrackerReplayer] Instrument ${instNum} not found! Available IDs:`, this.song.instruments.map(i => i.id).sort((a,b) => a-b));
      }
    }

    // Handle note
    const noteValue = row.note;
    const rawPeriod = row.period;

    // Probability/maybe: skip note if random check fails
    const prob = row.probability;
    const probabilitySkip = prob !== undefined && prob > 0 && prob < 100 && Math.random() * 100 >= prob;

    if (noteValue && noteValue !== 0 && !probabilitySkip) {
      // For MOD files, use the raw period stored in the row (if available)
      // This is more accurate than converting XM note numbers
      const usePeriod = rawPeriod || this.noteToPeriod(noteValue, ch.finetune);

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
        }

        // TB-303 SLIDE SEMANTICS:
        // "Slide is ON on a step if the PREVIOUSLY played step had Slide AND the current step is a valid Note"
        // This means the slide flag on step N affects the transition FROM step N TO step N+1
        // So we check if the PREVIOUS row had slide, not the current row
        const slideActive = ch.previousSlideFlag && noteValue !== null;

        // Trigger the note with proper 303 slide semantics
        // Pass row.accent directly (accent applies to current note)
        // Pass slideActive (computed from previous row's slide flag) for pitch glide
        // Pass row.slide for gate timing (if this row has slide, gate stays high to slide to next)
        this.triggerNote(ch, time, offset, chIndex, row.accent, slideActive, row.slide ?? false);

        // Reset vibrato/tremolo positions
        if ((ch.waveControl & 0x04) === 0) ch.vibratoPos = 0;
        if ((ch.waveControl & 0x40) === 0) ch.tremoloPos = 0;
      }
    }

    // Update previous slide flag for next row (TB-303 semantics)
    // Store current row's slide flag to be used when processing the next note
    ch.previousSlideFlag = row.slide ?? false;

    // Handle note off
    if (noteValue === 97) {
      this.releaseMacros(ch);
      this.stopChannel(ch);
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
        ch.panNode.pan.setValueAtTime((param - 128) / 128, time);
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
        this.pBreakPos = x * 10 + y; // BCD
        if (this.pBreakPos > 63) this.pBreakPos = 0;
        this.pBreakFlag = true;
        break;

      case 0xE: // Extended effects
        this.processExtendedEffect0(chIndex, ch, x, y, time);
        break;

      case 0xF: // Set speed/tempo
        if (param === 0) {
          // F00 = stop in some trackers
        } else if (param < 0x20) {
          this.speed = param;
        } else {
          this.bpm = param;
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
            this.triggerNote(ch, time, 0, chIndex, row.accent, false, false);
          }
        } else if (x === 0xC && y === this.currentTick) {
          // Note cut
          ch.volume = 0;
          ch.gainNode.gain.setValueAtTime(0, time);
        } else if (x === 0xD && y === this.currentTick) {
          // Note delay - uses the computed slide from processRow (stored in ch.previousSlideFlag context)
          // Since this is a delayed trigger of the same note, use the slide state computed at row start
          const slideActive = ch.previousSlideFlag;
          this.triggerNote(ch, time, 0, chIndex, row.accent, slideActive, row.slide ?? false);
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
            this.triggerNote(ch, time, 0, chIndex, row.accent, false, false);
          }
        }
        break;
    }
  }

  /**
   * Process a single effect on ticks 1+ (reusable for effect2 column)
   */
  private processEffectTickSingle(chIndex: number, ch: ChannelState, row: TrackerCell, effect: number, param: number, time: number): void {
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
            this.triggerNote(ch, time, 0, chIndex, row.accent, false, false);
          }
        } else if (x === 0xC && y === this.currentTick) {
          ch.volume = 0;
          ch.gainNode.gain.setValueAtTime(0, time);
        } else if (x === 0xD && y === this.currentTick) {
          const slideActive = ch.previousSlideFlag;
          this.triggerNote(ch, time, 0, chIndex, row.accent, slideActive, row.slide ?? false);
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
            this.triggerNote(ch, time, 0, chIndex, row.accent, false, false);
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

    ch.panNode.pan.setValueAtTime((ch.panning - 128) / 128, time);
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
        ch.panNode.pan.setValueAtTime((ch.panning - 128) / 128, time);
        break;

      case FurnaceMacroType.PAN_R: // Pan right
        ch.panning = Math.min(255, 128 + value * 8);
        ch.panNode.pan.setValueAtTime((ch.panning - 128) / 128, time);
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

  private triggerNote(ch: ChannelState, time: number, offset: number, channelIndex?: number, accent?: boolean, slide?: boolean, currentRowSlide?: boolean): void {
    // Skip note trigger if channel is muted
    if (channelIndex !== undefined) {
      const engine = getToneEngine();
      if (engine.isChannelMuted(channelIndex)) return;
    }

    const safeTime = time ?? Tone.now();

    // Stop the current active player at the new note's start time
    // Uses pool: old player stops, we switch to the next pooled player
    if (ch.player) {
      try {
        ch.player.stop(safeTime);
      } catch (e) {
        // Player might already be stopped
      }
    }

    // Reset macro state on note trigger
    ch.macroPos = 0;
    ch.macroReleased = false;
    ch.macroPitchOffset = 0;
    ch.macroArpNote = 0;

    if (!ch.instrument) {
      console.log('[TrackerReplayer] No instrument assigned to channel');
      return;
    }

    const engine = getToneEngine();
    const noteName = periodToNoteName(ch.period);
    const velocity = ch.volume / 64;

    // Schedule VU meter trigger at the correct audio time (not scheduling time)
    // Use Tone.Draw to sync the visual update with audio playback
    if (channelIndex !== undefined) {
      Tone.Draw.schedule(() => {
        engine.triggerChannelMeter(channelIndex, velocity);
      }, safeTime);
    }

    // Check if this is a synth instrument (has synthType) or sample-based

    if (ch.instrument.synthType && ch.instrument.synthType !== 'Sampler') {
      // Use ToneEngine for synth instruments (TB303, drums, etc.)
      // Calculate duration based on speed/BPM (one row duration as default)
      const rowDuration = (2.5 / this.bpm) * this.speed;

      // TB-303 MID-STEP GATE TIMING:
      // Real 303 lowers gate at MIDPOINT of step (not end), unless sliding to next note
      // The slide flag on CURRENT row means we slide TO the next note, so gate stays high
      // Check if this is a 303-style synth that needs mid-step gate timing
      const is303Synth = ch.instrument.synthType === 'TB303' ||
                         ch.instrument.synthType === 'Buzz3o3';

      // For 303 synths: use half duration (gate low at midpoint) unless:
      // 1. We're sliding INTO this note (slide = true, from previous row)
      // 2. This row has slide flag (currentRowSlide = true, will slide to next note)
      // When sliding, gate stays HIGH for continuous legato
      // For other synths: use full duration
      const keepGateHigh = slide || currentRowSlide;
      const noteDuration = is303Synth && !keepGateHigh
        ? rowDuration * 0.5  // Mid-step gate off for 303 (non-sliding notes)
        : rowDuration;       // Full duration for other synths or when sliding

      // Update gate state for 303 synths
      if (is303Synth) {
        ch.gateHigh = true;
      }

      engine.triggerNote(
        ch.instrument.id,
        noteName,
        noteDuration,
        safeTime,
        velocity,
        ch.instrument,
        accent, // accent
        slide, // slide (slideActive - computed from previous row, for pitch glide)
        undefined, // channelIndex (let engine allocate)
        ch.period // period for MOD playback
      );
      return;
    }

    // Sample-based playback (MOD/XM imports with embedded samples)
    // Get decoded AudioBuffer from ToneEngine (which decodes WAV to AudioBuffer during loading)
    const decodedBuffer = engine.getDecodedBuffer(ch.instrument.id);


    if (!decodedBuffer) {
      console.log('[TrackerReplayer] No decoded buffer for instrument:', ch.instrument.id, ch.instrument.name);
      return;
    }

    const sample = ch.instrument.sample;

    // Check if period is valid (non-zero)
    if (!ch.period || ch.period <= 0) {
      console.log('[TrackerReplayer] Invalid period, skipping playback:', ch.period);
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
    // that's still in 'started' state from a previously scheduled note.
    if (player.state === 'started') {
      try { player.stop(safeTime); } catch (e) {}
    }

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
    player.playbackRate = playbackRate;

    ch.player = player; // Keep reference for updatePeriod compatibility

    // Start playback - buffer is already loaded, player already connected
    try {
      const startOffset = offset > 0 ? offset / originalSampleRate : 0;
      player.start(safeTime, Math.min(startOffset, duration - 0.0001));
    } catch (e) {
      console.log('[TrackerReplayer] Playback start failed:', e);
    }
  }

  private stopChannel(ch: ChannelState): void {
    // Stop all pooled players (no disposal - they're reused)
    for (const player of ch.playerPool) {
      try {
        if (player.state === 'started') player.stop();
      } catch (e) {}
    }
    ch.player = null;
  }

  private updatePeriod(ch: ChannelState): void {
    this.updatePeriodDirect(ch, ch.period);
  }

  private updatePeriodDirect(ch: ChannelState, period: number): void {
    if (!ch.player || period === 0) return;

    const sampleRate = ch.instrument?.sample?.sampleRate || 8363;
    const frequency = AMIGA_PAL_FREQUENCY / period;
    ch.player.playbackRate = frequency / sampleRate;
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

    // Song end
    if (this.songPos >= this.song.songLength) {
      console.log(`[TrackerReplayer] Song end, restarting at position ${this.song.restartPosition}`);
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
  }

  // ==========================================================================
  // GETTERS
  // ==========================================================================

  isPlaying(): boolean { return this.playing; }
  getBPM(): number { return this.bpm; }
  getSpeed(): number { return this.speed; }
  getCurrentRow(): number { return this.pattPos; }
  getCurrentPosition(): number { return this.songPos; }
  getCurrentTick(): number { return this.currentTick; }

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  dispose(): void {
    this.stop();
    for (const ch of this.channels) {
      // Dispose all pooled players
      for (const player of ch.playerPool) {
        try { player.dispose(); } catch (e) {}
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
