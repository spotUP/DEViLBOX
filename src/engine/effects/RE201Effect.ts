/**
 * RE201Effect — WASM-backed Roland RE-201 Space Echo effect
 *
 * Wraps the RE-201 C++ DSP engine compiled to WebAssembly.
 * Uses a native WebAudio DelayNode fallback that runs immediately,
 * then upgrades to WASM when available.
 *
 * Parameters:
 *   - bass: Tone stack bass 0-1
 *   - treble: Tone stack treble 0-1
 *   - delayMode: 0-10 (head/reverb combinations)
 *   - repeatRate: Tape speed 0-1 (controls delay time)
 *   - intensity: Feedback amount 0-1
 *   - echoVolume: Echo wet level 0-1
 *   - reverbVolume: Spring reverb level 0-1
 *   - inputLevel: Input gain 0-5
 *   - wet: Dry/wet mix 0-1
 */

import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

export interface RE201Options {
  bass?: number;          // 0-1
  treble?: number;        // 0-1
  delayMode?: number;     // 0-10
  repeatRate?: number;    // 0-1
  intensity?: number;     // 0-1
  echoVolume?: number;    // 0-1
  reverbVolume?: number;  // 0-1
  inputLevel?: number;    // 0-5
  wet?: number;           // 0-1
}

let wasmBinary: ArrayBuffer | null = null;
let jsCode: string | null = null;
let moduleLoaded = false;
let moduleLoadPromise: Promise<void> | null = null;

export class RE201Effect extends Tone.ToneAudioNode {
  readonly name = 'RE201';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private _disposed = false;
  private _wasmReady = false;
  private _options: Required<RE201Options>;

  // JS fallback
  private fallbackDelay: DelayNode | null = null;
  private fallbackFeedback: GainNode | null = null;
  private fallbackFilter: BiquadFilterNode | null = null;
  private fallbackEchoGain: GainNode | null = null;
  private _usingFallback = false;

