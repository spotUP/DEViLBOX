/**
 * EffectCommands - FastTracker II Effect Command Processor
 *
 * Full implementation of FT2 effect commands:
 * - Main effects: 0-9, A-F
 * - E-commands: E0x-EEx (extended effects)
 * - Additional: Gxx, Hxy, Lxx, Pxy, Rxy, Txy, X1x, X2x
 *
 * Effect format: XYZ where X is command, YZ is parameter (all hex)
 * Tick system: First tick plays note, subsequent ticks process effects
 */

import * as Tone from 'tone';

export type EffectCommand = string | null; // "A0F", "301", "C40", etc.

// Vibrato/Tremolo waveform types
export type WaveformType = 'sine' | 'rampDown' | 'square' | 'random';

export interface EffectMemory {
  [channelIndex: number]: {
    // Portamento
    portaUp?: number;
    portaDown?: number;
    tonePortaSpeed?: number;
    tonePortaTarget?: number; // Target frequency

    // Vibrato
    vibratoSpeed?: number;
    vibratoDepth?: number;
    vibratoWaveform?: WaveformType;
    vibratoNoRetrig?: boolean;
    vibratoPhase?: number; // Persistent phase 0-63

    // Tremolo
    tremoloSpeed?: number;
    tremoloDepth?: number;
    tremoloWaveform?: WaveformType;
    tremoloNoRetrig?: boolean;
    tremoloPhase?: number; // Persistent phase 0-63

    // Volume
    volumeSlideUp?: number;
    volumeSlideDown?: number;
    volume?: number; // Current volume 0-64

    // Global
    globalVolume?: number; // 0-64
    globalSlideUp?: number;
    globalSlideDown?: number;

    // Panning
    pan?: number; // 0-255
    panSlideRight?: number;
    panSlideLeft?: number;

    // Sample
    sampleOffset?: number;

    // Pattern loop
    loopStart?: number;
    loopCount?: number;

    // Retrig
    retrigInterval?: number;
    retrigVolChange?: number;

    // Tremor
    tremorOnTime?: number;
    tremorOffTime?: number;

    // Current frequency for portamento
    currentFreq?: number;

    // Zxx MIDI Macro (IT-style filter)
    filterCutoff?: number;     // 0-127
    filterResonance?: number;  // 0-15
    filterMode?: 'lowpass' | 'highpass' | 'bandpass';

    // Smooth macro target for \xx
    smoothMacroTarget?: number;
    smoothMacroStart?: number;

    // Wxx - Global Pitch Shift (DJ-style)
    globalPitchShift?: number; // 0-255, centered at 128 (0x80)
  };
}

export interface EffectState {
  // Active effects for current row
  arpeggio?: {
    baseNote: string;
    baseFreq: number;
    x: number; // semitones
    y: number; // semitones
    step: number;
  };

  portaUp?: {
    speed: number;
  };

  portaDown?: {
    speed: number;
  };

  tonePorta?: {
    targetFreq: number;
    speed: number;
  };

  vibrato?: {
    speed: number;
    depth: number;
    waveform: WaveformType;
  };

  tremolo?: {
    speed: number;
    depth: number;
    waveform: WaveformType;
  };

  volumeSlide?: {
    up: number;
    down: number;
  };

  panSlide?: {
    right: number;
    left: number;
  };

  retrig?: {
    interval: number;
    volChange: number;
    tickCounter: number;
  };

  tremor?: {
    onTime: number;
    offTime: number;
    tickCounter: number;
    isOn: boolean;
  };

  noteCut?: {
    tick: number;
  };

  noteDelay?: {
    tick: number;
    note: string;
    instrument: number;
  };

  patternDelay?: {
    rows: number;
  };

  // Smooth MIDI Macro (\xx)
  smoothMacro?: {
    startValue: number;
    targetValue: number;
    ticksTotal: number;
  };
}

// Result of processing an effect - actions to take
export interface EffectResult {
  // Transport control
  setBPM?: number;
  setSpeed?: number; // Ticks per row
  jumpToPosition?: number;
  patternBreak?: { position: number };

  // Note control
  preventNoteTrigger?: boolean;
  delayedNote?: { note: string; tick: number };

  // Volume
  setVolume?: number; // 0-64
  setGlobalVolume?: number; // 0-64

  // Panning
  setPan?: number; // 0-255 (0=left, 128=center, 255=right)

  // Global Pitch Shift (DJ-style)
  setGlobalPitchShift?: number; // semitones (-12 to +12)

  // Sample
  sampleOffset?: number;

  // Amiga Filter
  setAmigaFilter?: boolean;

  // IT-style Envelope Controls (S77-S7C)
  envelopeControl?: {
    volume?: boolean;      // true = on, false = off
    panning?: boolean;     // true = on, false = off
    pitch?: boolean;       // true = on, false = off (also controls filter)
  };

  // IT-style New Note Action (S70-S76)
  newNoteAction?: 'cut' | 'continue' | 'noteOff' | 'noteFade';
  duplicateCheck?: 'note' | 'sample' | 'instrument' | 'off';

  // Zxx MIDI Macro (IT-style filter control)
  setFilterCutoff?: number;    // 0-127 (Z00-Z7F)
  setFilterResonance?: number; // 0-15 (Z80-Z8F)
  setFilterMode?: 'lowpass' | 'highpass' | 'bandpass'; // Z90-Z9F
}

// ProTracker vibrato/tremolo sine table
const VIBRATO_TABLE = [
  0, 24, 49, 74, 97, 120, 141, 161, 180, 197, 212, 224, 235, 244, 250, 253,
  255, 253, 250, 244, 235, 224, 212, 197, 180, 161, 141, 120, 97, 74, 49, 24
];

