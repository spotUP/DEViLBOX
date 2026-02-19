/**
 * RETapeEchoEffect - WASM-backed Roland RE-150/201 tape echo effect
 *
 * Wraps the RE-Tape-Echo C++ DSP engine compiled to WebAssembly.
 * Provides a Tone.ToneAudioNode-compatible interface for use in
 * instrument, channel, and master effect chains.
 *
 * Parameters:
 *   - mode: Echo mode 0-5 (head/feedback combinations)
 *   - repeatRate: Tape speed 0-1 (controls delay time)
 *   - intensity: Feedback amount 0-1
 *   - echoVolume: Wet echo level 0-1
 *   - wow: Low-frequency speed modulation 0-1
 *   - flutter: Mid-frequency speed modulation 0-1
 *   - dirt: High-frequency speed noise 0-1
 *   - inputBleed: Simulate record/play head crosstalk (0/1)
 *   - loopAmount: Tape loop ghost echo 0-1
 *   - playheadFilter: Speed-dependent EQ (0/1)
 *   - wet: Dry/wet mix 0-1
 */

import * as Tone from 'tone';
import { getNativeContext } from '@utils/audio-context';

export interface RETapeEchoOptions {
  mode?: number;           // 0-5
  repeatRate?: number;     // 0-1
  intensity?: number;      // 0-1
  echoVolume?: number;     // 0-1
  wow?: number;            // 0-1
  flutter?: number;        // 0-1
  dirt?: number;           // 0-1
  inputBleed?: number;     // 0 or 1
  loopAmount?: number;     // 0-1
  playheadFilter?: number; // 0 or 1
  wet?: number;            // 0-1
}

// Static caches shared across instances
let wasmBinary: ArrayBuffer | null = null;
let jsCode: string | null = null;
let moduleLoaded = false;
let moduleLoadPromise: Promise<void> | null = null;

export class RETapeEchoEffect extends Tone.ToneAudioNode {
  readonly name = 'RETapeEcho';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private _disposed = false;
  private _options: Required<RETapeEchoOptions>;

  constructor(options: RETapeEchoOptions = {}) {
    super();

    this._options = {
      mode: Math.max(0, Math.min(options.mode ?? 3, 5)),
      repeatRate: Math.max(0, Math.min(options.repeatRate ?? 0.5, 1)),
      intensity: Math.max(0, Math.min(options.intensity ?? 0.5, 1)),
      echoVolume: Math.max(0, Math.min(options.echoVolume ?? 0.8, 1)),
      wow: Math.max(0, Math.min(options.wow ?? 0, 1)),
      flutter: Math.max(0, Math.min(options.flutter ?? 0, 1)),
      dirt: Math.max(0, Math.min(options.dirt ?? 0, 1)),
      inputBleed: options.inputBleed ?? 0,
      loopAmount: Math.max(0, Math.min(options.loopAmount ?? 0, 1)),
      playheadFilter: options.playheadFilter ?? 1,
      wet: Math.max(0, Math.min(options.wet ?? 0.5, 1)),
    };

    this.input = new Tone.Gain(1);
    this.output = new Tone.Gain(1);

    // WASM outputs wet-only signal; we mix externally.
    // Use a minimum dry floor of 0.2 until WASM is confirmed ready — ensures
    // audio passes through even at 100% wet before the worklet produces output.
    this.dryGain = new Tone.Gain(Math.max(0.2, 1 - this._options.wet));
    this.wetGain = new Tone.Gain(this._options.wet);

    // Dry path: input → dryGain → output
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    // Wet path output must be connected immediately so audio isn't silent
    // while WASM loads (initialize() connects input → worklet → wetGain async)
    this.wetGain.connect(this.output);

    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      const nativeCtx = getNativeContext(this.context);
      if (!nativeCtx) throw new Error('Could not get native AudioContext');

      await RETapeEchoEffect.ensureModuleLoaded(nativeCtx);
      if (this._disposed) return;

      this.workletNode = new AudioWorkletNode(nativeCtx, 're-tape-echo-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        channelCount: 2,
        channelCountMode: 'explicit',
      });

