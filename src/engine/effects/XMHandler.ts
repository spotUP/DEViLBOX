/**
 * XMHandler - FastTracker II (XM) Effect Handler
 *
 * Implements all FastTracker II effect commands:
 * - Main effects (0-F) with XM-specific behavior
 * - Volume column effects (16 types)
 * - Extended effects (Gxx, Hxy, Kxx, Lxx, Pxy, Rxy, Txy, X1x, X2x)
 * - Linear frequency slides (optional Amiga compatibility)
 */

import { type ChannelState, type TickResult, type FormatConfig, RETRIG_VOLUME_OPS } from './types';
import { BaseFormatHandler } from './FormatHandler';
import {
  periodToFrequency,
  noteStringToPeriod,
  xmLinearPeriodToFrequency,
  XM_LINEAR_PERIOD_BASE,
} from './PeriodTables';

// XM Effect constants (same as MOD, plus extensions)
const XM_EFFECTS = {
  ARPEGGIO: 0x0,
  PORTA_UP: 0x1,
  PORTA_DOWN: 0x2,
  TONE_PORTA: 0x3,
  VIBRATO: 0x4,
  TONE_PORTA_VOL_SLIDE: 0x5,
  VIBRATO_VOL_SLIDE: 0x6,
  TREMOLO: 0x7,
  SET_PANNING: 0x8,
  SAMPLE_OFFSET: 0x9,
  VOLUME_SLIDE: 0xA,
  POSITION_JUMP: 0xB,
  SET_VOLUME: 0xC,
  PATTERN_BREAK: 0xD,
  E_COMMANDS: 0xE,
  SET_SPEED: 0xF,
  // Extended commands (use letter codes)
  GLOBAL_VOLUME: 0x10,      // Gxx
  GLOBAL_VOL_SLIDE: 0x11,   // Hxy
  KEY_OFF: 0x14,            // Kxx
  SET_ENV_POS: 0x15,        // Lxx
  PAN_SLIDE: 0x19,          // Pxy
  MULTI_RETRIG: 0x1B,       // Rxy
  TREMOR: 0x1D,             // Txy
  EXTRA_FINE_PORTA: 0x21,   // X1x/X2x
};

// XM E-commands (same as MOD)
const XM_E_COMMANDS = {
  FILTER: 0x0,
  FINE_PORTA_UP: 0x1,
  FINE_PORTA_DOWN: 0x2,
  GLISSANDO: 0x3,
  VIBRATO_WAVEFORM: 0x4,
  FINETUNE: 0x5,
  PATTERN_LOOP: 0x6,
  TREMOLO_WAVEFORM: 0x7,
  PANNING: 0x8,
  RETRIG: 0x9,
  FINE_VOL_UP: 0xA,
  FINE_VOL_DOWN: 0xB,
  NOTE_CUT: 0xC,
  NOTE_DELAY: 0xD,
  PATTERN_DELAY: 0xE,
  // EFx is unused in XM
};

// Volume column effect types (upper nibble of volume value)
const XM_VOL_EFFECTS = {
  NONE: 0x0,          // 00-0F: No effect
  SET_VOLUME: 0x1,    // 10-50: Set volume 0-64
  VOL_SLIDE_DOWN: 0x6,// 60-6F: Volume slide down
  VOL_SLIDE_UP: 0x7,  // 70-7F: Volume slide up
  FINE_VOL_DOWN: 0x8, // 80-8F: Fine volume slide down
  FINE_VOL_UP: 0x9,   // 90-9F: Fine volume slide up
  VIBRATO_SPEED: 0xA, // A0-AF: Set vibrato speed
  VIBRATO: 0xB,       // B0-BF: Vibrato
  SET_PAN: 0xC,       // C0-CF: Set panning
  PAN_SLIDE_LEFT: 0xD,// D0-DF: Pan slide left
  PAN_SLIDE_RIGHT: 0xE,// E0-EF: Pan slide right
  TONE_PORTA: 0xF,    // F0-FF: Tone portamento
};

/**
 * FastTracker II effect handler
 */
export class XMHandler extends BaseFormatHandler {
  readonly format = 'XM' as const;

  // XM-specific settings
  private linearSlides: boolean = true;
  private minPeriod: number = 1;
  private maxPeriod: number = 32000;

  // Active effects per channel
  private activeEffects: Map<number, {
    type: string;
    param: number;
    x: number;
    y: number;
  }> = new Map();

