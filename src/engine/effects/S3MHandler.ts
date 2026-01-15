/**
 * S3MHandler - ScreamTracker 3 (S3M) Effect Handler
 *
 * Implements ScreamTracker 3 effect commands with S3M-specific command letters:
 * S3M uses different effect letters than MOD/XM (e.g., A=Speed, T=Tempo, D=VolSlide)
 *
 * Command mapping:
 * A = Set Speed (ticks per row)
 * B = Position Jump
 * C = Pattern Break
 * D = Volume Slide
 * E = Portamento Down
 * F = Portamento Up
 * G = Tone Portamento
 * H = Vibrato
 * I = Tremor
 * J = Arpeggio
 * K = Vibrato + Volume Slide
 * L = Tone Porta + Volume Slide
 * M = Set Channel Volume (not in original S3M)
 * N = Channel Volume Slide (not in original S3M)
 * O = Sample Offset
 * P = Panning Slide (not in original S3M)
 * Q = Retrigger + Volume Slide
 * R = Tremolo
 * S = Special Commands (Sxy)
 * T = Set Tempo (BPM)
 * U = Fine Vibrato
 * V = Set Global Volume
 * W = Global Volume Slide (not in original S3M)
 * X = Set Panning
 * Y = Panbrello (not in original S3M)
 * Z = MIDI Macros (not implemented)
 */

import { type ChannelState, type TickResult, type FormatConfig } from './types';
import { BaseFormatHandler } from './FormatHandler';
import {
  periodToFrequency,
  noteStringToPeriod,
} from './PeriodTables';

// S3M command letter to number mapping
const S3M_COMMANDS: Record<string, number> = {
  'A': 0x01, // Set Speed
  'B': 0x02, // Position Jump
  'C': 0x03, // Pattern Break
  'D': 0x04, // Volume Slide
  'E': 0x05, // Portamento Down
  'F': 0x06, // Portamento Up
  'G': 0x07, // Tone Portamento
  'H': 0x08, // Vibrato
  'I': 0x09, // Tremor
  'J': 0x0A, // Arpeggio
  'K': 0x0B, // Vibrato + Volume Slide
  'L': 0x0C, // Tone Porta + Volume Slide
  'M': 0x0D, // Set Channel Volume
  'N': 0x0E, // Channel Volume Slide
  'O': 0x0F, // Sample Offset
  'P': 0x10, // Panning Slide
  'Q': 0x11, // Retrig + Volume Slide
  'R': 0x12, // Tremolo
  'S': 0x13, // Special Commands
  'T': 0x14, // Set Tempo
  'U': 0x15, // Fine Vibrato
  'V': 0x16, // Set Global Volume
  'W': 0x17, // Global Volume Slide
  'X': 0x18, // Set Panning
  'Y': 0x19, // Panbrello
  'Z': 0x1A, // MIDI Macro
};

// S3M S-commands (Sxy)
const S3M_S_COMMANDS = {
  GLISSANDO: 0x1,        // S1x - Glissando control
  FINETUNE: 0x2,         // S2x - Set finetune
  VIBRATO_WAVEFORM: 0x3, // S3x - Set vibrato waveform
  TREMOLO_WAVEFORM: 0x4, // S4x - Set tremolo waveform
  PANBRELLO_WAVEFORM: 0x5, // S5x - Set panbrello waveform
  DELAY_PATTERN: 0x6,    // S6x - Fine pattern delay (ticks)
  PAST_NOTE_ACTION: 0x7, // S7x - Past note actions (IT style)
  PANNING: 0x8,          // S8x - Set panning (coarse)
  SOUND_CONTROL: 0x9,    // S9x - Sound control
  HIGH_OFFSET: 0xA,      // SAx - High offset
  PATTERN_LOOP: 0xB,     // SBx - Pattern loop
  NOTE_CUT: 0xC,         // SCx - Note cut
  NOTE_DELAY: 0xD,       // SDx - Note delay
  PATTERN_DELAY: 0xE,    // SEx - Pattern delay (rows)
  ACTIVE_MACRO: 0xF,     // SFx - Active macro
};

