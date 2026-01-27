/**
 * ITHandler - Impulse Tracker (IT) Effect Handler
 * 
 * Extends S3MHandler with IT-specific quirks and effects.
 */

import { S3MHandler } from './S3MHandler';
import { type ChannelState, type TickResult, type ModuleFormat } from './types';

export class ITHandler extends S3MHandler {
  readonly format: ModuleFormat = 'IT';

  /**
   * IT-specific frequency calculation
   * Impulse Tracker used a different base clock than Amiga PAL.
   * standard IT clock: 13316915 Hz
   * High-precision mode: 26633830 Hz (Double Clock)
   */
  public periodToHz(period: number): number {
    if (period <= 0) return 0;
    return 26633830 / period;
  }

  /**
   * Convert note string to IT period
   */
  public noteStringToPeriod(note: string, finetune: number = 0): number {
    // IT uses Amiga periods but scaled for its own clock
    // For now use default Amiga period logic
    return super.noteStringToPeriod(note, finetune);
  }

  /**
   * Process effect on tick 0
   */
  private processITEffectTick0(
    _channel: number,
    effect: string,
    state: ChannelState,
    result: TickResult
  ): void {
    const letter = effect[0].toUpperCase();
    const param = parseInt(effect.substring(1), 16);

    switch (letter) {
      case 'M':
        // Mxx: Set Channel Volume (0-64)
        state.channelVolume = Math.min(param, 64);
        result.setChannelVolume = state.channelVolume;
        break;

      case 'N':
        // Nxy: Channel Volume Slide
        if (param > 0) state.lastChannelVolumeSlide = param;
        const curParam = param > 0 ? param : (state.lastChannelVolumeSlide ?? 0);
        this.activeEffects.set(_channel, { 
          type: 'channelVolSlide', 
          param: curParam, 
          x: (curParam >> 4) & 0x0F, 
          y: curParam & 0x0F 
        });
        break;

      case 'Z':
        if (param <= 0x7F) {
          // Z00-Z7F: Set Cutoff
          state.filterCutoff = param;
          result.setFilterCutoff = param;
        } else if (param >= 0x80 && param <= 0x8F) {
          // Z80-Z8F: Set Resonance
          state.filterResonance = (param & 0x0F) << 3; // Map 0-15 to 0-127 approx
          result.setFilterResonance = state.filterResonance;
        }

        // Hardware Quirk: filter-7F.it
        // Filtering is only enabled if Cutoff < 127 or Resonance > 0
        if (state.filterCutoff === 0x7F && (state.filterResonance ?? 0) === 0) {
          result.setFilterCutoff = 255; // Bypass value
          state.filterCutoff = 0x7F; // Keep original value in state
        }
        break;
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
    // IT Quirk: Handle instrument change without note BEFORE calling super
    if (instrument !== null && instrument > 0) {
      state.instrumentId = instrument;
      
      const defaultVol = (state as any).sampleDefaultVolume ?? 64;
      const defaultFinetune = (state as any).sampleDefaultFinetune ?? 0;

      // In IT, instrument change resets volume if no volume column/effect override
      // (This is an approximation of IT's complex instrument mode)
      if (volume === null) {
        state.volume = defaultVol;
      }

      const oldFinetune = state.finetune;
      state.finetune = defaultFinetune;

      // If no note is present, re-calculate period
      if (!note || note === '...' || note === '---') {
        if (state.period > 0 && oldFinetune !== defaultFinetune) {
          // Re-calculate frequency based on new finetune
          // Frequency = BaseFreq * (NewFinetune / OldFinetune ratio)
          // Simplified: state.frequency remains Hz, we just update it
        }
      }
    }

    const result = super.processRowStart(channel, note, instrument, volume, effect, state);

    // IT processes auto-vibrato at tick 0 (unlike XM which only does ticks 1+)
    this.processAutoVibrato(state, result, 0);

    if (effect && effect.startsWith('Z')) {
      this.processITEffectTick0(channel, effect, state, result);
    }

    // Hardware Quirk: S7x - Past Note Action (NNA)
    if (effect && effect.toUpperCase().startsWith('S7')) {
      const mode = parseInt(effect[2], 16);
      if (mode <= 3) {
        state.nnaMode = mode; // 0=Cut, 1=Continue, 2=Off, 3=Fade
      } else if (mode === 7) {
        result.pastNoteAction = 0; // Cut Past Notes
      } else if (mode === 8) {
        result.pastNoteAction = 2; // Note Off Past Notes
      } else if (mode === 9) {
        result.pastNoteAction = 3; // Fade Past Notes
      }
    }

    // If a new note is triggering, set the NNA action in result
    if (result.triggerNote && instrument !== null) {
      result.nnaAction = state.nnaMode ?? 0; // Default to Note Cut for IT samples
    }

    return result;
  }

  /**
   * Process effect on ticks 1+
   */
  processTick(
    channel: number,
    tick: number,
    state: ChannelState
  ): TickResult {
    const result = super.processTick(channel, tick, state);

    // IT Specific: Process Channel Volume Slide (Nxy)
    const activeEffect = (this as any).activeEffects.get(channel);
    if (activeEffect && activeEffect.type === 'channelVolSlide') {
      const { x, y } = activeEffect;
      
      if (x === 0x0F && y > 0) {
        // Fine slide down
        if (tick === 0) { // Only on tick 0
          state.channelVolume = Math.max(0, (state.channelVolume ?? 64) - y);
        }
      } else if (y === 0x0F && x > 0) {
        // Fine slide up
        if (tick === 0) {
          state.channelVolume = Math.min(64, (state.channelVolume ?? 64) + x);
        }
      } else if (tick > 0) {
        // Normal slide
        if (x > 0) {
          state.channelVolume = Math.min(64, (state.channelVolume ?? 64) + x);
        } else if (y > 0) {
          state.channelVolume = Math.max(0, (state.channelVolume ?? 64) - y);
        }
      }
      result.setChannelVolume = state.channelVolume;
    }

    return result;
  }
}
