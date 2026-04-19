/**
 * GeonkickEngine.ts — singleton WASM wrapper for the Geonkick percussion synth.
 *
 * Geonkick bakes each kick sample offline via its synth engine, then reads
 * from the baked buffer when a note is triggered. The worklet handles the
 * bake (worker_stub.c runs it synchronously on any parameter change) and
 * exposes a typed setter surface over a MessagePort.
 *
 * Phase 2a: scalar parameter surface — length, limiter, filter, distortion,
 * per-oscillator amplitude/frequency/function/enable. Envelopes (the variable
 * -length point lists) and preset loading come in a follow-up.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

/** Matches gkick_filter_type in src/dsp/src/geonkick.h. */
export const GeonkickFilterType = {
  LowPass:  0,
  HighPass: 1,
  BandPass: 2,
} as const;
export type GeonkickFilterType = (typeof GeonkickFilterType)[keyof typeof GeonkickFilterType];

/** Matches geonkick_osc_func_type in src/dsp/src/geonkick.h. */
export const GeonkickOscFunction = {
  Sine:          0,
  Square:        1,
  Triangle:      2,
  Sawtooth:      3,
  NoiseWhite:    4,
  NoisePink:     5,
  NoiseBrownian: 6,
  Sample:        7,
} as const;
export type GeonkickOscFunction = (typeof GeonkickOscFunction)[keyof typeof GeonkickOscFunction];

/** Matches geonkick_envelope_type in src/dsp/src/geonkick.h. */
export const GeonkickKickEnvelope = {
  Amplitude:        0,
  Frequency:        1,
  FilterCutoff:     2,
  DistortionDrive:  3,
  DistortionVolume: 4,
  PitchShift:       5,
  FilterQ:          6,
  NoiseDensity:     7,
} as const;
export type GeonkickKickEnvelope = (typeof GeonkickKickEnvelope)[keyof typeof GeonkickKickEnvelope];

export const GeonkickOscEnvelope = {
  Amplitude:    0,
  Frequency:    1,
  FilterCutoff: 2,
  PitchShift:   3,
} as const;
export type GeonkickOscEnvelope = (typeof GeonkickOscEnvelope)[keyof typeof GeonkickOscEnvelope];

export interface GeonkickEnvelopePoint {
  x: number;
  y: number;
  controlPoint?: boolean;
}

function serializeEnvelopePoints(points: GeonkickEnvelopePoint[]): Float32Array {
  const out = new Float32Array(points.length * 3);
  for (let i = 0; i < points.length; i++) {
    out[i * 3 + 0] = points[i].x;
    out[i * 3 + 1] = points[i].y;
    out[i * 3 + 2] = points[i].controlPoint ? 1 : 0;
  }
  return out;
}

export class GeonkickEngine extends WASMSingletonBase {
  private static instance: GeonkickEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private _rejectInit: ((err: Error) => void) | null = null;

  private constructor() {
    super();
    // Replace the base class's init promise with one that also holds a reject
    // handle (so worklet errors during init can reject() the consumer's ready()).
    this._initPromise = new Promise<void>((resolve, reject) => {
      this._resolveInit = resolve;
      this._rejectInit = reject;
    });
    this.initialize(GeonkickEngine.cache);
  }

  static getInstance(): GeonkickEngine {
    const currentCtx = getDevilboxAudioContext();
    if (
      !GeonkickEngine.instance ||
      GeonkickEngine.instance._disposed ||
      GeonkickEngine.instance.audioContext !== currentCtx
    ) {
      if (GeonkickEngine.instance && !GeonkickEngine.instance._disposed) {
        GeonkickEngine.instance.dispose();
      }
      GeonkickEngine.instance = new GeonkickEngine();
    }
    return GeonkickEngine.instance;
  }

