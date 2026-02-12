/**
 * MODHandler - ProTracker (MOD) Effect Handler
 *
 * Implements all ProTracker effect commands with accurate quirk emulation:
 * - Period-based pitch (Amiga style)
 * - All standard effects (0-F)
 * - Extended E-commands (E0x-EFx)
 * - Optional bug emulation (arpeggio overflow, portamento limits, etc.)
 */

import { type ChannelState, type TickResult, type FormatConfig, type WaveformType } from './types';
import { BaseFormatHandler } from './FormatHandler';
import {
  PT_MIN_PERIOD,
  PT_MAX_PERIOD,
  periodToFrequency,
  getArpeggioPeriod,
  snapPeriodToSemitone,
  periodToNoteIndex,
  finetuneToIndex,
  PERIOD_TABLE,
  VIBRATO_TABLE,
  periodToNoteString,
} from './PeriodTables';

// Effect constants
const MOD_EFFECTS = {
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
};

// E-command sub-effects
const MOD_E_COMMANDS = {
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
  INVERT_LOOP: 0xF,
};

/**
 * ProTracker effect handler
 */
export class MODHandler extends BaseFormatHandler {
  readonly format = 'MOD' as const;

  // ProTracker-specific settings
  private emulatePTBugs: boolean = true;
  private ciaBPMDelay: number | null = null;

  // Active effects per channel
  protected activeEffects: Map<number, {
    type: string;
    param: number;
    x: number;
    y: number;
  }> = new Map();

  // Pattern delay state (pattern loop uses base class maps)
  public patternDelayCount: number = 0;

  /**
   * MOD frequency calculation (standard Amiga PAL)
   */
  public periodToHz(period: number): number {
    if (period <= 0) return 0;
    return periodToFrequency(period);
  }

  /**
   * Initialize with format config
   */
  init(config: FormatConfig): void {
    super.init(config);
    this.emulatePTBugs = config.emulatePTBugs ?? true;
    this.activeEffects.clear();
    this.patternDelayCount = 0;
    this.ciaBPMDelay = null;
  }

  /**
   * Reset all state
   */
  resetAll(): void {
    super.resetAll();
    this.activeEffects.clear();
    this.patternDelayCount = 0;
    this.ciaBPMDelay = null;
  }

  /**
   * Process effect at row start (tick 0)
   */
  processRowStart(
    channel: number,
    note: string | null,
    instrument: number | null,
    _volume: number | null,
    effect: string | null,
    state: ChannelState
  ): TickResult {
    const result: TickResult = {};

    this.activeEffects.delete(channel);

    if (this.emulatePTBugs && this.ciaBPMDelay !== null) {
      result.setBPM = this.ciaBPMDelay;
      this.ciaBPMDelay = null;
    }

    // Handle instrument change (Swap quirk)
    if (instrument !== null && instrument > 0) {
      state.instrumentId = instrument;
      
      const instExt = (state as unknown as { activeInstrument?: { defaultVolume?: number; finetune?: number } }).activeInstrument;
      const defaultVol = instExt?.defaultVolume ?? 64;
      const defaultFinetune = instExt?.finetune ?? 0;

      state.volume = defaultVol;
      result.setVolume = state.volume;

      const oldFinetune = state.finetune;
      state.finetune = defaultFinetune;

      if (!note || note === '...' || note === '---') {
        if (state.period > 0 && oldFinetune !== defaultFinetune) {
          // Use format-aware conversion to maintain correct octave mapping
          const noteStr = periodToNoteString(state.period, oldFinetune, this.format);
          state.period = this.noteStringToPeriod(noteStr, defaultFinetune);
          state.frequency = this.periodToHz(state.period);
          result.setPeriod = state.period;
          result.setFrequency = state.frequency;
        }
        result.triggerNote = false;
      }
    }

    if (_volume !== null && _volume !== 255 && _volume <= 64) {
      state.volume = _volume;
      result.setVolume = state.volume;
    }

    if (effect) {
      const effectResult = this.processEffectTick0(channel, effect, state, note);
      Object.assign(result, effectResult);
      
      const tick0Continuous = this.processTick(channel, 0, state);
      if (this.format === 'MOD') {
        delete tick0Continuous.setPeriod;
        if (tick0Continuous.setVolume === state.volume) delete tick0Continuous.setVolume;
      }
      Object.assign(result, tick0Continuous);
    }

    if (note && note !== '...' && note !== '---' && !result.preventNoteTrigger) {
      if (note === '===' || note === '^^^') {
        result.cutNote = true;
        state.noteOn = false;
      } else {
        const period = this.noteStringToPeriod(note, state.finetune);
        if (period > 0) {
          const parsed = this.parseEffect(effect);
          const isTonePorta = parsed && (parsed.command === MOD_EFFECTS.TONE_PORTA ||
                                       parsed.command === MOD_EFFECTS.TONE_PORTA_VOL_SLIDE);
          
          if (isTonePorta) {
            let targetPeriod = period;
            if (this.emulatePTBugs) {
              const baseIndex = periodToNoteIndex(period, state.finetune);
              const ftIndex = finetuneToIndex(state.finetune);
              if (ftIndex >= 8 && baseIndex > 0) {
                targetPeriod = PERIOD_TABLE[ftIndex][baseIndex - 1];
              }
            }
            state.portamentoTarget = targetPeriod;
          } else {
            state.period = period;
            state.frequency = this.periodToHz(period);
            state.noteOn = true;
            result.triggerNote = true;
            result.setPeriod = period;

            if (state.vibratoRetrigger) state.vibratoPos = 0;
            if (state.tremoloRetrigger) state.tremoloPos = 0;
          }
        }
      }
    }

    return result;
  }

