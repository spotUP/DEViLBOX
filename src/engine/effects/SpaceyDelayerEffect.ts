/**
 * SpaceyDelayerEffect - WASM-backed multitap tape delay effect
 *
 * Wraps the SpaceyDelayer C++ DSP engine compiled to WebAssembly.
 * Uses a native WebAudio DelayNode fallback that runs immediately,
 * then upgrades to WASM when available.
 *
 * Follows MVerb's proven pattern:
 *   - rawContext for WASM, getNativeAudioNode for node connections
 *   - Connect WASM first, then disconnect fallback (no silent gap)
 *   - Keepalive connection to destination (ensures worklet scheduling)
 *   - Send wetness=1.0 to WASM (external dryGain/wetGain handles mix)
 *   - Last-resort Tone.js fallback if native node access fails
 *
 * Parameters:
 *   - firstTap: Delay time before first echo (10-2000 ms)
 *   - tapSize: Spacing between taps (10-1000 ms)
 *   - feedback: Feedback amount (0-95%)
 *   - multiTap: Enable 3-tap mode (boolean)
 *   - tapeFilter: Enable tape-style bandpass in feedback (boolean)
 *   - wet: Dry/wet mix (0-1)
 */

import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

export interface SpaceyDelayerOptions {
  firstTap?: number;    // ms (10-2000)
  tapSize?: number;     // ms (10-1000)
  feedback?: number;    // % (0-95)
  multiTap?: number;    // 0 or 1
  tapeFilter?: number;  // 0 or 1
  wet?: number;         // 0-1
}

// Static caches shared across instances
let wasmBinary: ArrayBuffer | null = null;
let jsCode: string | null = null;
let moduleLoaded = false;
let moduleLoadPromise: Promise<void> | null = null;

export class SpaceyDelayerEffect extends Tone.ToneAudioNode {
  readonly name = 'SpaceyDelayer';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private _disposed = false;
  private _wasmReady = false;
  private _options: Required<SpaceyDelayerOptions>;

  // JS fallback nodes (native WebAudio delay)
  private fallbackDelay: DelayNode | null = null;
  private fallbackFeedback: GainNode | null = null;
  private fallbackFilter: BiquadFilterNode | null = null;
  private _usingFallback = false;