  static hasInstance(): boolean {
    return !!GeonkickEngine.instance && !GeonkickEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'geonkick',
      workletFile: 'Geonkick.worklet.js',
      wasmFile: 'Geonkick.wasm',
      jsFile: 'Geonkick.js',
    };
  }

  protected createNode(): void {
    this.workletNode = new AudioWorkletNode(this.audioContext, 'geonkick-processor', {
      outputChannelCount: [2],
      numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      if (data.type === 'ready') {
        this._resolveInit?.();
        this._resolveInit = null;
      } else if (data.type === 'error') {
        console.error('[GeonkickEngine] worklet error:', data.message);
        this._rejectInit?.(new Error(data.message));
        this._rejectInit = null;
      }
    };

    this.workletNode.connect(this.output);

    this.workletNode.port.postMessage({
      type: 'init',
      wasmBinary: GeonkickEngine.cache.wasmBinary,
      jsCode: GeonkickEngine.cache.jsCode,
    });
  }

  /** Trigger a note. Note is MIDI number; velocity is 0-127. */
  triggerNote(note: number, velocity = 127): void {
    this.workletNode?.port.postMessage({
      type: 'noteOn',
      note: note | 0,
      velocity: Math.max(0, Math.min(127, velocity | 0)),
    });
  }

  /** Release a note. Most kick presets ignore note-off (one-shot). */
  releaseNote(note: number): void {
    this.workletNode?.port.postMessage({
      type: 'noteOff',
      note: note | 0,
    });
  }

  /** Set the kick length in seconds (0.05..4.0). Triggers a rebake. */
  setLength(seconds: number): void {
    this.workletNode?.port.postMessage({
      type: 'setLength',
      seconds: Math.max(0.05, Math.min(4.0, seconds)),
    });
  }

  /** Master limiter (0..1.5 in upstream units, 1.0 = unity). */
  setLimiter(value: number): void {
    this.workletNode?.port.postMessage({
      type: 'setLimiter',
      value: Math.max(0, Math.min(1.5, value)),
    });
  }

  // ── Kick filter ──────────────────────────────────────────────────────────

  setFilterEnabled(enabled: boolean): void {
    this.workletNode?.port.postMessage({ type: 'setFilterEnabled', enabled });
  }

  /** Cutoff frequency in Hz. Typical kick range: 60..20000. */
  setFilterCutoff(frequencyHz: number): void {
    this.workletNode?.port.postMessage({
      type: 'setFilterCutoff',
      frequency: Math.max(20, Math.min(20000, frequencyHz)),
    });
  }

  /** Filter Q / resonance. Range depends on type; 1..20 is safe. */
  setFilterFactor(q: number): void {
    this.workletNode?.port.postMessage({
      type: 'setFilterFactor',
      q: Math.max(0.1, Math.min(20, q)),
    });
  }

  setFilterType(type: GeonkickFilterType): void {
    this.workletNode?.port.postMessage({ type: 'setFilterType', filterType: type | 0 });
  }

  // ── Distortion ──────────────────────────────────────────────────────────

  setDistortionEnabled(enabled: boolean): void {
    this.workletNode?.port.postMessage({ type: 'setDistortionEnabled', enabled });
  }

  setDistortionDrive(drive: number): void {
    this.workletNode?.port.postMessage({
      type: 'setDistortionDrive',
      drive: Math.max(0, Math.min(10, drive)),
    });
  }

  setDistortionVolume(volume: number): void {
    this.workletNode?.port.postMessage({
      type: 'setDistortionVolume',
      volume: Math.max(0, Math.min(2, volume)),
    });
  }

  // ── Oscillators ─────────────────────────────────────────────────────────

  enableOscillator(oscIndex: number, enabled: boolean): void {
    this.workletNode?.port.postMessage({
      type: 'enableOsc',
      oscIndex: oscIndex | 0,
      enabled,
    });
  }

  enableGroup(groupIndex: number, enabled: boolean): void {
    this.workletNode?.port.postMessage({
      type: 'enableGroup',
      groupIndex: groupIndex | 0,
      enabled,
    });
  }

  setGroupAmplitude(groupIndex: number, amplitude: number): void {
    this.workletNode?.port.postMessage({
      type: 'setGroupAmplitude',
      groupIndex: groupIndex | 0,
      amplitude,
    });
  }

  setKickAmplitude(amplitude: number): void {
    this.workletNode?.port.postMessage({ type: 'setKickAmplitude', amplitude });
  }

  setOscillatorFilterEnabled(oscIndex: number, enabled: boolean): void {
    this.workletNode?.port.postMessage({
      type: 'setOscFilterEnabled',
      oscIndex: oscIndex | 0,
      enabled,
    });
  }

  setOscillatorFilterCutoff(oscIndex: number, frequencyHz: number): void {
    this.workletNode?.port.postMessage({
      type: 'setOscFilterCutoff',
      oscIndex: oscIndex | 0,
      frequency: frequencyHz,
    });
  }

  setOscillatorFilterFactor(oscIndex: number, q: number): void {
    this.workletNode?.port.postMessage({
      type: 'setOscFilterFactor',
      oscIndex: oscIndex | 0,
      q,
    });
  }

  setOscillatorFilterType(oscIndex: number, type: GeonkickFilterType): void {
    this.workletNode?.port.postMessage({
      type: 'setOscFilterType',
      oscIndex: oscIndex | 0,
      filterType: type | 0,
    });
  }

  setOscillatorFm(oscIndex: number, isFm: boolean): void {
    this.workletNode?.port.postMessage({
      type: 'setOscFm',
      oscIndex: oscIndex | 0,
      isFm,
    });
  }

  setOscillatorPhase(oscIndex: number, phase: number): void {
    this.workletNode?.port.postMessage({
      type: 'setOscPhase',
      oscIndex: oscIndex | 0,
      phase,
    });
  }

  setOscillatorSeed(oscIndex: number, seed: number): void {
    this.workletNode?.port.postMessage({
      type: 'setOscSeed',
      oscIndex: oscIndex | 0,
      seed: seed | 0,
    });
  }

  setOscillatorAmplitude(oscIndex: number, amplitude: number): void {
    this.workletNode?.port.postMessage({
      type: 'setOscAmplitude',
      oscIndex: oscIndex | 0,
      amplitude: Math.max(0, Math.min(1, amplitude)),
    });
  }

  /** Oscillator base frequency in Hz. Kick fundamentals typically 40..200 Hz. */
  setOscillatorFrequency(oscIndex: number, frequencyHz: number): void {
    this.workletNode?.port.postMessage({
      type: 'setOscFrequency',
      oscIndex: oscIndex | 0,
      frequency: Math.max(0, Math.min(20000, frequencyHz)),
    });
  }

  setOscillatorFunction(oscIndex: number, func: GeonkickOscFunction): void {
    this.workletNode?.port.postMessage({
      type: 'setOscFunction',
      oscIndex: oscIndex | 0,
      func: func | 0,
    });
  }

  // ── Envelopes ───────────────────────────────────────────────────────────

  setKickEnvelope(envType: GeonkickKickEnvelope, points: GeonkickEnvelopePoint[]): void {
    if (!this.workletNode || points.length === 0) return;
    const serialized = serializeEnvelopePoints(points);
    this.workletNode.port.postMessage(
      {
        type: 'setKickEnvelope',
        envType: envType | 0,
        points: serialized,
      },
      [serialized.buffer],
    );
  }

  setOscillatorEnvelope(
    oscIndex: number,
    envIndex: GeonkickOscEnvelope,
    points: GeonkickEnvelopePoint[],
  ): void {
    if (!this.workletNode || points.length === 0) return;
    const serialized = serializeEnvelopePoints(points);
    this.workletNode.port.postMessage(
      {
        type: 'setOscEnvelope',
        oscIndex: oscIndex | 0,
        envIndex: envIndex | 0,
        points: serialized,
      },
      [serialized.buffer],
    );
  }

  override dispose(): void {
    super.dispose();
    try {
      this.output.disconnect();
    } catch {
      /* ignore */
    }
    if (GeonkickEngine.instance === this) {
      GeonkickEngine.instance = null;
    }
  }
}
