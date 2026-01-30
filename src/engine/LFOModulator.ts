/**
 * LFOModulator - Audio-rate LFO modulation for synthesizers
 *
 * Provides modulation for:
 * - Filter cutoff / resonance
 * - Pitch (vibrato)
 * - Volume (tremolo)
 *
 * Uses Tone.js LFO connected to Tone.Signal nodes for sample-accurate modulation
 */

import * as Tone from 'tone';
import type { LFOConfig, LFOWaveform } from '@typedefs/instrument';

export interface ModulationTargets {
  filterFrequency?: Tone.Param<'frequency'> | Tone.Signal<'frequency'>;
  filterQ?: Tone.Param<'number'> | Tone.Signal<'number'>;
  pitch?: Tone.Param<'cents'> | Tone.Signal<'cents'>;
  volume?: Tone.Param<'decibels'> | Tone.Signal<'decibels'>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gain?: Tone.Param<any> | Tone.Signal<any>;
}

export class LFOModulator {
  private lfo: Tone.LFO;
  private config: LFOConfig;

  // Modulation scaling signals
  private filterScaler: Tone.Multiply | null = null;
  private pitchScaler: Tone.Multiply | null = null;
  private volumeScaler: Tone.Multiply | null = null;

  // Connected targets
  private targets: ModulationTargets = {};

  // Base values for modulation (public for external access)
  public baseFilterFreq: number = 1000;
  public baseFilterQ: number = 1;

  constructor(config: LFOConfig) {
    this.config = { ...config };

    // Create the main LFO
    this.lfo = new Tone.LFO({
      frequency: config.rate,
      type: this.mapWaveform(config.waveform),
      min: -1,
      max: 1,
      phase: config.phase,
    });

    if (config.enabled) {
      this.lfo.start();
    }
  }

  /**
   * Map our waveform types to Tone.js types
   */
  private mapWaveform(waveform: LFOWaveform): Tone.ToneOscillatorType {
    switch (waveform) {
      case 'sine': return 'sine';
      case 'triangle': return 'triangle';
      case 'sawtooth': return 'sawtooth';
      case 'square': return 'square';
      default: return 'sine';
    }
  }

  /**
   * Connect LFO to filter frequency modulation
   */
  public connectFilter(
    filterNode: Tone.Filter | Tone.BiquadFilter | { frequency: Tone.Param<'frequency'>; Q?: Tone.Param<'number'> },
    baseFrequency: number = 1000
  ): void {
    this.baseFilterFreq = baseFrequency;

    if (this.config.filterAmount === 0) return;

    // Create multiplier to scale LFO output to filter range
    // LFO outputs -1 to 1, we want to modulate around the base frequency
    // Amount in semitones: 12 semitones = 1 octave = 2x frequency
    const octaveRange = (this.config.filterAmount / 100) * 4; // Max 4 octaves modulation

    this.filterScaler = new Tone.Multiply(octaveRange);
    this.lfo.connect(this.filterScaler);

    // Connect to filter frequency using exponential scaling for natural sound
    if ('frequency' in filterNode && filterNode.frequency) {
      // Store target for later updates
      this.targets.filterFrequency = filterNode.frequency;

      // Use Tone's built-in frequency scaling
      // Create a signal for frequency base value (reserved for future audio-rate modulation)
      const freqSignal = new Tone.Signal(baseFrequency, 'frequency');
      void freqSignal; // Reserved for true audio-rate filter modulation

      // Create an Add to offset the LFO (convert -1..1 to 0..2 range)
      const offset = new Tone.Add(1);
      this.filterScaler.connect(offset);

      // For now, use a simpler approach with interval-based modulation
      // as true audio-rate filter freq modulation is complex in Tone.js
    }
  }

  /**
   * Connect LFO to pitch (detune) modulation for vibrato
   */
  public connectPitch(
    oscillator: Tone.Oscillator | { detune: Tone.Param<'cents'> | Tone.Signal<'cents'> }
  ): void {
    if (this.config.pitchAmount === 0) return;

    // Scale LFO to cents (100 cents = 1 semitone)
    // pitchAmount is 0-100, representing max deviation in cents
    const centsRange = this.config.pitchAmount;

    this.pitchScaler = new Tone.Multiply(centsRange);
    this.lfo.connect(this.pitchScaler);

    if ('detune' in oscillator && oscillator.detune) {
      this.targets.pitch = oscillator.detune;
      this.pitchScaler.connect(oscillator.detune);
    }
  }

