/**
 * ProTrackerPlayer - 1:1 port of pt2-clone replayer
 *
 * This is a tick-based replayer that works EXACTLY like the Amiga:
 * - CIA timer fires every tick (2.5 / BPM seconds)
 * - Each tick processes effects for all channels
 * - Tick 0: read new row data, trigger notes
 * - All ticks: process continuous effects (volume slide, vibrato, etc.)
 *
 * Based on pt2-clone pt2_replayer.c
 * https://github.com/8bitbubsy/pt2-clone
 */

import * as Tone from 'tone';
import type { MODNote } from '@/lib/import/formats/MODParser';

// ============================================================================
// CONSTANTS (from pt2_replayer.c)
// ============================================================================

const AMIGA_PAL_FREQUENCY = 3546895; // Paula clock frequency (PAL)

// Period table with all 16 finetune variations (pt2_replayer.c periodTable)
// 3 octaves × 12 notes × 16 finetunes
const periodTable = [
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

// Vibrato/Tremolo waveforms (pt2_replayer.c vibratoTable)
const vibratoTable = [
  0, 24, 49, 74, 97, 120, 141, 161, 180, 197, 212, 224, 235, 244, 250, 253,
  255, 253, 250, 244, 235, 224, 212, 197, 180, 161, 141, 120, 97, 74, 49, 24
];

/**
 * Get period from note index and finetune
 * @param noteIndex Note index (0-35 for 3 octaves)
 * @param finetune Finetune value (-8 to +7)
 */
function getPeriod(noteIndex: number, finetune: number): number {
  // Convert finetune to table index (0-15)
  // Finetune 0-7 = index 0-7, finetune -8 to -1 = index 8-15
  const finetuneIndex = finetune >= 0 ? finetune : finetune + 16;
  const tableOffset = finetuneIndex * 36; // 36 notes per finetune
  return periodTable[tableOffset + Math.min(35, Math.max(0, noteIndex))];
}

/**
 * Find note index from period value
 * Returns the closest note index for the given period
 */
function periodToNoteIndex(period: number, finetune: number): number {
  const finetuneIndex = finetune >= 0 ? finetune : finetune + 16;
  const tableOffset = finetuneIndex * 36;

  // Find closest match
  for (let i = 0; i < 36; i++) {
    if (periodTable[tableOffset + i] <= period) {
      return i;
    }
  }
  return 35; // Lowest note
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * Sample data (from module)
 */
export interface PTSample {
  name: string;
  length: number;          // Length in samples
  finetune: number;        // -8 to +7
  volume: number;          // 0-64
  loopStart: number;       // Loop start in samples
  loopLength: number;      // Loop length in samples (2 = no loop)
  audioBuffer: AudioBuffer | null;
  blobUrl: string | null;
}

/**
 * Pattern cell (note + effect data)
 */
export interface PTCell {
  note: number;            // Period value (0 = no note)
  sample: number;          // Sample number (0 = no sample)
  effect: number;          // Effect command (0-15)
  param: number;           // Effect parameter (0-255)
}

/**
 * Module data
 */
export interface PTModule {
  name: string;
  samples: PTSample[];     // 31 samples (index 1-31, 0 unused)
  songLength: number;      // Number of positions in song
  restartPos: number;      // Position to restart from
  positions: number[];     // Pattern order (128 positions max)
  patterns: PTCell[][][];  // patterns[patternNum][row][channel]
  numChannels: number;     // 4 for MOD, 8-32 for XM
}

/**
 * Channel state (ported from moduleChannel_t in pt2_structs.h)
 */
interface ChannelState {
  // Note/sample state
  n_note: number;              // Current note (period)
  n_sample: number;            // Current sample number
  n_period: number;            // Current period (after effects)
  n_volume: number;            // Current volume (0-64)
  n_finetune: number;          // Current finetune

  // Sample data
  n_start: AudioBuffer | null; // Sample audio buffer
  n_length: number;            // Sample length
  n_loopstart: number;         // Loop start
  n_replen: number;            // Loop length

  // Effect memory
  n_wantedperiod: number;      // Target period for portamento
  n_toneportspeed: number;     // Tone portamento speed
  n_vibratopos: number;        // Vibrato position
  n_vibratocmd: number;        // Vibrato speed/depth
  n_tremolopos: number;        // Tremolo position
  n_tremolocmd: number;        // Tremolo speed/depth
  n_wavecontrol: number;       // Waveform control (vibrato/tremolo)
  n_glissfunk: number;         // Glissando control
  n_sampleoffset: number;      // Sample offset memory
  n_pattpos: number;           // Pattern loop position
  n_loopcount: number;         // Pattern loop count
  n_funkoffset: number;        // Funk repeat offset
  n_retrigcount: number;       // Retrigger counter

  // Arpeggio
  n_arpeggio: number;          // Arpeggio parameter
  n_arpeggioTick: number;      // Current arpeggio tick (0, 1, 2)

  // Audio nodes
  player: Tone.Player | null;
  gainNode: Tone.Gain | null;
  panNode: Tone.Panner | null;
}

// ============================================================================
// PROTRACKER REPLAYER CLASS
// ============================================================================

export class ProTrackerReplayer {
  // Module data
  private module: PTModule | null = null;

  // Playback state
  private playing = false;
  private songPos = 0;           // Current position in song
  private pattPos = 0;           // Current row in pattern
  private currentTick = 0;       // Current tick (0 to speed-1)
  private speed = 6;             // Ticks per row (Fxx < 0x20)
  private bpm = 125;             // Beats per minute (Fxx >= 0x20)

  // Pattern break/jump state
  private pBreakPos = 0;         // Pattern break position
  private pBreakFlag = false;    // Pattern break pending
  private posJumpFlag = false;   // Position jump pending
  private posJumpPos = 0;        // Position to jump to
  private patternDelay = 0;      // Pattern delay counter (EEE effect)

  // Channel states
  private channels: ChannelState[] = [];

  // Tick timer
  private tickLoop: Tone.Loop | null = null;
  private tickInterval = 0.02;   // 20ms default (125 BPM, 2.5/125)

  // Master output
  private masterGain: Tone.Gain | null = null;

  // Callbacks
  public onRowChange: ((row: number, pattern: number, position: number) => void) | null = null;
  public onSongEnd: (() => void) | null = null;

  constructor() {
    this.masterGain = new Tone.Gain(1).toDestination();
  }

  // ==========================================================================
  // MODULE LOADING
  // ==========================================================================

  /**
   * Load a module for playback
   */
  loadModule(module: PTModule): void {
    this.stop();
    this.module = module;

    // Initialize channels
    this.channels = [];
    for (let i = 0; i < module.numChannels; i++) {
      this.channels.push(this.createChannelState(i));
    }

    // Reset playback state
    this.songPos = 0;
    this.pattPos = 0;
    this.currentTick = 0;
    this.speed = 6;
    this.bpm = 125;
    this.pBreakFlag = false;
    this.posJumpFlag = false;

    console.log(`[PTReplayer] Loaded module: ${module.name}, ${module.numChannels} channels, ${module.songLength} positions`);
  }

  /**
   * Create initial channel state
   */
  private createChannelState(channelIndex: number): ChannelState {
    // Amiga panning: channels 0,3 = left, channels 1,2 = right
    const panValue = (channelIndex % 4 === 0 || channelIndex % 4 === 3) ? -0.7 : 0.7;

    const panNode = new Tone.Panner(panValue);
    const gainNode = new Tone.Gain(1);
    gainNode.connect(panNode);
    panNode.connect(this.masterGain!);

    return {
      n_note: 0,
      n_sample: 0,
      n_period: 0,
      n_volume: 0,
      n_finetune: 0,
      n_start: null,
      n_length: 0,
      n_loopstart: 0,
      n_replen: 0,
      n_wantedperiod: 0,
      n_toneportspeed: 0,
      n_vibratopos: 0,
      n_vibratocmd: 0,
      n_tremolopos: 0,
      n_tremolocmd: 0,
      n_wavecontrol: 0,
      n_glissfunk: 0,
      n_sampleoffset: 0,
      n_pattpos: 0,
      n_loopcount: 0,
      n_funkoffset: 0,
      n_retrigcount: 0,
      n_arpeggio: 0,
      n_arpeggioTick: 0,
      player: null,
      gainNode,
      panNode,
    };
  }

  // ==========================================================================
  // PLAYBACK CONTROL
  // ==========================================================================

  /**
   * Start playback
   */
  play(): void {
    if (!this.module || this.playing) return;

    this.playing = true;
    this.updateTickInterval();

    // Create tick timer (CIA timer emulation)
    this.tickLoop = new Tone.Loop((time) => {
      this.processTick(time);
    }, this.tickInterval);

    this.tickLoop.start(0);
    Tone.getTransport().start();

    console.log(`[PTReplayer] Started playback at ${this.bpm} BPM, speed ${this.speed}`);
  }

  /**
   * Stop playback
   */
  stop(): void {
    this.playing = false;

    if (this.tickLoop) {
      this.tickLoop.stop();
      this.tickLoop.dispose();
      this.tickLoop = null;
    }

    // Stop all channels
    for (const ch of this.channels) {
      this.stopChannel(ch);
    }

    // Reset position
    this.songPos = 0;
    this.pattPos = 0;
    this.currentTick = 0;

    console.log('[PTReplayer] Stopped playback');
  }

  /**
   * Pause playback
   */
  pause(): void {
    if (this.tickLoop) {
      this.tickLoop.stop();
    }
    this.playing = false;
  }

  /**
   * Resume playback
   */
  resume(): void {
    if (this.tickLoop && this.module) {
      this.tickLoop.start();
      this.playing = true;
    }
  }

  /**
   * Update tick interval based on BPM
   * Amiga formula: tickInterval = 2.5 / BPM
   */
  private updateTickInterval(): void {
    this.tickInterval = 2.5 / this.bpm;
    if (this.tickLoop) {
      this.tickLoop.interval = this.tickInterval;
    }
  }

  // ==========================================================================
  // TICK PROCESSING (pt2_replayer.c intMusic)
  // ==========================================================================

  /**
   * Process one tick (called by CIA timer)
   * This is the heart of the replayer - ported from intMusic() in pt2_replayer.c
   */
  private processTick(time: number): void {
    if (!this.module || !this.playing) return;

    // Process all channels
    for (let ch = 0; ch < this.channels.length; ch++) {
      const channel = this.channels[ch];

      if (this.currentTick === 0) {
        // Tick 0: Read new row data
        this.processNewRow(ch, channel, time);
      } else {
        // Ticks 1+: Process continuous effects
        this.processEffects(ch, channel, time);
      }
    }

    // Advance tick counter
    this.currentTick++;
    if (this.currentTick >= this.speed) {
      this.currentTick = 0;
      this.advanceRow();
    }
  }

  /**
   * Process new row data for a channel (tick 0)
   * Ported from playVoice() in pt2_replayer.c
   */
  private processNewRow(chIndex: number, ch: ChannelState, time: number): void {
    if (!this.module) return;

    const patternNum = this.module.positions[this.songPos];
    const pattern = this.module.patterns[patternNum];
    if (!pattern || !pattern[this.pattPos]) return;

    const cell = pattern[this.pattPos][chIndex];
    if (!cell) return;

    // Store effect for later processing
    const effect = cell.effect;
    const param = cell.param;

    // Sample change
    if (cell.sample > 0 && cell.sample <= this.module.samples.length) {
      const sample = this.module.samples[cell.sample];
      if (sample) {
        ch.n_sample = cell.sample;
        ch.n_finetune = sample.finetune;
        ch.n_volume = sample.volume;
        ch.n_start = sample.audioBuffer;
        ch.n_length = sample.length;
        ch.n_loopstart = sample.loopStart;
        ch.n_replen = sample.loopLength;

        // Update volume immediately
        if (ch.gainNode) {
          ch.gainNode.gain.setValueAtTime(ch.n_volume / 64, time);
        }
      }
    }

    // Note handling
    if (cell.note > 0) {
      // Check for tone portamento (effect 3 or 5)
      if (effect === 3 || effect === 5) {
        // Set portamento target, don't trigger note
        ch.n_wantedperiod = cell.note;
        if (param !== 0 && effect === 3) {
          ch.n_toneportspeed = param;
        }
      } else {
        // Trigger new note
        ch.n_note = cell.note;
        ch.n_period = cell.note;

        // Handle sample offset (effect 9)
        let offset = 0;
        if (effect === 9) {
          offset = param > 0 ? param * 256 : ch.n_sampleoffset * 256;
          ch.n_sampleoffset = param > 0 ? param : ch.n_sampleoffset;
        }

        // Trigger the note
        this.triggerNote(ch, time, offset);

        // Reset vibrato position (unless waveform control says otherwise)
        if ((ch.n_wavecontrol & 0x04) === 0) {
          ch.n_vibratopos = 0;
        }
        if ((ch.n_wavecontrol & 0x40) === 0) {
          ch.n_tremolopos = 0;
        }
      }
    }

    // Process tick 0 effects
    this.processEffect0(chIndex, ch, effect, param, time);
  }

  /**
   * Process tick 0 effects (only execute on tick 0)
   */
  private processEffect0(chIndex: number, ch: ChannelState, effect: number, param: number, time: number): void {
    const x = (param >> 4) & 0x0F;
    const y = param & 0x0F;

    switch (effect) {
      case 0x0: // Arpeggio
        if (param !== 0) {
          ch.n_arpeggio = param;
          ch.n_arpeggioTick = 0;
        }
        break;

      case 0x3: // Tone portamento
        if (param !== 0) ch.n_toneportspeed = param;
        break;

      case 0x4: // Vibrato
        if (x !== 0) ch.n_vibratocmd = (ch.n_vibratocmd & 0x0F) | (x << 4);
        if (y !== 0) ch.n_vibratocmd = (ch.n_vibratocmd & 0xF0) | y;
        break;

      case 0x5: // Tone portamento + volume slide
        if (param !== 0) ch.n_toneportspeed = param;
        break;

      case 0x6: // Vibrato + volume slide
        // Just set up vibrato, volume slide happens on other ticks
        break;

      case 0x7: // Tremolo
        if (x !== 0) ch.n_tremolocmd = (ch.n_tremolocmd & 0x0F) | (x << 4);
        if (y !== 0) ch.n_tremolocmd = (ch.n_tremolocmd & 0xF0) | y;
        break;

      case 0x8: // Set panning (not in original PT, but common extension)
        if (ch.panNode) {
          ch.panNode.pan.setValueAtTime((param - 128) / 128, time);
        }
        break;

      case 0x9: // Sample offset - handled in note processing
        if (param !== 0) ch.n_sampleoffset = param;
        break;

      case 0xA: // Volume slide - handled on other ticks
        break;

      case 0xB: // Position jump
        this.posJumpPos = param;
        this.posJumpFlag = true;
        this.pBreakFlag = true;
        break;

      case 0xC: // Set volume
        ch.n_volume = Math.min(64, param);
        if (ch.gainNode) {
          ch.gainNode.gain.setValueAtTime(ch.n_volume / 64, time);
        }
        break;

      case 0xD: // Pattern break
        this.pBreakPos = x * 10 + y; // BCD conversion
        if (this.pBreakPos > 63) this.pBreakPos = 0;
        this.pBreakFlag = true;
        break;

      case 0xE: // Extended effects
        this.processExtendedEffect(chIndex, ch, x, y, time);
        break;

      case 0xF: // Set speed/tempo
        if (param === 0) {
          // F00 = stop (some trackers)
        } else if (param < 0x20) {
          this.speed = param;
        } else {
          this.bpm = param;
          this.updateTickInterval();
        }
        break;
    }
  }

  /**
   * Process extended effects (Exy)
   */
  private processExtendedEffect(_chIndex: number, ch: ChannelState, x: number, y: number, time: number): void {
    switch (x) {
      case 0x0: // Set filter (Amiga LED filter)
        // Not implemented - no hardware filter
        break;

      case 0x1: // Fine portamento up
        ch.n_period = Math.max(1, ch.n_period - y);
        this.updatePeriod(ch, time);
        break;

      case 0x2: // Fine portamento down
        ch.n_period = Math.min(32000, ch.n_period + y);
        this.updatePeriod(ch, time);
        break;

      case 0x3: // Glissando control
        ch.n_glissfunk = y;
        break;

      case 0x4: // Vibrato waveform
        ch.n_wavecontrol = (ch.n_wavecontrol & 0xF0) | (y & 0x0F);
        break;

      case 0x5: // Set finetune
        ch.n_finetune = y > 7 ? y - 16 : y; // Convert to signed
        break;

      case 0x6: // Pattern loop
        if (y === 0) {
          ch.n_pattpos = this.pattPos;
        } else {
          if (ch.n_loopcount === 0) {
            ch.n_loopcount = y;
          } else {
            ch.n_loopcount--;
          }
          if (ch.n_loopcount !== 0) {
            this.pBreakPos = ch.n_pattpos;
            this.pBreakFlag = true;
          }
        }
        break;

      case 0x7: // Tremolo waveform
        ch.n_wavecontrol = (ch.n_wavecontrol & 0x0F) | ((y & 0x0F) << 4);
        break;

      case 0x8: // Unused (or set panning in some trackers)
        break;

      case 0x9: // Retrigger note
        ch.n_retrigcount = y;
        break;

      case 0xA: // Fine volume slide up
        ch.n_volume = Math.min(64, ch.n_volume + y);
        if (ch.gainNode) {
          ch.gainNode.gain.setValueAtTime(ch.n_volume / 64, time);
        }
        break;

      case 0xB: // Fine volume slide down
        ch.n_volume = Math.max(0, ch.n_volume - y);
        if (ch.gainNode) {
          ch.gainNode.gain.setValueAtTime(ch.n_volume / 64, time);
        }
        break;

      case 0xC: // Note cut
        // Handled on tick y
        break;

      case 0xD: // Note delay
        // Handled on tick y
        break;

      case 0xE: // Pattern delay
        // Set pattern delay - each row repeats (y + 1) times
        // Only set if not already in a delay
        if (this.patternDelay === 0) {
          this.patternDelay = y;
        }
        break;

      case 0xF: // Invert loop (Funk repeat)
        ch.n_funkoffset = y;
        break;
    }
  }

  /**
   * Process continuous effects (ticks 1+)
   * Ported from checkMoreEffects() in pt2_replayer.c
   */
  private processEffects(chIndex: number, ch: ChannelState, time: number): void {
    if (!this.module) return;

    const patternNum = this.module.positions[this.songPos];
    const pattern = this.module.patterns[patternNum];
    if (!pattern || !pattern[this.pattPos]) return;

    const cell = pattern[this.pattPos][chIndex];
    if (!cell) return;

    const effect = cell.effect;
    const param = cell.param;
    const x = (param >> 4) & 0x0F;
    const y = param & 0x0F;

    switch (effect) {
      case 0x0: // Arpeggio
        if (param !== 0) {
          this.doArpeggio(ch, param, time);
        }
        break;

      case 0x1: // Portamento up
        ch.n_period = Math.max(1, ch.n_period - param);
        this.updatePeriod(ch, time);
        break;

      case 0x2: // Portamento down
        ch.n_period = Math.min(32000, ch.n_period + param);
        this.updatePeriod(ch, time);
        break;

      case 0x3: // Tone portamento
        this.doTonePortamento(ch, time);
        break;

      case 0x4: // Vibrato
        this.doVibrato(ch, time);
        break;

      case 0x5: // Tone portamento + volume slide
        this.doTonePortamento(ch, time);
        this.doVolumeSlide(ch, param, time);
        break;

      case 0x6: // Vibrato + volume slide
        this.doVibrato(ch, time);
        this.doVolumeSlide(ch, param, time);
        break;

      case 0x7: // Tremolo
        this.doTremolo(ch, time);
        break;

      case 0xA: // Volume slide
        this.doVolumeSlide(ch, param, time);
        break;

      case 0xE: // Extended effects
        // Handle tick-based extended effects
        if (x === 0x9 && y > 0) {
          // E9x: Retrigger
          ch.n_retrigcount--;
          if (ch.n_retrigcount <= 0) {
            ch.n_retrigcount = y;
            this.triggerNote(ch, time, 0);
          }
        } else if (x === 0xC && y === this.currentTick) {
          // ECx: Note cut
          ch.n_volume = 0;
          if (ch.gainNode) {
            ch.gainNode.gain.setValueAtTime(0, time);
          }
        } else if (x === 0xD && y === this.currentTick) {
          // EDx: Note delay
          // Trigger the note that was delayed
          if (ch.n_note > 0) {
            this.triggerNote(ch, time, 0);
          }
        }
        break;
    }
  }

  // ==========================================================================
  // EFFECT IMPLEMENTATIONS
  // ==========================================================================

  /**
   * Arpeggio effect (0xy)
   */
  private doArpeggio(ch: ChannelState, param: number, time: number): void {
    const x = (param >> 4) & 0x0F;
    const y = param & 0x0F;

    let period = ch.n_note;

    // Cycle through base note, +x semitones, +y semitones
    const arpeggioTick = this.currentTick % 3;
    if (arpeggioTick === 1) {
      period = this.periodPlusSemitones(ch.n_note, x, ch.n_finetune);
    } else if (arpeggioTick === 2) {
      period = this.periodPlusSemitones(ch.n_note, y, ch.n_finetune);
    }

    ch.n_period = period;
    this.updatePeriod(ch, time);
  }

  /**
   * Convert period + semitones to new period (using finetune table)
   */
  private periodPlusSemitones(period: number, semitones: number, finetune: number = 0): number {
    const noteIndex = periodToNoteIndex(period, finetune);
    const newIndex = Math.min(35, Math.max(0, noteIndex + semitones));
    return getPeriod(newIndex, finetune);
  }

  /**
   * Tone portamento effect (3xx)
   */
  private doTonePortamento(ch: ChannelState, time: number): void {
    if (ch.n_wantedperiod === 0 || ch.n_period === ch.n_wantedperiod) return;

    if (ch.n_period < ch.n_wantedperiod) {
      ch.n_period += ch.n_toneportspeed;
      if (ch.n_period > ch.n_wantedperiod) {
        ch.n_period = ch.n_wantedperiod;
      }
    } else {
      ch.n_period -= ch.n_toneportspeed;
      if (ch.n_period < ch.n_wantedperiod) {
        ch.n_period = ch.n_wantedperiod;
      }
    }

    this.updatePeriod(ch, time);
  }

  /**
   * Vibrato effect (4xy)
   */
  private doVibrato(ch: ChannelState, time: number): void {
    const speed = (ch.n_vibratocmd >> 4) & 0x0F;
    const depth = ch.n_vibratocmd & 0x0F;

    // Get vibrato value from waveform
    const waveform = ch.n_wavecontrol & 0x03;
    let vibratoValue: number;

    if (waveform === 0) {
      // Sine wave
      vibratoValue = vibratoTable[ch.n_vibratopos & 31];
    } else if (waveform === 1) {
      // Ramp down
      vibratoValue = (ch.n_vibratopos & 31) * 8;
      if (ch.n_vibratopos >= 32) vibratoValue = 255 - vibratoValue;
    } else {
      // Square wave
      vibratoValue = 255;
    }

    // Apply vibrato
    let periodDelta = (vibratoValue * depth) >> 7;
    if (ch.n_vibratopos >= 32) periodDelta = -periodDelta;

    const newPeriod = ch.n_period + periodDelta;
    this.updatePeriodDirect(ch, newPeriod, time);

    // Advance position
    ch.n_vibratopos = (ch.n_vibratopos + speed) & 63;
  }

  /**
   * Tremolo effect (7xy)
   */
  private doTremolo(ch: ChannelState, time: number): void {
    const speed = (ch.n_tremolocmd >> 4) & 0x0F;
    const depth = ch.n_tremolocmd & 0x0F;

    // Get tremolo value from waveform
    const waveform = (ch.n_wavecontrol >> 4) & 0x03;
    let tremoloValue: number;

    if (waveform === 0) {
      // Sine wave
      tremoloValue = vibratoTable[ch.n_tremolopos & 31];
    } else if (waveform === 1) {
      // Ramp down
      tremoloValue = (ch.n_tremolopos & 31) * 8;
      if (ch.n_tremolopos >= 32) tremoloValue = 255 - tremoloValue;
    } else {
      // Square wave
      tremoloValue = 255;
    }

    // Apply tremolo
    let volumeDelta = (tremoloValue * depth) >> 6;
    if (ch.n_tremolopos >= 32) volumeDelta = -volumeDelta;

    let newVolume = ch.n_volume + volumeDelta;
    newVolume = Math.max(0, Math.min(64, newVolume));

    if (ch.gainNode) {
      ch.gainNode.gain.setValueAtTime(newVolume / 64, time);
    }

    // Advance position
    ch.n_tremolopos = (ch.n_tremolopos + speed) & 63;
  }

  /**
   * Volume slide effect (Axy)
   */
  private doVolumeSlide(ch: ChannelState, param: number, time: number): void {
    const x = (param >> 4) & 0x0F;
    const y = param & 0x0F;

    // x = slide up, y = slide down (x takes priority if both set)
    if (x > 0) {
      ch.n_volume = Math.min(64, ch.n_volume + x);
    } else if (y > 0) {
      ch.n_volume = Math.max(0, ch.n_volume - y);
    }

    if (ch.gainNode) {
      ch.gainNode.gain.setValueAtTime(ch.n_volume / 64, time);
    }
  }

  // ==========================================================================
  // VOICE CONTROL
  // ==========================================================================

  /**
   * Trigger a note on a channel
   */
  private triggerNote(ch: ChannelState, time: number, offset: number): void {
    // Stop previous note
    this.stopChannel(ch);

    if (!ch.n_start) return;

    // Get sample info
    const sample = this.module?.samples[ch.n_sample];
    if (!sample || !sample.blobUrl) return;

    // Calculate playback rate from period
    const frequency = AMIGA_PAL_FREQUENCY / ch.n_period;
    const sampleRate = ch.n_start.sampleRate || 8363;
    const playbackRate = frequency / sampleRate;

    // Create player
    const hasLoop = ch.n_replen > 2;

    const player = new Tone.Player({
      url: sample.blobUrl,
      loop: hasLoop,
      loopStart: hasLoop ? ch.n_loopstart / sampleRate : 0,
      loopEnd: hasLoop ? (ch.n_loopstart + ch.n_replen) / sampleRate : 0,
      playbackRate: playbackRate,
    });

    // Connect to channel's gain node
    player.connect(ch.gainNode!);

    ch.player = player;

    // Wait for buffer to load then start
    // Tone.Player.loaded is a Promise when using URL, boolean when using AudioBuffer
    const loadPromise = player.loaded;
    if (loadPromise && typeof loadPromise === 'object' && 'then' in loadPromise) {
      (loadPromise as Promise<void>).then(() => {
        if (ch.player === player && this.playing) {
          const startOffset = offset > 0 ? offset / sampleRate : 0;
          player.start(time, startOffset);
        }
      });
    } else if (player.buffer && player.buffer.loaded) {
      // Already loaded
      const startOffset = offset > 0 ? offset / sampleRate : 0;
      player.start(time, startOffset);
    }
  }

  /**
   * Stop a channel
   */
  private stopChannel(ch: ChannelState): void {
    if (ch.player) {
      try {
        if (ch.player.state === 'started') {
          ch.player.stop();
        }
        ch.player.dispose();
      } catch (e) {
        // Ignore disposal errors
      }
      ch.player = null;
    }
  }

  /**
   * Update period (playback rate) for a channel
   */
  private updatePeriod(ch: ChannelState, time: number): void {
    this.updatePeriodDirect(ch, ch.n_period, time);
  }

  /**
   * Update period with direct value (for vibrato etc)
   */
  private updatePeriodDirect(ch: ChannelState, period: number, _time: number): void {
    if (!ch.player || period === 0) return;

    const frequency = AMIGA_PAL_FREQUENCY / period;
    const sampleRate = ch.n_start?.sampleRate || 8363;
    const playbackRate = frequency / sampleRate;

    (ch.player as any).playbackRate = playbackRate;
  }

  // ==========================================================================
  // ROW/POSITION ADVANCEMENT
  // ==========================================================================

  /**
   * Advance to next row
   */
  private advanceRow(): void {
    if (!this.module) return;

    // Handle pattern delay (EEE effect) - repeat current row
    if (this.patternDelay > 0) {
      this.patternDelay--;
      return; // Stay on current row
    }

    // Handle pattern break
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

    // Handle position jump
    if (this.posJumpFlag) {
      this.songPos = this.posJumpPos;
      this.posJumpFlag = false;
      this.posJumpPos = 0;
    }

    // Check for pattern end
    if (this.pattPos >= 64) {
      this.pattPos = 0;
      this.songPos++;
    }

    // Check for song end
    if (this.songPos >= this.module.songLength) {
      if (this.module.restartPos < this.module.songLength) {
        this.songPos = this.module.restartPos;
      } else {
        this.songPos = 0;
      }

      if (this.onSongEnd) {
        this.onSongEnd();
      }
    }

    // Notify row change
    if (this.onRowChange) {
      const patternNum = this.module.positions[this.songPos];
      this.onRowChange(this.pattPos, patternNum, this.songPos);
    }
  }

  // ==========================================================================
  // GETTERS
  // ==========================================================================

  isPlaying(): boolean {
    return this.playing;
  }

  getCurrentPosition(): { songPos: number; pattPos: number; tick: number } {
    return {
      songPos: this.songPos,
      pattPos: this.pattPos,
      tick: this.currentTick,
    };
  }

  getBPM(): number {
    return this.bpm;
  }

  getSpeed(): number {
    return this.speed;
  }

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  dispose(): void {
    this.stop();

    for (const ch of this.channels) {
      if (ch.gainNode) ch.gainNode.dispose();
      if (ch.panNode) ch.panNode.dispose();
    }

    if (this.masterGain) {
      this.masterGain.dispose();
      this.masterGain = null;
    }

    this.channels = [];
    this.module = null;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: ProTrackerReplayer | null = null;

export function getProTrackerReplayer(): ProTrackerReplayer {
  if (!instance) {
    instance = new ProTrackerReplayer();
  }
  return instance;
}

export function disposeProTrackerReplayer(): void {
  if (instance) {
    instance.dispose();
    instance = null;
  }
}

// ============================================================================
// CONVERTER - Bridge existing MOD parser to PTModule format
// ============================================================================

// Note: MODNote type is imported at top of file

/**
 * Convert parsed MOD data to PTModule format for the replayer
 */
export function convertToPTModule(
  title: string,
  patterns: MODNote[][][],
  samples: Array<{
    name: string;
    length: number;
    finetune: number;
    volume: number;
    loopStart: number;
    loopLength: number;
    audioBuffer: AudioBuffer | null;
    blobUrl: string | null;
  }>,
  songLength: number,
  restartPos: number,
  positions: number[],
  numChannels: number
): PTModule {
  // Convert samples to PTSample format
  const ptSamples: PTSample[] = [
    // Index 0 is unused (samples are 1-indexed)
    { name: '', length: 0, finetune: 0, volume: 0, loopStart: 0, loopLength: 0, audioBuffer: null, blobUrl: null }
  ];

  for (const sample of samples) {
    ptSamples.push({
      name: sample.name,
      length: sample.length,
      finetune: sample.finetune,
      volume: sample.volume,
      loopStart: sample.loopStart,
      loopLength: sample.loopLength,
      audioBuffer: sample.audioBuffer,
      blobUrl: sample.blobUrl,
    });
  }

  // Convert patterns to PTCell format
  const ptPatterns: PTCell[][][] = [];

  for (const pattern of patterns) {
    const ptPattern: PTCell[][] = [];

    for (const row of pattern) {
      const ptRow: PTCell[] = [];

      for (const note of row) {
        ptRow.push({
          note: note.period,      // Period value
          sample: note.instrument,
          effect: note.effect,
          param: note.effectParam,
        });
      }

      ptPattern.push(ptRow);
    }

    ptPatterns.push(ptPattern);
  }

  return {
    name: title,
    samples: ptSamples,
    songLength,
    restartPos,
    positions,
    patterns: ptPatterns,
    numChannels,
  };
}