export class EffectProcessor {
  private memory: EffectMemory = {};
  private channelStates: Map<number, EffectState> = new Map();
  private ticksPerRow: number = 6; // Default FT2 speed
  // @ts-expect-error Reserved for future tick tracking
  private _currentTick: number = 0;

  // Global state
  private globalVolume: number = 64; // 0-64

  /**
   * Parse effect command string (e.g., "A0F", "301", "E91")
   */
  private parseEffect(effect: EffectCommand): { command: number; x: number; y: number; param: number } | null {
    if (!effect || effect === '...' || effect === '000') return null;

    // Effect format: XYZ where X is command, YZ is parameter
    const effectStr = effect.toUpperCase().padEnd(3, '0');
    const command = parseInt(effectStr[0], 16);
    const x = parseInt(effectStr[1], 16);
    const y = parseInt(effectStr[2], 16);
    const param = x * 16 + y; // Combined parameter (0x00-0xFF)

    if (isNaN(command) || isNaN(x) || isNaN(y)) return null;

    return { command, x, y, param };
  }

  /**
   * Convert note name to frequency
   */
  private noteToFrequency(note: string): number {
    try {
      return Tone.Frequency(note.replace('-', '')).toFrequency();
    } catch {
      return 440; // Default to A4
    }
  }

  /**
   * Convert frequency to nearest note
   * @internal - Reserved for future use
   */
  // @ts-expect-error Reserved for future use
  private _frequencyToNote(freq: number): string {
    try {
      return Tone.Frequency(freq).toNote();
    } catch {
      return 'C4';
    }
  }

  /**
   * Get waveform value for vibrato/tremolo
   */
  private getWaveformValue(waveform: WaveformType, phase: number): number {
    const p = phase & 63;

    switch (waveform) {
      case 'sine': {
        // Use authentic ProTracker sine table
        const tableValue = VIBRATO_TABLE[p & 31];
        return p < 32 ? tableValue / 255 : -(tableValue / 255);
      }
      case 'rampDown':
        return 1 - ((p % 32) / 16);
      case 'square':
        return p < 32 ? 1 : -1;
      case 'random':
        return Math.random() * 2 - 1;
      default:
        return Math.sin((p / 64) * Math.PI * 2);
    }
  }

  /**
   * Initialize channel memory
   */
  private ensureMemory(channelIndex: number): void {
    if (!this.memory[channelIndex]) {
      this.memory[channelIndex] = {
        volume: 64,
        pan: 128,
        vibratoWaveform: 'sine',
        tremoloWaveform: 'sine',
      };
    }
  }

