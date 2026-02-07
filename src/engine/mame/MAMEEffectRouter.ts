/**
 * MAME Effect Router
 *
 * Routes standard tracker effects (0x00-0x0F) and extended effects (Exy)
 * to MAME synth commands. Compatible with FT2/XM effect format.
 */

import type {
  ChannelEffectMemory,
} from './MAMEMacroTypes';
import {
  createDefaultChannelMemory,
} from './MAMEMacroTypes';

/**
 * Waveform types for vibrato/tremolo
 */
export const EffectWaveform = {
  SINE: 0,
  RAMP_DOWN: 1,
  SQUARE: 2,
  RANDOM: 3,
} as const;
export type EffectWaveform = typeof EffectWaveform[keyof typeof EffectWaveform];

/**
 * Effect handler interface - synths implement this
 */
export interface MAMEEffectTarget {
  // Pitch control
  setFrequency(freq: number): void;
  setPitchOffset(cents: number): void;

  // Volume control
  setVolume(volume: number): void;  // 0-64 (XM scale)

  // Panning control
  setPanning(pan: number): void;  // 0-255 (128 = center)

  // Sample playback
  setSampleOffset(offset: number): void;

  // Note control
  retriggerNote(velocity: number): void;
  cutNote(): void;

  // Optional FM controls
  setOperatorTL?(op: number, tl: number): void;
  setOperatorAR?(op: number, ar: number): void;
}

/**
 * Flow control return for pattern playback
 */
export interface EffectFlowControl {
  positionJump: number | null;  // Bxx
  patternBreak: number | null;  // Dxx
  patternDelay: number;         // EEx
}

/**
 * MAMEEffectRouter - Routes tracker effects to synth commands
 */
export class MAMEEffectRouter {
  private channelMemory: Map<number, ChannelEffectMemory> = new Map();
  private speed: number = 6;
  private bpm: number = 125;

  constructor() {}

  /**
   * Get or create channel memory
   */
  getChannelMemory(channel: number): ChannelEffectMemory {
    if (!this.channelMemory.has(channel)) {
      this.channelMemory.set(channel, createDefaultChannelMemory());
    }
    return this.channelMemory.get(channel)!;
  }

  /**
   * Set playback speed (ticks per row)
   */
  setSpeed(speed: number): void {
    this.speed = Math.max(1, Math.min(31, speed));
  }

  /**
   * Set playback BPM
   */
  setBPM(bpm: number): void {
    this.bpm = Math.max(32, Math.min(255, bpm));
  }

  /**
   * Get current speed
   */
  getSpeed(): number {
    return this.speed;
  }

  /**
   * Get current BPM
   */
  getBPM(): number {
    return this.bpm;
  }

