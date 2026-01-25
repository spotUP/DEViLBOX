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
import type { Pattern } from '@/types';
import type { InstrumentConfig, ChiptuneModuleConfig } from '@/types/instrument';
import { getToneEngine } from './ToneEngine';
import { ChiptuneInstrument } from './ChiptuneInstrument';

// ============================================================================
// CONSTANTS
// ============================================================================


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
  // Channel index (for ToneEngine)
  channelIndex: number;

  // Note state
  note: number;                  // Current note (period for MOD, note number for XM)
  period: number;                // Current period (after effects)
  volume: number;                // Current volume (0-64)
  panning: number;               // Current panning (0-255, 128=center)
  xmNote: number;                // XM note number (for non-period-based playback)

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
  patternLoopRow: number;        // Pattern loop start row
  patternLoopCount: number;      // Pattern loop counter

  // TB-303 specific
  accent: boolean;
  slide: boolean;

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
  // Original module data for libopenmpt playback (sample-accurate effects)
  originalModuleData?: {
    base64: string;
    format: 'MOD' | 'XM' | 'IT' | 'S3M' | 'UNKNOWN';
    sourceFile?: string;
  };
}

// ============================================================================
// TRACKER REPLAYER
// ============================================================================

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

  // Pattern break/jump
  private pBreakPos = 0;
  private pBreakFlag = false;
  private posJumpFlag = false;
  private posJumpPos = 0;
  private patternDelay = 0;      // EEx pattern delay

  // Channels
  private channels: ChannelState[] = [];

  // Instrument lookup map for O(1) access (built from song.instruments)
  private instrumentMap: Map<number, InstrumentConfig> = new Map();

  // Tick timer
  private tickLoop: Tone.Loop | null = null;

  // Libopenmpt playback mode for sample-accurate module playback
  private useLibopenmpt = false;
  private chiptuneInstrument: ChiptuneInstrument | null = null;

  // Callbacks
  public onRowChange: ((row: number, pattern: number, position: number) => void) | null = null;
  public onSongEnd: (() => void) | null = null;
  public onTickProcess: ((tick: number, row: number) => void) | null = null;

  constructor() {
    // ToneEngine manages all audio routing
  }

  // ==========================================================================
  // VOLUME/PANNING HELPERS
  // ==========================================================================

  private setChannelVolume(ch: ChannelState): void {
    const engine = getToneEngine();
    // Convert 0-64 to dB (-Infinity to 0)
    const volumeDb = ch.volume > 0 ? -60 + (ch.volume / 64) * 60 : -Infinity;
    engine.setChannelVolume(ch.channelIndex, volumeDb);
  }

  private setChannelPanning(ch: ChannelState): void {
    const engine = getToneEngine();
    // Convert 0-255 (128=center) to -1 to 1
    const pan = (ch.panning - 128) / 128;
    engine.setChannelPan(ch.channelIndex, pan * 100); // ToneEngine uses -100 to 100
  }

  // ==========================================================================
  // SONG LOADING
  // ==========================================================================

  loadSong(song: TrackerSong): void {
    this.stop();
    this.song = song;

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

    // Build instrument lookup map for O(1) access during playback
    this.instrumentMap.clear();
    for (const inst of song.instruments) {
      this.instrumentMap.set(inst.id, inst);
    }

    // Pre-load all sample buffers
    this.preloadSamples(song.instruments);

  }

  private sampleBufferCache: Map<string, Tone.ToneAudioBuffer> = new Map();

  private preloadSamples(instruments: InstrumentConfig[]): void {
    const urls: string[] = [];
    for (const inst of instruments) {
      if (inst.sample?.url && !this.sampleBufferCache.has(inst.sample.url)) {
        urls.push(inst.sample.url);
      }
    }

    if (urls.length > 0) {
      urls.forEach(url => {
        const buffer = new Tone.ToneAudioBuffer(url, () => {
        });
        this.sampleBufferCache.set(url, buffer);
      });
    }
  }

  private createChannel(index: number, _totalChannels: number): ChannelState {
    return {
      channelIndex: index,
      note: 0,
      period: 0,
      volume: 64,
      panning: 128,
      xmNote: 0,
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
      patternLoopRow: 0,
      patternLoopCount: 0,
      accent: false,
      slide: false,
      instrument: null,
    };
  }

  // ==========================================================================
  // PLAYBACK CONTROL
  // ==========================================================================

  private tickEventId: number | null = null;

  async play(): Promise<void> {
    if (!this.song || this.playing) return;

    await Tone.start();

    // Check if we should use libopenmpt for sample-accurate playback
    if (this.useLibopenmpt && this.song.originalModuleData?.base64) {
      console.log('[TrackerReplayer] Using libopenmpt for sample-accurate playback');
      await this.playWithLibopenmpt();
      return;
    }

    // Native Tone.js-based playback
    this.playing = true;

    // CRITICAL: Reset transport to time 0 before starting
    // This ensures scheduled events start correctly
    const transport = Tone.getTransport();
    transport.cancel(); // Clear any pending events
    transport.position = 0; // Reset to time 0

    // Use Transport.scheduleRepeat for more reliable timing
    const tickInterval = 2.5 / this.bpm;
    this.tickEventId = transport.scheduleRepeat((time) => {
      this.processTick(time);
    }, tickInterval, 0);

    console.log('[TrackerReplayer] Starting playback:', {
      speed: this.speed,
      bpm: this.bpm,
      tickInterval,
      songLength: this.song.songLength,
      numPatterns: this.song.patterns.length,
    });

    transport.start();

  }

  /**
   * Play using libopenmpt for sample-accurate module playback
   */
  private async playWithLibopenmpt(): Promise<void> {
    if (!this.song?.originalModuleData) return;

    const config: ChiptuneModuleConfig = {
      moduleData: this.song.originalModuleData.base64,
      format: this.song.originalModuleData.format,
      sourceFile: this.song.originalModuleData.sourceFile,
      useLibopenmpt: true,
      repeatCount: 0,
      stereoSeparation: 100,
      interpolationFilter: 0,
    };

    // Dispose previous instance if exists (defensive)
    if (this.chiptuneInstrument) {
      this.chiptuneInstrument.dispose();
      this.chiptuneInstrument = null;
    }

    // Create ChiptuneInstrument with callbacks for position tracking
    this.chiptuneInstrument = new ChiptuneInstrument(config, {
      onProgress: (data) => {
        // Update position tracking
        this.songPos = data.order;
        this.pattPos = data.row;
        if (this.onRowChange) {
          this.onRowChange(data.row, data.pattern, data.order);
        }
      },
      onEnded: () => {
        this.playing = false;
        if (this.onSongEnd) {
          this.onSongEnd();
        }
      },
      onError: (error) => {
        console.error('[TrackerReplayer] libopenmpt error:', error);
        this.playing = false;
      },
    });

    // Connect to destination
    this.chiptuneInstrument.toDestination();

    // play() will wait for initialization internally
    this.playing = true;
    await this.chiptuneInstrument.play();
  }

  stop(): void {
    this.playing = false;

    // Stop libopenmpt playback if active
    if (this.chiptuneInstrument) {
      this.chiptuneInstrument.stop();
      this.chiptuneInstrument.dispose();
      this.chiptuneInstrument = null;
    }

    // Clear tick event
    if (this.tickEventId !== null) {
      Tone.getTransport().clear(this.tickEventId);
      this.tickEventId = null;
    }

    if (this.tickLoop) {
      this.tickLoop.stop();
      this.tickLoop.dispose();
      this.tickLoop = null;
    }

    // Cancel ALL scheduled transport events (prevents lingering scheduled notes)
    Tone.getTransport().cancel();
    Tone.getTransport().stop();

    // Stop all channels individually (for proper release envelopes)
    for (const ch of this.channels) {
      this.stopChannel(ch);
    }

    // CRITICAL: Force-release ALL sounds immediately via ToneEngine
    // This catches any notes that weren't properly tracked or have long release times
    const engine = getToneEngine();
    engine.releaseAll();

    // Clear note tracking
    this.lastNotePerChannel.clear();

    // Reset position
    this.songPos = 0;
    this.pattPos = 0;
    this.currentTick = 0;

  }

  pause(): void {
    Tone.getTransport().pause();
    this.playing = false;
  }

  resume(): void {
    if (this.song) {
      Tone.getTransport().start();
      this.playing = true;
    }
  }

  private updateTickInterval(): void {
    // For Tone.Loop (legacy)
    if (this.tickLoop) {
      this.tickLoop.interval = 2.5 / this.bpm;
    }

    // For scheduleRepeat - need to reschedule with new interval
    if (this.tickEventId !== null && this.playing) {
      const transport = Tone.getTransport();
      transport.clear(this.tickEventId);
      const tickInterval = 2.5 / this.bpm;
      this.tickEventId = transport.scheduleRepeat((time) => {
        this.processTick(time);
      }, tickInterval, transport.seconds);
    }
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

    // Get current pattern
    const patternNum = this.song.songPositions[this.songPos];
    if (patternNum === undefined) {
      console.error('[TrackerReplayer] Invalid songPos:', this.songPos, 'songPositions:', this.song.songPositions);
      this.stop();
      return;
    }
    const pattern = this.song.patterns[patternNum];
    if (!pattern) {
      console.error('[TrackerReplayer] Pattern not found:', patternNum);
      this.stop();
      return;
    }

    // Log row changes (only on tick 0 to reduce spam)
    if (this.currentTick === 0) {
      console.log('[TrackerReplayer] Row:', this.pattPos, '/', pattern.length, 'Pattern:', patternNum, 'Pos:', this.songPos, '/', this.song.songLength);
    }

    const engine = getToneEngine();

    // Process all channels
    for (let ch = 0; ch < this.channels.length; ch++) {
      const channel = this.channels[ch];
      const patternChannel = pattern.channels[ch];
      const row = patternChannel?.rows[this.pattPos];
      if (!row) continue;

      // Check ToneEngine for real-time mute state (handles solo logic too)
      // This allows mute/solo to work during playback
      if (engine.isChannelMuted(ch)) {
        continue;
      }

      if (this.currentTick === 0) {
        // Tick 0: Read new row data
        this.processRow(ch, channel, row, time);
      } else {
        // Ticks 1+: Process continuous effects
        this.processEffectTick(ch, channel, row, time);
      }
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

  // ==========================================================================
  // ROW PROCESSING (TICK 0)
  // ==========================================================================

  private processRow(chIndex: number, ch: ChannelState, row: any, time: number): void {
    if (!this.song) return;

    // Get effect info (XM format: effTyp/eff, or string format: effect2)
    const effectStr = row.effect2 && row.effect2 !== '...' ? row.effect2 : null;
    const effect = row.effTyp ?? (effectStr ? parseInt(effectStr[0], 16) : 0);
    const param = row.eff ?? (effectStr ? parseInt(effectStr.substring(1), 16) : 0);

    // Handle TB-303 accent/slide columns
    ch.accent = row.accent ?? false;
    ch.slide = row.slide ?? false;

    // Handle instrument change (O(1) lookup from pre-built map)
    const instNum = row.instrument ?? 0;
    if (instNum > 0) {
      const instrument = this.instrumentMap.get(instNum);
      if (instrument) {
        ch.instrument = instrument;
        ch.sampleNum = instNum;
        // Use sample's default volume if available, otherwise full volume
        ch.volume = instrument.metadata?.modPlayback?.defaultVolume ?? 64;
        ch.finetune = instrument.metadata?.modPlayback?.finetune ?? 0;
      }
    }

    // Store XM note for non-period-based instruments
    if (typeof row.note === 'number' && row.note > 0 && row.note < 97) {
      ch.xmNote = row.note;
    }

    // Handle note
    const noteValue = row.note;
    // Use raw period from MOD data if available (more accurate than converting from note)
    const rawPeriod = row.period;

    // Debug: log row data on first few rows of first pattern
    if (this.pattPos < 5 && chIndex === 0) {
      console.log('[TrackerReplayer] Row data ch0:', { note: noteValue, period: rawPeriod, inst: row.instrument });
    }

    if (noteValue && noteValue !== 0 && noteValue !== '...' && noteValue !== '===') {
      // Check for tone portamento (3xx or 5xx) - don't trigger, just set target
      if (effect === 3 || effect === 5) {
        // Use raw period if available, otherwise convert from note
        ch.portaTarget = rawPeriod > 0 ? rawPeriod : this.noteToPeriod(noteValue, ch.finetune);
        if (param !== 0 && effect === 3) {
          ch.tonePortaSpeed = param;
        }
      } else {
        // Normal note - trigger
        // IMPORTANT: Use raw period from MOD data if available for accurate playback
        if (rawPeriod > 0) {
          ch.note = rawPeriod;
          ch.period = rawPeriod;
          console.log('[TrackerReplayer] Using raw period:', rawPeriod, 'for note:', noteValue);
        } else {
          ch.note = this.noteToPeriod(noteValue, ch.finetune);
          ch.period = ch.note;
          console.log('[TrackerReplayer] Converted note to period:', ch.period, 'from note:', noteValue);
        }

        // Handle sample offset (9xx)
        let offset = 0;
        if (effect === 9) {
          offset = param > 0 ? param * 256 : ch.sampleOffset * 256;
          ch.sampleOffset = param > 0 ? param : ch.sampleOffset;
        }

        // Trigger the note
        this.triggerNote(ch, time, offset);

        // Reset vibrato/tremolo positions
        if ((ch.waveControl & 0x04) === 0) ch.vibratoPos = 0;
        if ((ch.waveControl & 0x40) === 0) ch.tremoloPos = 0;
      }
    }

    // Handle note off
    if (noteValue === 97 || noteValue === '===') {
      this.stopChannel(ch, time);
    }

    // Handle volume column (XM)
    if (row.volume !== undefined && row.volume >= 0x10 && row.volume <= 0x50) {
      ch.volume = row.volume - 0x10;
      this.setChannelVolume(ch);
    }

    // Process tick-0 effects
    this.processEffect0(chIndex, ch, effect, param, time);
  }

  // ==========================================================================
  // EFFECT PROCESSING (TICK 0)
  // ==========================================================================

  private processEffect0(chIndex: number, ch: ChannelState, effect: number, param: number, time: number): void {
    const x = (param >> 4) & 0x0F;
    const y = param & 0x0F;

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
        this.setChannelPanning(ch);
        break;

      case 0x9: // Sample offset - handled in note processing
        if (param !== 0) ch.sampleOffset = param;
        break;

      case 0xA: // Volume slide - nothing on tick 0
        break;

      case 0xB: // Position jump
        console.log('[TrackerReplayer] Effect Bxx (position jump) at row', this.pattPos, '-> pos', param);
        this.posJumpPos = param;
        this.posJumpFlag = true;
        this.pBreakFlag = true;
        break;

      case 0xC: // Set volume
        ch.volume = Math.min(64, param);
        this.setChannelVolume(ch);
        break;

      case 0xD: // Pattern break
        console.log('[TrackerReplayer] Effect Dxx (pattern break) at row', this.pattPos, '-> row', x * 10 + y);
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
          this.updateTickInterval();
        }
        break;
    }
  }

  private processExtendedEffect0(_chIndex: number, ch: ChannelState, x: number, y: number, _time: number): void {
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
        this.setChannelVolume(ch);
        break;

      case 0xB: // Fine volume down
        ch.volume = Math.max(0, ch.volume - y);
        this.setChannelVolume(ch);
        break;

      case 0xE: // Pattern delay
        this.patternDelay = y * this.speed;
        break;
    }
  }

  // ==========================================================================
  // EFFECT PROCESSING (TICKS 1+)
  // ==========================================================================

  private processEffectTick(_chIndex: number, ch: ChannelState, row: any, time: number): void {
    const effectStr = row.effect2 && row.effect2 !== '...' ? row.effect2 : null;
    const effect = row.effTyp ?? (effectStr ? parseInt(effectStr[0], 16) : 0);
    const param = row.eff ?? (effectStr ? parseInt(effectStr.substring(1), 16) : 0);
    const x = (param >> 4) & 0x0F;
    const y = param & 0x0F;

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
          // Retrigger
          ch.retrigCount--;
          if (ch.retrigCount <= 0) {
            ch.retrigCount = y;
            this.triggerNote(ch, time, 0);
          }
        } else if (x === 0xC && y === this.currentTick) {
          // Note cut
          ch.volume = 0;
          this.stopChannel(ch, time);
        } else if (x === 0xD && y === this.currentTick) {
          // Note delay
          this.triggerNote(ch, time, 0);
        }
        break;
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

  private doTremolo(ch: ChannelState, _time: number): void {
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

    // Tremolo temporarily modifies volume without changing ch.volume
    const newVol = Math.max(0, Math.min(64, ch.volume + delta));
    const engine = getToneEngine();
    engine.setChannelVolume(ch.channelIndex, -60 + (newVol / 64) * 60);

    ch.tremoloPos = (ch.tremoloPos + speed) & 63;
  }

  private doVolumeSlide(ch: ChannelState, param: number, _time: number): void {
    const x = (param >> 4) & 0x0F;
    const y = param & 0x0F;

    if (x > 0) {
      ch.volume = Math.min(64, ch.volume + x);
    } else if (y > 0) {
      ch.volume = Math.max(0, ch.volume - y);
    }

    this.setChannelVolume(ch);
  }

  // ==========================================================================
  // VOICE CONTROL (via ToneEngine)
  // ==========================================================================

  // Track last note per channel for explicit note-off
  private lastNotePerChannel: Map<number, string> = new Map();

  private triggerNote(ch: ChannelState, time: number, _offset: number): void {
    if (!ch.instrument) {
      console.warn('[TrackerReplayer] triggerNote: No instrument for channel', ch.channelIndex);
      return;
    }

    const engine = getToneEngine();
    const config = ch.instrument;

    // Convert to note string - prefer XM note number for accuracy with synths
    let noteStr: string;
    if (ch.xmNote > 0 && ch.xmNote < 97) {
      // XM note number: 1 = C-0, 13 = C-1, 25 = C-2, etc.
      noteStr = this.xmNoteToString(ch.xmNote);
    } else if (ch.period > 0) {
      // Fallback to period conversion for MOD files
      noteStr = this.periodToNoteString(ch.period, ch.finetune);
    } else {
      noteStr = 'C4'; // Default (Tone.js format - no dash!)
    }

    // Use velocity based on channel volume (0-64 -> 0-1)
    const velocity = ch.volume / 64;


    // For TB-303 with slide, call triggerNoteAttack with slide flag
    // TB303Engine.triggerAttack handles sliding: it ramps frequency instead of retriggering
    if (config.synthType === 'TB303' && ch.slide) {
      engine.triggerNoteAttack(
        config.id,
        noteStr,
        time,
        velocity,
        config,
        ch.period,
        ch.accent,
        ch.slide, // slide flag tells TB303Engine to do portamento
        ch.channelIndex
      );
      this.lastNotePerChannel.set(ch.channelIndex, noteStr);
      engine.triggerChannelMeter(ch.channelIndex, velocity);
      return;
    }

    // Calculate row duration for one-shot sounds
    const tickDuration = 2.5 / this.bpm;
    const rowDuration = tickDuration * this.speed;

    // Determine if this is a one-shot (drums) or sustained (synths) instrument
    const isOneShot = ['MembraneSynth', 'NoiseSynth', 'MetalSynth', 'PluckSynth'].includes(config.synthType || '');

    if (isOneShot) {
      // One-shot drums: use triggerNote with appropriate duration
      let duration = rowDuration * 2;
      if (config.synthType === 'MembraneSynth') duration = rowDuration * 4;
      if (config.synthType === 'MetalSynth') duration = rowDuration * 3;

      engine.triggerNote(
        config.id,
        noteStr,
        duration,
        time,  // Use scheduled time for precise timing
        velocity,
        config,
        ch.accent,
        ch.slide,
        ch.channelIndex,
        ch.period,
        0
      );
    } else {
      // Sustained synths (TB303, Synth, etc.): use triggerAttack
      // Notes sustain until next note or explicit release
      // Pass channelIndex for slide/accent support on non-TB303 synths
      engine.triggerNoteAttack(
        config.id,
        noteStr,
        time,  // Use scheduled time for precise timing
        velocity,
        config,
        ch.period,
        ch.accent,
        ch.slide,
        ch.channelIndex
      );
    }

    // Track this note for explicit note-off commands only
    this.lastNotePerChannel.set(ch.channelIndex, noteStr);

    // Trigger VU meter for visual feedback
    engine.triggerChannelMeter(ch.channelIndex, velocity);
  }

  /**
   * Convert XM note number to note string
   * XM: 1 = C-0, 13 = C-1, 25 = C-2, 37 = C-3, 49 = C-4, etc.
   * Note: Tone.js expects "C4" format (no dash), not "C-4" (dash would be parsed as negative octave!)
   */
  private xmNoteToString(xmNote: number): string {
    if (xmNote <= 0 || xmNote >= 97) return 'C4';

    // Tone.js format: no dashes for natural notes (C4, D4, E4 - NOT C-4, D-4, E-4)
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const noteIndex = (xmNote - 1) % 12;
    const octave = Math.floor((xmNote - 1) / 12);

    return `${noteNames[noteIndex]}${octave}`;
  }

  private stopChannel(ch: ChannelState, time?: number): void {
    if (!ch.instrument) return;

    const engine = getToneEngine();
    // Use tracked note if available, otherwise derive from period
    const noteStr = this.lastNotePerChannel.get(ch.channelIndex)
      || this.periodToNoteString(ch.period, ch.finetune);
    engine.triggerNoteRelease(ch.instrument.id, noteStr, time ?? Tone.now(), ch.instrument);
    this.lastNotePerChannel.delete(ch.channelIndex);
  }

  private updatePeriod(ch: ChannelState): void {
    this.updatePeriodDirect(ch, ch.period);
  }

  private updatePeriodDirect(ch: ChannelState, period: number): void {
    // Real-time period changes for vibrato/portamento
    // Convert Amiga period to frequency and update via ToneEngine
    if (period <= 0 || !ch.instrument) return;

    const engine = getToneEngine();

    // Calculate frequency from Amiga period
    // Formula: frequency = AMIGA_PAL_FREQUENCY / (period * 2)
    // AMIGA_PAL_FREQUENCY = 3546895 Hz (Paula clock)
    const AMIGA_PAL_FREQUENCY = 3546895;
    const frequency = AMIGA_PAL_FREQUENCY / (period * 2);

    // Update channel frequency via ToneEngine
    engine.setChannelFrequency(ch.channelIndex, frequency);
  }

  /**
   * Convert period to note string (e.g., "C4", "F#3")
   * Note: Tone.js expects "C4" format (no dash), not "C-4" (dash would be parsed as negative octave!)
   */
  private periodToNoteString(period: number, finetune: number): string {
    if (period === 0) return 'C4';

    // Find closest note in period table
    const ftIndex = finetune >= 0 ? finetune : finetune + 16;
    const offset = ftIndex * 36;

    let closestIndex = 0;
    let closestDiff = Math.abs(PERIOD_TABLE[offset] - period);

    for (let i = 1; i < 36; i++) {
      const diff = Math.abs(PERIOD_TABLE[offset + i] - period);
      if (diff < closestDiff) {
        closestDiff = diff;
        closestIndex = i;
      }
    }

    // Tone.js format: no dashes for natural notes (C4, D4, E4 - NOT C-4, D-4, E-4)
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(closestIndex / 12) + 1;
    const noteInOctave = closestIndex % 12;

    return `${noteNames[noteInOctave]}${octave}`;
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private noteToPeriod(note: any, finetune: number): number {
    if (typeof note === 'number' && note > 0 && note < 97) {
      // XM note number to period
      const noteIndex = note - 1 - 12; // Adjust for octave offset
      if (noteIndex >= 0 && noteIndex < 36) {
        return this.getPeriod(noteIndex, finetune);
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

    const prevPos = this.songPos;
    const prevRow = this.pattPos;

    // Pattern break
    if (this.pBreakFlag) {
      console.log('[TrackerReplayer] Pattern break:', {
        from: { pos: prevPos, row: prevRow },
        breakPos: this.pBreakPos,
        posJumpFlag: this.posJumpFlag,
        posJumpPos: this.posJumpPos,
      });
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
      console.log('[TrackerReplayer] Position jump:', {
        from: prevPos,
        to: this.posJumpPos,
      });
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
      console.log('[TrackerReplayer] Pattern end, advancing to pos:', this.songPos);
    }

    // Song end
    if (this.songPos >= this.song.songLength) {
      console.log('[TrackerReplayer] Song end, restarting at:', this.song.restartPosition);
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
  // LIBOPENMPT PLAYBACK MODE
  // ==========================================================================

  /**
   * Enable or disable libopenmpt playback mode
   * When enabled, uses libopenmpt WASM for sample-accurate module playback
   * This provides authentic vibrato, portamento, and effects that Tone.js can't handle
   */
  setUseLibopenmpt(enable: boolean): void {
    this.useLibopenmpt = enable;
  }

  /**
   * Check if libopenmpt mode is enabled
   */
  getUseLibopenmpt(): boolean {
    return this.useLibopenmpt;
  }

  /**
   * Check if current song has original module data for libopenmpt playback
   */
  hasOriginalModuleData(): boolean {
    return !!this.song?.originalModuleData?.base64;
  }

  /**
   * Get the current playback mode description
   */
  getPlaybackMode(): 'native' | 'libopenmpt' {
    return this.useLibopenmpt && this.hasOriginalModuleData() ? 'libopenmpt' : 'native';
  }

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  dispose(): void {
    this.stop();
    this.channels = [];
    this.song = null;
    this.sampleBufferCache.clear();
    if (this.chiptuneInstrument) {
      this.chiptuneInstrument.dispose();
      this.chiptuneInstrument = null;
    }
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