  constructor(options: RE201Options = {}) {
    super();

    this._options = {
      bass: Math.max(0, Math.min(options.bass ?? 0.5, 1)),
      treble: Math.max(0, Math.min(options.treble ?? 0.5, 1)),
      delayMode: Math.max(0, Math.min(Math.round(options.delayMode ?? 7), 10)),
      repeatRate: Math.max(0, Math.min(options.repeatRate ?? 0.5, 1)),
      intensity: Math.max(0, Math.min(options.intensity ?? 0.5, 1)),
      echoVolume: Math.max(0, Math.min(options.echoVolume ?? 0.8, 1)),
      reverbVolume: Math.max(0, Math.min(options.reverbVolume ?? 0.3, 1)),
      inputLevel: Math.max(0, Math.min(options.inputLevel ?? 1, 5)),
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

  private rateToDelaySec(): number {
    const ms = 700 - this._options.repeatRate * 650;
    return Math.max(0.01, Math.min(ms / 1000, 0.7));
  }

  private initFallback(): void {
    try {
      const rawContext = Tone.getContext().rawContext as AudioContext;
      const inputNode = getNativeAudioNode(this.input);
      const wetNode = getNativeAudioNode(this.wetGain);

      if (!inputNode || !wetNode) {
        console.warn('[RE201] Native node access failed — using Tone.js passthrough');
        this.input.connect(this.wetGain);
        return;
      }

      this.fallbackDelay = rawContext.createDelay(1.0);
      this.fallbackFeedback = rawContext.createGain();
      this.fallbackFilter = rawContext.createBiquadFilter();
      this.fallbackEchoGain = rawContext.createGain();

      this.fallbackDelay.delayTime.value = this.rateToDelaySec();
      this.fallbackFeedback.gain.value = this._options.intensity * 0.85;
      this.fallbackEchoGain.gain.value = this._options.echoVolume;
      this.fallbackFilter.type = 'lowpass';
      this.fallbackFilter.frequency.value = 8000;

      inputNode.connect(this.fallbackDelay);
      this.fallbackDelay.connect(this.fallbackEchoGain);
      this.fallbackEchoGain.connect(this.fallbackFilter);
      this.fallbackFilter.connect(wetNode);
      this.fallbackFilter.connect(this.fallbackFeedback);
      this.fallbackFeedback.connect(this.fallbackDelay);

      this._usingFallback = true;
    } catch (err) {
      console.warn('[RE201] JS fallback init failed:', err);
      try { this.input.connect(this.wetGain); } catch { /* ignored */ }
    }
  }

  private disconnectFallback(): void {
    if (!this._usingFallback) return;
    try {
      this.fallbackDelay?.disconnect();
      this.fallbackFeedback?.disconnect();
      this.fallbackFilter?.disconnect();
      this.fallbackEchoGain?.disconnect();
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
        console.warn('[RE201] Cannot swap to WASM — native node access failed');
        return;
      }

      /* Tear down the fallback FIRST so the wet summing node isn't driven
         by two recursive paths simultaneously (fallback delay loop + WASM
         worklet). Double-driving the wet bus during the overlap window
         produced a brief transient that upstream biquads (in DubBus'
         feedback-loop chain) interpreted as "state is bad" and latched to
         NaN — permanently killing the dub bus. Silence during the
         handover is bounded to one processing block. */
      this.disconnectFallback();

      rawInput.connect(this.workletNode);
      this.workletNode.connect(rawWet);

      const keepalive = rawContext.createGain();
      keepalive.gain.value = 0;
      this.workletNode.connect(keepalive);
      keepalive.connect(rawContext.destination);
    } catch (err) {
      console.warn('[RE201] WASM swap failed, staying on fallback:', err);
    }
  }

  private async initWasm(): Promise<void> {
    try {
      const rawContext = Tone.getContext().rawContext as AudioContext;

      await RE201Effect.ensureModuleLoaded(rawContext);
      if (this._disposed) return;

      this.workletNode = new AudioWorkletNode(rawContext, 're201-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        channelCount: 2,
        channelCountMode: 'explicit',
      });

      this.workletNode.port.onmessage = (event) => {
        if (event.data.type === 'ready') {
          this._wasmReady = true;
          this.sendParam('bass', this._options.bass);
          this.sendParam('treble', this._options.treble);
          this.sendParam('delayMode', this._options.delayMode);
          this.sendParam('repeatRate', this._options.repeatRate);
          this.sendParam('intensity', this._options.intensity);
          this.sendParam('echoVolume', this._options.echoVolume);
          this.sendParam('reverbVolume', this._options.reverbVolume);
          this.sendParam('inputLevel', this._options.inputLevel);
          this.swapToWasm();
        } else if (event.data.type === 'error') {
          console.warn('[RE201] WASM init error, keeping JS fallback:', event.data.message);
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
          console.warn('[RE201] WASM not ready after 5s — keeping JS fallback');
        }
      }, 5000);

    } catch (err) {
      console.warn('[RE201] WASM init failed, using JS fallback:', err);
    }
  }

  static async ensureModuleLoaded(context: AudioContext): Promise<void> {
    if (moduleLoaded) return;
    if (moduleLoadPromise) return moduleLoadPromise;

    moduleLoadPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';

      try {
        await context.audioWorklet.addModule(`${baseUrl}re201/RE201.worklet.js`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes('already') && !msg.includes('duplicate')) {
          throw new Error(`Failed to load RE201 worklet: ${msg}`);
        }
      }

      if (!wasmBinary || !jsCode) {
        const [wasmResponse, jsResponse] = await Promise.all([
          fetch(`${baseUrl}re201/RE201.wasm`),
          fetch(`${baseUrl}re201/RE201.js`),
        ]);

        if (!wasmResponse.ok || !jsResponse.ok) {
          moduleLoadPromise = null;
          throw new Error(`Failed to fetch RE201 WASM/JS: wasm=${wasmResponse.status} js=${jsResponse.status}`);
        }

        wasmBinary = await wasmResponse.arrayBuffer();
        let code = await jsResponse.text();
        code = code
          .replace(/import\.meta\.url/g, "'.'")
          .replace(/export\s+default\s+\w+;?/g, '');
        code += '\nvar createRE201 = createRE201 || Module;';
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

  setBass(val: number): void {
    this._options.bass = Math.max(0, Math.min(val, 1));
    this.sendParam('bass', this._options.bass);
  }

  setTreble(val: number): void {
    this._options.treble = Math.max(0, Math.min(val, 1));
    this.sendParam('treble', this._options.treble);
  }

  setDelayMode(mode: number): void {
    this._options.delayMode = Math.max(0, Math.min(Math.round(mode), 10));
    this.sendParam('delayMode', this._options.delayMode);
  }

  setRepeatRate(rate: number): void {
    this._options.repeatRate = Math.max(0, Math.min(rate, 1));
    this.sendParam('repeatRate', this._options.repeatRate);
    if (this.fallbackDelay) {
      this.fallbackDelay.delayTime.value = this.rateToDelaySec();
    }
  }

  setIntensity(val: number): void {
    this._options.intensity = Math.max(0, Math.min(val, 1));
    this.sendParam('intensity', this._options.intensity);
    if (this.fallbackFeedback) {
      this.fallbackFeedback.gain.value = val * 0.85;
    }
  }

  setEchoVolume(vol: number): void {
    this._options.echoVolume = Math.max(0, Math.min(vol, 1));
    this.sendParam('echoVolume', this._options.echoVolume);
    if (this.fallbackEchoGain) {
      this.fallbackEchoGain.gain.value = vol;
    }
  }

  setReverbVolume(vol: number): void {
    this._options.reverbVolume = Math.max(0, Math.min(vol, 1));
    this.sendParam('reverbVolume', this._options.reverbVolume);
  }

  setInputLevel(val: number): void {
    this._options.inputLevel = Math.max(0, Math.min(val, 5));
    this.sendParam('inputLevel', this._options.inputLevel);
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