  /**
   * Process effect at row start (tick 0)
   * Returns actions to take
   */
  public processRowStart(
    channelIndex: number,
    note: string | null,
    effect: EffectCommand,
    volume: number | null
  ): EffectResult {
    this.ensureMemory(channelIndex);

    const result: EffectResult = {};
    const parsed = this.parseEffect(effect);

    // Initialize state for this row
    const state: EffectState = {};
    this.channelStates.set(channelIndex, state);

    // Update current frequency if note is played
    if (note && note !== '===' && note !== '...') {
      this.memory[channelIndex].currentFreq = this.noteToFrequency(note);
    }

    // Set volume if specified (volume column)
    if (volume !== null && volume >= 0 && volume <= 64) {
      this.memory[channelIndex].volume = volume;
      result.setVolume = volume;
    }

    if (!parsed) return result;

    const { command, x, y, param } = parsed;
    const mem = this.memory[channelIndex];

    switch (command) {
      // ========== 0xy - Arpeggio ==========
      case 0x0:
        if (x !== 0 || y !== 0) {
          const baseFreq = mem.currentFreq || this.noteToFrequency(note || 'C4');
          state.arpeggio = {
            baseNote: note || 'C4',
            baseFreq,
            x,
            y,
            step: 0,
          };
        }
        break;

      // ========== 1xx - Portamento Up ==========
      case 0x1:
        if (param > 0) mem.portaUp = param;
        state.portaUp = { speed: mem.portaUp || 1 };
        break;

      // ========== 2xx - Portamento Down ==========
      case 0x2:
        if (param > 0) mem.portaDown = param;
        state.portaDown = { speed: mem.portaDown || 1 };
        break;

      // ========== 3xx - Tone Portamento ==========
      case 0x3:
        if (param > 0) mem.tonePortaSpeed = param;
        if (note && note !== '===' && note !== '...') {
          mem.tonePortaTarget = this.noteToFrequency(note);
          result.preventNoteTrigger = true; // Don't play note, slide to it
        }
        if (mem.tonePortaTarget) {
          state.tonePorta = {
            targetFreq: mem.tonePortaTarget,
            speed: mem.tonePortaSpeed || 1,
          };
        }
        break;

      // ========== 4xy - Vibrato ==========
      case 0x4:
        if (x > 0) mem.vibratoSpeed = x;
        if (y > 0) mem.vibratoDepth = y;
        state.vibrato = {
          speed: mem.vibratoSpeed || 4,
          depth: mem.vibratoDepth || 4,
          waveform: mem.vibratoWaveform || 'sine',
        };
        break;

      // ========== 5xy - Tone Porta + Volume Slide ==========
      case 0x5:
        // Continue tone portamento
        if (mem.tonePortaTarget) {
          state.tonePorta = {
            targetFreq: mem.tonePortaTarget,
            speed: mem.tonePortaSpeed || 1,
          };
        }
        // Volume slide
        if (x > 0) {
          state.volumeSlide = { up: x, down: 0 };
        } else if (y > 0) {
          state.volumeSlide = { up: 0, down: y };
        }
        break;

      // ========== 6xy - Vibrato + Volume Slide ==========
      case 0x6:
        // Continue vibrato
        state.vibrato = {
          speed: mem.vibratoSpeed || 4,
          depth: mem.vibratoDepth || 4,
          waveform: mem.vibratoWaveform || 'sine',
        };
        // Volume slide
        if (x > 0) {
          state.volumeSlide = { up: x, down: 0 };
        } else if (y > 0) {
          state.volumeSlide = { up: 0, down: y };
        }
        break;

      // ========== 7xy - Tremolo ==========
      case 0x7:
        if (x > 0) mem.tremoloSpeed = x;
        if (y > 0) mem.tremoloDepth = y;
        state.tremolo = {
          speed: mem.tremoloSpeed || 4,
          depth: mem.tremoloDepth || 4,
          waveform: mem.tremoloWaveform || 'sine',
        };
        break;

      // ========== 8xx - Set Panning ==========
      case 0x8:
        mem.pan = param;
        result.setPan = param;
        break;

      // ========== 9xx - Sample Offset ==========
      case 0x9:
        if (param > 0) mem.sampleOffset = param;
        result.sampleOffset = (mem.sampleOffset || 0) * 256;
        break;

      // ========== Axy - Volume Slide ==========
      case 0xA:
        if (x > 0) {
          mem.volumeSlideUp = x;
          mem.volumeSlideDown = 0;
        } else if (y > 0) {
          mem.volumeSlideUp = 0;
          mem.volumeSlideDown = y;
        }
        state.volumeSlide = {
          up: mem.volumeSlideUp || 0,
          down: mem.volumeSlideDown || 0,
        };
        break;

      // ========== Bxx - Jump to Song Position ==========
      case 0xB:
        result.jumpToPosition = param;
        break;

      // ========== Cxx - Set Volume ==========
      case 0xC: {
        const vol = Math.min(param, 64);
        mem.volume = vol;
        result.setVolume = vol;
        break;
      }

      // ========== Dxx - Pattern Break ==========
      case 0xD: {
        // param is decimal-coded: D32 = row 32, not row 50
        const breakRow = x * 10 + y;
        result.patternBreak = { position: breakRow };
        break;
      }

      // ========== Exx - Extended Commands ==========
      case 0xE:
        this.processECommand(channelIndex, x, y, note, state, result);
        break;

      // ========== Fxx - Set Speed/BPM ==========
      case 0xF:
        if (param === 0) {
          // F00 = stop song (not implemented)
        } else if (param < 0x20) {
          // 01-1F: Set speed (ticks per row)
          this.ticksPerRow = param;
          result.setSpeed = param;
        } else {
          // 20-FF: Set BPM
          result.setBPM = param;
        }
        break;

      // ========== Gxx - Set Global Volume ==========
      case 0x10: // 'G' in hex extended
        break; // Handled below
    }

    // Extended commands (G, H, L, P, R, T, X) - these use letter codes
    const effectLetter = effect?.toUpperCase()[0];

    if (effectLetter === 'G') {
      // Gxx - Set Global Volume (0-40)
      const gvol = Math.min(param, 64);
      this.globalVolume = gvol;
      result.setGlobalVolume = gvol;
    }
    else if (effectLetter === 'H') {
      // Hxy - Global Volume Slide
      if (x > 0) {
        mem.globalSlideUp = x;
        mem.globalSlideDown = 0;
      } else if (y > 0) {
        mem.globalSlideUp = 0;
        mem.globalSlideDown = y;
      }
    }
    else if (effectLetter === 'L') {
      // Lxx - Set Envelope Position (not implemented - no envelope system)
    }
    else if (effectLetter === 'P') {
      // Pxy - Panning Slide
      if (x > 0) {
        mem.panSlideRight = x;
        mem.panSlideLeft = 0;
      } else if (y > 0) {
        mem.panSlideRight = 0;
        mem.panSlideLeft = y;
      }
      state.panSlide = {
        right: mem.panSlideRight || 0,
        left: mem.panSlideLeft || 0,
      };
    }
    else if (effectLetter === 'R') {
      // Rxy - Multi Retrig
      if (x > 0) mem.retrigInterval = x;
      if (y >= 0) mem.retrigVolChange = y;
      state.retrig = {
        interval: mem.retrigInterval || 1,
        volChange: mem.retrigVolChange || 0,
        tickCounter: 0,
      };
    }
    else if (effectLetter === 'T') {
      // Txy - Tremor
      if (x > 0) mem.tremorOnTime = x;
      if (y > 0) mem.tremorOffTime = y;
      state.tremor = {
        onTime: mem.tremorOnTime || 1,
        offTime: mem.tremorOffTime || 1,
        tickCounter: 0,
        isOn: true,
      };
    }
    else if (effectLetter === 'X') {
      // X1x - Extra Fine Porta Up, X2x - Extra Fine Porta Down
      if (x === 1) {
        // Extra fine portamento up (speed / 4)
        state.portaUp = { speed: y / 4 };
      } else if (x === 2) {
        // Extra fine portamento down (speed / 4)
        state.portaDown = { speed: y / 4 };
      }
    }
    else if (effectLetter === 'S') {
      // Sxx - IT-style Extended Commands
      // S70-S76: Past Note Actions / New Note Actions
      // S77-S7C: Envelope Controls
      if (x === 7) {
        switch (y) {
          // S70-S73: New Note Action settings
          case 0x0: // S70 - NNA Cut
            result.newNoteAction = 'cut';
            break;
          case 0x1: // S71 - NNA Continue
            result.newNoteAction = 'continue';
            break;
          case 0x2: // S72 - NNA Note Off
            result.newNoteAction = 'noteOff';
            break;
          case 0x3: // S73 - NNA Note Fade
            result.newNoteAction = 'noteFade';
            break;

          // S74-S76: Duplicate Note Check
          case 0x4: // S74 - Check for same note
            result.duplicateCheck = 'note';
            break;
          case 0x5: // S75 - Check for same sample
            result.duplicateCheck = 'sample';
            break;
          case 0x6: // S76 - Check for same instrument
            result.duplicateCheck = 'instrument';
            break;

          // S77-S7C: Envelope Controls
          case 0x7: // S77 - Volume Envelope Off
            result.envelopeControl = { ...result.envelopeControl, volume: false };
            break;
          case 0x8: // S78 - Volume Envelope On
            result.envelopeControl = { ...result.envelopeControl, volume: true };
            break;
          case 0x9: // S79 - Panning Envelope Off
            result.envelopeControl = { ...result.envelopeControl, panning: false };
            break;
          case 0xA: // S7A - Panning Envelope On
            result.envelopeControl = { ...result.envelopeControl, panning: true };
            break;
          case 0xB: // S7B - Pitch/Filter Envelope Off
            result.envelopeControl = { ...result.envelopeControl, pitch: false };
            break;
          case 0xC: // S7C - Pitch/Filter Envelope On
            result.envelopeControl = { ...result.envelopeControl, pitch: true };
            break;
        }
      }
      // S9x - Sound Control (panning surround, etc.) - future extension
      else if (x === 9) {
        // S91 - Set surround mode (not implemented)
      }
    }
    else if (effectLetter === 'Z') {
      // Zxx - MIDI Macro (IT-style filter control)
      // Z00-Z7F: Filter cutoff (0-127)
      // Z80-Z8F: Filter resonance (0-15)
      // Z90-Z9F: Filter mode
      if (param <= 0x7F) {
        // Filter cutoff
        mem.filterCutoff = param;
        result.setFilterCutoff = param;
      } else if (param >= 0x80 && param <= 0x8F) {
        // Filter resonance (0-15)
        mem.filterResonance = param - 0x80;
        result.setFilterResonance = param - 0x80;
      } else if (param >= 0x90 && param <= 0x9F) {
        // Filter mode
        const modes: Array<'lowpass' | 'highpass' | 'bandpass'> = ['lowpass', 'highpass', 'bandpass'];
        const modeIndex = (param - 0x90) % 3;
        mem.filterMode = modes[modeIndex];
        result.setFilterMode = modes[modeIndex];
      }
    }
    else if (effectLetter === 'W') {
      // Wxx - Global Pitch Shift (DJ-style)
      // W00 = -12 semitones (slowest)
      // W80 = 0 semitones (no change, centered at 128)
      // WFF = +12 semitones (fastest)
      // Affects entire song playback like a DJ pitch slider
      mem.globalPitchShift = param;
      // Convert 0-255 to semitones (-12 to +12)
      const semitones = ((param - 128) / 128) * 12;
      result.setGlobalPitchShift = semitones;
    }
    else if (effect?.[0] === '\\') {
      // \xx - Smooth MIDI Macro (interpolated filter cutoff slide)
      // Slides filter cutoff smoothly from current value to param over the row
      const targetCutoff = parseInt(effect.substring(1), 16);
      if (!isNaN(targetCutoff) && targetCutoff <= 127) {
        const startCutoff = mem.filterCutoff ?? 64;
        mem.smoothMacroTarget = targetCutoff;
        mem.smoothMacroStart = startCutoff;
        state.smoothMacro = {
          startValue: startCutoff,
          targetValue: targetCutoff,
          ticksTotal: this.ticksPerRow,
        };
        // Set initial cutoff
        result.setFilterCutoff = startCutoff;
      }
    }

    return result;
  }

