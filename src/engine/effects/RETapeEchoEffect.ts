/**
 * RETapeEchoEffect - WASM-backed Roland RE-150/201 tape echo effect
 *
 * Wraps the RE-Tape-Echo C++ DSP engine compiled to WebAssembly.
 * Uses a native WebAudio DelayNode fallback that runs immediately,
 * then upgrades to WASM when available.
 *
 * Follows MVerb's proven pattern:
 *   - rawContext for WASM, getNativeAudioNode for node connections
 *   - Connect WASM first, then disconnect fallback (no silent gap)
 *   - Keepalive connection to destination (ensures worklet scheduling)
 *   - Last-resort Tone.js fallback if native node access fails
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
import { getNativeAudioNode } from '@utils/audio-context';

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
  private _wasmReady = false;
  private _options: Required<RETapeEchoOptions>;

  // JS fallback nodes (native WebAudio delay)
  private fallbackDelay: DelayNode | null = null;
  private fallbackFeedback: GainNode | null = null;
  private fallbackFilter: BiquadFilterNode | null = null;
  private fallbackEchoGain: GainNode | null = null;
  private _usingFallback = false;

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

    // Start with correct dry/wet from the beginning
    this.dryGain = new Tone.Gain(1 - this._options.wet);
    this.wetGain = new Tone.Gain(this._options.wet);

    // Dry path: input → dryGain → output
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);
    this.wetGain.connect(this.output);

    // Initialize JS fallback immediately, then try WASM
    this.initFallback();
    this.initWasm();
  }

  /** Convert repeatRate (0-1) to delay time in seconds */
  private rateToDelaySec(): number {
    // Match the WASM formula: offset = 1 - (rate * 2.3), delay_ms = (offset + 1) * 47
    const offset = 1 - (this._options.repeatRate * 2.3);
    const delayMs = (offset + 1) * 47;
    return Math.max(0.01, Math.min(delayMs / 1000, 0.5));
  }

  /** JS fallback using native WebAudio DelayNode — runs immediately */
  private initFallback(): void {
    try {
      const rawContext = Tone.getContext().rawContext as AudioContext;
      const inputNode = getNativeAudioNode(this.input);
      const wetNode = getNativeAudioNode(this.wetGain);

      if (!inputNode || !wetNode) {
        // Last resort: pure Tone.js connection (no delay, but at least not silent)
        console.warn('[RETapeEcho] Native node access failed — using Tone.js passthrough');
        this.input.connect(this.wetGain);
        return;
      }

      this.fallbackDelay = rawContext.createDelay(1.0);
      this.fallbackFeedback = rawContext.createGain();
      this.fallbackFilter = rawContext.createBiquadFilter();
      this.fallbackEchoGain = rawContext.createGain();

      // Configure
      this.fallbackDelay.delayTime.value = this.rateToDelaySec();
      this.fallbackFeedback.gain.value = this._options.intensity * 0.9;
      this.fallbackEchoGain.gain.value = this._options.echoVolume;
      this.fallbackFilter.type = 'lowpass';
      this.fallbackFilter.frequency.value = this._options.playheadFilter ? 4000 : 20000;

      // Routing: input → delay → echoGain → filter → wetGain, with feedback loop
      inputNode.connect(this.fallbackDelay);
      this.fallbackDelay.connect(this.fallbackEchoGain);
      this.fallbackEchoGain.connect(this.fallbackFilter);
      this.fallbackFilter.connect(wetNode);
      this.fallbackFilter.connect(this.fallbackFeedback);
      this.fallbackFeedback.connect(this.fallbackDelay);

      this._usingFallback = true;
    } catch (err) {
      console.warn('[RETapeEcho] JS fallback init failed:', err);
      // Last resort: Tone.js passthrough
      try { this.input.connect(this.wetGain); } catch { /* ignored */ }
    }
  }

  /** Disconnect JS fallback when WASM takes over */
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

  /** Swap from JS fallback to WASM — connect first, then disconnect (MVerb pattern) */
  private swapToWasm(): void {
    if (!this.workletNode) return;
    try {
      const rawContext = Tone.getContext().rawContext as AudioContext;
      const rawInput = getNativeAudioNode(this.input);
      const rawWet = getNativeAudioNode(this.wetGain);

      if (!rawInput || !rawWet) {
        console.warn('[RETapeEcho] Cannot swap to WASM — native node access failed');
        return;
      }

      /* Tear down the fallback FIRST so the wet summing node isn't
         driven by two recursive paths (fallback delay loop + WASM
         worklet) during the swap window. Upstream biquads in the
         DubBus feedback chain interpreted that overlap as a transient
         and latched to NaN ("state is bad"). Bounded silence for one
         processing block is the safer tradeoff. */
      this.disconnectFallback();

      rawInput.connect(this.workletNode);
      this.workletNode.connect(rawWet);

      // Keepalive: ensure AudioWorklet is scheduled even if chain is complex
      const keepalive = rawContext.createGain();
      keepalive.gain.value = 0;
      this.workletNode.connect(keepalive);
      keepalive.connect(rawContext.destination);
    } catch (err) {
      console.warn('[RETapeEcho] WASM swap failed, staying on fallback:', err);
    }
  }

  /** Try to initialize WASM worklet in background */
  private async initWasm(): Promise<void> {
    try {
      const rawContext = Tone.getContext().rawContext as AudioContext;

      await RETapeEchoEffect.ensureModuleLoaded(rawContext);
      if (this._disposed) return;

      this.workletNode = new AudioWorkletNode(rawContext, 're-tape-echo-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        channelCount: 2,
        channelCountMode: 'explicit',
      });

      this.workletNode.port.onmessage = (event) => {
        if (event.data.type === 'ready') {
          this._wasmReady = true;
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

          this.swapToWasm();
        } else if (event.data.type === 'error') {
          console.warn('[RETapeEcho] WASM init error, keeping JS fallback:', event.data.message);
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
          console.warn('[RETapeEcho] WASM not ready after 5s — keeping JS fallback');
        }
      }, 5000);

    } catch (err) {
      console.warn('[RETapeEcho] WASM init failed, using JS fallback:', err);
    }
  }

  static async ensureModuleLoaded(context: AudioContext): Promise<void> {
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
    if (this.fallbackDelay) {
      this.fallbackDelay.delayTime.value = this.rateToDelaySec();
    }
  }

  setIntensity(val: number): void {
    this._options.intensity = Math.max(0, Math.min(val, 1));
    this.sendParam('intensity', this._options.intensity);
    if (this.fallbackFeedback) {
      this.fallbackFeedback.gain.value = val * 0.9;
    }
  }

  setEchoVolume(vol: number): void {
    this._options.echoVolume = Math.max(0, Math.min(vol, 1));
    this.sendParam('echoVolume', this._options.echoVolume);
    if (this.fallbackEchoGain) {
      this.fallbackEchoGain.gain.value = vol;
    }
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
    if (this.fallbackFilter) {
      this.fallbackFilter.frequency.value = on ? 4000 : 20000;
    }
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
    super.dispose();
    return this;
  }
}