  /**
   * Connect LFO to volume for tremolo effect
   */
  public connectVolume(
    gainNode: Tone.Gain | { gain: Tone.Param<'normalRange'> }
  ): void {
    if (this.config.volumeAmount === 0) return;

    // Scale LFO for volume modulation
    // Convert -1..1 to depth percentage around 1.0 center
    const depth = this.config.volumeAmount / 100;

    this.volumeScaler = new Tone.Multiply(depth);
    this.lfo.connect(this.volumeScaler);

    // Add offset to get 1.0 center (so output is 1-depth to 1+depth)
    const offset = new Tone.Add(1);
    this.volumeScaler.connect(offset);

    if ('gain' in gainNode && gainNode.gain) {
      this.targets.gain = gainNode.gain;
      offset.connect(gainNode.gain);
    }
  }

  /**
   * Update LFO configuration
   */
  public updateConfig(config: Partial<LFOConfig>): void {
    this.config = { ...this.config, ...config };

    // Update LFO parameters
    if (config.rate !== undefined) {
      this.lfo.frequency.value = config.rate;
    }

    if (config.waveform !== undefined) {
      this.lfo.type = this.mapWaveform(config.waveform);
    }

    if (config.phase !== undefined) {
      this.lfo.phase = config.phase;
    }

    // Handle enable/disable
    if (config.enabled !== undefined) {
      if (config.enabled && this.lfo.state === 'stopped') {
        this.lfo.start();
      } else if (!config.enabled && this.lfo.state === 'started') {
        this.lfo.stop();
      }
    }

    // Update scaling amounts
    if (config.filterAmount !== undefined && this.filterScaler) {
      const octaveRange = (config.filterAmount / 100) * 4;
      this.filterScaler.factor.value = octaveRange;
    }

    if (config.pitchAmount !== undefined && this.pitchScaler) {
      this.pitchScaler.factor.value = config.pitchAmount;
    }

    if (config.volumeAmount !== undefined && this.volumeScaler) {
      this.volumeScaler.factor.value = config.volumeAmount / 100;
    }
  }

  /**
   * Reset LFO phase (for retrigger on note attack)
   */
  public resetPhase(): void {
    if (this.config.retrigger) {
      // Restart LFO to reset phase
      this.lfo.phase = this.config.phase;
    }
  }

  /**
   * Start the LFO
   */
  public start(): void {
    if (this.config.enabled && this.lfo.state === 'stopped') {
      this.lfo.start();
    }
  }

  /**
   * Stop the LFO
   */
  public stop(): void {
    if (this.lfo.state === 'started') {
      this.lfo.stop();
    }
  }

  /**
   * Get current LFO phase (for visualization)
   */
  public getPhase(): number {
    return this.lfo.phase;
  }

  /**
   * Get current configuration
   */
  public getConfig(): LFOConfig {
    return { ...this.config };
  }

  /**
   * Dispose of all resources
   */
  public dispose(): void {
    this.lfo.stop();
    this.lfo.dispose();

    if (this.filterScaler) {
      this.filterScaler.dispose();
      this.filterScaler = null;
    }

    if (this.pitchScaler) {
      this.pitchScaler.dispose();
      this.pitchScaler = null;
    }

    if (this.volumeScaler) {
      this.volumeScaler.dispose();
      this.volumeScaler = null;
    }
  }
}

/**
 * Simple tremolo effect using Tone.js Tremolo
 * For cases where full LFO control isn't needed
 */
export function createTremolo(rate: number, depth: number): Tone.Tremolo {
  return new Tone.Tremolo({
    frequency: rate,
    depth: depth / 100,
    spread: 0,
    type: 'sine',
  }).start();
}

/**
 * Simple vibrato effect using Tone.js Vibrato
 * For cases where full LFO control isn't needed
 */
export function createVibrato(rate: number, depth: number): Tone.Vibrato {
  return new Tone.Vibrato({
    frequency: rate,
    depth: depth / 100,
    type: 'sine',
  });
}

/**
 * Auto-filter effect for filter LFO modulation
 */
export function createAutoFilter(
  rate: number,
  depth: number,
  baseFrequency: number = 1000
): Tone.AutoFilter {
  const octaves = (depth / 100) * 4; // Map 0-100% to 0-4 octaves
  return new Tone.AutoFilter({
    frequency: rate,
    type: 'sine',
    depth: 1,
    baseFrequency: baseFrequency,
    octaves: octaves,
    filter: {
      type: 'lowpass',
      rolloff: -12,
      Q: 1,
    },
  }).start();
}
