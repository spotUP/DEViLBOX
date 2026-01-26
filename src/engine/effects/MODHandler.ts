/**
 * MODHandler - ProTracker (MOD) Effect Handler
 *
 * Implements all ProTracker effect commands with accurate quirk emulation:
 * - Period-based pitch (Amiga style)
 * - All standard effects (0-F)
 * - Extended E-commands (E0x-EFx)
 * - Optional bug emulation (arpeggio overflow, portamento limits, etc.)
 */

import { type ChannelState, type TickResult, type FormatConfig } from './types';
import { BaseFormatHandler } from './FormatHandler';
import {
  PT_MIN_PERIOD,
  PT_MAX_PERIOD,
  periodToFrequency,
  noteStringToPeriod,
  getArpeggioPeriod,
  snapPeriodToSemitone,
  VIBRATO_TABLE,
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
  SET_PANNING: 0x8,      // Not in original PT, but common extension
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
  FILTER: 0x0,           // E0x - Amiga LED filter (not implemented)
  FINE_PORTA_UP: 0x1,    // E1x - Fine portamento up
  FINE_PORTA_DOWN: 0x2,  // E2x - Fine portamento down
  GLISSANDO: 0x3,        // E3x - Glissando control
  VIBRATO_WAVEFORM: 0x4, // E4x - Set vibrato waveform
  FINETUNE: 0x5,         // E5x - Set finetune
  PATTERN_LOOP: 0x6,     // E6x - Pattern loop
  TREMOLO_WAVEFORM: 0x7, // E7x - Set tremolo waveform
  PANNING: 0x8,          // E8x - Set panning (coarse)
  RETRIG: 0x9,           // E9x - Retrigger note
  FINE_VOL_UP: 0xA,      // EAx - Fine volume slide up
  FINE_VOL_DOWN: 0xB,    // EBx - Fine volume slide down
  NOTE_CUT: 0xC,         // ECx - Note cut
  NOTE_DELAY: 0xD,       // EDx - Note delay
  PATTERN_DELAY: 0xE,    // EEx - Pattern delay
  INVERT_LOOP: 0xF,      // EFx - Invert loop / Funk repeat
};

/**
 * ProTracker effect handler
 */
export class MODHandler extends BaseFormatHandler {
  readonly format = 'MOD' as const;

  // ProTracker-specific settings
  private emulatePTBugs: boolean = true;
  private ciaBPMDelay: number | null = null; // For CIA timing bug

  // Active effects per channel (for tick processing)
  private activeEffects: Map<number, {
    type: string;
    param: number;
    x: number;
    y: number;
  }> = new Map();

  // Pattern loop state
  private patternLoopRow: number = 0;
  private patternLoopCount: number = 0;
  public patternDelayCount: number = 0; // Used for EEx pattern delay effect

  /**
   * Initialize with format config
   */
  init(config: FormatConfig): void {
    super.init(config);
    this.emulatePTBugs = config.emulatePTBugs ?? true;
    this.activeEffects.clear();
    this.patternLoopRow = 0;
    this.patternLoopCount = 0;
    this.patternDelayCount = 0;
    this.ciaBPMDelay = null;
  }