  private processEffectTick0(
    channel: number,
    effect: string,
    state: ChannelState,
    note: string | null,
  ): TickResult {
    const result: TickResult = {};
    const parsed = this.parseEffect(effect);
    if (!parsed) return result;

    const { command, x, y, param } = parsed;

    switch (command) {
      case MOD_EFFECTS.ARPEGGIO:
        if (param !== 0) {
          state.lastArpeggio = param;
          this.activeEffects.set(channel, { type: 'arpeggio', param, x, y });
        }
        break;

      case MOD_EFFECTS.PORTA_UP:
        if (param > 0) state.lastPortaUp = param;
        this.activeEffects.set(channel, { type: 'portaUp', param: state.lastPortaUp, x, y });
        break;

      case MOD_EFFECTS.PORTA_DOWN:
        if (param > 0) state.lastPortaDown = param;
        this.activeEffects.set(channel, { type: 'portaDown', param: state.lastPortaDown, x, y });
        break;

      case MOD_EFFECTS.TONE_PORTA:
        if (param > 0) state.lastTonePortaSpeed = param;
        this.activeEffects.set(channel, { type: 'tonePorta', param: state.lastTonePortaSpeed, x, y });
        break;

      case MOD_EFFECTS.VIBRATO:
        if (x > 0) state.lastVibratoSpeed = x;
        if (y > 0) state.lastVibratoDepth = y;
        state.vibratoSpeed = state.lastVibratoSpeed;
        state.vibratoDepth = state.lastVibratoDepth;
        this.activeEffects.set(channel, { type: 'vibrato', param, x, y });
        break;

      case MOD_EFFECTS.TONE_PORTA_VOL_SLIDE:
        this.activeEffects.set(channel, { type: 'tonePortaVolSlide', param, x, y });
        break;

      case MOD_EFFECTS.VIBRATO_VOL_SLIDE:
        this.activeEffects.set(channel, { type: 'vibratoVolSlide', param, x, y });
        break;

      case MOD_EFFECTS.TREMOLO:
        if (x > 0) state.lastTremoloSpeed = x;
        if (y > 0) state.lastTremoloDepth = y;
        state.tremoloSpeed = state.lastTremoloSpeed;
        state.tremoloDepth = state.lastTremoloDepth;
        this.activeEffects.set(channel, { type: 'tremolo', param, x, y });
        break;

      case MOD_EFFECTS.SAMPLE_OFFSET: {
        if (param > 0) state.lastSampleOffset = param;
        const offsetValue = state.lastSampleOffset << 8;
        // Note: PT offset bug (doubling) only occurs in very specific edge cases
        // that are rarely encountered in normal music. We use standard behavior.
        result.sampleOffset = offsetValue;
        break;
      }

      case MOD_EFFECTS.VOLUME_SLIDE:
        if (param > 0) state.lastVolumeSlide = param;
        this.activeEffects.set(channel, { type: 'volumeSlide', param: state.lastVolumeSlide, x, y });
        break;

      case MOD_EFFECTS.POSITION_JUMP:
        result.positionJump = param;
        break;

      case MOD_EFFECTS.SET_VOLUME: {
        const vol = Math.min(param, 64);
        state.volume = vol;
        result.setVolume = vol;
        break;
      }

      case MOD_EFFECTS.PATTERN_BREAK: {
        const breakRow = x * 10 + y;
        result.patternBreak = breakRow > 63 ? 0 : breakRow;
        break;
      }

      case MOD_EFFECTS.E_COMMANDS:
        this.processECommandTick0(channel, x, y, state, note, result);
        break;

      case MOD_EFFECTS.SET_SPEED:
        if (param === 0) {
          result.stopSong = true;
        } else if (param < 0x20) {
          this.speed = param;
          result.setSpeed = param;
        } else {
          if (this.emulatePTBugs) {
            this.ciaBPMDelay = param;
          } else {
            this.tempo = param;
            result.setBPM = param;
          }
        }
        break;
    }

    return result;
  }