/**
 * ScreamTracker 3 effect handler
 */
export class S3MHandler extends BaseFormatHandler {
  readonly format = 'S3M' as const;

  // S3M-specific settings (reserved for future format-specific features)
  public stereo: boolean = true;
  public customPan: boolean = false;

  // Active effects per channel
  private activeEffects: Map<number, {
    type: string;
    param: number;
    x: number;
    y: number;
  }> = new Map();

  // Pattern loop state
  private patternLoopRow: Map<number, number> = new Map();
  private patternLoopCount: Map<number, number> = new Map();
  public patternDelayCount: number = 0; // Used for SEx pattern delay effect

  // Sample offset high byte (SAx command)
  private highOffset: Map<number, number> = new Map();

  /**
   * Initialize with format config
   */
  init(config: FormatConfig): void {
    super.init(config);
    this.activeEffects.clear();
    this.patternLoopRow.clear();
    this.patternLoopCount.clear();
    this.highOffset.clear();
    this.patternDelayCount = 0;
  }

  /**
   * Reset all state
   */
  resetAll(): void {
    super.resetAll();
    this.activeEffects.clear();
    this.patternLoopRow.clear();
    this.patternLoopCount.clear();
    this.highOffset.clear();
    this.patternDelayCount = 0;
  }

  /**
   * Parse S3M effect (letter + 2 hex digits)
   */
  protected parseS3MEffect(effect: string | null): {
    command: number;
    letter: string;
    x: number;
    y: number;
    param: number;
  } | null {
    if (!effect || effect === '...' || effect.length < 3) return null;

    const letter = effect[0].toUpperCase();
    const command = S3M_COMMANDS[letter];
    if (!command) return null;

    const x = parseInt(effect[1], 16);
    const y = parseInt(effect[2], 16);

    if (isNaN(x) || isNaN(y)) return null;

    return { command, letter, x, y, param: x * 16 + y };
  }

  /**
   * Convert note string to S3M period
   */
  private noteToS3MPeriod(note: string, finetune: number = 0): number {
    if (!note || note === '...' || note === '---') return 0;
    if (note === '===' || note === '^^^') return -1;

    // S3M uses standard Amiga periods but with different octave range
    return noteStringToPeriod(note, finetune);
  }

  /**
   * Process effect at row start (tick 0)
   */
  processRowStart(
    channel: number,
    note: string | null,
    instrument: number | null,
    volume: number | null,
    effect: string | null,
    state: ChannelState
  ): TickResult {
    const result: TickResult = {};

    // Clear active effect
    this.activeEffects.delete(channel);

    // Handle instrument
    if (instrument !== null && instrument > 0) {
      state.instrumentId = instrument;
    }

    // Handle volume column (S3M has separate volume column)
    if (volume !== null && volume <= 64) {
      state.volume = volume;
      result.setVolume = volume;
    }

    // Handle note
    if (note && note !== '...' && note !== '---') {
      if (note === '===' || note === '^^^' || note === '..^') {
        // Note off/cut
        result.cutNote = true;
        state.noteOn = false;
      } else {
        const period = this.noteToS3MPeriod(note, state.finetune);
        if (period > 0) {
          // Check for tone portamento
          const parsed = this.parseS3MEffect(effect);
          if (parsed && (parsed.letter === 'G' || parsed.letter === 'L')) {
            state.portamentoTarget = period;
          } else {
            state.period = period;
            state.frequency = periodToFrequency(period);
            state.noteOn = true;
            result.triggerNote = true;
            result.setPeriod = period;
            result.setFrequency = state.frequency;

            if (state.vibratoRetrigger) state.vibratoPos = 0;
            if (state.tremoloRetrigger) state.tremoloPos = 0;
          }
        }
      }
    }

    // Process effect
    if (effect) {
      const effectResult = this.processEffectTick0(channel, effect, state, note);
      Object.assign(result, effectResult);
    }

    return result;
  }

