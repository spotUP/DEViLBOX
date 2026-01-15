/**
 * FormatHandler - Base class for format-specific effect handlers
 *
 * Provides common functionality and a consistent interface for
 * MOD, XM, S3M, and IT effect processing.
 */

import {
  type ModuleFormat,
  type FormatConfig,
  type ChannelState,
  type TickResult,
  type WaveformType,
  type FormatHandler as IFormatHandler,
  createDefaultChannelState,
} from './types';
import { VIBRATO_TABLE } from './PeriodTables';

/**
 * Abstract base class for effect handlers
 */
export abstract class BaseFormatHandler implements IFormatHandler {
  abstract readonly format: ModuleFormat;

  protected config: FormatConfig = {
    format: 'NATIVE',
    initialSpeed: 6,
    initialTempo: 125,
    numChannels: 4,
  };

  protected channels: Map<number, ChannelState> = new Map();
  protected globalVolume: number = 64;
  protected speed: number = 6;
  protected tempo: number = 125;
  protected currentTick: number = 0;
  protected currentRow: number = 0;

  /**
   * Initialize handler with format configuration
   */
  init(config: FormatConfig): void {
    this.config = config;
    this.speed = config.initialSpeed;
    this.tempo = config.initialTempo;

    // Initialize channels
    this.channels.clear();
    for (let i = 0; i < config.numChannels; i++) {
      this.channels.set(i, createDefaultChannelState());
    }
  }

  /**
   * Get channel state, creating if needed
   */
  getChannelState(channel: number): ChannelState {
    if (!this.channels.has(channel)) {
      this.channels.set(channel, createDefaultChannelState());
    }
    return this.channels.get(channel)!;
  }

  /**
   * Reset a single channel
   */
  resetChannel(channel: number): void {
    this.channels.set(channel, createDefaultChannelState());
  }

  /**
   * Reset all state
   */
  resetAll(): void {
    this.channels.clear();
    for (let i = 0; i < this.config.numChannels; i++) {
      this.channels.set(i, createDefaultChannelState());
    }
    this.globalVolume = 64;
    this.speed = this.config.initialSpeed;
    this.tempo = this.config.initialTempo;
    this.currentTick = 0;
    this.currentRow = 0;
  }

  /**
   * Parse effect command string (e.g., "A0F", "301", "E91")
   * Returns null if no effect or invalid
   */
  protected parseEffect(effect: string | null): {
    command: number;
    x: number;
    y: number;
    param: number;
  } | null {
    if (!effect || effect === '...' || effect === '000') return null;

    // Effect format: XYZ where X is command letter/digit, YZ is hex parameter
    const effectStr = effect.toUpperCase().padEnd(3, '0');

    // First character can be letter (A-Z) or digit (0-9)
    let command: number;
    const firstChar = effectStr[0];
    if (firstChar >= '0' && firstChar <= '9') {
      command = parseInt(firstChar, 16);
    } else if (firstChar >= 'A' && firstChar <= 'Z') {
      command = firstChar.charCodeAt(0) - 55; // A=10, B=11, etc.
    } else {
      return null;
    }

    const x = parseInt(effectStr[1], 16);
    const y = parseInt(effectStr[2], 16);

    if (isNaN(command) || isNaN(x) || isNaN(y)) return null;

    return { command, x, y, param: x * 16 + y };
  }

  /**
   * Get waveform value for vibrato/tremolo
   * @param waveform - Waveform type
   * @param position - Position in waveform (0-63)
   * @returns Value from -1 to 1
   */
  protected getWaveformValue(waveform: WaveformType, position: number): number {
    const pos = position & 0x3F; // 0-63

    switch (waveform) {
      case 'sine': {
        // Use authentic ProTracker sine table (0-255 range)
        // Convert 64-position to 32-position table
        const tablePos = (pos >> 1) & 0x1F;
        const value = VIBRATO_TABLE[tablePos];
        // Convert 0-255 to -1 to 1, accounting for waveform phase
        return pos < 32
          ? value / 255
          : -(value / 255);
      }

      case 'rampDown':
        // Sawtooth wave: 1 at 0, -1 at 63
        return 1 - (pos / 32);

      case 'square':
        // Square wave: 1 for first half, -1 for second half
        return pos < 32 ? 1 : -1;

      case 'random':
        // Random value between -1 and 1
        return Math.random() * 2 - 1;

      default:
        return 0;
    }
  }

