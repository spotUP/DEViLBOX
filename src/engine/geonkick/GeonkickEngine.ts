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

/**
 * Per-oscillator envelope slots. Matches GKICK_OSC_*_ENVELOPE in
 * src/dsp/src/synthesizer.h.
 */
export const GeonkickOscEnvelope = {
  Amplitude:    0,
  Frequency:    1,
  FilterCutoff: 2,
  PitchShift:   3,
} as const;
export type GeonkickOscEnvelope = (typeof GeonkickOscEnvelope)[keyof typeof GeonkickOscEnvelope];

/**
 * One envelope control point. x and y are normalised to [0, 1]:
 *   x = time as a fraction of the kick length (0 = start, 1 = end)
 *   y = value as a fraction of the parameter's dynamic range
 *   controlPoint = true means this is a curve-shaping handle, not a vertex
 */
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

export class GeonkickEngine {
  private static instance: GeonkickEngine | null = null;
  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts: WeakSet<AudioContext> = new WeakSet();
  private static initPromises: WeakMap<AudioContext, Promise<void>> = new WeakMap();

  private audioContext: AudioContext;
  private workletNode: AudioWorkletNode | null = null;
  readonly output: GainNode;

  private _initPromise: Promise<void>;
  private _resolveInit: (() => void) | null = null;
  private _rejectInit: ((err: Error) => void) | null = null;
  private _disposed = false;

  private constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();

    this._initPromise = new Promise<void>((resolve, reject) => {
      this._resolveInit = resolve;
      this._rejectInit = reject;
    });

    this.initialize();
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

  /** Resolves when the worklet has created its WASM synth instance. */
  ready(): Promise<void> {
    return this._initPromise;
  }

  private async initialize(): Promise<void> {
    try {
      await GeonkickEngine.ensureInitialized(this.audioContext);
      this.createNode();
    } catch (err) {
      console.error('[GeonkickEngine] initialization failed:', err);
      this._rejectInit?.(err as Error);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.loadedContexts.has(context)) return;
    const existing = this.initPromises.get(context);
    if (existing) return existing;

    const initPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';

      await context.audioWorklet.addModule(`${baseUrl}geonkick/Geonkick.worklet.js`);

      if (!this.wasmBinary || !this.jsCode) {
        const [wasmResp, jsResp] = await Promise.all([
          fetch(`${baseUrl}geonkick/Geonkick.wasm`),
          fetch(`${baseUrl}geonkick/Geonkick.js`),
        ]);
        if (wasmResp.ok) this.wasmBinary = await wasmResp.arrayBuffer();
        if (jsResp.ok) {
          let code = await jsResp.text();
          // Transform the Emscripten glue so it evaluates cleanly inside
          // `new Function()` in an AudioWorklet context, and so HEAPF32 /
          // HEAPU8 become accessible via the returned Module object.
          code = code
            .replace(/import\.meta\.url/g, "'.'")
            .replace(/export\s+default\s+\w+;?/g, '')
            .replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];')
            .replace(
              /HEAPU8=new Uint8Array\(b\);/,
              'HEAPU8=new Uint8Array(b);Module["HEAPU8"]=HEAPU8;',
            )
            .replace(
              /HEAPF32=new Float32Array\(b\);/,
              'HEAPF32=new Float32Array(b);Module["HEAPF32"]=HEAPF32;',
            );
          this.jsCode = code;
        }
      }

      this.loadedContexts.add(context);
    })();

    this.initPromises.set(context, initPromise);
    return initPromise;
  }

  private createNode(): void {
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
      wasmBinary: GeonkickEngine.wasmBinary,
      jsCode: GeonkickEngine.jsCode,
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

  /** Drive amount; 1.0 is unity, higher values push harder into saturation. */
  setDistortionDrive(drive: number): void {
    this.workletNode?.port.postMessage({
      type: 'setDistortionDrive',
      drive: Math.max(0, Math.min(10, drive)),
    });
  }

  /** Distortion out-limiter ("volume" knob in the upstream UI). */
  setDistortionVolume(volume: number): void {
    this.workletNode?.port.postMessage({
      type: 'setDistortionVolume',
      volume: Math.max(0, Math.min(2, volume)),
    });
  }

  // ── Oscillators ─────────────────────────────────────────────────────────
  // 9 oscillators per instrument: 0..2 = group 0, 3..5 = group 1, 6..8 = group 2.

  enableOscillator(oscIndex: number, enabled: boolean): void {
    this.workletNode?.port.postMessage({
      type: 'enableOsc',
      oscIndex: oscIndex | 0,
      enabled,
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

  /**
   * Replace a kick-level envelope (amp, freq, filter cutoff, pitch shift,
   * distortion, etc.). Triggers a rebake on the worker stub.
   */
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

  /** Replace a per-oscillator envelope (0..8 for oscIndex, 0..3 for envIndex). */
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

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    if (this.workletNode) {
      try {
        this.workletNode.port.postMessage({ type: 'dispose' });
      } catch {
        /* port may already be closed */
      }
      this.workletNode.disconnect();
      this.workletNode = null;
    }
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