  /**
   * Process effect on tick 0
   */
  private processEffectTick0(
    channel: number,
    effect: string,
    state: ChannelState,
    note: string | null
  ): TickResult {
    const result: TickResult = {};
    const parsed = this.parseS3MEffect(effect);
    if (!parsed) return result;

    const { letter, x, y, param } = parsed;

    switch (letter) {
      case 'A': // Set Speed
        if (param > 0) {
          this.speed = param;
          result.setSpeed = param;
        }
        break;

      case 'B': // Position Jump
        result.positionJump = param;
        break;

      case 'C': // Pattern Break
        result.patternBreak = x * 10 + y; // BCD format
        break;

      case 'D': // Volume Slide
        if (param > 0) state.lastVolumeSlide = param;
        // Check for fine slides (D0x = fine down, Dx0 = fine up, DxF/DFx = fine)
        if (x === 0x0F && y > 0) {
          // Fine slide down
          state.volume = this.clampVolume(state.volume - y);
          result.setVolume = state.volume;
        } else if (y === 0x0F && x > 0) {
          // Fine slide up
          state.volume = this.clampVolume(state.volume + x);
          result.setVolume = state.volume;
        } else {
          this.activeEffects.set(channel, { type: 'volumeSlide', param, x, y });
        }
        break;

      case 'E': // Portamento Down
        if (param > 0) state.lastPortaDown = param;
        // Check for fine/extra fine
        if (x === 0x0F) {
          // Fine porta down
          if (state.period > 0) {
            state.period += y * 4;
            state.frequency = periodToFrequency(state.period);
            result.setPeriod = state.period;
            result.setFrequency = state.frequency;
          }
        } else if (x === 0x0E) {
          // Extra fine porta down
          if (state.period > 0) {
            state.period += y;
            state.frequency = periodToFrequency(state.period);
            result.setPeriod = state.period;
            result.setFrequency = state.frequency;
          }
        } else {
          this.activeEffects.set(channel, { type: 'portaDown', param: state.lastPortaDown, x, y });
        }
        break;

      case 'F': // Portamento Up
        if (param > 0) state.lastPortaUp = param;
        // Check for fine/extra fine
        if (x === 0x0F) {
          // Fine porta up
          if (state.period > 0) {
            state.period -= y * 4;
            if (state.period < 1) state.period = 1;
            state.frequency = periodToFrequency(state.period);
            result.setPeriod = state.period;
            result.setFrequency = state.frequency;
          }
        } else if (x === 0x0E) {
          // Extra fine porta up
          if (state.period > 0) {
            state.period -= y;
            if (state.period < 1) state.period = 1;
            state.frequency = periodToFrequency(state.period);
            result.setPeriod = state.period;
            result.setFrequency = state.frequency;
          }
        } else {
          this.activeEffects.set(channel, { type: 'portaUp', param: state.lastPortaUp, x, y });
        }
        break;

      case 'G': // Tone Portamento
        if (param > 0) state.lastTonePortaSpeed = param;
        this.activeEffects.set(channel, { type: 'tonePorta', param: state.lastTonePortaSpeed, x, y });
        break;

      case 'H': // Vibrato
        if (x > 0) state.lastVibratoSpeed = x;
        if (y > 0) state.lastVibratoDepth = y;
        state.vibratoSpeed = state.lastVibratoSpeed;
        state.vibratoDepth = state.lastVibratoDepth;
        this.activeEffects.set(channel, { type: 'vibrato', param, x, y });
        break;

      case 'I': // Tremor
        if (x > 0) state.tremorOnTime = x;
        if (y > 0) state.tremorOffTime = y;
        this.activeEffects.set(channel, { type: 'tremor', param, x, y });
        break;

      case 'J': // Arpeggio
        if (param !== 0) {
          state.lastArpeggio = param;
          this.activeEffects.set(channel, { type: 'arpeggio', param, x, y });
        }
        break;

      case 'K': // Vibrato + Volume Slide
        this.activeEffects.set(channel, { type: 'vibratoVolSlide', param, x, y });
        break;

      case 'L': // Tone Porta + Volume Slide
        this.activeEffects.set(channel, { type: 'tonePortaVolSlide', param, x, y });
        break;

      case 'O': { // Sample Offset
        if (param > 0) state.lastSampleOffset = param;
        const highByte = this.highOffset.get(channel) ?? 0;
        result.sampleOffset = (highByte * 65536) + (state.lastSampleOffset * 256);
        break;
      }

      case 'Q': // Retrig + Volume Slide
        if (y > 0) state.retrigTick = y;
        if (x >= 0) state.retrigVolChange = x;
        this.activeEffects.set(channel, { type: 'retrig', param, x, y });
        break;

      case 'R': // Tremolo
        if (x > 0) state.lastTremoloSpeed = x;
        if (y > 0) state.lastTremoloDepth = y;
        state.tremoloSpeed = state.lastTremoloSpeed;
        state.tremoloDepth = state.lastTremoloDepth;
        this.activeEffects.set(channel, { type: 'tremolo', param, x, y });
        break;

      case 'S': // Special Commands
        this.processSCommand(channel, x, y, state, note, result);
        break;

      case 'T': // Set Tempo
        if (param >= 0x20) {
          this.tempo = param;
          result.setBPM = param;
        } else if (param > 0) {
          // Tempo slide (T0x = slide down, T1x = slide up)
          this.activeEffects.set(channel, { type: 'tempoSlide', param, x, y });
        }
        break;

      case 'U': // Fine Vibrato
        if (x > 0) state.lastVibratoSpeed = x;
        if (y > 0) state.lastVibratoDepth = y;
        state.vibratoSpeed = state.lastVibratoSpeed;
        state.vibratoDepth = state.lastVibratoDepth;
        this.activeEffects.set(channel, { type: 'fineVibrato', param, x, y });
        break;

      case 'V': // Set Global Volume
        this.globalVolume = Math.min(param, 64);
        result.setGlobalVolume = this.globalVolume;
        break;

      case 'W': // Global Volume Slide
        this.activeEffects.set(channel, { type: 'globalVolSlide', param, x, y });
        break;

      case 'X': // Set Panning
        // S3M panning: 0-128 = left to right, 164 = surround
        if (param <= 128) {
          state.pan = Math.floor(param * 2);
          result.setPan = state.pan;
        }
        break;
    }

    return result;
  }