  constructor(options: SpaceyDelayerOptions = {}) {
    super();

    this._options = {
      firstTap: options.firstTap ?? 250,
      tapSize: options.tapSize ?? 150,
      feedback: Math.min(options.feedback ?? 40, 95),
      multiTap: options.multiTap ?? 1,
      tapeFilter: options.tapeFilter ?? 0,
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

  /** JS fallback using native WebAudio DelayNode — runs immediately */
  private initFallback(): void {
    try {
      const rawContext = Tone.getContext().rawContext as AudioContext;
      const inputNode = getNativeAudioNode(this.input);
      const wetNode = getNativeAudioNode(this.wetGain);

      if (!inputNode || !wetNode) {
        // Last resort: pure Tone.js connection (no delay, but at least not silent)
        console.warn('[SpaceyDelayer] Native node access failed — using Tone.js passthrough');
        this.input.connect(this.wetGain);
        return;
      }

      this.fallbackDelay = rawContext.createDelay(2.0);
      this.fallbackFeedback = rawContext.createGain();
      this.fallbackFilter = rawContext.createBiquadFilter();

      // Configure
      this.fallbackDelay.delayTime.value = this._options.firstTap / 1000;
      this.fallbackFeedback.gain.value = this._options.feedback / 100;
      this.fallbackFilter.type = 'lowpass';
      this.fallbackFilter.frequency.value = this._options.tapeFilter ? 3000 : 20000;

      // Routing: input → delay → filter → wetGain, with feedback loop
      inputNode.connect(this.fallbackDelay);
      this.fallbackDelay.connect(this.fallbackFilter);
      this.fallbackFilter.connect(wetNode);
      this.fallbackFilter.connect(this.fallbackFeedback);
      this.fallbackFeedback.connect(this.fallbackDelay);

      this._usingFallback = true;
    } catch (err) {
      console.warn('[SpaceyDelayer] JS fallback init failed:', err);
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
        console.warn('[SpaceyDelayer] Cannot swap to WASM — native node access failed');
        return;
      }

      // Connect WASM FIRST, then disconnect fallback (avoids silent gap)
      rawInput.connect(this.workletNode);
      this.workletNode.connect(rawWet);

      // Keepalive: ensure AudioWorklet is scheduled even if chain is complex
      const keepalive = rawContext.createGain();
      keepalive.gain.value = 0;
      this.workletNode.connect(keepalive);
      keepalive.connect(rawContext.destination);

      // Now safe to disconnect fallback
      this.disconnectFallback();
    } catch (err) {
      console.warn('[SpaceyDelayer] WASM swap failed, staying on fallback:', err);
    }
  }

  /** Try to initialize WASM worklet in background */
  private async initWasm(): Promise<void> {
    try {
      const rawContext = Tone.getContext().rawContext as AudioContext;

      await SpaceyDelayerEffect.ensureModuleLoaded(rawContext);
      if (this._disposed) return;

      this.workletNode = new AudioWorkletNode(rawContext, 'spacey-delayer-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        channelCount: 2,
        channelCountMode: 'explicit',
      });

      this.workletNode.port.onmessage = (event) => {
        if (event.data.type === 'ready') {
          this._wasmReady = true;
          // WASM handles DSP only — external dryGain/wetGain handles mix
          this.sendParam('wetness', 1.0);
          this.sendParam('firstTap', this._options.firstTap);
          this.sendParam('tapSize', this._options.tapSize);
          this.sendParam('feedback', this._options.feedback);
          this.sendParam('multiTap', this._options.multiTap);
          this.sendParam('tapeFilter', this._options.tapeFilter);

          this.swapToWasm();
        } else if (event.data.type === 'error') {
          console.warn('[SpaceyDelayer] WASM init error, keeping JS fallback:', event.data.message);
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
          console.warn('[SpaceyDelayer] WASM not ready after 5s — keeping JS fallback');
        }
      }, 5000);

    } catch (err) {
      console.warn('[SpaceyDelayer] WASM init failed, using JS fallback:', err);
    }
  }

  private static async ensureModuleLoaded(context: AudioContext): Promise<void> {
    if (moduleLoaded) return;
    if (moduleLoadPromise) return moduleLoadPromise;

    moduleLoadPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';

      try {
        await context.audioWorklet.addModule(`${baseUrl}spacey-delayer/SpaceyDelayer.worklet.js`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes('already') && !msg.includes('duplicate')) {
          throw new Error(`Failed to load SpaceyDelayer worklet: ${msg}`);
        }
      }

      if (!wasmBinary || !jsCode) {
        const [wasmResponse, jsResponse] = await Promise.all([
          fetch(`${baseUrl}spacey-delayer/SpaceyDelayer.wasm`),
          fetch(`${baseUrl}spacey-delayer/SpaceyDelayer.js`),
        ]);

        if (!wasmResponse.ok || !jsResponse.ok) {
          moduleLoadPromise = null;
          throw new Error(`Failed to fetch SpaceyDelayer WASM/JS: wasm=${wasmResponse.status} js=${jsResponse.status}`);
        }

        wasmBinary = await wasmResponse.arrayBuffer();
        let code = await jsResponse.text();
        code = code
          .replace(/import\.meta\.url/g, "'.'")
          .replace(/export\s+default\s+\w+;?/g, '');
        code += '\nvar createSpaceyDelayer = createSpaceyDelayer || Module;';
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

  /** Update JS fallback delay time to match firstTap */
  private updateFallbackDelay(): void {
    if (this.fallbackDelay) {
      this.fallbackDelay.delayTime.value = Math.max(0.01, this._options.firstTap / 1000);
    }
  }

  private updateFallbackFeedback(): void {
    if (this.fallbackFeedback) {
      this.fallbackFeedback.gain.value = this._options.feedback / 100;
    }
  }

  private updateFallbackFilter(): void {
    if (this.fallbackFilter) {
      this.fallbackFilter.frequency.value = this._options.tapeFilter ? 3000 : 20000;
    }
  }

  // ---- Public parameter setters ----

  setFirstTap(ms: number): void {
    this._options.firstTap = Math.max(10, Math.min(ms, 2000));
    this.sendParam('firstTap', this._options.firstTap);
    this.updateFallbackDelay();
  }

  setTapSize(ms: number): void {
    this._options.tapSize = Math.max(10, Math.min(ms, 1000));
    this.sendParam('tapSize', this._options.tapSize);
  }

  setFeedback(pct: number): void {
    this._options.feedback = Math.max(0, Math.min(pct, 95));
    this.sendParam('feedback', this._options.feedback);
    this.updateFallbackFeedback();
  }

  setMultiTap(on: boolean | number): void {
    this._options.multiTap = on ? 1 : 0;
    this.sendParam('multiTap', on ? 1 : 0);
  }

  setTapeFilter(on: boolean | number): void {
    this._options.tapeFilter = on ? 1 : 0;
    this.sendParam('tapeFilter', on ? 1 : 0);
    this.updateFallbackFilter();
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