  /**
   * Process E-commands (E0x through EEx)
   */
  private processECommand(
    channelIndex: number,
    x: number,
    y: number,
    note: string | null,
    state: EffectState,
    result: EffectResult
  ): void {
    const mem = this.memory[channelIndex];

    switch (x) {
      // E0x - Filter (Amiga LED filter)
      case 0x0:
        result.setAmigaFilter = (y === 0);
        break;

      // E1x - Fine Portamento Up
      case 0x1:
        if (mem.currentFreq) {
          mem.currentFreq *= Math.pow(2, y / 192); // Fine slide
        }
        break;

      // E2x - Fine Portamento Down
      case 0x2:
        if (mem.currentFreq) {
          mem.currentFreq /= Math.pow(2, y / 192); // Fine slide
        }
        break;

      // E3x - Glissando Control
      case 0x3:
        // y=1: Round portamento to nearest semitone (not implemented)
        break;

      // E4x - Vibrato Control (waveform)
      case 0x4: {
        const vibratoWaves: WaveformType[] = ['sine', 'rampDown', 'square', 'random'];
        mem.vibratoWaveform = vibratoWaves[y & 3];
        mem.vibratoNoRetrig = (y & 4) !== 0;
        break;
      }

      // E5x - Set Finetune
      case 0x5:
        // Finetune value (not fully implemented - would need sample support)
        break;

      // E6x - Pattern Loop
      case 0x6:
        if (y === 0) {
          // Set loop start
          mem.loopStart = 0; // Would need current row from scheduler
        } else {
          // Loop y times
          if (mem.loopCount === undefined) {
            mem.loopCount = y;
          } else if (mem.loopCount > 0) {
            mem.loopCount--;
            // Would need to signal scheduler to jump to loopStart
          } else {
            mem.loopCount = undefined;
          }
        }
        break;

      // E7x - Tremolo Control (waveform)
      case 0x7: {
        const tremoloWaves: WaveformType[] = ['sine', 'rampDown', 'square', 'random'];
        mem.tremoloWaveform = tremoloWaves[y & 3];
        mem.tremoloNoRetrig = (y & 4) !== 0;
        break;
      }

      // E8x - Set Panning (coarse, 16 positions)
      case 0x8:
        mem.pan = y * 17; // Map 0-F to 0-255
        result.setPan = mem.pan;
        break;

      // E9x - Retrig Note
      case 0x9:
        if (y > 0) {
          state.retrig = {
            interval: y,
            volChange: 0,
            tickCounter: 0,
          };
        }
        break;

      // EAx - Fine Volume Slide Up
      case 0xA:
        mem.volume = Math.min(64, (mem.volume ?? 64) + y);
        result.setVolume = mem.volume;
        break;

      // EBx - Fine Volume Slide Down
      case 0xB:
        mem.volume = Math.max(0, (mem.volume ?? 64) - y);
        result.setVolume = mem.volume;
        break;

      // ECx - Note Cut
      case 0xC:
        state.noteCut = { tick: y };
        break;

      // EDx - Note Delay
      case 0xD:
        if (y > 0 && note) {
          state.noteDelay = {
            tick: y,
            note,
            instrument: 0, // Would need instrument from row
          };
          result.preventNoteTrigger = true;
        }
        break;

      // EEx - Pattern Delay
      case 0xE:
        state.patternDelay = { rows: y };
        break;

      // EFx - Invert Loop (not implemented - Amiga only)
      case 0xF:
        break;
    }
  }

