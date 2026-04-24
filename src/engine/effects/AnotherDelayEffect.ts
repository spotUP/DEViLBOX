/**
 * AnotherDelayEffect — WASM-backed tape delay with wow/flutter/saturation/reverb
 *
 * Wraps the AnotherDelay C++ DSP engine compiled to WebAssembly.
 * Uses a native WebAudio DelayNode fallback that runs immediately,
 * then upgrades to WASM when available.
 *
 * Parameters:
 *   - delayTime: Delay time in ms (1-2000)
 *   - feedback: Feedback amount 0-0.95
 *   - gain: Input gain 0-4 (linear)
 *   - lowpass: Lowpass filter frequency (200-20000 Hz)
 *   - highpass: Highpass filter frequency (1-5000 Hz)
 *   - flutterFreq: Flutter oscillator frequency (0.1-10 Hz)
 *   - flutterDepth: Flutter modulation depth (0-0.3)
 *   - wowFreq: Wow oscillator frequency (0.01-5 Hz)
 *   - wowDepth: Wow modulation depth (0-0.3)
 *   - reverbEnabled: Enable built-in Schroeder reverb (boolean)
 *   - roomSize: Reverb room size 0-1
 *   - damping: Reverb damping 0-1
 *   - width: Reverb stereo width 0-1
 *   - wet: Dry/wet mix 0-1
 */

import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

export interface AnotherDelayOptions {
  delayTime?: number;      // ms
  feedback?: number;       // 0-0.95
  gain?: number;           // 0-4
  lowpass?: number;        // Hz
  highpass?: number;       // Hz
  flutterFreq?: number;    // Hz
  flutterDepth?: number;   // 0-0.3
  wowFreq?: number;        // Hz
  wowDepth?: number;       // 0-0.3
  reverbEnabled?: boolean;
  roomSize?: number;       // 0-1
  damping?: number;        // 0-1
  width?: number;          // 0-1
  wet?: number;            // 0-1
}

let wasmBinary: ArrayBuffer | null = null;
let jsCode: string | null = null;
let moduleLoaded = false;
let moduleLoadPromise: Promise<void> | null = null;

export class AnotherDelayEffect extends Tone.ToneAudioNode {
  readonly name = 'AnotherDelay';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private _disposed = false;
  private _wasmReady = false;
  private _options: Required<AnotherDelayOptions>;

  // JS fallback
  private fallbackDelay: DelayNode | null = null;
  private fallbackFeedback: GainNode | null = null;
  private fallbackFilter: BiquadFilterNode | null = null;
  private _usingFallback = false;

  constructor(options: AnotherDelayOptions = {}) {
    super();

    this._options = {
      delayTime: Math.max(1, Math.min(options.delayTime ?? 300, 2000)),
      feedback: Math.max(0, Math.min(options.feedback ?? 0.3, 0.95)),
      gain: Math.max(0, Math.min(options.gain ?? 1, 4)),
      lowpass: Math.max(200, Math.min(options.lowpass ?? 12000, 20000)),
      highpass: Math.max(1, Math.min(options.highpass ?? 80, 5000)),
      flutterFreq: Math.max(0.1, Math.min(options.flutterFreq ?? 3.5, 10)),
      flutterDepth: Math.max(0, Math.min(options.flutterDepth ?? 0, 0.3)),
      wowFreq: Math.max(0.01, Math.min(options.wowFreq ?? 0.5, 5)),
      wowDepth: Math.max(0, Math.min(options.wowDepth ?? 0, 0.3)),
      reverbEnabled: options.reverbEnabled ?? true,
      roomSize: Math.max(0, Math.min(options.roomSize ?? 0.5, 1)),
      damping: Math.max(0, Math.min(options.damping ?? 0.5, 1)),
      width: Math.max(0, Math.min(options.width ?? 1, 1)),
      wet: Math.max(0, Math.min(options.wet ?? 0.35, 1)),
    };

    this.input = new Tone.Gain(1);
    this.output = new Tone.Gain(1);

    this.dryGain = new Tone.Gain(1 - this._options.wet);
    this.wetGain = new Tone.Gain(this._options.wet);

    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);
    this.wetGain.connect(this.output);