  private processECommandTick0(
    channel: number,
    x: number,
    y: number,
    state: ChannelState,
    note: string | null,
    result: TickResult
  ): void {
    switch (x) {
      case MOD_E_COMMANDS.FILTER:
        result.setAmigaFilter = (y === 0);
        break;

      case MOD_E_COMMANDS.FINE_PORTA_UP:
        if (y > 0 && state.period > 0) {
          state.period = Math.max(PT_MIN_PERIOD, state.period - y);
          state.frequency = this.periodToHz(state.period);
          result.setPeriod = state.period;
        }
        break;

      case MOD_E_COMMANDS.FINE_PORTA_DOWN:
        if (y > 0 && state.period > 0) {
          state.period = Math.min(PT_MAX_PERIOD, state.period + y);
          state.frequency = this.periodToHz(state.period);
          result.setPeriod = state.period;
        }
        break;

      case MOD_E_COMMANDS.GLISSANDO:
        state.glissando = (y !== 0);
        break;

      case MOD_E_COMMANDS.VIBRATO_WAVEFORM:
        this.setVibratoWaveform(state, y);
        break;

      case MOD_E_COMMANDS.FINETUNE:
        state.finetune = y > 7 ? y - 16 : y;
        break;

      case MOD_E_COMMANDS.PATTERN_LOOP:
        this.processPatternLoop(channel, y, result);
        break;

      case MOD_E_COMMANDS.TREMOLO_WAVEFORM:
        this.setTremoloWaveform(state, y);
        break;

      case MOD_E_COMMANDS.RETRIG:
        if (y > 0) {
          state.retrigTick = y;
          this.activeEffects.set(channel, { type: 'retrig', param: y, x: 0, y });
        }
        break;

      case MOD_E_COMMANDS.FINE_VOL_UP:
        this.processFineVolumeSlide(state, y, 0, result);
        break;

      case MOD_E_COMMANDS.FINE_VOL_DOWN:
        this.processFineVolumeSlide(state, 0, y, result);
        break;

      case MOD_E_COMMANDS.NOTE_CUT:
        state.noteCutTick = y;
        this.activeEffects.set(channel, { type: 'noteCut', param: y, x: 0, y });
        break;

      case MOD_E_COMMANDS.NOTE_DELAY:
        if (y > 0 && note) {
          state.noteDelayTick = y;
          this.activeEffects.set(channel, { type: 'noteDelay', param: y, x: 0, y });
          result.preventNoteTrigger = true;
        }
        break;

      case MOD_E_COMMANDS.PATTERN_DELAY:
        if (y > 0) {
          this.patternDelayCount = y;
          result.patternDelay = y;
        }
        break;

      case MOD_E_COMMANDS.INVERT_LOOP:
        if (y === 0) {
          state.funkRepeatPos = 0;
        } else {
          if (state.funkRepeatPos === undefined) state.funkRepeatPos = 0;
          this.activeEffects.set(channel, { type: 'invertLoop', param: y, x: 0, y });
        }
        break;
    }
  }