  /**
   * Reset all state
   */
  resetAll(): void {
    super.resetAll();
    this.activeEffects.clear();
    this.patternLoopRow = 0;
    this.patternLoopCount = 0;
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
    volume: number | null,
    effect: string | null,
    state: ChannelState
  ): TickResult {
    const result: TickResult = {};

    // Clear active effect for this channel
    this.activeEffects.delete(channel);

    // Handle delayed BPM change (CIA timing bug)
    if (this.emulatePTBugs && this.ciaBPMDelay !== null) {
      result.setBPM = this.ciaBPMDelay;
      this.ciaBPMDelay = null;
    }

    // Handle instrument change
    if (instrument !== null && instrument > 0) {
      state.instrumentId = instrument;
      // In ProTracker, instrument change resets volume
      // UNLESS it's a tone portamento (3xx) which preserves volume
      const parsed = this.parseEffect(effect);
      const isTonePorta = parsed && (
        parsed.command === MOD_EFFECTS.TONE_PORTA ||
        parsed.command === MOD_EFFECTS.TONE_PORTA_VOL_SLIDE
      );
      if (!isTonePorta) {
        state.volume = 64;
        result.setVolume = state.volume;
      }
    }

    // Handle note
    if (note && note !== '...' && note !== '---') {
      if (note === '===' || note === '^^^') {
        // Note off
        result.cutNote = true;
        state.noteOn = false;
      } else {
        // Convert note to period
        const period = noteStringToPeriod(note, state.finetune);
        if (period > 0) {
          // Check if this is a tone portamento target
          const parsed = this.parseEffect(effect);
          if (parsed && (parsed.command === MOD_EFFECTS.TONE_PORTA ||
                        parsed.command === MOD_EFFECTS.TONE_PORTA_VOL_SLIDE)) {
            // Don't trigger note, just set portamento target
            state.portamentoTarget = period;
          } else {
            // Trigger note
            state.period = period;
            state.frequency = periodToFrequency(period);
            state.noteOn = true;
            result.triggerNote = true;
            result.setPeriod = period;

            // Reset vibrato/tremolo position on new note (unless waveform bit 4 set)
            if (state.vibratoRetrigger) state.vibratoPos = 0;
            if (state.tremoloRetrigger) state.tremoloPos = 0;
          }
        }
      }
    }

    // Handle volume column (not in original PT, but common extension)
    if (volume !== null && volume >= 0 && volume <= 64) {
      state.volume = volume;
      result.setVolume = volume;
    }

    // Process effect command
    if (effect) {
      const effectResult = this.processEffectTick0(channel, effect, state, note, instrument);
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
    note: string | null,
    _instrument: number | null // Kept for signature consistency, unused after 9xx simplification
  ): TickResult {
    const result: TickResult = {};
    const parsed = this.parseEffect(effect);
    if (!parsed) return result;

    const { command, x, y, param } = parsed;

    switch (command) {
      // 0xy - Arpeggio
      case MOD_EFFECTS.ARPEGGIO:
        if (param !== 0) {
          state.lastArpeggio = param;
          this.activeEffects.set(channel, { type: 'arpeggio', param, x, y });
        }
        break;

      // 1xx - Portamento up
      case MOD_EFFECTS.PORTA_UP:
        if (param > 0) state.lastPortaUp = param;
        this.activeEffects.set(channel, { type: 'portaUp', param: state.lastPortaUp, x, y });
        break;

      // 2xx - Portamento down
      case MOD_EFFECTS.PORTA_DOWN:
        if (param > 0) state.lastPortaDown = param;
        this.activeEffects.set(channel, { type: 'portaDown', param: state.lastPortaDown, x, y });
        break;

      // 3xx - Tone portamento
      case MOD_EFFECTS.TONE_PORTA:
        if (param > 0) state.lastTonePortaSpeed = param;
        // Note: Volume reset for instrument change with 3xx is handled in processRowStart()
        this.activeEffects.set(channel, { type: 'tonePorta', param: state.lastTonePortaSpeed, x, y });
        break;

      // 4xy - Vibrato
      case MOD_EFFECTS.VIBRATO:
        if (x > 0) state.lastVibratoSpeed = x;
        if (y > 0) state.lastVibratoDepth = y;
        state.vibratoSpeed = state.lastVibratoSpeed;
        state.vibratoDepth = state.lastVibratoDepth;
        this.activeEffects.set(channel, { type: 'vibrato', param, x, y });
        break;

      // 5xy - Tone portamento + volume slide
      case MOD_EFFECTS.TONE_PORTA_VOL_SLIDE:
        this.activeEffects.set(channel, { type: 'tonePortaVolSlide', param, x, y });
        break;

      // 6xy - Vibrato + volume slide
      case MOD_EFFECTS.VIBRATO_VOL_SLIDE:
        this.activeEffects.set(channel, { type: 'vibratoVolSlide', param, x, y });
        break;

      // 7xy - Tremolo
      case MOD_EFFECTS.TREMOLO:
        if (x > 0) state.lastTremoloSpeed = x;
        if (y > 0) state.lastTremoloDepth = y;
        state.tremoloSpeed = state.lastTremoloSpeed;
        state.tremoloDepth = state.lastTremoloDepth;
        this.activeEffects.set(channel, { type: 'tremolo', param, x, y });
        break;

      // 8xx - Set panning (extension)
      case MOD_EFFECTS.SET_PANNING:
        state.pan = param;
        result.setPan = param;
        break;

      // 9xx - Sample offset (PT2.3D accurate implementation)
      case MOD_EFFECTS.SAMPLE_OFFSET: {
        /* PT2.3D behavior (from pt2-clone source):
         * - If param > 0, store it for future use
         * - If param = 0, use previously stored value
         * - Offset = stored_param * 256 bytes (128 words * 2 bytes/word)
         * - No doubling bugs, no PT1/2 quirks
         */

        // Store param if > 0, otherwise use cached value
        if (param > 0) {
          state.lastSampleOffset = param;
        }

        // Calculate offset: param * 256 bytes
        // PT2 does: (param << 7) for words, then << 1 for bytes = 256
        const offsetValue = state.lastSampleOffset << 8;

        result.sampleOffset = offsetValue;
        break;
      }

      // Axy - Volume slide
      case MOD_EFFECTS.VOLUME_SLIDE:
        if (param > 0) state.lastVolumeSlide = param;
        this.activeEffects.set(channel, { type: 'volumeSlide', param: state.lastVolumeSlide, x, y });
        break;

      // Bxx - Position jump
      case MOD_EFFECTS.POSITION_JUMP:
        result.positionJump = param;
        break;

      // Cxx - Set volume
      case MOD_EFFECTS.SET_VOLUME: {
        const vol = Math.min(param, 64);
        state.volume = vol;
        result.setVolume = vol;
        break;
      }

      // Dxx - Pattern break
      case MOD_EFFECTS.PATTERN_BREAK: {
        // In ProTracker, Dxx parameter is BCD (D32 = row 32, not 50)
        const breakRow = x * 10 + y;
        result.patternBreak = Math.min(breakRow, 63);
        break;
      }

      // Exx - Extended commands
      case MOD_EFFECTS.E_COMMANDS:
        this.processECommandTick0(channel, x, y, state, note, result);
        break;

      // Fxx - Set speed/tempo
      case MOD_EFFECTS.SET_SPEED:
        if (param === 0) {
          // F00 = stop (not implemented - would require transport control)
        } else if (param < 0x20) {
          // 01-1F: Set speed (ticks per row)
          this.speed = param;
          result.setSpeed = param;
        } else {
          // 20-FF: Set BPM
          if (this.emulatePTBugs) {
            // CIA timing bug: BPM change delayed by 1 tick
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
      // E0x - Amiga filter (not implemented)
      case MOD_E_COMMANDS.FILTER:
        break;

      // E1x - Fine portamento up
      case MOD_E_COMMANDS.FINE_PORTA_UP:
        if (y > 0 && state.period > 0) {
          state.period = Math.max(PT_MIN_PERIOD, state.period - y);
          state.frequency = periodToFrequency(state.period);
          result.setPeriod = state.period;
        }
        break;

      // E2x - Fine portamento down
      case MOD_E_COMMANDS.FINE_PORTA_DOWN:
        if (y > 0 && state.period > 0) {
          state.period = Math.min(PT_MAX_PERIOD, state.period + y);
          state.frequency = periodToFrequency(state.period);
          result.setPeriod = state.period;
        }
        break;

      // E3x - Glissando control
      case MOD_E_COMMANDS.GLISSANDO:
        // y=0: Off (smooth portamento)
        // y=1: On (round tone portamento to nearest semitone)
        state.glissando = (y !== 0);
        break;

      // E4x - Vibrato waveform
      case MOD_E_COMMANDS.VIBRATO_WAVEFORM:
        state.vibratoWaveform = this.waveformFromNumber(y & 3);
        state.vibratoRetrigger = (y & 4) === 0;
        break;

      // E5x - Set finetune
      case MOD_E_COMMANDS.FINETUNE:
        // Convert unsigned 0-15 to signed -8 to +7
        state.finetune = y > 7 ? y - 16 : y;
        break;

      // E6x - Pattern loop
      case MOD_E_COMMANDS.PATTERN_LOOP:
        if (y === 0) {
          // Set loop start point
          this.patternLoopRow = this.currentRow;
        } else {
          // Loop y times
          if (this.patternLoopCount === 0) {
            this.patternLoopCount = y;
          } else {
            this.patternLoopCount--;
          }
          if (this.patternLoopCount > 0) {
            result.patternLoop = {
              startRow: this.patternLoopRow,
              count: this.patternLoopCount,
            };
          }
        }
        break;

      // E7x - Tremolo waveform
      case MOD_E_COMMANDS.TREMOLO_WAVEFORM:
        state.tremoloWaveform = this.waveformFromNumber(y & 3);
        state.tremoloRetrigger = (y & 4) === 0;
        break;

      // E8x - Set panning (coarse)
      case MOD_E_COMMANDS.PANNING:
        state.pan = y * 17; // 0-15 -> 0-255
        result.setPan = state.pan;
        break;

      // E9x - Retrigger note
      case MOD_E_COMMANDS.RETRIG:
        if (y > 0) {
          state.retrigTick = y;
          this.activeEffects.set(channel, { type: 'retrig', param: y, x: 0, y });
        }
        break;

      // EAx - Fine volume slide up
      case MOD_E_COMMANDS.FINE_VOL_UP:
        state.volume = this.clampVolume(state.volume + y);
        result.setVolume = state.volume;
        break;

      // EBx - Fine volume slide down
      case MOD_E_COMMANDS.FINE_VOL_DOWN:
        state.volume = this.clampVolume(state.volume - y);
        result.setVolume = state.volume;
        break;

      // ECx - Note cut
      case MOD_E_COMMANDS.NOTE_CUT:
        state.noteCutTick = y;
        this.activeEffects.set(channel, { type: 'noteCut', param: y, x: 0, y });
        break;

      // EDx - Note delay
      case MOD_E_COMMANDS.NOTE_DELAY:
        if (y > 0 && note) {
          state.noteDelayTick = y;
          this.activeEffects.set(channel, { type: 'noteDelay', param: y, x: 0, y });
          // Note will be triggered later, so prevent immediate trigger
          result.preventNoteTrigger = true;
        }
        break;

      // EEx - Pattern delay
      case MOD_E_COMMANDS.PATTERN_DELAY:
        if (y > 0) {
          this.patternDelayCount = y;
          result.patternDelay = y;
        }
        break;

      // EFx - Invert loop / Funk repeat
      case MOD_E_COMMANDS.INVERT_LOOP:
        // This is a destructive effect that modifies sample data
        // Not implemented as it requires direct sample access
        break;
    }
  }

  /**
   * Process effect on ticks 1+ (not tick 0)
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
        this.processVibrato(state, result);
        break;

      case 'tonePortaVolSlide':
        this.processTonePorta(state, state.lastTonePortaSpeed, result);
        this.processVolumeSlide(state, x, y, result, tick);
        break;

      case 'vibratoVolSlide':
        this.processVibrato(state, result);
        this.processVolumeSlide(state, x, y, result, tick);
        break;

      case 'tremolo':
        this.processTremolo(state, result);
        break;

      case 'volumeSlide':
        this.processVolumeSlide(state, x, y, result, tick);
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

    return result;
  }

  /**
   * Process arpeggio effect (0xy)
   */
  private processArpeggio(
    tick: number,
    state: ChannelState,
    x: number,
    y: number,
    result: TickResult
  ): void {
    if (state.period <= 0) return;

    // Cycle through base, +x, +y semitones
    const offsets = [0, x, y];
    const offset = offsets[tick % 3];

    if (offset === 0) {
      result.setPeriod = state.period;
    } else {
      const newPeriod = getArpeggioPeriod(
        state.period,
        offset,
        state.finetune,
        this.emulatePTBugs
      );
      result.setPeriod = newPeriod;
    }

    result.setFrequency = periodToFrequency(result.setPeriod!);
  }

  /**
   * Process portamento up (1xx)
   */
  private processPortaUp(state: ChannelState, speed: number, result: TickResult): void {
    if (state.period <= 0) return;

    state.period -= speed;
    if (state.period < PT_MIN_PERIOD) {
      state.period = PT_MIN_PERIOD;
    }

    state.frequency = periodToFrequency(state.period);
    result.setPeriod = state.period;
    result.setFrequency = state.frequency;
  }

  /**
   * Process portamento down (2xx)
   */
  private processPortaDown(state: ChannelState, speed: number, result: TickResult): void {
    if (state.period <= 0) return;

    state.period += speed;
    if (state.period > PT_MAX_PERIOD) {
      state.period = PT_MAX_PERIOD;
    }

    state.frequency = periodToFrequency(state.period);
    result.setPeriod = state.period;
    result.setFrequency = state.frequency;
  }

  /**
   * Process tone portamento (3xx)
   */
  private processTonePorta(state: ChannelState, speed: number, result: TickResult): void {
    if (state.period <= 0 || state.portamentoTarget <= 0) return;

    // Slide period towards target
    if (state.period < state.portamentoTarget) {
      state.period += speed;
      if (state.period > state.portamentoTarget) {
        state.period = state.portamentoTarget;
      }
    } else if (state.period > state.portamentoTarget) {
      state.period -= speed;
      if (state.period < state.portamentoTarget) {
        state.period = state.portamentoTarget;
      }
    }

    // Apply glissando (E3x) - snap to nearest semitone
    let finalPeriod = state.period;
    if (state.glissando) {
      finalPeriod = snapPeriodToSemitone(state.period, state.finetune);
    }

    state.frequency = periodToFrequency(finalPeriod);
    result.setPeriod = finalPeriod;
    result.setFrequency = state.frequency;
  }

  /**
   * Process vibrato (4xy)
   */
  private processVibrato(state: ChannelState, result: TickResult): void {
    if (state.period <= 0) return;

    // Get waveform value (-1 to 1)
    const waveValue = this.getWaveformValue(state.vibratoWaveform, state.vibratoPos);

    // PT2.3D vibrato scaling: (waveValue * depth) >> 7
    // Since waveValue is normalized (-1 to 1), we multiply by depth * 2
    // to match PT2's (255 * depth / 128) ≈ depth * 2 formula
    const delta = Math.floor(waveValue * state.vibratoDepth * 2);

    // Apply to period (don't modify base period, just output)
    const newPeriod = state.period + delta;
    result.setPeriod = newPeriod;
    result.setFrequency = periodToFrequency(newPeriod);

    // Advance vibrato position: PT2 uses (speed >> 2) & 0x3C
    // With speed stored as nibble (0-15), this becomes speed * 4
    state.vibratoPos = (state.vibratoPos + state.vibratoSpeed * 4) & 0x3F;
  }

  /**
   * Process tremolo (7xy)
   * Note: In original ProTracker, tremolo uses vibratoPos (bug in ramp waveform)
   */
  private processTremolo(state: ChannelState, result: TickResult): void {
    // ProTracker 1:1 implementation
    const pos = this.emulatePTBugs ? state.vibratoPos : state.tremoloPos;
    
    // Map string waveform to number: 0=sine, 1=ramp, 2=square, 3=random
    let type = 0;
    switch (state.tremoloWaveform) {
      case 'rampDown': type = 1; break;
      case 'square': type = 2; break;
      case 'random': type = 3; break;
      default: type = 0;
    }
    
    // Calculate table index (0-31)
    const tableIndex = pos & 0x1F;
    
    let tremoloData = 0;
    
    switch (type) {
      case 0: // Sine
        tremoloData = VIBRATO_TABLE[tableIndex];
        break;
      case 1: // Ramp
        // PT Bug: Ramp uses vibratoPos even if tremoloPos should be used
        // Since we selected 'pos' based on emulatePTBugs above, we just check phase
        // Ramp down: 255 -> 0
        if (this.emulatePTBugs ? (state.vibratoPos & 0x20) === 0 : (state.tremoloPos & 0x20) === 0) {
          tremoloData = tableIndex << 3; // 0-31 -> 0-248
        } else {
          tremoloData = 255 - (tableIndex << 3);
        }
        break;
      case 2: // Square
        tremoloData = 255;
        break;
      case 3: // Random (not in standard PT, but in extensions)
        tremoloData = Math.floor(Math.random() * 255);
        break;
    }

    // Apply scaling: (data * depth) / 64
    const delta = (tremoloData * state.tremoloDepth) >> 6;

    // Apply to volume
    // Add if phase is 0-31, Subtract if 32-63
    let newVolume = state.volume;
    if ((pos & 0x20) === 0) {
      newVolume += delta;
      if (newVolume > 64) newVolume = 64;
    } else {
      newVolume -= delta;
      if (newVolume < 0) newVolume = 0;
    }
    
    result.setVolume = newVolume;

    // Advance tremolo position
    // PT2: ch->n_tremolopos += (ch->n_tremolocmd >> 2) & 0x3C;
    // DEViLBOX stores speed (x) separately. x * 4 is equivalent.
    state.tremoloPos = (state.tremoloPos + state.tremoloSpeed * 4) & 0x3F;
    
    // PT bug: Tremolo updates vibrato position too if emulating bugs
    if (this.emulatePTBugs) {
        state.vibratoPos = state.tremoloPos; 
    }
  }

  /**
   * Process volume slide (Axy, 5xy, 6xy)
   * Note: Volume slides should NOT happen on tick 0
   */
  private processVolumeSlide(
    state: ChannelState,
    up: number,
    down: number,
    result: TickResult,
    tick?: number
  ): void {
    // Volume slides don't happen on tick 0 in ProTracker
    if (tick === 0) return;

    if (up > 0) {
      state.volume = this.clampVolume(state.volume + up);
    } else if (down > 0) {
      state.volume = this.clampVolume(state.volume - down);
    }
    result.setVolume = state.volume;
  }
}