  /**
   * Process effect per tick (called on ticks 1, 2, 3... not tick 0)
   * Returns frequency multiplier, volume adjustment, etc.
   */
  public processTick(
    channelIndex: number,
    tick: number
  ): {
    frequencyMult?: number;
    frequencySet?: number;
    volumeAdd?: number;
    volumeSet?: number;
    panSet?: number;
    triggerNote?: boolean;
    cutNote?: boolean;
    globalVolumeAdd?: number;
    filterCutoffSet?: number; // Smooth macro
  } {
    const state = this.channelStates.get(channelIndex);
    const mem = this.memory[channelIndex];
    if (!state || !mem) return {};

    const result: ReturnType<typeof this.processTick> = {};

    // Arpeggio - cycle through base, +x, +y semitones
    if (state.arpeggio) {
      const { baseFreq, x, y } = state.arpeggio;
      const offsets = [0, x, y];
      const offset = offsets[tick % 3];
      result.frequencySet = baseFreq * Math.pow(2, offset / 12);
      state.arpeggio.step = tick % 3;
    }

    // Portamento Up
    if (state.portaUp && mem.currentFreq) {
      mem.currentFreq *= Math.pow(2, state.portaUp.speed / 192);
      result.frequencySet = mem.currentFreq;
    }

    // Portamento Down
    if (state.portaDown && mem.currentFreq) {
      mem.currentFreq /= Math.pow(2, state.portaDown.speed / 192);
      result.frequencySet = mem.currentFreq;
    }

    // Tone Portamento (slide to target)
    if (state.tonePorta && mem.currentFreq) {
      const { targetFreq, speed } = state.tonePorta;
      const slideAmount = speed * 4; // Adjust for FT2 feel

      if (mem.currentFreq < targetFreq) {
        mem.currentFreq *= Math.pow(2, slideAmount / 192);
        if (mem.currentFreq > targetFreq) mem.currentFreq = targetFreq;
      } else if (mem.currentFreq > targetFreq) {
        mem.currentFreq /= Math.pow(2, slideAmount / 192);
        if (mem.currentFreq < targetFreq) mem.currentFreq = targetFreq;
      }
      result.frequencySet = mem.currentFreq;
    }

    // Vibrato
    if (state.vibrato) {
      const { speed, depth, waveform } = state.vibrato;
      const phase = mem.vibratoPhase ?? 0;
      const waveValue = this.getWaveformValue(waveform, phase);
      // PT2.3D Scaling for period slides is approx (waveValue * depth) / (16 * 12) semitones
      result.frequencyMult = Math.pow(2, (waveValue * depth) / (16 * 12));
      mem.vibratoPhase = (phase + speed) & 63;
    }

    // Tremolo
    if (state.tremolo) {
      const { speed, depth, waveform } = state.tremolo;
      const phase = mem.tremoloPhase ?? 0;
      const waveValue = this.getWaveformValue(waveform, phase);
      
      // PT2.3D scaling: delta = (waveValue_0_255 * depth) >> 6
      // Since our waveValue is -1 to 1, we convert:
      // (waveValue * 255 * depth) / 64 ≈ waveValue * depth * 4
      result.volumeAdd = waveValue * depth * 4;
      mem.tremoloPhase = (phase + speed) & 63;
    }

    // Volume Slide
    if (state.volumeSlide) {
      const { up, down } = state.volumeSlide;
      const currentVol = mem.volume ?? 64;
      mem.volume = Math.max(0, Math.min(64, currentVol + up - down));
      result.volumeSet = mem.volume;
    }

    // Panning Slide
    if (state.panSlide) {
      const { right, left } = state.panSlide;
      mem.pan = Math.max(0, Math.min(255, (mem.pan ?? 128) + right - left));
      result.panSet = mem.pan;
    }

    // Retrig
    if (state.retrig) {
      state.retrig.tickCounter++;
      if (state.retrig.tickCounter >= state.retrig.interval) {
        state.retrig.tickCounter = 0;
        result.triggerNote = true;

        // Apply volume change
        const vc = state.retrig.volChange;
        if (vc > 0) {
          const volChanges: number[] = [0, -1, -2, -4, -8, -16, 0, 0, 0, 1, 2, 4, 8, 16, 0, 0];
          const volMults: number[] = [1, 1, 1, 1, 1, 1, 2/3, 0.5, 1, 1, 1, 1, 1, 1, 1.5, 2];

          if (vc <= 5 || (vc >= 9 && vc <= 13)) {
            mem.volume = Math.max(0, Math.min(64, (mem.volume ?? 64) + volChanges[vc]));
          } else if (vc === 6 || vc === 7 || vc === 14 || vc === 15) {
            mem.volume = Math.max(0, Math.min(64, Math.floor((mem.volume ?? 64) * volMults[vc])));
          }
          result.volumeSet = mem.volume;
        }
      }
    }

    // Tremor
    if (state.tremor) {
      state.tremor.tickCounter++;
      const { onTime, offTime, tickCounter } = state.tremor;
      const cycleLength = onTime + offTime;
      const posInCycle = tickCounter % cycleLength;

      if (posInCycle < onTime) {
        // Sound on
        state.tremor.isOn = true;
      } else {
        // Sound off
        state.tremor.isOn = false;
        result.volumeSet = 0;
      }
    }

    // Note Cut
    if (state.noteCut && tick >= state.noteCut.tick) {
      result.cutNote = true;
      result.volumeSet = 0;
      state.noteCut = undefined;
    }

    // Note Delay
    if (state.noteDelay && tick === state.noteDelay.tick) {
      result.triggerNote = true;
      state.noteDelay = undefined;
    }

    // Global Volume Slide
    if (mem.globalSlideUp || mem.globalSlideDown) {
      const gup = mem.globalSlideUp || 0;
      const gdown = mem.globalSlideDown || 0;
      this.globalVolume = Math.max(0, Math.min(64, this.globalVolume + gup - gdown));
      result.globalVolumeAdd = gup - gdown;
    }

    // Smooth MIDI Macro (\xx) - interpolate filter cutoff over ticks
    if (state.smoothMacro) {
      const { startValue, targetValue, ticksTotal } = state.smoothMacro;
      const progress = Math.min(1, tick / ticksTotal);
      const interpolatedValue = Math.round(startValue + (targetValue - startValue) * progress);
      mem.filterCutoff = interpolatedValue;
      result.filterCutoffSet = interpolatedValue;

      // When done, clear the smooth macro state
      if (tick >= ticksTotal) {
        mem.filterCutoff = targetValue;
        result.filterCutoffSet = targetValue;
      }
    }

    return result;
  }