  /**
   * Process effects on tick 0 (row start)
   *
   * @param effect Effect string like "A05", "B00", "C40"
   * @param channel Channel index
   * @param baseFreq Base frequency of the note (Hz)
   * @param target Synth to apply effects to
   * @returns Flow control for pattern playback
   */
  processTickZero(
    effect: string | null,
    channel: number,
    baseFreq: number,
    currentRow: number,
    target: MAMEEffectTarget
  ): EffectFlowControl {
    const mem = this.getChannelMemory(channel);
    const flow: EffectFlowControl = {
      positionJump: null,
      patternBreak: null,
      patternDelay: 0,
    };

    if (!effect || effect.length < 3) return flow;

    const cmd = effect.charAt(0).toUpperCase();
    const param = parseInt(effect.substring(1), 16);
    const x = (param >> 4) & 0x0F;
    const y = param & 0x0F;

    // Store base frequency for pitch effects
    if (baseFreq > 0) {
      mem.currentPitch = baseFreq;
    }

    switch (cmd) {
      case '0': // Arpeggio
        if (param > 0) {
          mem.arpeggioX = x;
          mem.arpeggioY = y;
          mem.arpeggioTick = 0;
        }
        break;

      case '1': // Pitch slide up
        if (param > 0) mem.pitchSlideUp = param;
        break;

      case '2': // Pitch slide down
        if (param > 0) mem.pitchSlideDown = param;
        break;

      case '3': // Tone portamento
        if (param > 0) mem.tonePortamento = param;
        if (baseFreq > 0) mem.tonePortamentoTarget = baseFreq;
        break;

      case '4': // Vibrato
        if (x > 0) mem.vibratoSpeed = x;
        if (y > 0) mem.vibratoDepth = y;
        break;

      case '5': // Tone portamento + volume slide
        if (param > 0) mem.volumeSlide = param;
        // Portamento continues from memory
        break;

      case '6': // Vibrato + volume slide
        if (param > 0) mem.volumeSlide = param;
        // Vibrato continues from memory
        break;

      case '7': // Tremolo
        if (x > 0) mem.tremoloSpeed = x;
        if (y > 0) mem.tremoloDepth = y;
        break;

      case '8': // Set panning
        mem.currentPanning = param;
        target.setPanning(param);
        break;

      case '9': // Sample offset
        if (param > 0) mem.sampleOffset = param;
        target.setSampleOffset(mem.sampleOffset * 256);
        break;

      case 'A': // Volume slide
        if (param > 0) mem.volumeSlide = param;
        break;

      case 'B': // Position jump
        flow.positionJump = param;
        break;

      case 'C': // Set volume (0-64)
        mem.currentVolume = Math.min(param, 0x40);
        target.setVolume(mem.currentVolume);
        break;

      case 'D': // Pattern break
        // Convert BCD to decimal
        flow.patternBreak = x * 10 + y;
        break;

      case 'E': // Extended commands
        this.processExtendedTick0(param, channel, currentRow, target, flow);
        break;

      case 'F': // Set speed/BPM
        if (param === 0) {
          // F00 = stop (handled by caller)
        } else if (param < 0x20) {
          this.speed = param;
        } else {
          this.bpm = param;
        }
        break;

      case 'G': // Global volume (0-64)
        // Would need global volume support in synth
        break;

      case 'H': // Global volume slide
        // Would need global volume support in synth
        break;
    }

    return flow;
  }

  /**
   * Process extended (Exy) commands on tick 0
   */
  private processExtendedTick0(
    param: number,
    channel: number,
    currentRow: number,
    target: MAMEEffectTarget,
    flow: EffectFlowControl
  ): void {
    const mem = this.getChannelMemory(channel);
    const x = (param >> 4) & 0x0F;
    const y = param & 0x0F;

    switch (x) {
      case 0x1: // E1y - Fine pitch slide up
        mem.currentPitchOffset += y * 4;
        target.setPitchOffset(mem.currentPitchOffset);
        break;

      case 0x2: // E2y - Fine pitch slide down
        mem.currentPitchOffset -= y * 4;
        target.setPitchOffset(mem.currentPitchOffset);
        break;

      case 0x3: // E3y - Set glissando control
        // Not commonly used
        break;

      case 0x4: // E4y - Set vibrato waveform
        mem.vibratoWaveform = y & 0x03;
        break;

      case 0x5: // E5y - Set finetune
        // Would need finetune support
        break;

      case 0x6: // E6y - Pattern loop
        if (y === 0) {
          mem.loopStart = currentRow;
        } else {
          if (mem.loopCount === 0) {
            mem.loopCount = y;
            mem.loopRow = mem.loopStart;
          } else {
            mem.loopCount--;
            if (mem.loopCount > 0) {
              mem.loopRow = mem.loopStart;
            }
          }
        }
        break;

      case 0x7: // E7y - Set tremolo waveform
        mem.tremoloWaveform = y & 0x03;
        break;

      case 0x8: // E8y - Set panning (coarse 0-F)
        mem.currentPanning = y * 17;  // Map 0-F to 0-255
        target.setPanning(mem.currentPanning);
        break;

      case 0x9: // E9y - Retrigger note
        if (y > 0) mem.retriggerTick = y;
        break;

      case 0xA: // EAy - Fine volume slide up
        mem.currentVolume = Math.min(mem.currentVolume + y, 64);
        target.setVolume(mem.currentVolume);
        break;

      case 0xB: // EBy - Fine volume slide down
        mem.currentVolume = Math.max(mem.currentVolume - y, 0);
        target.setVolume(mem.currentVolume);
        break;

      case 0xC: // ECy - Note cut at tick y
        mem.noteCutTick = y;
        if (y === 0) {
          target.cutNote();
        }
        break;

      case 0xD: // EDy - Note delay
        mem.noteDelayTick = y;
        break;

      case 0xE: // EEy - Pattern delay
        flow.patternDelay = y;
        break;

      case 0xF: // EFy - Invert loop (not commonly used)
        break;
    }
  }