  /**
   * Clamp volume to valid range
   */
  protected clampVolume(volume: number): number {
    return Math.max(0, Math.min(64, Math.floor(volume)));
  }

  /**
   * Clamp pan to valid range
   */
  protected clampPan(pan: number): number {
    return Math.max(0, Math.min(255, Math.floor(pan)));
  }

  /**
   * Convert waveform number to type
   */
  protected waveformFromNumber(num: number): WaveformType {
    const types: WaveformType[] = ['sine', 'rampDown', 'square', 'random'];
    return types[num & 3];
  }

  /**
   * Abstract methods that format handlers must implement
   */
  abstract processRowStart(
    channel: number,
    note: string | null,
    instrument: number | null,
    volume: number | null,
    effect: string | null,
    state: ChannelState
  ): TickResult;

  abstract processTick(
    channel: number,
    tick: number,
    state: ChannelState
  ): TickResult;
}

/**
 * Effect timing classifications
 * Used to determine when effects should be processed
 */
export const EffectTiming = {
  // Process only on tick 0
  TICK_0: 'tick0',
  // Process on ticks 1+ (not tick 0)
  TICK_N: 'tickN',
  // Process on every tick
  ALL_TICKS: 'allTicks',
  // Process at specific tick (EDx note delay, ECx note cut)
  SPECIFIC_TICK: 'specificTick',
} as const;
export type EffectTiming = typeof EffectTiming[keyof typeof EffectTiming];

/**
 * Effect timing lookup for common effects
 */
export const EFFECT_TIMINGS: Record<string, EffectTiming> = {
  // Tick 0 only (immediate effects)
  setVolume: EffectTiming.TICK_0,
  setBPM: EffectTiming.TICK_0,
  setSpeed: EffectTiming.TICK_0,
  patternBreak: EffectTiming.TICK_0,
  positionJump: EffectTiming.TICK_0,
  finePortaUp: EffectTiming.TICK_0,
  finePortaDown: EffectTiming.TICK_0,
  fineVolumeUp: EffectTiming.TICK_0,
  fineVolumeDown: EffectTiming.TICK_0,
  setFinetune: EffectTiming.TICK_0,
  setVibratoWaveform: EffectTiming.TICK_0,
  setTremoloWaveform: EffectTiming.TICK_0,
  setPanning: EffectTiming.TICK_0,
  sampleOffset: EffectTiming.TICK_0,
  patternLoopSet: EffectTiming.TICK_0,

  // Tick N only (sliding effects)
  portaUp: EffectTiming.TICK_N,
  portaDown: EffectTiming.TICK_N,
  tonePortamento: EffectTiming.TICK_N,
  vibrato: EffectTiming.TICK_N,
  tremolo: EffectTiming.TICK_N,
  volumeSlide: EffectTiming.TICK_N,
  panSlide: EffectTiming.TICK_N,
  globalVolumeSlide: EffectTiming.TICK_N,

  // Every tick
  arpeggio: EffectTiming.ALL_TICKS,
  retrig: EffectTiming.ALL_TICKS,
  tremor: EffectTiming.ALL_TICKS,

  // Specific tick
  noteCut: EffectTiming.SPECIFIC_TICK,
  noteDelay: EffectTiming.SPECIFIC_TICK,
  keyOff: EffectTiming.SPECIFIC_TICK,
  patternLoopJump: EffectTiming.SPECIFIC_TICK,
};