  /**
   * Get current frequency for channel (after effects)
   */
  public getCurrentFrequency(channelIndex: number): number | undefined {
    return this.memory[channelIndex]?.currentFreq;
  }

  /**
   * Get current volume for channel (0-64)
   */
  public getCurrentVolume(channelIndex: number): number {
    return this.memory[channelIndex]?.volume ?? 64;
  }

  /**
   * Get global volume (0-64)
   */
  public getGlobalVolume(): number {
    return this.globalVolume;
  }

  /**
   * Set global volume
   */
  public setGlobalVolume(vol: number): void {
    this.globalVolume = Math.max(0, Math.min(64, vol));
  }

  /**
   * Get ticks per row (speed)
   */
  public getTicksPerRow(): number {
    return this.ticksPerRow;
  }

  /**
   * Set ticks per row (speed)
   */
  public setTicksPerRow(ticks: number): void {
    this.ticksPerRow = Math.max(1, Math.min(31, ticks));
  }

  /**
   * Clear effect state for channel
   */
  public clearChannel(channelIndex: number): void {
    this.channelStates.delete(channelIndex);
    // Keep memory for effect continuation
  }

  /**
   * Clear all effects and memory
   */
  public clearAll(): void {
    this.channelStates.clear();
    this.memory = {};
    this.globalVolume = 64;
    this.ticksPerRow = 6;
  }

  /**
   * Reset just the active effects (keep memory)
   */
  public resetActiveEffects(): void {
    this.channelStates.clear();
  }

  /**
   * Get effect description for help/display
   */
  public static getEffectDescription(effect: EffectCommand): string {
    if (!effect || effect === '...' || effect === '000') return '';

    const cmd = effect.toUpperCase()[0];
    const param = effect.substring(1);

    const descriptions: Record<string, string> = {
      '0': `Arpeggio +${parseInt(param[0], 16)}/+${parseInt(param[1], 16)} semitones`,
      '1': `Portamento up speed ${parseInt(param, 16)}`,
      '2': `Portamento down speed ${parseInt(param, 16)}`,
      '3': `Tone portamento speed ${parseInt(param, 16)}`,
      '4': `Vibrato speed ${parseInt(param[0], 16)} depth ${parseInt(param[1], 16)}`,
      '5': `Tone porta + vol slide ${param}`,
      '6': `Vibrato + vol slide ${param}`,
      '7': `Tremolo speed ${parseInt(param[0], 16)} depth ${parseInt(param[1], 16)}`,
      '8': `Set panning ${parseInt(param, 16)}`,
      '9': `Sample offset ${parseInt(param, 16) * 256}`,
      'A': `Volume slide ${parseInt(param[0], 16) > 0 ? 'up ' + param[0] : 'down ' + param[1]}`,
      'B': `Jump to position ${parseInt(param, 16)}`,
      'C': `Set volume ${parseInt(param, 16)}`,
      'D': `Pattern break to row ${parseInt(param[0], 10) * 10 + parseInt(param[1], 10)}`,
      'E': EffectProcessor.getECommandDescription(parseInt(param[0], 16), parseInt(param[1], 16)),
      'F': parseInt(param, 16) < 32 ? `Set speed ${parseInt(param, 16)}` : `Set BPM ${parseInt(param, 16)}`,
      'G': `Set global volume ${parseInt(param, 16)}`,
      'H': `Global volume slide ${param}`,
      'L': `Set envelope position ${parseInt(param, 16)}`,
      'P': `Panning slide ${param}`,
      'R': `Multi retrig interval ${param[0]} vol ${param[1]}`,
      'T': `Tremor on ${param[0]} off ${param[1]}`,
      'X': param[0] === '1' ? `Extra fine porta up ${param[1]}` : `Extra fine porta down ${param[1]}`,
      'S': EffectProcessor.getSCommandDescription(parseInt(param[0], 16), parseInt(param[1], 16)),
      'Z': EffectProcessor.getZCommandDescription(parseInt(param, 16)),
    };

    // Handle backslash command separately
    if (effect[0] === '\\') {
      const target = parseInt(effect.substring(1), 16);
      return `Smooth filter slide to ${target}`;
    }

    return descriptions[cmd] || `Unknown effect ${effect}`;
  }