  /**
   * Process effects on tick N (N > 0)
   *
   * Called every tick to process continuous effects like slides and vibrato.
   */
  processTickN(
    effect: string | null,
    channel: number,
    tick: number,
    target: MAMEEffectTarget
  ): void {
    const mem = this.getChannelMemory(channel);

    if (!effect) return;

    const cmd = effect.charAt(0).toUpperCase();

    switch (cmd) {
      case '0': // Arpeggio
        this.processArpeggio(mem, tick, target);
        break;

      case '1': // Pitch slide up
        this.processPitchSlideUp(mem, target);
        break;

      case '2': // Pitch slide down
        this.processPitchSlideDown(mem, target);
        break;

      case '3': // Tone portamento
        this.processTonePortamento(mem, target);
        break;

      case '4': // Vibrato
        this.processVibrato(mem, target);
        break;

      case '5': // Tone portamento + volume slide
        this.processTonePortamento(mem, target);
        this.processVolumeSlide(mem, target);
        break;

      case '6': // Vibrato + volume slide
        this.processVibrato(mem, target);
        this.processVolumeSlide(mem, target);
        break;

      case '7': // Tremolo
        this.processTremolo(mem, target);
        break;

      case 'A': // Volume slide
        this.processVolumeSlide(mem, target);
        break;

      case 'E': // Extended - check for tick-based effects
        this.processExtendedTickN(effect, mem, tick, target);
        break;
    }
  }

  /**
   * Process extended effects on tick N
   */
  private processExtendedTickN(
    effect: string,
    mem: ChannelEffectMemory,
    tick: number,
    target: MAMEEffectTarget
  ): void {
    const param = parseInt(effect.substring(1), 16);
    const x = (param >> 4) & 0x0F;
    // const y = param & 0x0F; // Lower nibble (unused in current implementation)

    switch (x) {
      case 0x9: // E9y - Retrigger
        if (mem.retriggerTick > 0 && tick % mem.retriggerTick === 0) {
          target.retriggerNote(mem.currentVolume / 64);
        }
        break;

      case 0xC: // ECy - Note cut at tick y
        if (tick === mem.noteCutTick) {
          target.cutNote();
        }
        break;

      case 0xD: // EDy - Note delay
        // Handled by caller - note is triggered at tick y
        break;
    }
  }

  /**
   * Process arpeggio effect (0xy)
   */
  private processArpeggio(
    mem: ChannelEffectMemory,
    tick: number,
    target: MAMEEffectTarget
  ): void {
    if (mem.arpeggioX === 0 && mem.arpeggioY === 0) return;

    const cycle = tick % 3;
    let semitones = 0;

    switch (cycle) {
      case 0:
        semitones = 0;
        break;
      case 1:
        semitones = mem.arpeggioX;
        break;
      case 2:
        semitones = mem.arpeggioY;
        break;
    }

    const freq = mem.currentPitch * Math.pow(2, semitones / 12);
    target.setFrequency(freq);
  }

  /**
   * Process pitch slide up (1xx)
   */
  private processPitchSlideUp(
    mem: ChannelEffectMemory,
    target: MAMEEffectTarget
  ): void {
    if (mem.pitchSlideUp > 0) {
      mem.currentPitchOffset += mem.pitchSlideUp * 4;
      target.setPitchOffset(mem.currentPitchOffset);
    }
  }

  /**
   * Process pitch slide down (2xx)
   */
  private processPitchSlideDown(
    mem: ChannelEffectMemory,
    target: MAMEEffectTarget
  ): void {
    if (mem.pitchSlideDown > 0) {
      mem.currentPitchOffset -= mem.pitchSlideDown * 4;
      target.setPitchOffset(mem.currentPitchOffset);
    }
  }

  /**
   * Process tone portamento (3xx)
   */
  private processTonePortamento(
    mem: ChannelEffectMemory,
    target: MAMEEffectTarget
  ): void {
    if (mem.tonePortamento === 0 || mem.tonePortamentoTarget === null) return;

    const diff = mem.tonePortamentoTarget - mem.currentPitch;
    const step = mem.tonePortamento * 4;

    if (Math.abs(diff) < step) {
      mem.currentPitch = mem.tonePortamentoTarget;
    } else {
      mem.currentPitch += diff > 0 ? step : -step;
    }

    target.setFrequency(mem.currentPitch);
  }

