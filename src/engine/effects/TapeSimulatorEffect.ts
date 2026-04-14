/**
 * TapeSimulatorEffect - WASM-backed analog tape deck emulator
 *
 * Wraps the Kiss of Shame C++ DSP engine compiled to WebAssembly.
 * Port of TheKissOfShame JUCE plugin by Hollance.
 * Provides a Tone.ToneAudioNode-compatible interface for use in
 * master effect chains.
 *
 * Parameters (all 0-1 normalized):
 *   - drive:     Input saturation amount (-18→+18dB even harmonics)
 *   - character: Odd/even harmonic blend (0=KoS default, 1=50/50)
 *   - bias:      Tape bias LP cutoff (0=22kHz bright, 1=2kHz dark)
 *   - shame:     Wow+flutter amount (slow+fast pitch modulation)
 *   - hiss:      Pink noise floor level
 *   - speed:     Tape speed selector (0=S-111/15IPS, 1=A-456/30IPS)
 *   - wet:       Dry/wet mix 0-1
 */

import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

function clamp01(v: number): number { return Math.max(0, Math.min(1, v)); }

export interface TapeSimulatorOptions {
  drive?:     number;  // 0-1
  character?: number;  // 0-1
  bias?:      number;  // 0-1
  shame?:     number;  // 0-1
  hiss?:      number;  // 0-1
  speed?:     number;  // 0 or 1
  wet?:       number;  // 0-1
}

// Static caches shared across instances
let wasmBinary: ArrayBuffer | null = null;
let jsCode: string | null = null;
const loadedContexts = new Set<BaseAudioContext>();
const initPromises = new Map<BaseAudioContext, Promise<void>>();

export class TapeSimulatorEffect extends Tone.ToneAudioNode {
  readonly name = 'TapeSimulator';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ param: string; value: number }> = [];
  private _disposed = false;
  private _options: Required<TapeSimulatorOptions>;

  constructor(options: TapeSimulatorOptions = {}) {
    super();

    this._options = {
      drive:     clamp01(options.drive     ?? 0.3),
      character: clamp01(options.character ?? 0.4),
      bias:      clamp01(options.bias      ?? 0.4),
      shame:     clamp01(options.shame     ?? 0.2),
      hiss:      clamp01(options.hiss      ?? 0.2),
      speed:     options.speed ?? 0,
      wet:       clamp01(options.wet       ?? 0.5),
    };

    this.input  = new Tone.Gain(1);
    this.output = new Tone.Gain(1);

    this.dryGain = new Tone.Gain(1 - this._options.wet);
    this.wetGain = new Tone.Gain(this._options.wet);

    // Dry path: input → dryGain → output
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    // Wet path: passthrough until WASM is ready
    this.wetGain.connect(this.output);
    this.input.connect(this.wetGain);

    void this._initWorklet();
  }

  private async _initWorklet(): Promise<void> {
    try {
      const rawCtx = Tone.getContext().rawContext as AudioContext;
      await TapeSimulatorEffect.ensureInitialized(rawCtx);
      if (this._disposed) return;

      this.workletNode = new AudioWorkletNode(rawCtx, 'kiss-of-shame-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        channelCount: 2,
        channelCountMode: 'explicit',
      });

      this.workletNode.port.onmessage = (event) => {
        if (event.data.type === 'ready') {
          this.isWasmReady = true;
          for (const p of this.pendingParams) {
            this.workletNode!.port.postMessage({ type: 'setParameter', param: p.param, value: p.value });
          }
          this.pendingParams = [];
          // Connect WASM first, then disconnect passthrough (avoids silent gap)
          try {
            const rawInput = getNativeAudioNode(this.input)!;
            const rawWet = getNativeAudioNode(this.wetGain)!;
            rawInput.connect(this.workletNode!);
            this.workletNode!.connect(rawWet);
            try { rawInput.disconnect(rawWet); } catch { /* */ }
            // Keepalive: ensure Chrome schedules the worklet
            const rawCtx2 = Tone.getContext().rawContext as AudioContext;
            const keepalive = rawCtx2.createGain();
            keepalive.gain.value = 0;
            this.workletNode!.connect(keepalive);
            keepalive.connect(rawCtx2.destination);
          } catch (swapErr) {
            console.error('[TapeSimulator] WASM swap failed, staying on passthrough:', swapErr);
          }
        } else if (event.data.type === 'error') {
          console.error('[TapeSimulator] Worklet error:', event.data.message);
        }
      };

      this.workletNode.port.postMessage(
        { type: 'init', sampleRate: rawCtx.sampleRate, wasmBinary: wasmBinary!, jsCode: jsCode! },
        [wasmBinary!.slice(0)],
      );

      this.sendParam('drive',     this._options.drive);
      this.sendParam('character', this._options.character);
      this.sendParam('bias',      this._options.bias);
      this.sendParam('shame',     this._options.shame);
      this.sendParam('hiss',      this._options.hiss);
      this.sendParam('speed',     this._options.speed);
    } catch (err) {
      console.error('[TapeSimulator] Worklet init failed:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (loadedContexts.has(ctx)) return;
    const existing = initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}kissofshame/KissOfShame.wasm`), fetch(`${base}kissofshame/KissOfShame.js`),
      ]);
      wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      jsCode = js;
      await ctx.audioWorklet.addModule(`${base}kissofshame/KissOfShame.worklet.js`);
      loadedContexts.add(ctx);
    })();
    initPromises.set(ctx, p);
    return p;
  }

  private sendParam(param: string, value: number): void {
    if (this.workletNode && this.isWasmReady) {
      this.workletNode.port.postMessage({ type: 'setParameter', param, value });
    } else {
      this.pendingParams = this.pendingParams.filter(p => p.param !== param);
      this.pendingParams.push({ param, value });
    }
  }

  // ---- Public parameter setters ----

  setDrive(val: number): void {
    this._options.drive = clamp01(val);
    this.sendParam('drive', this._options.drive);
  }

  setCharacter(val: number): void {
    this._options.character = clamp01(val);
    this.sendParam('character', this._options.character);
  }

  setBias(val: number): void {
    this._options.bias = clamp01(val);
    this.sendParam('bias', this._options.bias);
  }

  setShame(val: number): void {
    this._options.shame = clamp01(val);
    this.sendParam('shame', this._options.shame);
  }

  setHiss(val: number): void {
    this._options.hiss = clamp01(val);
    this.sendParam('hiss', this._options.hiss);
  }

  setSpeed(val: number): void {
    this._options.speed = Math.round(val);
    this.sendParam('speed', this._options.speed);
  }

  get wet(): number { return this._options.wet; }
  set wet(value: number) {
    this._options.wet = clamp01(value);
    this.dryGain.gain.value = 1 - this._options.wet;
    this.wetGain.gain.value = this._options.wet;
  }

  setParam(param: string, value: number): void {
    switch (param) {
      case 'drive': this.setDrive(value); break;
      case 'character': this.setCharacter(value); break;
      case 'bias': this.setBias(value); break;
      case 'shame': this.setShame(value); break;
      case 'hiss': this.setHiss(value); break;
      case 'speed': this.setSpeed(value); break;
      case 'wet': this.wet = value; break;
    }
  }

  dispose(): this {
    this._disposed = true;
    if (this.workletNode) {
      try { this.workletNode.port.postMessage({ type: 'dispose' }); } catch { /* */ }
      try { this.workletNode.disconnect(); } catch { /* */ }
      this.workletNode = null;
    }
    this.dryGain.dispose();
    this.wetGain.dispose();
    this.input.dispose();
    this.output.dispose();
    super.dispose();
    return this;
  }
}