  /**
   * Process S-commands (Sxy)
   */
  private processSCommand(
    channel: number,
    x: number,
    y: number,
    state: ChannelState,
    note: string | null,
    result: TickResult
  ): void {
    switch (x) {
      case S3M_S_COMMANDS.GLISSANDO:
        // Not implemented
        break;

      case S3M_S_COMMANDS.FINETUNE:
        state.finetune = y > 7 ? y - 16 : y;
        break;

      case S3M_S_COMMANDS.VIBRATO_WAVEFORM:
        state.vibratoWaveform = this.waveformFromNumber(y & 3);
        state.vibratoRetrigger = (y & 4) === 0;
        break;

      case S3M_S_COMMANDS.TREMOLO_WAVEFORM:
        state.tremoloWaveform = this.waveformFromNumber(y & 3);
        state.tremoloRetrigger = (y & 4) === 0;
        break;

      case S3M_S_COMMANDS.PANNING:
        state.pan = y * 17;
        result.setPan = state.pan;
        break;

      case S3M_S_COMMANDS.HIGH_OFFSET:
        this.highOffset.set(channel, y);
        break;

      case S3M_S_COMMANDS.PATTERN_LOOP:
        if (y === 0) {
          this.patternLoopRow.set(channel, this.currentRow);
        } else {
          const count = this.patternLoopCount.get(channel) ?? 0;
          if (count === 0) {
            this.patternLoopCount.set(channel, y);
          } else {
            this.patternLoopCount.set(channel, count - 1);
          }
          if ((this.patternLoopCount.get(channel) ?? 0) > 0) {
            result.patternLoop = {
              startRow: this.patternLoopRow.get(channel) ?? 0,
              count: this.patternLoopCount.get(channel) ?? 0,
            };
          }
        }
        break;

      case S3M_S_COMMANDS.NOTE_CUT:
        state.noteCutTick = y;
        this.activeEffects.set(channel, { type: 'noteCut', param: y, x: 0, y });
        break;

      case S3M_S_COMMANDS.NOTE_DELAY:
        if (y > 0 && note) {
          state.noteDelayTick = y;
          this.activeEffects.set(channel, { type: 'noteDelay', param: y, x: 0, y });
        }
        break;

      case S3M_S_COMMANDS.PATTERN_DELAY:
        if (y > 0) {
          this.patternDelayCount = y;
          result.patternDelay = y;
        }
        break;
    }
  }