    this.initFallback();
    this.initWasm();
  }

  private initFallback(): void {
    try {
      const rawContext = Tone.getContext().rawContext as AudioContext;
      const inputNode = getNativeAudioNode(this.input);
      const wetNode = getNativeAudioNode(this.wetGain);

      if (!inputNode || !wetNode) {
        console.warn('[AnotherDelay] Native node access failed — using Tone.js passthrough');
        this.input.connect(this.wetGain);
        return;
      }

      this.fallbackDelay = rawContext.createDelay(2.0);
      this.fallbackFeedback = rawContext.createGain();
      this.fallbackFilter = rawContext.createBiquadFilter();

      this.fallbackDelay.delayTime.value = this._options.delayTime / 1000;
      // Cap JS fallback feedback well below unity — see setFeedback().
      this.fallbackFeedback.gain.value = Math.min(this._options.feedback, 0.7);
      this.fallbackFilter.type = 'lowpass';
      this.fallbackFilter.frequency.value = this._options.lowpass;

      inputNode.connect(this.fallbackDelay);
      this.fallbackDelay.connect(this.fallbackFilter);
      this.fallbackFilter.connect(wetNode);
      this.fallbackFilter.connect(this.fallbackFeedback);
      this.fallbackFeedback.connect(this.fallbackDelay);

      this._usingFallback = true;
    } catch (err) {
      console.warn('[AnotherDelay] JS fallback init failed:', err);
      try { this.input.connect(this.wetGain); } catch { /* ignored */ }
    }
  }

  private disconnectFallback(): void {
    if (!this._usingFallback) return;
    try {
      this.fallbackDelay?.disconnect();
      this.fallbackFeedback?.disconnect();
      this.fallbackFilter?.disconnect();
    } catch { /* already disconnected */ }
    this._usingFallback = false;
  }

  private swapToWasm(): void {
    if (!this.workletNode) return;
    try {
      const rawContext = Tone.getContext().rawContext as AudioContext;
      const rawInput = getNativeAudioNode(this.input);
      const rawWet = getNativeAudioNode(this.wetGain);

      if (!rawInput || !rawWet) {
        console.warn('[AnotherDelay] Cannot swap to WASM — native node access failed');
        return;
      }

      /* Tear down the fallback FIRST so the wet summing node isn't
         double-driven by the fallback's internal delay loop AND the
         worklet during the handover. Double-driving produced a
         transient that poisoned upstream biquads in the DubBus
         feedback chain ("state is bad" → permanent NaN). */
      this.disconnectFallback();

      rawInput.connect(this.workletNode);
      this.workletNode.connect(rawWet);

      const keepalive = rawContext.createGain();
      keepalive.gain.value = 0;
      this.workletNode.connect(keepalive);
      keepalive.connect(rawContext.destination);
    } catch (err) {
      console.warn('[AnotherDelay] WASM swap failed, staying on fallback:', err);
    }
  }

  private async initWasm(): Promise<void> {
    try {
      const rawContext = Tone.getContext().rawContext as AudioContext;

      await AnotherDelayEffect.ensureModuleLoaded(rawContext);
      if (this._disposed) return;

      this.workletNode = new AudioWorkletNode(rawContext, 'another-delay-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        channelCount: 2,
        channelCountMode: 'explicit',
      });

      this.workletNode.port.onmessage = (event) => {
        if (event.data.type === 'ready') {
          this._wasmReady = true;
          this.sendParam('delayTime', this._options.delayTime);
          this.sendParam('feedback', this._options.feedback);
          this.sendParam('gain', this._options.gain);
          this.sendParam('lowpass', this._options.lowpass);
          this.sendParam('highpass', this._options.highpass);
          this.sendParam('flutterFreq', this._options.flutterFreq);
          this.sendParam('flutterDepth', this._options.flutterDepth);
          this.sendParam('wowFreq', this._options.wowFreq);
          this.sendParam('wowDepth', this._options.wowDepth);
          this.sendParam('reverbEnabled', this._options.reverbEnabled ? 1 : 0);
          this.sendParam('roomSize', this._options.roomSize);
          this.sendParam('damping', this._options.damping);
          this.sendParam('width', this._options.width);
          this.swapToWasm();
        } else if (event.data.type === 'error') {
          console.warn('[AnotherDelay] WASM init error, keeping JS fallback:', event.data.message);
        }
      };

      this.workletNode.port.postMessage({
        type: 'init',
        sampleRate: rawContext.sampleRate,
        wasmBinary: wasmBinary,
        jsCode: jsCode,
      });

      setTimeout(() => {
        if (!this._wasmReady && !this._disposed && this.workletNode) {
          console.warn('[AnotherDelay] WASM not ready after 5s — keeping JS fallback');
        }
      }, 5000);

    } catch (err) {
      console.warn('[AnotherDelay] WASM init failed, using JS fallback:', err);
    }
  }

  static async ensureModuleLoaded(context: AudioContext): Promise<void> {
    if (moduleLoaded) return;
    if (moduleLoadPromise) return moduleLoadPromise;

    moduleLoadPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';

      try {
        await context.audioWorklet.addModule(`${baseUrl}another-delay/AnotherDelay.worklet.js`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes('already') && !msg.includes('duplicate')) {
          throw new Error(`Failed to load AnotherDelay worklet: ${msg}`);
        }
      }

      if (!wasmBinary || !jsCode) {
        const [wasmResponse, jsResponse] = await Promise.all([
          fetch(`${baseUrl}another-delay/AnotherDelay.wasm`),
          fetch(`${baseUrl}another-delay/AnotherDelay.js`),
        ]);

        if (!wasmResponse.ok || !jsResponse.ok) {
          moduleLoadPromise = null;
          throw new Error(`Failed to fetch AnotherDelay WASM/JS: wasm=${wasmResponse.status} js=${jsResponse.status}`);
        }

        wasmBinary = await wasmResponse.arrayBuffer();
        let code = await jsResponse.text();
        code = code
          .replace(/import\.meta\.url/g, "'.'")
          .replace(/export\s+default\s+\w+;?/g, '');
        code += '\nvar createAnotherDelay = createAnotherDelay || Module;';
        jsCode = code;
      }

      moduleLoaded = true;
    })();

    try {
      await moduleLoadPromise;
    } catch (err) {
      moduleLoadPromise = null;
      moduleLoaded = false;
      throw err;
    }
  }

  private sendParam(param: string, value: number): void {
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'setParameter', param, value });
    }
  }

  // ---- Public parameter setters ----

  setDelayTime(ms: number): void {
    this._options.delayTime = Math.max(1, Math.min(ms, 2000));
    this.sendParam('delayTime', this._options.delayTime);
    if (this.fallbackDelay) {
      this.fallbackDelay.delayTime.value = this._options.delayTime / 1000;
    }
  }

  setFeedback(val: number): void {
    this._options.feedback = Math.max(0, Math.min(val, 0.95));
    this.sendParam('feedback', this._options.feedback);
    if (this.fallbackFeedback) {
      // JS fallback is pure delay+filter feedback — no reverb model, no
      // tape-ageing losses. Near-unity feedback sustains for 15+ seconds
      // and sounds like it "goes on forever". Scale down so the JS path
      // has audible decay even at maxed-out echoIntensity. WASM path
      // stays at full range for the real tape simulation.
      const fallbackMax = 0.7;
      this.fallbackFeedback.gain.value = Math.min(this._options.feedback, fallbackMax);
    }
  }

  setGain(val: number): void {
    this._options.gain = Math.max(0, Math.min(val, 4));
    this.sendParam('gain', this._options.gain);
  }

  setLowpass(freq: number): void {
    this._options.lowpass = Math.max(200, Math.min(freq, 20000));
    this.sendParam('lowpass', this._options.lowpass);
    if (this.fallbackFilter) {
      this.fallbackFilter.frequency.value = this._options.lowpass;
    }
  }

  setHighpass(freq: number): void {
    this._options.highpass = Math.max(1, Math.min(freq, 5000));
    this.sendParam('highpass', this._options.highpass);
  }

  setFlutterFreq(freq: number): void {
    this._options.flutterFreq = Math.max(0.1, Math.min(freq, 10));
    this.sendParam('flutterFreq', this._options.flutterFreq);
  }

  setFlutterDepth(depth: number): void {
    this._options.flutterDepth = Math.max(0, Math.min(depth, 0.3));
    this.sendParam('flutterDepth', this._options.flutterDepth);
  }

  setWowFreq(freq: number): void {
    this._options.wowFreq = Math.max(0.01, Math.min(freq, 5));
    this.sendParam('wowFreq', this._options.wowFreq);
  }

  setWowDepth(depth: number): void {
    this._options.wowDepth = Math.max(0, Math.min(depth, 0.3));
    this.sendParam('wowDepth', this._options.wowDepth);
  }

  setReverbEnabled(on: boolean): void {
    this._options.reverbEnabled = on;
    this.sendParam('reverbEnabled', on ? 1 : 0);
  }

  setRoomSize(val: number): void {
    this._options.roomSize = Math.max(0, Math.min(val, 1));
    this.sendParam('roomSize', this._options.roomSize);
  }

  setDamping(val: number): void {
    this._options.damping = Math.max(0, Math.min(val, 1));
    this.sendParam('damping', this._options.damping);
  }

  setWidth(val: number): void {
    this._options.width = Math.max(0, Math.min(val, 1));
    this.sendParam('width', this._options.width);
  }

  get wet(): number { return this._options.wet; }
  set wet(value: number) {
    this._options.wet = Math.max(0, Math.min(1, value));
    this.dryGain.gain.value = 1 - this._options.wet;
    this.wetGain.gain.value = this._options.wet;
  }

  dispose(): this {
    this._disposed = true;
    this.disconnectFallback();
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'dispose' });
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    this.dryGain.dispose();
    this.wetGain.dispose();
    this.input.dispose();
    this.output.dispose();
    return this;
  }
}