  // Volume column state per channel
  private volumeColumnData: Map<number, number> = new Map();

  // Pattern loop state
  private patternLoopRow: Map<number, number> = new Map(); // Per-channel in XM
  private patternLoopCount: Map<number, number> = new Map();
  public patternDelayCount: number = 0; // Used for EEx pattern delay effect

  /**
   * Initialize with format config
   */
  init(config: FormatConfig): void {
    super.init(config);
    this.linearSlides = config.linearSlides ?? true;
    this.activeEffects.clear();
    this.volumeColumnData.clear();
    this.patternLoopRow.clear();
    this.patternLoopCount.clear();
    this.patternDelayCount = 0;
  }

  /**
   * Reset all state
   */
  resetAll(): void {
    super.resetAll();
    this.activeEffects.clear();
    this.volumeColumnData.clear();
    this.patternLoopRow.clear();
    this.patternLoopCount.clear();
    this.patternDelayCount = 0;
  }

  /**
   * Convert note string to XM period
   */
  private noteToXMPeriod(note: string, finetune: number = 0): number {
    if (!note || note === '...' || note === '---') return 0;
    if (note === '===' || note === '^^^') return -1;

    // Parse note
    const match = note.match(/^([A-G][#-]?)[-]?(\d)$/i);
    if (!match) return 0;

    const noteNames = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
    const noteName = match[1].toUpperCase().replace('#', '#').replace('-', '-');
    const octave = parseInt(match[2], 10);

    const noteIndex = noteNames.findIndex(n => n === noteName || n.replace('-', '') === noteName.replace('-', ''));
    if (noteIndex === -1) return 0;

    // XM note number: (octave * 12) + noteIndex + 1
    const noteNum = (octave * 12) + noteIndex + 1;

    if (this.linearSlides) {
      // Linear period: 7680 - (noteNum * 64) - (finetune / 2)
      return XM_LINEAR_PERIOD_BASE - (noteNum * 64) - Math.floor(finetune / 2);
    } else {
      // Amiga period (use period table)
      return noteStringToPeriod(note, Math.floor(finetune / 16));
    }
  }

  /**
   * Get frequency from XM period
   */
  private periodToHz(period: number): number {
    if (period <= 0) return 0;

    if (this.linearSlides) {
      return xmLinearPeriodToFrequency(period);
    } else {
      return periodToFrequency(period);
    }
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

    // Clear active effect for this channel
    this.activeEffects.delete(channel);

    // Handle instrument change
    if (instrument !== null && instrument > 0) {
      state.instrumentId = instrument;
      // In XM, instrument change resets volume if no volume column
      if (volume === null) {
        state.volume = 64;
      }
    }

    // Store volume column data for tick processing
    this.volumeColumnData.set(channel, volume ?? 0);

    // Handle volume column effects (tick 0)
    if (volume !== null && volume > 0) {
      this.processVolumeColumnTick0(channel, volume, state, result);
    }

    // Handle note
    if (note && note !== '...' && note !== '---') {
      if (note === '===' || note === '^^^') {
        // Note off (key-off in XM terminology)
        result.keyOff = true;
        state.noteOn = false;
      } else {
        // Convert note to period
        const period = this.noteToXMPeriod(note, state.finetune);
        if (period > 0) {
          // Check if this is a tone portamento target
          const parsed = this.parseEffect(effect);
          const volColType = (volume ?? 0) >> 4;

          if ((parsed && (parsed.command === XM_EFFECTS.TONE_PORTA ||
                         parsed.command === XM_EFFECTS.TONE_PORTA_VOL_SLIDE)) ||
              volColType === XM_VOL_EFFECTS.TONE_PORTA) {
            // Don't trigger note, just set portamento target
            state.portamentoTarget = period;
          } else {
            // Trigger note
            state.period = period;
            state.frequency = this.periodToHz(period);
            state.noteOn = true;
            result.triggerNote = true;
            result.setPeriod = period;
            result.setFrequency = state.frequency;

            // Reset vibrato/tremolo position on new note (unless waveform bit 2 set)
            if (state.vibratoRetrigger) state.vibratoPos = 0;
            if (state.tremoloRetrigger) state.tremoloPos = 0;
          }
        }
      }
    }

    // Process effect command
    if (effect) {
      const effectResult = this.processEffectTick0(channel, effect, state, note);
      Object.assign(result, effectResult);
    }

    return result;
  }

  /**
   * Process volume column on tick 0
   */
  private processVolumeColumnTick0(
    _channel: number,
    volume: number,
    state: ChannelState,
    result: TickResult
  ): void {
    const type = volume >> 4;
    const param = volume & 0x0F;

    switch (type) {
      case 0x1: case 0x2: case 0x3: case 0x4: case 0x5: {
        // Set volume (0x10-0x50 = volume 0-64)
        const vol = volume - 0x10;
        if (vol >= 0 && vol <= 64) {
          state.volume = vol;
          result.setVolume = vol;
        }
        break;
      }

      case XM_VOL_EFFECTS.FINE_VOL_DOWN:
        // 80-8F: Fine volume slide down
        state.volume = this.clampVolume(state.volume - param);
        result.setVolume = state.volume;
        break;

      case XM_VOL_EFFECTS.FINE_VOL_UP:
        // 90-9F: Fine volume slide up
        state.volume = this.clampVolume(state.volume + param);
        result.setVolume = state.volume;
        break;

      case XM_VOL_EFFECTS.VIBRATO_SPEED:
        // A0-AF: Set vibrato speed
        if (param > 0) {
          state.vibratoSpeed = param;
          state.lastVibratoSpeed = param;
        }
        break;

      case XM_VOL_EFFECTS.SET_PAN:
        // C0-CF: Set panning (0-F -> 0-240)
        state.pan = param << 4;
        result.setPan = state.pan;
        break;

      // Other volume column effects are processed on tick N
    }
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
    const parsed = this.parseEffect(effect);
    if (!parsed) return result;

    const { command, x, y, param } = parsed;
    const effectLetter = effect.toUpperCase()[0];

    // Handle standard effects (0-F)
    switch (command) {
      case XM_EFFECTS.ARPEGGIO:
        if (param !== 0) {
          state.lastArpeggio = param;
          this.activeEffects.set(channel, { type: 'arpeggio', param, x, y });
        }
        break;

      case XM_EFFECTS.PORTA_UP:
        if (param > 0) state.lastPortaUp = param;
        this.activeEffects.set(channel, { type: 'portaUp', param: state.lastPortaUp, x, y });
        break;

      case XM_EFFECTS.PORTA_DOWN:
        if (param > 0) state.lastPortaDown = param;
        this.activeEffects.set(channel, { type: 'portaDown', param: state.lastPortaDown, x, y });
        break;

      case XM_EFFECTS.TONE_PORTA:
        if (param > 0) state.lastTonePortaSpeed = param;
        this.activeEffects.set(channel, { type: 'tonePorta', param: state.lastTonePortaSpeed, x, y });
        break;

      case XM_EFFECTS.VIBRATO:
        if (x > 0) state.lastVibratoSpeed = x;
        if (y > 0) state.lastVibratoDepth = y;
        state.vibratoSpeed = state.lastVibratoSpeed;
        state.vibratoDepth = state.lastVibratoDepth;
        this.activeEffects.set(channel, { type: 'vibrato', param, x, y });
        break;

      case XM_EFFECTS.TONE_PORTA_VOL_SLIDE:
        this.activeEffects.set(channel, { type: 'tonePortaVolSlide', param, x, y });
        break;

      case XM_EFFECTS.VIBRATO_VOL_SLIDE:
        this.activeEffects.set(channel, { type: 'vibratoVolSlide', param, x, y });
        break;

      case XM_EFFECTS.TREMOLO:
        if (x > 0) state.lastTremoloSpeed = x;
        if (y > 0) state.lastTremoloDepth = y;
        state.tremoloSpeed = state.lastTremoloSpeed;
        state.tremoloDepth = state.lastTremoloDepth;
        this.activeEffects.set(channel, { type: 'tremolo', param, x, y });
        break;

      case XM_EFFECTS.SET_PANNING:
        state.pan = param;
        result.setPan = param;
        break;

      case XM_EFFECTS.SAMPLE_OFFSET:
        if (param > 0) state.lastSampleOffset = param;
        result.sampleOffset = state.lastSampleOffset * 256;
        break;

      case XM_EFFECTS.VOLUME_SLIDE:
        if (param > 0) state.lastVolumeSlide = param;
        this.activeEffects.set(channel, { type: 'volumeSlide', param: state.lastVolumeSlide, x, y });
        break;

      case XM_EFFECTS.POSITION_JUMP:
        result.positionJump = param;
        break;

      case XM_EFFECTS.SET_VOLUME: {
        const vol = Math.min(param, 64);
        state.volume = vol;
        result.setVolume = vol;
        break;
      }

      case XM_EFFECTS.PATTERN_BREAK:
        // XM uses hex for pattern break (D10 = row 16, not row 10)
        result.patternBreak = param;
        break;

      case XM_EFFECTS.E_COMMANDS:
        this.processECommandTick0(channel, x, y, state, note, result);
        break;

      case XM_EFFECTS.SET_SPEED:
        if (param === 0) {
          // F00 = stop
        } else if (param < 0x20) {
          this.speed = param;
          result.setSpeed = param;
        } else {
          this.tempo = param;
          result.setBPM = param;
        }
        break;
    }

    // Handle extended effects (letter codes)
    if (effectLetter === 'G') {
      // Gxx - Global volume
      const gvol = Math.min(param, 64);
      this.globalVolume = gvol;
      result.setGlobalVolume = gvol;
    }
    else if (effectLetter === 'H') {
      // Hxy - Global volume slide
      this.activeEffects.set(channel, { type: 'globalVolSlide', param, x, y });
    }
    else if (effectLetter === 'K') {
      // Kxx - Key off at tick xx
      state.keyOffTick = param;
      this.activeEffects.set(channel, { type: 'keyOff', param, x, y });
    }
    else if (effectLetter === 'L') {
      // Lxx - Set envelope position (not implemented without envelope system)
    }
    else if (effectLetter === 'P') {
      // Pxy - Panning slide
      if (param > 0) state.lastPanSlide = param;
      this.activeEffects.set(channel, { type: 'panSlide', param: state.lastPanSlide, x, y });
    }
    else if (effectLetter === 'R') {
      // Rxy - Multi retrig
      if (y > 0) state.retrigTick = y;
      if (x >= 0) state.retrigVolChange = x;
      this.activeEffects.set(channel, { type: 'multiRetrig', param, x, y });
    }
    else if (effectLetter === 'T') {
      // Txy - Tremor
      if (x > 0) state.tremorOnTime = x;
      if (y > 0) state.tremorOffTime = y;
      this.activeEffects.set(channel, { type: 'tremor', param, x, y });
    }
    else if (effectLetter === 'X') {
      // X1x/X2x - Extra fine portamento
      if (x === 1) {
        // Extra fine porta up (1/4 speed)
        if (state.period > 0) {
          state.period -= y;
          if (state.period < this.minPeriod) state.period = this.minPeriod;
          state.frequency = this.periodToHz(state.period);
          result.setPeriod = state.period;
          result.setFrequency = state.frequency;
        }
      } else if (x === 2) {
        // Extra fine porta down (1/4 speed)
        if (state.period > 0) {
          state.period += y;
          if (state.period > this.maxPeriod) state.period = this.maxPeriod;
          state.frequency = this.periodToHz(state.period);
          result.setPeriod = state.period;
          result.setFrequency = state.frequency;
        }
      }
    }

    return result;
  }

  /**
   * Process E-commands on tick 0
   */
  private processECommandTick0(
    channel: number,
    x: number,
    y: number,
    state: ChannelState,
    note: string | null,
    result: TickResult
  ): void {
    switch (x) {
      case XM_E_COMMANDS.FINE_PORTA_UP:
        if (y > 0 && state.period > 0) {
          state.period -= y * 4; // XM uses larger steps than MOD
          if (state.period < this.minPeriod) state.period = this.minPeriod;
          state.frequency = this.periodToHz(state.period);
          result.setPeriod = state.period;
          result.setFrequency = state.frequency;
        }
        break;

      case XM_E_COMMANDS.FINE_PORTA_DOWN:
        if (y > 0 && state.period > 0) {
          state.period += y * 4;
          if (state.period > this.maxPeriod) state.period = this.maxPeriod;
          state.frequency = this.periodToHz(state.period);
          result.setPeriod = state.period;
          result.setFrequency = state.frequency;
        }
        break;

      case XM_E_COMMANDS.GLISSANDO:
        // Not implemented
        break;

      case XM_E_COMMANDS.VIBRATO_WAVEFORM:
        state.vibratoWaveform = this.waveformFromNumber(y & 3);
        state.vibratoRetrigger = (y & 4) === 0;
        break;

      case XM_E_COMMANDS.FINETUNE:
        // XM uses signed 8-bit finetune (-128 to +127)
        state.finetune = y > 7 ? (y - 16) * 16 : y * 16;
        break;

      case XM_E_COMMANDS.PATTERN_LOOP:
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

      case XM_E_COMMANDS.TREMOLO_WAVEFORM:
        state.tremoloWaveform = this.waveformFromNumber(y & 3);
        state.tremoloRetrigger = (y & 4) === 0;
        break;

      case XM_E_COMMANDS.PANNING:
        state.pan = y * 17;
        result.setPan = state.pan;
        break;

      case XM_E_COMMANDS.RETRIG:
        if (y > 0) {
          state.retrigTick = y;
          this.activeEffects.set(channel, { type: 'retrig', param: y, x: 0, y });
        }
        break;

      case XM_E_COMMANDS.FINE_VOL_UP:
        state.volume = this.clampVolume(state.volume + y);
        result.setVolume = state.volume;
        break;

      case XM_E_COMMANDS.FINE_VOL_DOWN:
        state.volume = this.clampVolume(state.volume - y);
        result.setVolume = state.volume;
        break;

      case XM_E_COMMANDS.NOTE_CUT:
        state.noteCutTick = y;
        this.activeEffects.set(channel, { type: 'noteCut', param: y, x: 0, y });
        break;

      case XM_E_COMMANDS.NOTE_DELAY:
        if (y > 0 && note) {
          state.noteDelayTick = y;
          this.activeEffects.set(channel, { type: 'noteDelay', param: y, x: 0, y });
        }
        break;

      case XM_E_COMMANDS.PATTERN_DELAY:
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

    // Process volume column effects (tick N)
    const volCol = this.volumeColumnData.get(channel) ?? 0;
    if (volCol > 0) {
      this.processVolumeColumnTickN(channel, tick, volCol, state, result);
    }

    // Process main effect
    const activeEffect = this.activeEffects.get(channel);
    if (activeEffect) {
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
          this.processVibrato(state, result);
          break;

        case 'tonePortaVolSlide':
          this.processTonePorta(state, state.lastTonePortaSpeed, result);
          this.processVolumeSlide(state, x, y, result);
          break;

        case 'vibratoVolSlide':
          this.processVibrato(state, result);
          this.processVolumeSlide(state, x, y, result);
          break;

        case 'tremolo':
          this.processTremolo(state, result);
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

        case 'panSlide':
          if (x > 0) {
            state.pan = this.clampPan(state.pan + x);
          } else if (y > 0) {
            state.pan = this.clampPan(state.pan - y);
          }
          result.setPan = state.pan;
          break;

        case 'keyOff':
          if (tick === param) {
            result.keyOff = true;
            state.noteOn = false;
          }
          break;

        case 'multiRetrig':
          if (y > 0 && tick % y === 0) {
            result.triggerNote = true;
            // Apply volume change using retrig table
            if (x > 0 && x < RETRIG_VOLUME_OPS.length) {
              state.volume = this.clampVolume(RETRIG_VOLUME_OPS[x](state.volume));
              result.setVolume = state.volume;
            }
          }
          break;

        case 'tremor': {
          const tremorCycle = state.tremorOnTime + state.tremorOffTime;
          state.tremorPos = (state.tremorPos + 1) % tremorCycle;
          if (state.tremorPos < state.tremorOnTime) {
            result.setVolume = state.volume;
          } else {
            result.setVolume = 0;
          }
          break;
        }

        case 'retrig':
          if (tick > 0 && tick % param === 0) {
            result.triggerNote = true;
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
    }

    return result;
  }

  /**
   * Process volume column on ticks 1+
   */
  private processVolumeColumnTickN(
    _channel: number,
    _tick: number,
    volume: number,
    state: ChannelState,
    result: TickResult
  ): void {
    const type = volume >> 4;
    const param = volume & 0x0F;

    switch (type) {
      case XM_VOL_EFFECTS.VOL_SLIDE_DOWN:
        state.volume = this.clampVolume(state.volume - param);
        result.setVolume = state.volume;
        break;

      case XM_VOL_EFFECTS.VOL_SLIDE_UP:
        state.volume = this.clampVolume(state.volume + param);
        result.setVolume = state.volume;
        break;

      case XM_VOL_EFFECTS.VIBRATO:
        if (param > 0) {
          state.vibratoDepth = param;
        }
        this.processVibrato(state, result);
        break;

      case XM_VOL_EFFECTS.PAN_SLIDE_LEFT:
        state.pan = this.clampPan(state.pan - param);
        result.setPan = state.pan;
        break;

      case XM_VOL_EFFECTS.PAN_SLIDE_RIGHT:
        state.pan = this.clampPan(state.pan + param);
        result.setPan = state.pan;
        break;

      case XM_VOL_EFFECTS.TONE_PORTA: {
        // Use parameter as portamento speed
        const speed = param > 0 ? param * 16 : state.lastTonePortaSpeed;
        this.processTonePorta(state, speed, result);
        break;
      }
    }
  }

  /**
   * Process arpeggio (0xy)
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

    if (this.linearSlides) {
      // In linear mode, each semitone = 64 period units
      const newPeriod = state.period - (offset * 64);
      result.setPeriod = newPeriod;
      result.setFrequency = xmLinearPeriodToFrequency(newPeriod);
    } else {
      // Amiga mode - use period table
      const basePeriod = state.period;
      const baseFreq = periodToFrequency(basePeriod);
      const newFreq = baseFreq * Math.pow(2, offset / 12);
      result.setFrequency = newFreq;
    }
  }

  /**
   * Process portamento up (1xx)
   */
  private processPortaUp(state: ChannelState, speed: number, result: TickResult): void {
    if (state.period <= 0) return;

    if (this.linearSlides) {
      state.period -= speed * 4;
    } else {
      state.period -= speed;
    }

    if (state.period < this.minPeriod) {
      state.period = this.minPeriod;
    }

    state.frequency = this.periodToHz(state.period);
    result.setPeriod = state.period;
    result.setFrequency = state.frequency;
  }

  /**
   * Process portamento down (2xx)
   */
  private processPortaDown(state: ChannelState, speed: number, result: TickResult): void {
    if (state.period <= 0) return;

    if (this.linearSlides) {
      state.period += speed * 4;
    } else {
      state.period += speed;
    }

    if (state.period > this.maxPeriod) {
      state.period = this.maxPeriod;
    }

    state.frequency = this.periodToHz(state.period);
    result.setPeriod = state.period;
    result.setFrequency = state.frequency;
  }

  /**
   * Process tone portamento (3xx)
   */
  private processTonePorta(state: ChannelState, speed: number, result: TickResult): void {
    if (state.period <= 0 || state.portamentoTarget <= 0) return;

    const slideSpeed = this.linearSlides ? speed * 4 : speed;

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

    state.frequency = this.periodToHz(state.period);
    result.setPeriod = state.period;
    result.setFrequency = state.frequency;
  }

  /**
   * Process vibrato (4xy)
   */
  private processVibrato(state: ChannelState, result: TickResult): void {
    if (state.period <= 0) return;

    const waveValue = this.getWaveformValue(state.vibratoWaveform, state.vibratoPos);

    // XM vibrato depth is in 1/16 semitones (linear) or period units (Amiga)
    let delta: number;
    if (this.linearSlides) {
      // Each semitone = 64 period units, depth is 1/16 semitone
      delta = Math.floor(waveValue * state.vibratoDepth * 4);
    } else {
      delta = Math.floor(waveValue * state.vibratoDepth);
    }

    const newPeriod = state.period + delta;
    result.setPeriod = newPeriod;
    result.setFrequency = this.periodToHz(newPeriod);

    state.vibratoPos = (state.vibratoPos + state.vibratoSpeed) & 0x3F;
  }

  /**
   * Process tremolo (7xy)
   */
  private processTremolo(state: ChannelState, result: TickResult): void {
    const waveValue = this.getWaveformValue(state.tremoloWaveform, state.tremoloPos);
    const delta = Math.floor(waveValue * state.tremoloDepth);
    const newVolume = this.clampVolume(state.volume + delta);

    result.setVolume = newVolume;
    state.tremoloPos = (state.tremoloPos + state.tremoloSpeed) & 0x3F;
  }

  /**
   * Process volume slide (Axy)
   */
  private processVolumeSlide(state: ChannelState, up: number, down: number, result: TickResult): void {
    if (up > 0) {
      state.volume = this.clampVolume(state.volume + up);
    } else if (down > 0) {
      state.volume = this.clampVolume(state.volume - down);
    }
    result.setVolume = state.volume;
  }
}