  /**
   * Process effect on ticks 1+
   */
  processTick(
    channel: number,
    tick: number,
    state: ChannelState
  ): TickResult {
    const result: TickResult = {};
    const activeEffect = this.activeEffects.get(channel);

    if (!activeEffect) return result;

    const { type, param, x, y } = activeEffect;

    switch (type) {
      case 'arpeggio':
        this.processArpeggio(tick, state, x, y, result);
        break;

      case 'portaUp':
        this.processPortaUp(state, param, result);
        break;

      case 'portaDown':
        this.processPortaDown(state, param, result);
        break;

      case 'tonePorta':
        this.processTonePorta(state, param, result);
        break;

      case 'vibrato':
        this.processVibrato(state, false, result);
        break;

      case 'fineVibrato':
        this.processVibrato(state, true, result);
        break;

      case 'vibratoVolSlide':
        this.processVibrato(state, false, result);
        this.processVolumeSlide(state, x, y, result);
        break;

      case 'tonePortaVolSlide':
        this.processTonePorta(state, state.lastTonePortaSpeed, result);
        this.processVolumeSlide(state, x, y, result);
        break;

      case 'tremolo':
        this.processTremolo(state, result);
        break;

      case 'tremor':
        this.processTremor(state, result);
        break;

      case 'volumeSlide':
        this.processVolumeSlide(state, x, y, result);
        break;

      case 'globalVolSlide':
        if (x > 0) {
          this.globalVolume = Math.min(64, this.globalVolume + x);
        } else if (y > 0) {
          this.globalVolume = Math.max(0, this.globalVolume - y);
        }
        result.setGlobalVolume = this.globalVolume;
        break;

      case 'retrig':
        if (y > 0 && tick % y === 0) {
          result.triggerNote = true;
          // Apply S3M retrig volume operations
          if (x > 0) {
            state.volume = this.applyRetrigVolume(state.volume, x);
            result.setVolume = state.volume;
          }
        }
        break;

      case 'tempoSlide':
        if (x === 0 && y > 0) {
          this.tempo = Math.max(32, this.tempo - y);
          result.setBPM = this.tempo;
        } else if (x === 1 && y > 0) {
          this.tempo = Math.min(255, this.tempo + y);
          result.setBPM = this.tempo;
        }
        break;

      case 'noteCut':
        if (tick === param) {
          state.volume = 0;
          result.setVolume = 0;
          result.cutNote = true;
        }
        break;

      case 'noteDelay':
        if (tick === param) {
          result.triggerNote = true;
        }
        break;
    }

    return result;
  }

  /**
   * Apply S3M retrig volume modification
   */
  private applyRetrigVolume(volume: number, mode: number): number {
    switch (mode) {
      case 0x1: return volume - 1;
      case 0x2: return volume - 2;
      case 0x3: return volume - 4;
      case 0x4: return volume - 8;
      case 0x5: return volume - 16;
      case 0x6: return Math.floor(volume * 2 / 3);
      case 0x7: return Math.floor(volume / 2);
      case 0x8: return volume; // No change
      case 0x9: return volume + 1;
      case 0xA: return volume + 2;
      case 0xB: return volume + 4;
      case 0xC: return volume + 8;
      case 0xD: return volume + 16;
      case 0xE: return Math.floor(volume * 3 / 2);
      case 0xF: return volume * 2;
      default: return volume;
    }
  }

