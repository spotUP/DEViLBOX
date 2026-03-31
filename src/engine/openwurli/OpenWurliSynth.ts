/**
 * OpenWurli Synth — Wurlitzer 200A Electric Piano (WASM)
 *
 * Physical model: reed + hammer + pickup + preamp + tremolo + power amp + speaker
 * Based on retromulator/openWurliLib (GPL v3)
 */

import type { DevilboxSynth } from '@/types/synth';
import type { OpenWurliConfig } from '@typedefs/instrument';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';

export const OPENWURLI_PARAM_IDS = {
  volume: 0,
  tremoloDepth: 1,
  speakerCharacter: 2,
  mlpEnabled: 3,
  velocityCurve: 4,
} as const;

export class OpenWurliSynth implements DevilboxSynth {
  readonly name = 'OpenWurliSynth';
  readonly output: GainNode;

  private workletNode: AudioWorkletNode | null = null;
  private static loadedContexts = new WeakSet<AudioContext>();
  private static initPromises = new WeakMap<AudioContext, Promise<void>>();

  private audioContext: AudioContext;
  private _disposed = false;
  private _resolveInit: (() => void) | null = null;
  private _pendingParams: Array<{ paramId: number; value: number }> = [];
  private _ready = false;

  constructor(config?: OpenWurliConfig) {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();
    this.output.gain.value = 1.0;

    new Promise<void>(resolve => {
      this._resolveInit = resolve;
    });

    this.initWorklet(config);
  }

  private async initWorklet(config?: OpenWurliConfig) {
    try {
      // Load worklet module + fetch WASM assets in parallel
      const [, assets] = await Promise.all([
        OpenWurliSynth.ensureModuleLoaded(this.audioContext),
        OpenWurliSynth.fetchWasmAssets(),
      ]);

      this.workletNode = new AudioWorkletNode(this.audioContext, 'openwurli-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });

      this.workletNode.port.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === 'ready') {
          this._ready = true;
          // Flush pending params
          for (const p of this._pendingParams) {
            this.workletNode?.port.postMessage({ type: 'setParam', paramId: p.paramId, value: p.value });
          }
          this._pendingParams = [];
          this._resolveInit?.();
        } else if (msg.type === 'error') {
          console.error('[OpenWurli]', msg.message);
        }
      };

      this.workletNode.connect(this.output);

      // Send WASM binary + JS code to worklet for initialization
      this.workletNode.port.postMessage({
        type: 'init',
        sampleRate: this.audioContext.sampleRate,
        wasmBinary: assets.wasmBinary,
        jsCode: assets.jsCode,
      });

      // Apply initial config
      if (config) {
        this.applyConfig(config);
      }
    } catch (err) {
      console.error('[OpenWurli] Init failed:', err);
    }
  }

  private static async ensureModuleLoaded(ctx: AudioContext): Promise<void> {
    if (OpenWurliSynth.loadedContexts.has(ctx)) return;

    let promise = OpenWurliSynth.initPromises.get(ctx);
    if (promise) return promise;

    promise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';
      await ctx.audioWorklet.addModule(`${baseUrl}openwurli/OpenWurli.worklet.js`);
      OpenWurliSynth.loadedContexts.add(ctx);
    })();

    OpenWurliSynth.initPromises.set(ctx, promise);
    return promise;
  }

  /** Fetch WASM binary + JS code for sending to worklet */
  private static wasmCache: { wasmBinary: ArrayBuffer; jsCode: string } | null = null;
  private static wasmFetchPromise: Promise<{ wasmBinary: ArrayBuffer; jsCode: string }> | null = null;

  private static async fetchWasmAssets(): Promise<{ wasmBinary: ArrayBuffer; jsCode: string }> {
    if (OpenWurliSynth.wasmCache) return OpenWurliSynth.wasmCache;
    if (OpenWurliSynth.wasmFetchPromise) return OpenWurliSynth.wasmFetchPromise;

    OpenWurliSynth.wasmFetchPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${baseUrl}openwurli/OpenWurli.wasm`),
        fetch(`${baseUrl}openwurli/OpenWurli.js`),
      ]);
      const wasmBinary = await wasmResp.arrayBuffer();
      let jsCode = await jsResp.text();
      // Strip import.meta.url references that don't work in worklet scope
      jsCode = jsCode.replace(/import\.meta\.url/g, "'.'");
      const result = { wasmBinary, jsCode };
      OpenWurliSynth.wasmCache = result;
      return result;
    })();

    return OpenWurliSynth.wasmFetchPromise;
  }

  private sendParam(paramId: number, value: number) {
    if (this._ready && this.workletNode) {
      this.workletNode.port.postMessage({ type: 'setParam', paramId, value });
    } else {
      this._pendingParams.push({ paramId, value });
    }
  }

  applyConfig(config: OpenWurliConfig) {
    this.sendParam(OPENWURLI_PARAM_IDS.volume, config.volume ?? 0.8);
    this.sendParam(OPENWURLI_PARAM_IDS.tremoloDepth, config.tremoloDepth ?? 0.5);
    this.sendParam(OPENWURLI_PARAM_IDS.speakerCharacter, config.speakerCharacter ?? 0.5);
    this.sendParam(OPENWURLI_PARAM_IDS.mlpEnabled, config.mlpEnabled !== false ? 1.0 : 0.0);
    this.sendParam(OPENWURLI_PARAM_IDS.velocityCurve, config.velocityCurve ?? 2);
  }

  triggerAttack(note: string | number, _time?: number, velocity = 1) {
    if (!this.workletNode || this._disposed) return;
    const midi = typeof note === 'string' ? noteToMidi(note) : note;
    const vel = Math.round(velocity * 127);
    this.workletNode.port.postMessage({ type: 'noteOn', note: midi, velocity: vel });
  }

  triggerRelease(note?: string | number, _time?: number) {
    if (!this.workletNode || this._disposed) return;
    if (note !== undefined) {
      const midi = typeof note === 'string' ? noteToMidi(note) : note;
      this.workletNode.port.postMessage({ type: 'noteOff', note: midi });
    } else {
      this.workletNode.port.postMessage({ type: 'allNotesOff' });
    }
  }

  triggerAttackRelease(note: string | number, duration: number, _time?: number, velocity?: number) {
    this.triggerAttack(note, _time, velocity);
    setTimeout(() => this.triggerRelease(note), (duration) * 1000);
  }

  set(param: string, value: number) {
    const paramId = OPENWURLI_PARAM_IDS[param as keyof typeof OPENWURLI_PARAM_IDS];
    if (paramId !== undefined) {
      this.sendParam(paramId, value);
    }
  }

  get(_param: string): number | undefined {
    // Synchronous get not supported for worklet synths
    return undefined;
  }

  sustainPedal(on: boolean) {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'sustainPedal', value: on });
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'destroy' });
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    this.output.disconnect();
  }
}
