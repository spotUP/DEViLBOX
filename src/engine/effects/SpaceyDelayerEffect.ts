/**
 * SpaceyDelayerEffect - WASM-backed multitap tape delay effect
 *
 * Wraps the SpaceyDelayer C++ DSP engine compiled to WebAssembly.
 * Provides a Tone.ToneAudioNode-compatible interface for use in
 * instrument, channel, and master effect chains.
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
import { getNativeContext } from '@utils/audio-context';

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
  private _options: Required<SpaceyDelayerOptions>;

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

    // Dry/wet mixing via parallel paths
    // WASM outputs wet-only signal; we mix externally
    this.dryGain = new Tone.Gain(1 - this._options.wet);
    this.wetGain = new Tone.Gain(this._options.wet);

    // Dry path: input → dryGain → output (always connected)
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    // Wet path output connected immediately so audio isn't silent while WASM loads
    this.wetGain.connect(this.output);

    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      const nativeCtx = getNativeContext(this.context);
      if (!nativeCtx) throw new Error('Could not get native AudioContext');

      await SpaceyDelayerEffect.ensureModuleLoaded(nativeCtx);
      if (this._disposed) return;

      // Create AudioWorkletNode
      this.workletNode = new AudioWorkletNode(nativeCtx, 'spacey-delayer-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        channelCount: 2,
        channelCountMode: 'explicit',
      });

      this.workletNode.port.onmessage = (event) => {
        if (event.data.type === 'ready') {
          // WASM module ready
          // Send all initial parameters
          this.sendParam('firstTap', this._options.firstTap);
          this.sendParam('tapSize', this._options.tapSize);
          this.sendParam('feedback', this._options.feedback);
          this.sendParam('multiTap', this._options.multiTap);
          this.sendParam('tapeFilter', this._options.tapeFilter);
        } else if (event.data.type === 'error') {
          console.error('[SpaceyDelayer] Worklet error:', event.data.message);
        }
      };

      // Send init with WASM data
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
      console.error('[SpaceyDelayer] Init failed:', err);
    }
  }

  private static async ensureModuleLoaded(context: AudioContext): Promise<void> {
    if (moduleLoaded) return;
    if (moduleLoadPromise) return moduleLoadPromise;

    moduleLoadPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';

      // Load worklet module
      try {
        await context.audioWorklet.addModule(`${baseUrl}spacey-delayer/SpaceyDelayer.worklet.js`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes('already') && !msg.includes('duplicate')) {
          throw new Error(`Failed to load SpaceyDelayer worklet: ${msg}`);
        }
      }

      // Fetch WASM and JS
      if (!wasmBinary || !jsCode) {
        const [wasmResponse, jsResponse] = await Promise.all([
          fetch(`${baseUrl}spacey-delayer/SpaceyDelayer.wasm`),
          fetch(`${baseUrl}spacey-delayer/SpaceyDelayer.js`),
        ]);

        if (!wasmResponse.ok || !jsResponse.ok) {
          // Reset so retry is possible
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
      // Reset on failure so future instances can retry
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

  setFirstTap(ms: number): void {
    this._options.firstTap = Math.max(10, Math.min(ms, 2000));
    this.sendParam('firstTap', this._options.firstTap);
  }

  setTapSize(ms: number): void {
    this._options.tapSize = Math.max(10, Math.min(ms, 1000));
    this.sendParam('tapSize', this._options.tapSize);
  }

  setFeedback(pct: number): void {
    this._options.feedback = Math.max(0, Math.min(pct, 95));
    this.sendParam('feedback', this._options.feedback);
  }

  setMultiTap(on: boolean | number): void {
    this._options.multiTap = on ? 1 : 0;
    this.sendParam('multiTap', on ? 1 : 0);
  }

  setTapeFilter(on: boolean | number): void {
    this._options.tapeFilter = on ? 1 : 0;
    this.sendParam('tapeFilter', on ? 1 : 0);
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