  /**
   * Get E-command description
   */
  private static getECommandDescription(x: number, y: number): string {
    const eDescs: Record<number, string> = {
      0x0: `Filter ${y ? 'on' : 'off'} (Amiga)`,
      0x1: `Fine porta up ${y}`,
      0x2: `Fine porta down ${y}`,
      0x3: `Glissando ${y ? 'on' : 'off'}`,
      0x4: `Vibrato waveform ${y}`,
      0x5: `Set finetune ${y}`,
      0x6: y === 0 ? 'Set loop start' : `Loop ${y} times`,
      0x7: `Tremolo waveform ${y}`,
      0x8: `Set panning ${y * 17}`,
      0x9: `Retrig every ${y} ticks`,
      0xA: `Fine vol up ${y}`,
      0xB: `Fine vol down ${y}`,
      0xC: `Note cut at tick ${y}`,
      0xD: `Note delay ${y} ticks`,
      0xE: `Pattern delay ${y} rows`,
      0xF: `Funk repeat ${y}`,
    };
    return eDescs[x] || `E${x.toString(16)}${y.toString(16)}`;
  }

  /**
   * Get IT-style S-command description
   */
  private static getSCommandDescription(x: number, y: number): string {
    if (x === 7) {
      const sDescs: Record<number, string> = {
        0x0: 'NNA: Cut',
        0x1: 'NNA: Continue',
        0x2: 'NNA: Note Off',
        0x3: 'NNA: Note Fade',
        0x4: 'DNC: Note',
        0x5: 'DNC: Sample',
        0x6: 'DNC: Instrument',
        0x7: 'Volume Envelope Off',
        0x8: 'Volume Envelope On',
        0x9: 'Panning Envelope Off',
        0xA: 'Panning Envelope On',
        0xB: 'Pitch/Filter Envelope Off',
        0xC: 'Pitch/Filter Envelope On',
      };
      return sDescs[y] || `S7${y.toString(16)}`;
    }
    if (x === 9) {
      return y === 1 ? 'Surround Sound' : `S9${y.toString(16)}`;
    }
    return `S${x.toString(16)}${y.toString(16)}`;
  }

  /**
   * Get Zxx MIDI Macro description
   */
  private static getZCommandDescription(param: number): string {
    if (param <= 0x7F) {
      return `Filter cutoff ${param} (${Math.round(param / 127 * 100)}%)`;
    } else if (param >= 0x80 && param <= 0x8F) {
      const resonance = param - 0x80;
      return `Filter resonance ${resonance} (${Math.round(resonance / 15 * 100)}%)`;
    } else if (param >= 0x90 && param <= 0x9F) {
      const modes = ['Lowpass', 'Highpass', 'Bandpass'];
      const mode = modes[(param - 0x90) % 3];
      return `Filter mode: ${mode}`;
    }
    return `Z${param.toString(16).toUpperCase().padStart(2, '0')}`;
  }
}

// Singleton instance
let effectProcessorInstance: EffectProcessor | null = null;

export const getEffectProcessor = (): EffectProcessor => {
  if (!effectProcessorInstance) {
    effectProcessorInstance = new EffectProcessor();
  }
  return effectProcessorInstance;
};

/**
 * Effect command reference (for help display)
 */
