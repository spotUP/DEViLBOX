/**
 * CheeseCutterEngine — singleton WASM wrapper for the CheeseCutter 6502+reSID engine.
 *
 * Loads the 64KB C64 memory image from a .ct file, runs the JCH NewPlayer
 * binary via a flat-RAM 6502 CPU emulator, and renders audio through reSID.
 * This matches CheeseCutter's own playback architecture exactly — no PSID
 * wrapping, no I/O mapping, no bank switching.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';
import { preprocessEmscriptenJS } from '../mame/mame-wasm-loader';

let modulePromise: Promise<{ wasmBinary: ArrayBuffer; jsCode: string }> | null = null;
const workletLoaded = new WeakSet<AudioContext>();
const CACHE_BUST = `?t=${Date.now()}`;

export class CheeseCutterEngine {
  private static _instance: CheeseCutterEngine | null = null;
  // @ts-expect-error stored for future use (live editing)
  private _audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private outputNode: GainNode | null = null;
  private _ready = false;
  private _playing = false;
  private readyResolve: (() => void) | null = null;
  private readyPromise: Promise<void>;
  private _sidRegsCallback: ((regs: Uint8Array) => void) | null = null;

  static getInstance(): CheeseCutterEngine {
    if (!CheeseCutterEngine._instance) {
      CheeseCutterEngine._instance = new CheeseCutterEngine();
    }
    return CheeseCutterEngine._instance;
  }

  static hasInstance(): boolean {
    return CheeseCutterEngine._instance !== null;
  }

  private constructor() {
    this.readyPromise = new Promise(resolve => { this.readyResolve = resolve; });
  }

  get output(): GainNode | null { return this.outputNode; }
  get isReady(): boolean { return this._ready; }

  async ready(): Promise<void> { return this.readyPromise; }

  async init(): Promise<void> {
    const audioCtx = getDevilboxAudioContext();
    if (!audioCtx) throw new Error('No AudioContext');
    this._audioContext = audioCtx;

    const baseUrl = import.meta.env.BASE_URL || '/';

    if (!workletLoaded.has(audioCtx)) {
      await audioCtx.audioWorklet.addModule(`${baseUrl}cheesecutter/CheeseCutter.worklet.js${CACHE_BUST}`);
      workletLoaded.add(audioCtx);
    }

    if (!modulePromise) {
      modulePromise = (async () => {
        const [wasmResp, jsResp] = await Promise.all([
          fetch(`${baseUrl}cheesecutter/CheeseCutter.wasm${CACHE_BUST}`),
          fetch(`${baseUrl}cheesecutter/CheeseCutter.js${CACHE_BUST}`),
        ]);
        const [wasmBinary, jsCodeRaw] = await Promise.all([
          wasmResp.arrayBuffer(),
          jsResp.text(),
        ]);
        const jsCode = preprocessEmscriptenJS(jsCodeRaw, `${baseUrl}cheesecutter/`);
        return { wasmBinary, jsCode };
      })();
    }

    const { wasmBinary, jsCode } = await modulePromise;

    this.outputNode = audioCtx.createGain();
    this.workletNode = new AudioWorkletNode(audioCtx, 'cheesecutter-processor', {
      outputChannelCount: [2],
      numberOfOutputs: 1,
    });
    this.workletNode.port.onmessage = (e) => this.handleMessage(e.data);
    this.workletNode.connect(this.outputNode);

    const wasmCopy = wasmBinary.slice(0);
    this.workletNode.port.postMessage(
      { type: 'init', wasmBinary: wasmCopy, jsCode, sampleRate: audioCtx.sampleRate, sidModel: 0 },
      [wasmCopy],
    );
  }

  private handleMessage(msg: Record<string, unknown>): void {
    switch (msg.type) {
      case 'ready':
        this._ready = true;
        this.readyResolve?.();
        break;
      case 'error':
        console.error('[CheeseCutterEngine]', msg.error);
        break;
      case 'playing':
        this._playing = true;
        break;
      case 'stopped':
        this._playing = false;
        break;
      case 'sidRegs':
        if (this._sidRegsCallback) {
          this._sidRegsCallback(msg.regs as Uint8Array);
          this._sidRegsCallback = null;
        }
        break;
    }
  }

  async loadAndPlay(data: ArrayBuffer, subtune: number, multiplier: number): Promise<void> {
    if (!this._ready || !this.workletNode) {
      await this.init();
      await this.ready();
    }
    this.workletNode!.port.postMessage(
      { type: 'load', data: data.slice(0) },
      [data.slice(0)],
    );
    this.workletNode!.port.postMessage({ type: 'play', subtune, multiplier });
    this._playing = true;
  }

  stop(): void {
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'stop' });
    }
    this._playing = false;
  }

  isPlaying(): boolean {
    return this._playing;
  }

  connectTo(destination: AudioNode): void {
    if (this.outputNode) {
      try { this.outputNode.disconnect(); } catch { /* already disconnected */ }
      this.outputNode.connect(destination);
    }
  }

  requestSidRegs(): Promise<Uint8Array> {
    return new Promise((resolve) => {
      if (!this.workletNode || !this._ready) {
        resolve(new Uint8Array(25));
        return;
      }
      this._sidRegsCallback = resolve;
      this.workletNode.port.postMessage({ type: 'getSidRegs' });
    });
  }

  writeByte(addr: number, value: number): void {
    if (this.workletNode && this._ready) {
      this.workletNode.port.postMessage({ type: 'writeByte', addr, value });
    }
  }

  writeBytes(addrs: number[], values: number[]): void {
    if (this.workletNode && this._ready) {
      this.workletNode.port.postMessage({ type: 'writeBytes', addrs, values });
    }
  }

  dispose(): void {
    this.stop();
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.outputNode) {
      this.outputNode.disconnect();
      this.outputNode = null;
    }
    this._ready = false;
    this._playing = false;
    CheeseCutterEngine._instance = null;
  }
}