  processTick(
    channel: number,
    tick: number,
    state: ChannelState
  ): TickResult {
    const result: TickResult = {};

    if (this.emulatePTBugs && tick === 1 && this.ciaBPMDelay !== null) {
      result.setBPM = this.ciaBPMDelay;
      this.ciaBPMDelay = null;
    }

    const activeEffect = this.activeEffects.get(channel);
    if (!activeEffect) return result;

    const { type, param, x, y } = activeEffect;

    switch (type) {
      case 'arpeggio':
        this.processArpeggio(tick, state, x, y, result);
        break;

      case 'portaUp':
        this.processPortaUp(state, param, result, PT_MIN_PERIOD);
        break;

      case 'portaDown':
        this.processPortaDown(state, param, result, PT_MAX_PERIOD);
        break;

      case 'tonePorta':
        this.processTonePorta(state, param, result);
        if (state.glissando && result.setPeriod !== undefined) {
          result.setPeriod = snapPeriodToSemitone(result.setPeriod, state.finetune);
          result.setFrequency = this.periodToHz(result.setPeriod);
        }
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

      case 'retrig':
        if (tick > 0 && tick % param === 0) {
          result.triggerNote = true;
          if (this.emulatePTBugs && state.lastSampleOffset > 0) {
            result.sampleOffset = state.lastSampleOffset << 8;
          }
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

      case 'invertLoop':
        if (state.funkRepeatPos !== undefined) {
          state.funkRepeatPos += param;
          if (state.funkRepeatPos > 0x80) state.funkRepeatPos = 0;
          result.funkRepeat = state.funkRepeatPos;
        }
        break;
    }

    return result;
  }

  protected getWaveformValueInt(waveform: WaveformType, pos: number): number {
    const p = pos & 0x3F;
    switch (waveform) {
      case 'sine': {
        const val = VIBRATO_TABLE[p & 0x1F];
        return p < 32 ? val : -val;
      }
      case 'rampDown':
        return 255 - (p * 4);
      case 'square':
        return p < 32 ? 255 : -255;
      default:
        return 0;
    }
  }

  protected processVibrato(state: ChannelState, result: TickResult): void {
    if (state.period <= 0) return;
    state.vibratoPos = (state.vibratoPos + state.vibratoSpeed) & 0x3F;
    const waveValue = this.getWaveformValueInt(state.vibratoWaveform, state.vibratoPos);
    const delta = (waveValue * state.vibratoDepth) >> 7;
    const finalPeriod = state.period + delta;
    result.setPeriod = finalPeriod;
    result.setFrequency = this.periodToHz(finalPeriod);
  }

  protected processTremolo(state: ChannelState, result: TickResult): void {
    state.tremoloPos = (state.tremoloPos + state.tremoloSpeed) & 0x3F;
    const waveValue = this.getWaveformValueInt(state.tremoloWaveform, state.tremoloPos);
    const delta = (waveValue * state.tremoloDepth) >> 6;
    const newVolume = this.clampVolume(state.volume + delta);
    result.setVolume = newVolume;
  }

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
      const ftIndex = finetuneToIndex(state.finetune);
      // periodToNoteIndex returns internal indices: 36-71 for Amiga period table range
      const baseIndex = periodToNoteIndex(state.period, state.finetune);
      let newPeriod: number;
      if (baseIndex !== -1) {
        let targetIndex = baseIndex + offset;
        if (this.emulatePTBugs) {
          // ProTracker boundary: internal index 72 (one past B-3) returns 0
          if (targetIndex === 72) {
            result.setPeriod = 0;
            result.setFrequency = 0;
            return;
          } else if (targetIndex >= 73) {
            // Wrap to beginning of table (index 73 -> 36, 74 -> 37, etc.)
            targetIndex -= 37;
          }
        }
        // PERIOD_TABLE uses indices 0-35, internal indices are 36-71
        if (targetIndex >= 36 && targetIndex < 72) {
          newPeriod = PERIOD_TABLE[ftIndex][targetIndex - 36];
        } else {
          newPeriod = getArpeggioPeriod(state.period, offset, state.finetune, this.emulatePTBugs);
        }
      } else {
        newPeriod = getArpeggioPeriod(state.period, offset, state.finetune, this.emulatePTBugs);
      }
      result.setPeriod = newPeriod;
      result.setFrequency = result.setPeriod! > 0 ? this.periodToHz(result.setPeriod!) : 0;
    }
  }
}