export const EFFECT_REFERENCE = {
  '0xy': { name: 'Arpeggio', desc: 'Cycle note, note+x, note+y semitones' },
  '1xx': { name: 'Portamento Up', desc: 'Slide pitch up by xx per tick' },
  '2xx': { name: 'Portamento Down', desc: 'Slide pitch down by xx per tick' },
  '3xx': { name: 'Tone Portamento', desc: 'Slide to note at speed xx' },
  '4xy': { name: 'Vibrato', desc: 'x=speed, y=depth' },
  '5xy': { name: 'Tone Porta + Vol Slide', desc: 'Continue porta, slide volume' },
  '6xy': { name: 'Vibrato + Vol Slide', desc: 'Continue vibrato, slide volume' },
  '7xy': { name: 'Tremolo', desc: 'x=speed, y=depth' },
  '8xx': { name: 'Set Panning', desc: '00=left, 80=center, FF=right' },
  '9xx': { name: 'Sample Offset', desc: 'Start sample at offset xx*256' },
  'Axy': { name: 'Volume Slide', desc: 'x>0: slide up, y>0: slide down' },
  'Bxx': { name: 'Position Jump', desc: 'Jump to song position xx' },
  'Cxx': { name: 'Set Volume', desc: 'Set volume to xx (00-40)' },
  'Dxx': { name: 'Pattern Break', desc: 'Jump to row xx of next pattern' },
  'E1x': { name: 'Fine Porta Up', desc: 'Slide up once by x' },
  'E2x': { name: 'Fine Porta Down', desc: 'Slide down once by x' },
  'E3x': { name: 'Glissando', desc: '1=on (round to semitones)' },
  'E4x': { name: 'Vibrato Waveform', desc: '0=sine, 1=ramp, 2=square' },
  'E5x': { name: 'Set Finetune', desc: 'Set finetune value' },
  'E6x': { name: 'Pattern Loop', desc: '0=set start, x=loop x times' },
  'E7x': { name: 'Tremolo Waveform', desc: '0=sine, 1=ramp, 2=square' },
  'E9x': { name: 'Retrig Note', desc: 'Retrigger every x ticks' },
  'EAx': { name: 'Fine Vol Up', desc: 'Slide volume up once by x' },
  'EBx': { name: 'Fine Vol Down', desc: 'Slide volume down once by x' },
  'ECx': { name: 'Note Cut', desc: 'Cut note at tick x' },
  'EDx': { name: 'Note Delay', desc: 'Delay note by x ticks' },
  'EEx': { name: 'Pattern Delay', desc: 'Delay pattern by x rows' },
  'Fxx': { name: 'Set Speed/BPM', desc: '01-1F=speed, 20-FF=BPM' },
  'Gxx': { name: 'Set Global Volume', desc: 'Set global vol to xx (00-40)' },
  'Hxy': { name: 'Global Vol Slide', desc: 'x>0: up, y>0: down' },
  'Lxx': { name: 'Set Envelope Pos', desc: 'Set envelope position' },
  'Pxy': { name: 'Panning Slide', desc: 'x=right, y=left' },
  'Rxy': { name: 'Multi Retrig', desc: 'x=interval, y=vol change' },
  'Txy': { name: 'Tremor', desc: 'x=on ticks, y=off ticks' },
  'X1x': { name: 'Extra Fine Porta Up', desc: 'Very fine slide up' },
  'X2x': { name: 'Extra Fine Porta Down', desc: 'Very fine slide down' },
  // IT-style Sxx commands
  'S70': { name: 'NNA Cut', desc: 'Set New Note Action to cut' },
  'S71': { name: 'NNA Continue', desc: 'Set New Note Action to continue' },
  'S72': { name: 'NNA Note Off', desc: 'Set New Note Action to note off' },
  'S73': { name: 'NNA Note Fade', desc: 'Set New Note Action to fade' },
  'S74': { name: 'DNC Note', desc: 'Duplicate Note Check: note' },
  'S75': { name: 'DNC Sample', desc: 'Duplicate Note Check: sample' },
  'S76': { name: 'DNC Instrument', desc: 'Duplicate Note Check: instrument' },
  'S77': { name: 'Vol Env Off', desc: 'Turn volume envelope off' },
  'S78': { name: 'Vol Env On', desc: 'Turn volume envelope on' },
  'S79': { name: 'Pan Env Off', desc: 'Turn panning envelope off' },
  'S7A': { name: 'Pan Env On', desc: 'Turn panning envelope on' },
  'S7B': { name: 'Pitch Env Off', desc: 'Turn pitch/filter envelope off' },
  'S7C': { name: 'Pitch Env On', desc: 'Turn pitch/filter envelope on' },
  // Zxx MIDI Macro (IT-style filter)
  'Zxx': { name: 'MIDI Macro', desc: 'Filter cutoff (00-7F), resonance (80-8F), mode (90-9F)' },
  'Z00': { name: 'Filter Cutoff 0', desc: 'Set filter cutoff to minimum' },
  'Z7F': { name: 'Filter Cutoff Max', desc: 'Set filter cutoff to maximum (127)' },
  'Z80': { name: 'Filter Resonance 0', desc: 'Set filter resonance to minimum' },
  'Z8F': { name: 'Filter Resonance Max', desc: 'Set filter resonance to maximum' },
  'Z90': { name: 'Lowpass Filter', desc: 'Set filter to lowpass mode' },
  'Z91': { name: 'Highpass Filter', desc: 'Set filter to highpass mode' },
  'Z92': { name: 'Bandpass Filter', desc: 'Set filter to bandpass mode' },
  // \xx Smooth MIDI Macro
  '\\xx': { name: 'Smooth MIDI Macro', desc: 'Smoothly slide filter cutoff to value' },
};

/**
 * Volume column commands reference
 */
export const VOLUME_COLUMN_REFERENCE = {
  '00-40': { name: 'Set Volume', desc: 'Set volume directly' },
  '+x': { name: 'Vol Slide Up', desc: 'Slide volume up' },
  '-x': { name: 'Vol Slide Down', desc: 'Slide volume down' },
  'Ux': { name: 'Fine Vol Up', desc: 'Fine slide up' },
  'Dx': { name: 'Fine Vol Down', desc: 'Fine slide down' },
  'Sx': { name: 'Vibrato Speed', desc: 'Set vibrato speed' },
  'Vx': { name: 'Vibrato', desc: 'Vibrato with depth x' },
  'Px': { name: 'Set Panning', desc: 'Set pan position' },
  'Rx': { name: 'Pan Slide Right', desc: 'Slide pan right' },
  'Lx': { name: 'Pan Slide Left', desc: 'Slide pan left' },
  'Mx': { name: 'Tone Portamento', desc: 'Porta with speed x' },
};
