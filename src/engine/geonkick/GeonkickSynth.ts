/**
 * GeonkickSynth — DevilboxSynth wrapper around the singleton GeonkickEngine.
 *
 * The wrapper exists so the SynthRegistry can hand out a fresh instance
 * per channel even though the underlying WASM engine is one-per-AudioContext
 * (Geonkick is currently built with -DGEONKICK_SINGLE = single-instrument
 * kit). All wrappers share the engine; loading a preset on one wrapper
 * affects every channel using the synth. The registry sets `sharedInstance`
 * so the channel router only ever creates one wrapper anyway.
 */

import { noteToMidi } from '@/utils/audio-context';
import type { DevilboxSynth } from '@typedefs/synth';
import type { GeonkickConfig } from '@/types/instrument/exotic';
import { GeonkickEngine } from './GeonkickEngine';
import { applyGeonkickPreset } from './GeonkickPresetLoader';

export class GeonkickSynth implements DevilboxSynth {
  readonly name = 'Geonkick';
  readonly output: AudioNode;

  private engine: GeonkickEngine;
  private _disposed = false;

  constructor(config?: GeonkickConfig) {
    this.engine = GeonkickEngine.getInstance();
    this.output = this.engine.output;

    if (config?.preset) {
      // Apply once the engine's worklet has booted; ignore failures
      // because the worklet may still be initialising during early calls.
      this.engine.ready().then(() => {
        if (this._disposed) return;
        try {
          applyGeonkickPreset(this.engine, config.preset!);
        } catch (err) {
          console.warn('[GeonkickSynth] preset apply failed:', err);
        }
      }).catch(() => { /* engine init failed; nothing to apply */ });
    }
  }

  triggerAttack(note: string | number, _time?: number, velocity = 0.8): void {
    if (this._disposed) return;
    const midi = noteToMidi(note);
    const vel127 = Math.round(Math.max(0, Math.min(1, velocity)) * 127);
    this.engine.triggerNote(midi, vel127);
  }

  triggerRelease(note?: string | number, _time?: number): void {
    if (this._disposed) return;
    const midi = note !== undefined ? noteToMidi(note) : 69;
    this.engine.releaseNote(midi);
  }

  triggerAttackRelease(
    note: string | number,
    _duration: number,
    time?: number,
    velocity = 0.8,
  ): void {
    // Geonkick kicks are one-shots — release is a no-op for most presets,
    // so we just trigger the attack and let the kick decay naturally.
    this.triggerAttack(note, time, velocity);
  }

  set(param: string, value: number): void {
    if (this._disposed) return;
    const eng = this.engine;
    switch (param) {
      case 'length': eng.setLength(value); break;
      case 'amplitude': eng.setKickAmplitude(value); break;
      case 'limiter': eng.setLimiter(value); break;
      case 'filterCutoff': eng.setFilterCutoff(value); break;
      case 'filterQ': eng.setFilterFactor(value); break;
      case 'distDrive': eng.setDistortionDrive(value); break;
      case 'distVolume': eng.setDistortionVolume(value); break;
      case 'osc0Freq': eng.setOscillatorFrequency(0, value); break;
      case 'osc0Amp': eng.setOscillatorAmplitude(0, value); break;
      case 'osc1Freq': eng.setOscillatorFrequency(1, value); break;
      case 'osc1Amp': eng.setOscillatorAmplitude(1, value); break;
      case 'osc2Freq': eng.setOscillatorFrequency(2, value); break;
      case 'osc2Amp': eng.setOscillatorAmplitude(2, value); break;
    }
  }

  dispose(): void {
    // Engine is a singleton shared across channels — never dispose it
    // from a per-instrument wrapper, only mark this wrapper as inactive.
    this._disposed = true;
  }
}