      this.workletNode.port.onmessage = (event) => {
        if (event.data.type === 'ready') {
          // WASM ready — send params and apply the true dry level
          this.sendParam('mode', this._options.mode);
          this.sendParam('repeatRate', this._options.repeatRate);
          this.sendParam('intensity', this._options.intensity);
          this.sendParam('echoVolume', this._options.echoVolume);
          this.sendParam('wow', this._options.wow);
          this.sendParam('flutter', this._options.flutter);
          this.sendParam('dirt', this._options.dirt);
          this.sendParam('inputBleed', this._options.inputBleed);
          this.sendParam('loopAmount', this._options.loopAmount);
          this.sendParam('playheadFilter', this._options.playheadFilter);
          // Remove the dry floor now that WASM is producing output
          this.dryGain.gain.value = 1 - this._options.wet;
        } else if (event.data.type === 'error') {
          console.error('[RETapeEcho] Worklet error:', event.data.message);
        }
      };

      this.workletNode.port.postMessage({
        type: 'init',
        sampleRate: nativeCtx.sampleRate,
        wasmBinary: wasmBinary,
        jsCode: jsCode,
      });

      // Connect wet path: input → workletNode → wetGain (already connected to output)
      Tone.connect(this.input, this.workletNode);
      Tone.connect(this.workletNode, this.wetGain);

    } catch (err) {
      console.error('[RETapeEcho] Init failed:', err);
    }
  }

  private static async ensureModuleLoaded(context: AudioContext): Promise<void> {
    if (moduleLoaded) return;
    if (moduleLoadPromise) return moduleLoadPromise;

    moduleLoadPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';

      try {
        await context.audioWorklet.addModule(`${baseUrl}re-tape-echo/RETapeEcho.worklet.js`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes('already') && !msg.includes('duplicate')) {
          throw new Error(`Failed to load RETapeEcho worklet: ${msg}`);
        }
      }

      if (!wasmBinary || !jsCode) {
        const [wasmResponse, jsResponse] = await Promise.all([
          fetch(`${baseUrl}re-tape-echo/RETapeEcho.wasm`),
          fetch(`${baseUrl}re-tape-echo/RETapeEcho.js`),
        ]);

        if (!wasmResponse.ok || !jsResponse.ok) {
          moduleLoadPromise = null;
          throw new Error(`Failed to fetch RETapeEcho WASM/JS: wasm=${wasmResponse.status} js=${jsResponse.status}`);
        }

        wasmBinary = await wasmResponse.arrayBuffer();
        let code = await jsResponse.text();
        code = code
          .replace(/import\.meta\.url/g, "'.'")
          .replace(/export\s+default\s+\w+;?/g, '');
        code += '\nvar createRETapeEcho = createRETapeEcho || Module;';
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

  setMode(mode: number): void {
    this._options.mode = Math.max(0, Math.min(Math.round(mode), 5));
    this.sendParam('mode', this._options.mode);
  }

  setRepeatRate(rate: number): void {
    this._options.repeatRate = Math.max(0, Math.min(rate, 1));
    this.sendParam('repeatRate', this._options.repeatRate);
  }

  setIntensity(val: number): void {
    this._options.intensity = Math.max(0, Math.min(val, 1));
    this.sendParam('intensity', this._options.intensity);
  }

  setEchoVolume(vol: number): void {
    this._options.echoVolume = Math.max(0, Math.min(vol, 1));
    this.sendParam('echoVolume', this._options.echoVolume);
  }

  setWow(val: number): void {
    this._options.wow = Math.max(0, Math.min(val, 1));
    this.sendParam('wow', this._options.wow);
  }

  setFlutter(val: number): void {
    this._options.flutter = Math.max(0, Math.min(val, 1));
    this.sendParam('flutter', this._options.flutter);
  }

  setDirt(val: number): void {
    this._options.dirt = Math.max(0, Math.min(val, 1));
    this.sendParam('dirt', this._options.dirt);
  }

  setInputBleed(on: boolean | number): void {
    this._options.inputBleed = on ? 1 : 0;
    this.sendParam('inputBleed', on ? 1 : 0);
  }

  setLoopAmount(val: number): void {
    this._options.loopAmount = Math.max(0, Math.min(val, 1));
    this.sendParam('loopAmount', this._options.loopAmount);
  }

  setPlayheadFilter(on: boolean | number): void {
    this._options.playheadFilter = on ? 1 : 0;
    this.sendParam('playheadFilter', on ? 1 : 0);
  }

  get wet(): number { return this._options.wet; }
  set wet(value: number) {
    this._options.wet = Math.max(0, Math.min(1, value));
    this.dryGain.gain.value = 1 - this._options.wet;
    this.wetGain.gain.value = this._options.wet;
  }

  dispose(): this {
    this._disposed = true;
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'dispose' });
      this.workletNode.disconnect();
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