  /**
   * Process vibrato effect (4xy)
   */
  private processVibrato(
    mem: ChannelEffectMemory,
    target: MAMEEffectTarget
  ): void {
    if (mem.vibratoDepth === 0) return;

    const delta = this.calculateWaveformValue(
      mem.vibratoWaveform,
      mem.vibratoPhase,
      mem.vibratoDepth
    );

    // Apply as pitch offset (in linear frequency units)
    const pitchDelta = delta * 4;
    target.setPitchOffset(mem.currentPitchOffset + pitchDelta);

    // Advance phase
    mem.vibratoPhase = (mem.vibratoPhase + mem.vibratoSpeed) & 0x3F;
  }

  /**
   * Process tremolo effect (7xy)
   */
  private processTremolo(
    mem: ChannelEffectMemory,
    target: MAMEEffectTarget
  ): void {
    if (mem.tremoloDepth === 0) return;

    const delta = this.calculateWaveformValue(
      mem.tremoloWaveform,
      mem.tremoloPhase,
      mem.tremoloDepth
    );

    // Apply as volume offset
    const volDelta = Math.round(delta);
    const newVol = Math.max(0, Math.min(64, mem.currentVolume + volDelta));
    target.setVolume(newVol);

    // Advance phase
    mem.tremoloPhase = (mem.tremoloPhase + mem.tremoloSpeed) & 0x3F;
  }

  /**
   * Process volume slide (Axy)
   */
  private processVolumeSlide(
    mem: ChannelEffectMemory,
    target: MAMEEffectTarget
  ): void {
    if (mem.volumeSlide === 0) return;

    const x = (mem.volumeSlide >> 4) & 0x0F;
    const y = mem.volumeSlide & 0x0F;

    // X takes priority if both set
    if (x > 0) {
      mem.currentVolume = Math.min(mem.currentVolume + x, 64);
    } else if (y > 0) {
      mem.currentVolume = Math.max(mem.currentVolume - y, 0);
    }

    target.setVolume(mem.currentVolume);
  }

  /**
   * Calculate waveform value for vibrato/tremolo
   */
  private calculateWaveformValue(
    waveform: number,
    phase: number,
    depth: number
  ): number {
    const phaseAngle = (phase / 64) * Math.PI * 2;

    switch (waveform) {
      case EffectWaveform.SINE:
        return Math.sin(phaseAngle) * depth;

      case EffectWaveform.RAMP_DOWN:
        return ((64 - phase) / 32 - 1) * depth;

      case EffectWaveform.SQUARE:
        return (phase < 32 ? 1 : -1) * depth;

      case EffectWaveform.RANDOM:
        return (Math.random() * 2 - 1) * depth;

      default:
        return 0;
    }
  }

  /**
   * Check if effect has note delay (EDx)
   */
  hasNoteDelay(effect: string | null): boolean {
    if (!effect) return false;
    return effect.toUpperCase().startsWith('ED') && effect !== 'ED0';
  }

  /**
   * Get note delay tick (EDx)
   */
  getNoteDelayTick(effect: string | null): number {
    if (!effect) return 0;
    if (!effect.toUpperCase().startsWith('ED')) return 0;
    return parseInt(effect.substring(2), 16) || 0;
  }

  /**
   * Reset all channel memory
   */
  reset(): void {
    this.channelMemory.clear();
    this.speed = 6;
    this.bpm = 125;
  }

  /**
   * Reset memory for a specific channel (on note-on)
   */
  resetChannel(channel: number): void {
    const mem = this.getChannelMemory(channel);

    // Reset pitch effects
    mem.currentPitchOffset = 0;
    mem.arpeggioX = 0;
    mem.arpeggioY = 0;
    mem.arpeggioTick = 0;
    mem.pitchSlideUp = 0;
    mem.pitchSlideDown = 0;
    mem.tonePortamentoTarget = null;

    // Reset vibrato phase (but keep speed/depth for memory)
    mem.vibratoPhase = 0;

    // Reset tremolo phase
    mem.tremoloPhase = 0;

    // Reset tick-based effects
    mem.noteCutTick = -1;
    mem.noteDelayTick = -1;
  }
}

/**
 * Singleton instance for shared effect routing
 */
let sharedRouter: MAMEEffectRouter | null = null;

/**
 * Get shared effect router instance
 */
export function getSharedEffectRouter(): MAMEEffectRouter {
  if (!sharedRouter) {
    sharedRouter = new MAMEEffectRouter();
  }
  return sharedRouter;
}
