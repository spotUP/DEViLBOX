/**
 * SidechainGateEffect — Gate with bandpass sidechain filter via WASM AudioWorklet.
 *
 * Parameters:
 *   threshold  -80..0 dB      Gate threshold
 *   attack     0.01..100 ms   Attack time
 *   hold       0..2000 ms     Hold time
 *   release    1..5000 ms     Release time
 *   range      0..1           Gate floor (0=full gate, 1=no gating)
 *   scFreq     20..20000 Hz   Sidechain bandpass center frequency
 *   scQ        0.1..10        Sidechain bandpass Q
 *   mix        0..1           Dry/wet mix
 */

import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export interface SidechainGateOptions {
  threshold?: number;
  attack?: number;
  hold?: number;
  release?: number;
  range?: number;
  scFreq?: number;
  scQ?: number;
  wet?: number;
}

export class SidechainGateEffect extends Tone.ToneAudioNode {
  readonly name = 'SidechainGate';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private sidechainInput: Tone.Gain;
  private selfRouteGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ param: string; value: number }> = [];

  private _threshold: number;
  private _attack: number;
  private _hold: number;
  private _release: number;
  private _range: number;
  private _scFreq: number;
  private _scQ: number;
  private _wet: number;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: SidechainGateOptions = {}) {
    super();
    this._threshold = options.threshold ?? -30;
    this._attack    = options.attack    ?? 1;
    this._hold      = options.hold      ?? 50;
    this._release   = options.release   ?? 200;
    this._range     = options.range     ?? 0;
    this._scFreq    = options.scFreq    ?? 200;
    this._scQ       = options.scQ       ?? 1;
    this._wet       = options.wet       ?? 1.0;

    this.input   = new Tone.Gain(1);
    this.output  = new Tone.Gain(1);
    this.dryGain = new Tone.Gain(1 - this._wet);
    this.wetGain = new Tone.Gain(this._wet);
    this.sidechainInput = new Tone.Gain(1);

    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);
    this.wetGain.connect(this.output);
    this.input.connect(this.wetGain);

    // Self-route: main input feeds sidechain for self-detection mode.
    // Controlled by selfRouteGain — set to 0 when external source is wired.
    this.selfRouteGain = new Tone.Gain(1);
    this.input.connect(this.selfRouteGain);
    this.selfRouteGain.connect(this.sidechainInput);

    void this._initWorklet();
  }

  private async _initWorklet(): Promise<void> {
    try {
      const rawCtx = Tone.getContext().rawContext as AudioContext;
      await SidechainGateEffect.ensureInitialized(rawCtx);

      this.workletNode = new AudioWorkletNode(rawCtx, 'sidechain-gate-processor', {
        numberOfInputs: 2, numberOfOutputs: 1, outputChannelCount: [2],
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
            // Connect sidechain input to worklet's 2nd input
            const rawSc = getNativeAudioNode(this.sidechainInput)!;
            if (rawSc) rawSc.connect(this.workletNode!, 0, 1);
            // Now safe to disconnect passthrough
            try { this.input.disconnect(this.wetGain); } catch { /* */ }
            // Keepalive: ensure Chrome schedules the worklet
            const rawCtx = Tone.getContext().rawContext as AudioContext;
            const keepalive = rawCtx.createGain();
            keepalive.gain.value = 0;
            this.workletNode!.connect(keepalive);
            keepalive.connect(rawCtx.destination);
          } catch (swapErr) {
            console.warn('[SidechainGate] WASM swap failed, staying on passthrough:', swapErr);
          }
        }
      };

      this.workletNode.port.postMessage(
        { type: 'init', wasmBinary: SidechainGateEffect.wasmBinary!, jsCode: SidechainGateEffect.jsCode! },
        [SidechainGateEffect.wasmBinary!.slice(0)],
      );

      this.sendParam('threshold', this._threshold);
      this.sendParam('attack', this._attack);
      this.sendParam('hold', this._hold);
      this.sendParam('release', this._release);
      this.sendParam('range', this._range);
      this.sendParam('scFreq', this._scFreq);
      this.sendParam('scQ', this._scQ);
    } catch (err) {
      console.warn('[SidechainGate] Worklet init failed:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}sidechain-gate/SidechainGate.wasm`), fetch(`${base}sidechain-gate/SidechainGate.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}sidechain-gate/SidechainGate.worklet.js`);
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

  get threshold(): number { return this._threshold; }
  set threshold(v: number) { this._threshold = clamp(v, -80, 0); this.sendParam('threshold', this._threshold); }
  get attack(): number { return this._attack; }
  set attack(v: number) { this._attack = clamp(v, 0.01, 100); this.sendParam('attack', this._attack); }
  get hold(): number { return this._hold; }
  set hold(v: number) { this._hold = clamp(v, 0, 2000); this.sendParam('hold', this._hold); }
  get release(): number { return this._release; }
  set release(v: number) { this._release = clamp(v, 1, 5000); this.sendParam('release', this._release); }
  get range(): number { return this._range; }
  set range(v: number) {
    // UI sends dB (-80..0), WASM DSP expects linear 0..1 (0=full gate, 1=no gating)
    this._range = v <= -80 ? 0 : Math.pow(10, clamp(v, -80, 0) / 20);
    this.sendParam('range', this._range);
  }
  get scFreq(): number { return this._scFreq; }
  set scFreq(v: number) { this._scFreq = clamp(v, 20, 20000); this.sendParam('scFreq', this._scFreq); }
  get scQ(): number { return this._scQ; }
  set scQ(v: number) { this._scQ = clamp(v, 0.1, 10); this.sendParam('scQ', this._scQ); }
  get wet(): number { return this._wet; }
  set wet(value: number) {
    this._wet = clamp(value, 0, 1);
    this.wetGain.gain.value = this._wet;
    this.dryGain.gain.value = 1 - this._wet;
  }

  getSidechainInput(): Tone.Gain {
    return this.sidechainInput;
  }

  /** Enable/disable self-route (input→sidechain). Called by wireMasterSidechain. */
  setSelfSidechain(enabled: boolean): void {
    this.selfRouteGain.gain.value = enabled ? 1 : 0;
  }

  setParam(param: string, value: number): void {
    switch (param) {
      case 'threshold': this.threshold = value; break;
      case 'attack':    this.attack = value;    break;
      case 'hold':      this.hold = value;      break;
      case 'release':   this.release = value;   break;
      case 'range':     this.range = value;     break;
      case 'scFreq':    this.scFreq = value;    break;
      case 'scQ':       this.scQ = value;       break;
      case 'wet':       this.wet = value;       break;
    }
  }

  dispose(): this {
    if (this.workletNode) {
      try { this.workletNode.port.postMessage({ type: 'dispose' }); } catch { /* */ }
      try { this.workletNode.disconnect(); } catch { /* */ }
      this.workletNode = null;
    }
    this.dryGain.dispose(); this.wetGain.dispose(); this.sidechainInput.dispose();
    this.selfRouteGain.dispose();
    this.input.dispose(); this.output.dispose();
    super.dispose();
    return this;
  }
}
