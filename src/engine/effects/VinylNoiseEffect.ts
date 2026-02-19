// src/engine/effects/VinylNoiseEffect.ts
/**
 * VinylNoiseEffect — pure JS AudioWorklet vinyl crackle synthesizer.
 * DSP ported from viator-rust (MIT, Landon Viator).
 * No WASM. The worklet is always ready immediately after init.
 */

import * as Tone from 'tone';

function getRawNode(node: Tone.Gain): AudioNode {
  const n = node as unknown as Record<string, AudioNode | undefined>;
  return n._gainNode ?? n._nativeAudioNode ?? n._node ?? (node as unknown as AudioNode);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export interface VinylNoiseOptions {
  hiss?:   number;  // 0-1
  dust?:   number;  // 0-1
  age?:    number;  // 0-1
  speed?:  number;  // 0-1
  wet?:    number;  // 0-1
}

export class VinylNoiseEffect extends Tone.ToneAudioNode {
  readonly name = 'VinylNoise';
  readonly input:  Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;

  private _hiss:  number;
  private _dust:  number;
  private _age:   number;
  private _speed: number;
  private _wet:   number;

  // One registration per AudioContext
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: VinylNoiseOptions = {}) {
    super();

    this._hiss  = options.hiss  ?? 0.5;
    this._dust  = options.dust  ?? 0.5;
    this._age   = options.age   ?? 0.5;
    this._speed = options.speed ?? 0.0;
    this._wet   = options.wet   ?? 1.0;

    this.input  = new Tone.Gain(1);
    this.output = new Tone.Gain(1);

    // Dry path (input → dryGain → output)
    this.dryGain = new Tone.Gain(1 - this._wet);
    this.wetGain = new Tone.Gain(this._wet);

    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);
    this.wetGain.connect(this.output);

    this._initWorklet();
  }

  private async _initWorklet() {
    try {
      const rawCtx = Tone.getContext().rawContext as AudioContext;
      await VinylNoiseEffect._ensureRegistered(rawCtx);

      this.workletNode = new AudioWorkletNode(rawCtx, 'vinyl-noise-processor', {
        numberOfInputs:  1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });

      // Wire: input → worklet → wetGain → output
      const rawInput = getRawNode(this.input);
      const rawWet   = getRawNode(this.wetGain);
      rawInput.connect(this.workletNode);
      this.workletNode.connect(rawWet);

      // Push current params to worklet
      this._send('hiss',  this._hiss);
      this._send('dust',  this._dust);
      this._send('age',   this._age);
      this._send('speed', this._speed);

    } catch (err) {
      console.warn('[VinylNoise] Worklet init failed:', err);
      // Fallback: just pass input through wetGain
      this.input.connect(this.wetGain);
    }
  }

  private static async _ensureRegistered(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;

    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      await ctx.audioWorklet.addModule(`${base}vinylnoise/VinylNoise.worklet.js`);
      this.loadedContexts.add(ctx);
    })();

    this.initPromises.set(ctx, p);
    return p;
  }

  private _send(param: string, value: number) {
    this.workletNode?.port.postMessage({ param, value });
  }

  // ─── Parameter setters ────────────────────────────────────────────────────

  setHiss(v: number)  { this._hiss  = clamp01(v); this._send('hiss',  this._hiss);  }
  setDust(v: number)  { this._dust  = clamp01(v); this._send('dust',  this._dust);  }
  setAge(v: number)   { this._age   = clamp01(v); this._send('age',   this._age);   }
  setSpeed(v: number) { this._speed = clamp01(v); this._send('speed', this._speed); }

  get wet(): number { return this._wet; }
  set wet(value: number) {
    this._wet = clamp01(value);
    this.wetGain.gain.value = this._wet;
    this.dryGain.gain.value = 1 - this._wet;
  }

  dispose(): this {
    try { this.workletNode?.disconnect(); } catch { /* */ }
    this.workletNode = null;
    this.dryGain.dispose();
    this.wetGain.dispose();
    this.input.dispose();
    this.output.dispose();
    super.dispose();
    return this;
  }
}
