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
import { getNativeContext } from '@utils/audio-context';

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
let moduleLoaded = false;
let moduleLoadPromise: Promise<void> | null = null;

export class TapeSimulatorEffect extends Tone.ToneAudioNode {
  readonly name = 'TapeSimulator';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private _disposed = false;
  private _options: Required<TapeSimulatorOptions>;

  constructor(options: TapeSimulatorOptions = {}) {
    super();

    this._options = {
      drive:     Math.max(0, Math.min(options.drive     ?? 0.3, 1)),
      character: Math.max(0, Math.min(options.character ?? 0.4, 1)),
      bias:      Math.max(0, Math.min(options.bias      ?? 0.4, 1)),
      shame:     Math.max(0, Math.min(options.shame     ?? 0.2, 1)),
      hiss:      Math.max(0, Math.min(options.hiss      ?? 0.2, 1)),
      speed:     options.speed ?? 0,
      wet:       Math.max(0, Math.min(options.wet       ?? 0.5, 1)),
    };

    this.input  = new Tone.Gain(1);
    this.output = new Tone.Gain(1);

    // WASM outputs wet-only signal; we mix externally
    this.dryGain = new Tone.Gain(1 - this._options.wet);
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

      await TapeSimulatorEffect.ensureModuleLoaded(nativeCtx);
      if (this._disposed) return;

      this.workletNode = new AudioWorkletNode(nativeCtx, 'kiss-of-shame-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        channelCount: 2,
        channelCountMode: 'explicit',
      });

      this.workletNode.port.onmessage = (event) => {
        if (event.data.type === 'ready') {
          this.sendParam('drive',     this._options.drive);
          this.sendParam('character', this._options.character);
          this.sendParam('bias',      this._options.bias);
          this.sendParam('shame',     this._options.shame);
          this.sendParam('hiss',      this._options.hiss);
          this.sendParam('speed',     this._options.speed);
        } else if (event.data.type === 'error') {
          console.error('[TapeSimulator] Worklet error:', event.data.message);
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
      console.error('[TapeSimulator] Init failed:', err);
    }
  }

  private static async ensureModuleLoaded(context: AudioContext): Promise<void> {
    if (moduleLoaded) return;
    if (moduleLoadPromise) return moduleLoadPromise;

    moduleLoadPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';

      try {
        await context.audioWorklet.addModule(`${baseUrl}kissofshame/KissOfShame.worklet.js`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes('already') && !msg.includes('duplicate')) {
          throw new Error(`Failed to load KissOfShame worklet: ${msg}`);
        }
      }

      if (!wasmBinary || !jsCode) {
        const [wasmResponse, jsResponse] = await Promise.all([
          fetch(`${baseUrl}kissofshame/KissOfShame.wasm`),
          fetch(`${baseUrl}kissofshame/KissOfShame.js`),
        ]);

        if (!wasmResponse.ok || !jsResponse.ok) {
          moduleLoadPromise = null;
          throw new Error(
            `Failed to fetch KissOfShame WASM/JS: wasm=${wasmResponse.status} js=${jsResponse.status}`
          );
        }

        wasmBinary = await wasmResponse.arrayBuffer();
        let code = await jsResponse.text();
        code = code
          .replace(/import\.meta\.url/g, "'.'")
          .replace(/export\s+default\s+\w+;?/g, '');
        code += '\nvar createKissOfShameModule = createKissOfShameModule || Module;';
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

  setDrive(val: number): void {
    this._options.drive = Math.max(0, Math.min(val, 1));
    this.sendParam('drive', this._options.drive);
  }

  setCharacter(val: number): void {
    this._options.character = Math.max(0, Math.min(val, 1));
    this.sendParam('character', this._options.character);
  }

  setBias(val: number): void {
    this._options.bias = Math.max(0, Math.min(val, 1));
    this.sendParam('bias', this._options.bias);
  }

  setShame(val: number): void {
    this._options.shame = Math.max(0, Math.min(val, 1));
    this.sendParam('shame', this._options.shame);
  }

  setHiss(val: number): void {
    this._options.hiss = Math.max(0, Math.min(val, 1));
    this.sendParam('hiss', this._options.hiss);
  }

  setSpeed(val: number): void {
    this._options.speed = Math.round(val);
    this.sendParam('speed', this._options.speed);
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
