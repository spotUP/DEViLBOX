/**
 * DJMixerEngine - Crossfader, master gain, and limiter
 *
 * Audio graph:
 *   Deck A channelGain ──> crossfaderA ──┐
 *                                         ├──> masterGain ──> limiter ──> mainOut
 *   Deck B channelGain ──> crossfaderB ──┘
 *
 * Crossfader curves:
 *   - linear: gainA = 1-pos, gainB = pos
 *   - cut: hard cut at ~5% from each end (DJ battle style)
 *   - smooth: constant-power (cos/sin)
 */

import * as Tone from 'tone';

export type CrossfaderCurve = 'linear' | 'cut' | 'smooth';

export class DJMixerEngine {
  // Crossfader inputs — Deck engines connect to these
  readonly inputA: Tone.Gain;
  readonly inputB: Tone.Gain;

  // Master chain
  private masterGain: Tone.Gain;
  private limiter: Tone.Compressor;
  readonly masterMeter: Tone.Meter;

  // State
  private position = 0.5;
  private curve: CrossfaderCurve = 'smooth';

  constructor() {
    this.inputA = new Tone.Gain(1);
    this.inputB = new Tone.Gain(1);

    this.masterGain = new Tone.Gain(1);

    // Limiter: fast attack, high ratio compressor acting as a brickwall
    this.limiter = new Tone.Compressor({
      threshold: -1,
      ratio: 20,
      attack: 0.003,
      release: 0.1,
    });

    this.masterMeter = new Tone.Meter({ smoothing: 0.8 });

    // Wire: inputs → masterGain → limiter → destination + meter
    this.inputA.connect(this.masterGain);
    this.inputB.connect(this.masterGain);
    this.masterGain.connect(this.limiter);
    this.limiter.toDestination();
    this.limiter.connect(this.masterMeter);

    // Apply initial crossfader position
    this.applyCrossfader();
  }

  // ==========================================================================
  // CROSSFADER
  // ==========================================================================

  setCrossfader(position: number): void {
    this.position = Math.max(0, Math.min(1, position));
    this.applyCrossfader();
  }

  getCrossfader(): number {
    return this.position;
  }

  setCurve(curve: CrossfaderCurve): void {
    this.curve = curve;
    this.applyCrossfader();
  }

  getCurve(): CrossfaderCurve {
    return this.curve;
  }

  private applyCrossfader(): void {
    let gainA: number;
    let gainB: number;

    switch (this.curve) {
      case 'linear':
        gainA = 1 - this.position;
        gainB = this.position;
        break;

      case 'cut': {
        // Hard cut: full volume except near the opposite end
        const cutThreshold = 0.05;
        gainA = this.position > (1 - cutThreshold) ? 0 : 1;
        gainB = this.position < cutThreshold ? 0 : 1;
        break;
      }

      case 'smooth':
      default:
        // Constant power: cos/sin curve (no volume dip in the middle)
        gainA = Math.cos(this.position * Math.PI / 2);
        gainB = Math.sin(this.position * Math.PI / 2);
        break;
    }

    // Smooth ramp to avoid clicks
    this.inputA.gain.rampTo(gainA, 0.01);
    this.inputB.gain.rampTo(gainB, 0.01);
  }

  // ==========================================================================
  // MASTER
  // ==========================================================================

  setMasterVolume(value: number): void {
    this.masterGain.gain.rampTo(Math.max(0, Math.min(1.5, value)), 0.02);
  }

  getMasterVolume(): number {
    return this.masterGain.gain.value;
  }

  getMasterLevel(): number | number[] {
    return this.masterMeter.getValue();
  }

  /** Get the master gain node (for PFL/cue routing) */
  getMasterGain(): Tone.Gain {
    return this.masterGain;
  }

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  dispose(): void {
    this.inputA.dispose();
    this.inputB.dispose();
    this.masterGain.dispose();
    this.limiter.dispose();
    this.masterMeter.dispose();
  }
}