  /**
   * Process arpeggio
   */
  private processArpeggio(
    tick: number,
    state: ChannelState,
    x: number,
    y: number,
    result: TickResult
  ): void {
    if (state.period <= 0) return;

    const offsets = [0, x, y];
    const offset = offsets[tick % 3];

    if (offset === 0) {
      result.setPeriod = state.period;
    } else {
      const baseFreq = periodToFrequency(state.period);
      const newFreq = baseFreq * Math.pow(2, offset / 12);
      result.setFrequency = newFreq;
    }
  }

  /**
   * Process portamento up
   */
  private processPortaUp(state: ChannelState, speed: number, result: TickResult): void {
    if (state.period <= 0) return;

    state.period -= speed * 4;
    if (state.period < 1) state.period = 1;

    state.frequency = periodToFrequency(state.period);
    result.setPeriod = state.period;
    result.setFrequency = state.frequency;
  }

  /**
   * Process portamento down
   */
  private processPortaDown(state: ChannelState, speed: number, result: TickResult): void {
    if (state.period <= 0) return;

    state.period += speed * 4;
    state.frequency = periodToFrequency(state.period);
    result.setPeriod = state.period;
    result.setFrequency = state.frequency;
  }

  /**
   * Process tone portamento
   */
  private processTonePorta(state: ChannelState, speed: number, result: TickResult): void {
    if (state.period <= 0 || state.portamentoTarget <= 0) return;

    const slideSpeed = speed * 4;

    if (state.period < state.portamentoTarget) {
      state.period += slideSpeed;
      if (state.period > state.portamentoTarget) {
        state.period = state.portamentoTarget;
      }
    } else if (state.period > state.portamentoTarget) {
      state.period -= slideSpeed;
      if (state.period < state.portamentoTarget) {
        state.period = state.portamentoTarget;
      }
    }

    state.frequency = periodToFrequency(state.period);
    result.setPeriod = state.period;
    result.setFrequency = state.frequency;
  }

  /**
   * Process vibrato
   */
  private processVibrato(state: ChannelState, fine: boolean, result: TickResult): void {
    if (state.period <= 0) return;

    const waveValue = this.getWaveformValue(state.vibratoWaveform, state.vibratoPos);
    const depth = fine ? state.vibratoDepth : state.vibratoDepth * 4;
    const delta = Math.floor(waveValue * depth);

    const newPeriod = state.period + delta;
    result.setPeriod = newPeriod;
    result.setFrequency = periodToFrequency(newPeriod);

    state.vibratoPos = (state.vibratoPos + state.vibratoSpeed) & 0x3F;
  }

  /**
   * Process tremolo
   */
  private processTremolo(state: ChannelState, result: TickResult): void {
    const waveValue = this.getWaveformValue(state.tremoloWaveform, state.tremoloPos);
    const delta = Math.floor(waveValue * state.tremoloDepth);
    const newVolume = this.clampVolume(state.volume + delta);

    result.setVolume = newVolume;
    state.tremoloPos = (state.tremoloPos + state.tremoloSpeed) & 0x3F;
  }

  /**
   * Process tremor
   */
  private processTremor(state: ChannelState, result: TickResult): void {
    const cycle = state.tremorOnTime + state.tremorOffTime;
    state.tremorPos = (state.tremorPos + 1) % cycle;

    if (state.tremorPos < state.tremorOnTime) {
      result.setVolume = state.volume;
    } else {
      result.setVolume = 0;
    }
  }

  /**
   * Process volume slide
   */
  private processVolumeSlide(state: ChannelState, up: number, down: number, result: TickResult): void {
    // S3M volume slide: if both set, up takes priority
    if (up > 0) {
      state.volume = this.clampVolume(state.volume + up);
    } else if (down > 0) {
      state.volume = this.clampVolume(state.volume - down);
    }
    result.setVolume = state.volume;
  }
}
