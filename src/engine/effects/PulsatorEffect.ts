// src/engine/effects/PulsatorEffect.ts
/**
 * PulsatorEffect — Autopanner/tremolo with stereo phase offset via WASM AudioWorklet.
 *
 * Parameters:
 *   rate         0.01..20 Hz   LFO rate
 *   depth        0..1          Modulation depth
 *   waveform     0..4          0=sine, 1=tri, 2=square, 3=saw, 4=revsaw
 *   stereoPhase  0..360 deg    Phase offset between L/R
 *   offset       0..1          Minimum volume
 *   mix          0..1          Wet/dry mix (internal to WASM)
 */

import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export interface PulsatorOptions {
  rate?: number;
  depth?: number;
  waveform?: number;
  stereoPhase?: number;
  offset?: number;
  mix?: number;
  wet?: number;
}

export class PulsatorEffect extends Tone.ToneAudioNode {
  readonly name = 'Pulsator';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private passthroughGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ param: string; value: number }> = [];

  private _rate: number;
  private _depth: number;
  private _waveform: number;
  private _stereoPhase: number;
  private _offset: number;
  private _mix: number;
  private _wet: number;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: PulsatorOptions = {}) {
    super();
    this._rate        = options.rate ?? 2;
    this._depth       = options.depth ?? 0.5;
    this._waveform    = options.waveform ?? 0;
    this._stereoPhase = options.stereoPhase ?? 180;
    this._offset      = options.offset ?? 0;
    this._mix         = options.mix ?? 1;
    this._wet         = options.wet ?? 1.0;

    this.input   = new Tone.Gain(1);
    this.output  = new Tone.Gain(1);
    this.dryGain = new Tone.Gain(1 - this._wet);
    this.wetGain = new Tone.Gain(this._wet);
    this.passthroughGain = new Tone.Gain(1);

    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);
    this.wetGain.connect(this.output);
    this.input.connect(this.passthroughGain);
    this.passthroughGain.connect(this.wetGain);

    void this._initWorklet();
  }

  private async _initWorklet(): Promise<void> {
    try {
      const rawCtx = Tone.getContext().rawContext as AudioContext;
      await PulsatorEffect.ensureInitialized(rawCtx);

      this.workletNode = new AudioWorkletNode(rawCtx, 'pulsator-processor', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
      });

      this.workletNode.port.onmessage = (e) => {
        if (e.data.type === 'ready') {
          this.isWasmReady = true;
          for (const p of this.pendingParams) {
            this.workletNode!.port.postMessage({ type: 'parameter', param: p.param, value: p.value });
          }
          this.pendingParams = [];
          // Connect WASM first, then disconnect passthrough (avoids silent gap)
          try {
            const rawInput = getNativeAudioNode(this.input)!;
            const rawWet = getNativeAudioNode(this.wetGain)!;
            rawInput.connect(this.workletNode!);
            this.workletNode!.connect(rawWet);
            // Now safe to disconnect passthrough
            this.passthroughGain.gain.value = 0;
            // Keepalive: ensure Chrome schedules the worklet
            const rawCtx = Tone.getContext().rawContext as AudioContext;
            const keepalive = rawCtx.createGain();
            keepalive.gain.value = 0;
            this.workletNode!.connect(keepalive);
            keepalive.connect(rawCtx.destination);
          } catch (swapErr) {
            console.warn('[Pulsator] WASM swap failed, staying on passthrough:', swapErr);
          }
        }
      };

      this.workletNode.port.postMessage(
        { type: 'init', wasmBinary: PulsatorEffect.wasmBinary!, jsCode: PulsatorEffect.jsCode! },
        [PulsatorEffect.wasmBinary!.slice(0)],
      );

      this.sendParam('rate', this._rate);
      this.sendParam('depth', this._depth);
      this.sendParam('waveform', this._waveform);
      this.sendParam('stereoPhase', this._stereoPhase);
      this.sendParam('offset', this._offset);
      this.sendParam('mix', this._mix);
    } catch (err) {
      console.warn('[Pulsator] Worklet init failed:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}pulsator/Pulsator.wasm`), fetch(`${base}pulsator/Pulsator.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}pulsator/Pulsator.worklet.js`);
      this.loadedContexts.add(ctx);
    })();
    this.initPromises.set(ctx, p);
    return p;
  }

  private sendParam(param: string, value: number): void {
    if (this.workletNode && this.isWasmReady) {
      this.workletNode.port.postMessage({ type: 'parameter', param, value });
    } else {
      this.pendingParams = this.pendingParams.filter(p => p.param !== param);
      this.pendingParams.push({ param, value });
    }
  }

  setRate(v: number): void { this._rate = clamp(v, 0.01, 20); this.sendParam('rate', this._rate); }
  setDepth(v: number): void { this._depth = clamp(v, 0, 1); this.sendParam('depth', this._depth); }
  setWaveform(v: number): void { this._waveform = clamp(Math.round(v), 0, 4); this.sendParam('waveform', this._waveform); }
  setStereoPhase(v: number): void { this._stereoPhase = clamp(v, 0, 360); this.sendParam('stereoPhase', this._stereoPhase); }
  setOffset(v: number): void { this._offset = clamp(v, 0, 1); this.sendParam('offset', this._offset); }
  setMix(v: number): void { this._mix = clamp(v, 0, 1); this.sendParam('mix', this._mix); }

  get wet(): number { return this._wet; }
  set wet(value: number) {
    this._wet = clamp(value, 0, 1);
    this.wetGain.gain.value = this._wet;
    this.dryGain.gain.value = 1 - this._wet;
  }

  get rate(): number { return this._rate; }
  get depth(): number { return this._depth; }
  get waveform(): number { return this._waveform; }
  get stereoPhase(): number { return this._stereoPhase; }
  get offset(): number { return this._offset; }
  get mix(): number { return this._mix; }

  setParam(param: string, value: number): void {
    switch (param) {
      case 'rate':        this.setRate(value);        break;
      case 'depth':       this.setDepth(value);       break;
      case 'waveform':    this.setWaveform(value);    break;
      case 'stereoPhase': this.setStereoPhase(value); break;
      case 'offset':      this.setOffset(value);      break;
      case 'mix':         this.setMix(value);         break;
      case 'wet':         this.wet = value;           break;
    }
  }

  dispose(): this {
    if (this.workletNode) {
      try { this.workletNode.port.postMessage({ type: 'dispose' }); } catch { /* */ }
      try { this.workletNode.disconnect(); } catch { /* */ }
      this.workletNode = null;
    }
    this.passthroughGain.dispose(); this.dryGain.dispose(); this.wetGain.dispose();
    this.input.dispose(); this.output.dispose();
    super.dispose();
    return this;
  }
}
