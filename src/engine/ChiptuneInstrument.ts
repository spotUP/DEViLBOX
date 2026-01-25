/**
 * ChiptuneInstrument - Adapter for libopenmpt-based module playback
 *
 * Wraps ChiptunePlayer to provide Tone.js-compatible interface for accurate
 * MOD/XM/IT/S3M playback. Uses libopenmpt WASM for sample-accurate rendering
 * of tracker effects (vibrato, portamento, etc.) that Tone.js can't handle.
 *
 * Key differences from native tracker playback:
 * - Audio-rate parameter modulation (smooth vibrato, not chunky)
 * - Authentic Amiga period-based pitch calculation
 * - Sample-accurate effect timing
 *
 * Usage:
 * - Create with original module data (base64 or ArrayBuffer)
 * - Call play() to start libopenmpt playback
 * - Audio routes through Tone.js gain node for effects/master
 */

import * as Tone from 'tone';
import { ChiptunePlayer } from '@/lib/import/ChiptunePlayer';
import type { ChiptuneModuleConfig } from '@typedefs/instrument';

export interface ChiptuneInstrumentCallbacks {
  onProgress?: (data: { pos: number; order: number; pattern: number; row: number }) => void;
  onEnded?: () => void;
  onMetadata?: (meta: any) => void;
  onError?: (error: { type: string; message?: string }) => void;
}

export class ChiptuneInstrument {
  private player: ChiptunePlayer | null = null;
  private config: ChiptuneModuleConfig;
  private output: Tone.Gain;
  private callbacks: ChiptuneInstrumentCallbacks;
  private moduleData: ArrayBuffer | null = null;
  private isPlaying = false;
  private initialized = false;

  constructor(config: ChiptuneModuleConfig, callbacks: ChiptuneInstrumentCallbacks = {}) {
    this.config = config;
    this.callbacks = callbacks;

    // Create Tone.js output node for integration with effect chain
    this.output = new Tone.Gain(1);

    // Initialize async
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      // Create ChiptunePlayer
      this.player = new ChiptunePlayer({
        repeatCount: 0, // Play once (can be changed)
        stereoSeparation: 100,
        interpolationFilter: 0, // No interpolation for authentic sound
      });

      // Set up event handlers
      this.player.onProgress((data) => {
        this.callbacks.onProgress?.(data);
      });

      this.player.onEnded(() => {
        this.isPlaying = false;
        this.callbacks.onEnded?.();
      });

      this.player.onMetadata((meta) => {
        this.callbacks.onMetadata?.(meta);
      });

      this.player.onError((error) => {
        this.callbacks.onError?.(error);
      });

      // Load module data from config
      if (this.config.moduleData) {
        this.moduleData = this.base64ToArrayBuffer(this.config.moduleData);
      }

      // Wait for player initialization
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('ChiptunePlayer initialization timeout'));
        }, 10000);

        this.player!.onInitialized(() => {
          clearTimeout(timeout);
          this.initialized = true;
          resolve();
        });

        this.player!.onError((error) => {
          clearTimeout(timeout);
          reject(new Error(error.type));
        });
      });

      console.log('[ChiptuneInstrument] Initialized successfully');
    } catch (error) {
      console.error('[ChiptuneInstrument] Failed to initialize:', error);
      this.callbacks.onError?.({
        type: 'init_failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    // Remove data URL prefix if present
    const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
    const binary = atob(base64Data);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  // ==========================================================================
  // PLAYBACK CONTROL
  // ==========================================================================

  async play(): Promise<void> {
    if (!this.player || !this.moduleData) {
      const error = { type: 'not_ready', message: 'Player or module data not available' };
      console.error('[ChiptuneInstrument] Not ready for playback');
      this.callbacks.onError?.(error);
      return;
    }

    // Wait for initialization if still pending
    if (!this.initialized) {
      console.log('[ChiptuneInstrument] Waiting for initialization...');
      await new Promise<void>((resolve) => {
        const checkInterval = setInterval(() => {
          if (this.initialized) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 50);
        // Timeout after 10 seconds
        setTimeout(() => {
          clearInterval(checkInterval);
          resolve();
        }, 10000);
      });

      if (!this.initialized) {
        const error = { type: 'init_timeout', message: 'Initialization timed out' };
        console.error('[ChiptuneInstrument] Initialization timed out');
        this.callbacks.onError?.(error);
        return;
      }
    }

    await this.player.play(this.moduleData);
    this.isPlaying = true;
  }

  stop(): void {
    if (this.player) {
      this.player.stop();
      this.isPlaying = false;
    }
  }

  pause(): void {
    this.player?.pause();
    this.isPlaying = false;
  }

  unpause(): void {
    this.player?.unpause();
    this.isPlaying = true;
  }

  setPosition(seconds: number): void {
    this.player?.setPos(seconds);
  }

  setVolume(volume: number): void {
    // volume is 0-1
    this.player?.setVol(volume);
    this.output.gain.value = volume;
  }

  setRepeatCount(count: number): void {
    this.player?.setRepeatCount(count);
  }

  // ==========================================================================
  // TONE.JS COMPATIBILITY
  // Note: These methods exist for interface compatibility but may not be
  // meaningful for module playback (the module handles its own notes)
  // ==========================================================================

  triggerAttackRelease(
    _note: string | number,
    _duration?: Tone.Unit.Time,
    _time?: Tone.Unit.Time,
    _velocity?: number
  ): void {
    // For module playback, individual notes aren't triggered
    // The module plays as a whole
    console.warn('[ChiptuneInstrument] triggerAttackRelease not applicable for module playback');
  }

  triggerAttack(
    _note: string | number,
    _time?: Tone.Unit.Time,
    _velocity?: number
  ): void {
    // Start playback from beginning if not playing
    if (!this.isPlaying) {
      this.play();
    }
  }

  triggerRelease(_time?: Tone.Unit.Time): void {
    // Stop playback
    this.stop();
  }

  // ==========================================================================
  // CONNECTION (AUDIO ROUTING)
  // ==========================================================================

  /**
   * Connect output to destination
   * Note: ChiptunePlayer manages its own audio routing internally.
   * This output node can be used for additional Tone.js effects.
   */
  connect(destination: Tone.InputNode): this {
    this.output.connect(destination);
    return this;
  }

  disconnect(): void {
    this.output.disconnect();
  }

  toDestination(): this {
    this.output.toDestination();
    return this;
  }

  // ==========================================================================
  // GETTERS
  // ==========================================================================

  get volume(): Tone.Param<'gain'> {
    return this.output.gain;
  }

  get duration(): number {
    return this.player?.duration ?? 0;
  }

  get currentTime(): number {
    return this.player?.currentTime ?? 0;
  }

  get order(): number {
    return this.player?.order ?? 0;
  }

  get pattern(): number {
    return this.player?.pattern ?? 0;
  }

  get row(): number {
    return this.player?.row ?? 0;
  }

  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  isAvailable(): boolean {
    return this.initialized && (this.player?.isAvailable() ?? false);
  }

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  dispose(): void {
    this.stop();
    this.output.dispose();
    // ChiptunePlayer doesn't have explicit dispose, but we clear references
    this.player = null;
    this.moduleData = null;
  }
}

/**
 * Factory function to create ChiptuneInstrument
 */
export function createChiptuneInstrument(
  config: ChiptuneModuleConfig,
  callbacks?: ChiptuneInstrumentCallbacks
): ChiptuneInstrument {
  return new ChiptuneInstrument(config, callbacks);
}
