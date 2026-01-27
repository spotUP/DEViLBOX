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
  xmLinearPeriodToFrequency,
  noteStringToXMLinearPeriod,
} from './PeriodTables';

declare var require: any;

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
  public linearSlides: boolean = true;
  public minPeriod: number = 1;
  public maxPeriod: number = 32000;

  // Active effects per channel
  protected activeEffects: Map<number, {
    type: string;
    param: number;
    x: number;
    y: number;
  }> = new Map();

  // Volume column state per channel
  private volumeColumnData: Map<number, number> = new Map();

  // Pattern delay state (pattern loop uses base class maps)
  public patternDelayCount: number = 0; // Used for EEx pattern delay effect

  /**
   * XM-specific note to period conversion
   */
  public noteStringToPeriod(note: string, finetune: number = 0): number {
    if (this.linearSlides) {
      return noteStringToXMLinearPeriod(note, finetune);
    }
    return super.noteStringToPeriod(note, finetune);
  }

  /**
   * S3M frequency calculation (standard Amiga PAL)
   */
  public periodToHz(period: number): number {
    if (period <= 0) return 0;
    if (this.linearSlides) {
      return xmLinearPeriodToFrequency(period);
    } else {
      return periodToFrequency(period);
    }
  }

  /**
   * Initialize with format config
   */
  init(config: FormatConfig): void {
    super.init(config);
    this.linearSlides = config.linearSlides ?? true;
    this.activeEffects.clear();
    this.volumeColumnData.clear();
    this.patternDelayCount = 0;
  }

  /**
   * Reset all state
   */
  resetAll(): void {
    super.resetAll();
    this.activeEffects.clear();
    this.volumeColumnData.clear();
    this.patternDelayCount = 0;
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
      
      const defaultVol = (state as any).sampleDefaultVolume ?? 64;
      const defaultFinetune = (state as any).sampleDefaultFinetune ?? 0;

      // In XM, instrument change resets volume IF no volume column or effect Cxx override
      const parsed = this.parseEffect(effect);
      const isSetVol = (parsed && parsed.command === XM_EFFECTS.SET_VOLUME) || 
                       (volume !== null && volume >= 0x10 && volume <= 0x50);
      
      if (!isSetVol) {
        state.volume = defaultVol;
        result.setVolume = state.volume;
      }

      // Update finetune even without a note
      const oldFinetune = state.finetune;
      state.finetune = defaultFinetune;

      // If no note is present, re-calculate period if finetune changed
      if (!note || note === '...' || note === '---') {
        if (state.period > 0 && oldFinetune !== defaultFinetune) {
          const { periodToNoteString } = require('./PeriodTables');
          // Use format-aware conversion to maintain correct octave mapping
          const noteStr = periodToNoteString(state.period, oldFinetune, this.format);
          // Use instance method to respect format-specific period calculation
          state.period = this.noteStringToPeriod(noteStr, defaultFinetune);
          state.frequency = this.periodToHz(state.period);
          result.setPeriod = state.period;
          result.setFrequency = state.frequency;
        }
        result.triggerNote = false; // Ensure we don't restart the sample
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
        const period = this.noteStringToPeriod(note, state.finetune);
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
      
      // Hardware Compliance: Process continuous effects on Tick 0 too
      // EXCEPT for Auto-Vibrato in XM (AutoVibratoSweepKeyOff.xm quirk)
      if (this.format !== 'XM') {
        const tick0Continuous = this.processTick(channel, 0, state);
        Object.assign(result, tick0Continuous);
      }
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
        this.processFineVolumeSlide(state, 0, param, result);
        break;

      case XM_VOL_EFFECTS.FINE_VOL_UP:
        // 90-9F: Fine volume slide up
        this.processFineVolumeSlide(state, param, 0, result);
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
        // Hardware Quirk: XM volume-column panning is multiplied by 16 (PF = 8F0, not 8FF)
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
    _channel: number,
    x: number,
    y: number,
    state: ChannelState,
    _note: string | null,
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
        this.setVibratoWaveform(state, y);
        break;

      case XM_E_COMMANDS.FINETUNE:
        // XM uses signed 8-bit finetune (-128 to +127)
        state.finetune = y > 7 ? (y - 16) * 16 : y * 16;
        break;

      case XM_E_COMMANDS.PATTERN_LOOP:
        this.processPatternLoop(_channel, y, result);
        break;

      case XM_E_COMMANDS.TREMOLO_WAVEFORM:
        this.setTremoloWaveform(state, y);
        break;

      case XM_E_COMMANDS.PANNING:
        state.pan = y * 17;
        result.setPan = state.pan;
        break;

      case XM_E_COMMANDS.RETRIG:
        if (y > 0) {
          state.retrigTick = y;
          this.activeEffects.set(_channel, { type: 'retrig', param: y, x: 0, y });
        }
        break;

      case XM_E_COMMANDS.FINE_VOL_UP:
        this.processFineVolumeSlide(state, y, 0, result);
        break;

      case XM_E_COMMANDS.FINE_VOL_DOWN:
        this.processFineVolumeSlide(state, 0, y, result);
        break;

      case XM_E_COMMANDS.NOTE_CUT:
        state.noteCutTick = y;
        this.activeEffects.set(_channel, { type: 'noteCut', param: y, x: 0, y });
        break;

      case XM_E_COMMANDS.NOTE_DELAY:
        if (y > 0 && _note) {
          state.noteDelayTick = y;
          this.activeEffects.set(_channel, { type: 'noteDelay', param: y, x: 0, y });
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

    // 1. Process Auto-Vibrato (XM / IT)
    this.processAutoVibrato(state, result, tick);

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
          if (tick > 0) {
            this.processArpeggio(tick, state, x, y, result);
          }
          break;

        case 'portaUp':
          this.processPortaUp(state, param, result, this.minPeriod);
          break;

        case 'portaDown':
          this.processPortaDown(state, param, result, this.maxPeriod);
          break;

        case 'tonePorta':
          this.processTonePorta(state, param, result);
          break;

        case 'vibrato':
          this.processVibrato(state, result, 4);
          break;

        case 'tonePortaVolSlide':
          this.processTonePorta(state, state.lastTonePortaSpeed, result);
          this.processVolumeSlide(state, x, y, result);
          break;

        case 'vibratoVolSlide':
          this.processVibrato(state, result, 4);
          this.processVolumeSlide(state, x, y, result);
          break;

        case 'tremolo':
          this.processTremolo(state, result);
          break;

        case 'volumeSlide':
          this.processVolumeSlide(state, x, y, result);
          break;

        case 'globalVolSlide':
          this.processGlobalVolumeSlide(x, y, result);
          break;

        case 'panSlide':
          if (x > 0) {
            state.pan = this.clampPan(state.pan + x);
          } else if (y > 0) {
            state.pan = this.clampPan(state.pan - y);
          } else if (param === 0) {
            // Hardware Quirk: Pan slide left 0 (P00) resets to 0 on all ticks > 0
            state.pan = 0;
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
          if (tick > 0 && y > 0 && tick % y === 0) {
            result.triggerNote = true;
            // Apply volume change using retrig table
            if (x > 0 && x < RETRIG_VOLUME_OPS.length) {
              state.volume = this.clampVolume(RETRIG_VOLUME_OPS[x](state.volume));
              result.setVolume = state.volume;
            }
          }
          break;

        case 'tremor':
          this.processTremor(state, result);
          break;

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
        this.processVolumeSlide(state, 0, param, result);
        break;

      case XM_VOL_EFFECTS.VOL_SLIDE_UP:
        this.processVolumeSlide(state, param, 0, result);
        break;

      case XM_VOL_EFFECTS.VIBRATO:
        if (param > 0) {
          state.vibratoDepth = param;
        }
        this.processVibrato(state, result, 4);
        break;

      case XM_VOL_EFFECTS.PAN_SLIDE_LEFT:
        // Hardware Quirk: Pan slide left with param 0 resets to 0 on all ticks > 0
        if (param === 0) {
          state.pan = 0;
        } else {
          state.pan = this.clampPan(state.pan - param);
        }
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
   * Overridden Vibrato for XM: handles linear period scaling
   */
  protected processVibrato(state: ChannelState, result: TickResult, depthMultiplier: number = 4): void {
    if (state.period <= 0) return;

    const waveValue = this.getWaveformValue(state.vibratoWaveform, state.vibratoPos);
    
    // XM Scaling: each depth unit is 4 units in linear mode, or 1 unit in Amiga mode
    const finalDepthMultiplier = this.linearSlides ? depthMultiplier : 1;
    const delta = Math.floor(waveValue * state.vibratoDepth * finalDepthMultiplier);

    const finalPeriod = state.period + delta;
    result.setPeriod = finalPeriod;
    result.setFrequency = this.periodToHz(finalPeriod);

    // Advance position for next tick
    state.vibratoPos = (state.vibratoPos + state.vibratoSpeed) & 0x3F;
  }

  private processArpeggio(
    tick: number,
    state: ChannelState,
    x: number,
    y: number,
    result: TickResult
  ): void {
    if (state.period <= 0) return;

    // Hardware Quirk: FastTracker 2 Arpeggio LUT
    // FT2 counts ticks DOWNWARDS for arpeggio lookup.
    // At speed 6, ticks are processed 0, 1, 2, 3, 4, 5 but lookup uses 5, 4, 3, 2, 1, 0.
    const arpTick = this.speed > 0 ? (this.speed - 1 - tick) : tick;
    const offsets = [0, x, y];
    const offset = offsets[arpTick % 3];

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
}
