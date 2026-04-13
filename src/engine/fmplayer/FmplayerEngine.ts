/**
 * FmplayerEngine.ts - Singleton WASM engine wrapper for 98fmplayer (FMP format)
 *
 * Plays FMP (PLAY6) format files from PC-98 computers using the myon98/98fmplayer
 * YM2608 (OPNA) emulator. Follows the Sc68Engine singleton pattern.
 *
 * Channel index → LIBOPNA_CHAN bitmask mapping:
 *   0-5  : FM 1-6   (bits 0-5,  values 0x0001-0x0020)
 *   6-8  : SSG 1-3  (bits 6-8,  values 0x0040-0x0100)
 *   9    : ADPCM    (bit 15,    value 0x8000)
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';

// FM slot parameter IDs (matching C enum FMP_SLOT_*)
export const FM_SLOT_PARAM = {
  TL: 0, AR: 1, DR: 2, SR: 3, RR: 4, SL: 5, MUL: 6, DET: 7, KS: 8,
} as const;

// FM channel parameter IDs (matching C enum FMP_CH_*)
export const FM_CH_PARAM = {
  ALG: 0, FB: 1, FNUM: 2, BLK: 3, PAN_L: 4, PAN_R: 5,
} as const;

// SSG parameter IDs (matching C enum FMP_SSG_*)
export const SSG_PARAM = {
  TONE_L: 0, TONE_H: 1, VOLUME: 2, NOISE: 3, TONE_EN: 4, NOISE_EN: 5,
} as const;

export interface FmSlotData {
  tl: number; ar: number; dr: number; sr: number; rr: number;
  sl: number; mul: number; det: number; ks: number;
}

export interface FmChannelData {
  ch: number;
  alg: number; fb: number; fnum: number; blk: number;
  panL: number; panR: number;
  slots: FmSlotData[];
}

export interface SsgChannelData {
  ch: number;
  toneL: number; toneH: number; volume: number;
  noise: number; toneEn: number; noiseEn: number;
}

/**
 * Maps a logical channel index (0-9) to the corresponding LIBOPNA_CHAN_* bitmask.
 * Returns 0 for unknown indices (no-op).
 */
function channelIndexToMask(ch: number): number {
  if (ch >= 0 && ch <= 5) return 1 << ch;          // FM 1-6: bits 0-5
  if (ch >= 6 && ch <= 8) return 1 << ch;          // SSG 1-3: bits 6-8
  if (ch === 9) return 0x8000;                      // ADPCM: bit 15
  return 0;
}

export class FmplayerEngine {
  private static instance: FmplayerEngine | null = null;
  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts: WeakSet<AudioContext> = new WeakSet();
  private static initPromises: WeakMap<AudioContext, Promise<void>> = new WeakMap();

  private audioContext: AudioContext;
  private workletNode: AudioWorkletNode | null = null;
  readonly output: GainNode;

  private _initPromise: Promise<void>;
  private _resolveInit: (() => void) | null = null;
  private _disposed = false;
  private _pendingFmRequests = new Map<number, (data: FmChannelData) => void>();
  private _pendingSsgRequests = new Map<number, (data: SsgChannelData) => void>();

  private constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();
    this._initPromise = new Promise<void>((resolve) => { this._resolveInit = resolve; });
    this.initialize();
  }

  static getInstance(): FmplayerEngine {
    if (!FmplayerEngine.instance || FmplayerEngine.instance._disposed) {
      FmplayerEngine.instance = new FmplayerEngine();
    }
    return FmplayerEngine.instance;
  }

  static hasInstance(): boolean {
    return !!FmplayerEngine.instance && !FmplayerEngine.instance._disposed;
  }

  private async initialize(): Promise<void> {
    try {
      await FmplayerEngine.ensureInitialized(this.audioContext);
      this.createNode();
    } catch (err) {
      console.error('[FmplayerEngine] Initialization failed:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.loadedContexts.has(context)) return;
    const existingPromise = this.initPromises.get(context);
    if (existingPromise) return existingPromise;

    const initPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';
      try { await context.audioWorklet.addModule(`${baseUrl}fmplayer/Fmplayer.worklet.js`); } catch { /* already registered */ }

      if (!this.wasmBinary || !this.jsCode) {
        const [wasmResponse, jsResponse] = await Promise.all([
          fetch(`${baseUrl}fmplayer/Fmplayer.wasm`),
          fetch(`${baseUrl}fmplayer/Fmplayer.js`),
        ]);
        if (wasmResponse.ok) this.wasmBinary = await wasmResponse.arrayBuffer();
        if (jsResponse.ok) {
          let code = await jsResponse.text();
          code = code
            .replace(/import\.meta\.url/g, "'.'")
            .replace(/export\s+default\s+\w+;?/g, '')
            .replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];')
            .replace(/HEAPU8=new Uint8Array\(b\);/, 'HEAPU8=new Uint8Array(b);Module["HEAPU8"]=HEAPU8;')
            .replace(/HEAPF32=new Float32Array\(b\);/, 'HEAPF32=new Float32Array(b);Module["HEAPF32"]=HEAPF32;');
          this.jsCode = code;
        }
      }
      this.loadedContexts.add(context);
    })();

    this.initPromises.set(context, initPromise);
    return initPromise;
  }

  private createNode(): void {
    const ctx = this.audioContext;
    this.workletNode = new AudioWorkletNode(ctx, 'fmplayer-processor', {
      outputChannelCount: [2], numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[FmplayerEngine] WASM ready');
          if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
          break;
        case 'moduleLoaded':
          console.log('[FmplayerEngine] FMP module loaded');
          break;
        case 'fmChannelData': {
          const d = data.data as FmChannelData;
          const resolve = this._pendingFmRequests.get(d.ch);
          if (resolve) { resolve(d); this._pendingFmRequests.delete(d.ch); }
          break;
        }
        case 'ssgChannelData': {
          const d = data.data as SsgChannelData;
          const resolve = this._pendingSsgRequests.get(d.ch);
          if (resolve) { resolve(d); this._pendingSsgRequests.delete(d.ch); }
          break;
        }
        case 'error':
          console.error('[FmplayerEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init', sampleRate: ctx.sampleRate,
      wasmBinary: FmplayerEngine.wasmBinary, jsCode: FmplayerEngine.jsCode,
    });
    this.workletNode.connect(this.output);
  }

  async ready(): Promise<void> { return this._initPromise; }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('FmplayerEngine not initialized');
    this.workletNode.port.postMessage({ type: 'loadModule', moduleData: buffer });
  }

  play(): void { /* playback starts on load */ }
  stop(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }
  pause(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }

  /**
   * Set the channel mute mask directly using LIBOPNA_CHAN_* bitmask values.
   * A set bit mutes the corresponding channel.  Pass 0 to un-mute all channels.
   *
   * Bitmask constants (mirrors LIBOPNA_CHAN_* in opna.h):
   *   FM 1-6   : 0x0001-0x0020
   *   SSG 1-3  : 0x0040-0x0100
   *   ADPCM    : 0x8000
   */
  setMuteMask(mask: number): void {
    this.workletNode?.port.postMessage({ type: 'setMuteMask', mask });
  }

  /**
   * Mute (gain === 0) or un-mute (gain > 0) a single channel by index.
   * Channel indices: 0-5 = FM 1-6, 6-8 = SSG 1-3, 9 = ADPCM.
   *
   * Because libopna's per-channel API is bitmask-based (mute/unmute only),
   * non-zero gain values are treated as un-muted regardless of magnitude.
   * To apply actual volume scaling use the master GainNode on this.output.
   */
  setChannelGain(ch: number, gain: number): void {
    const bit = channelIndexToMask(ch);
    if (!bit) return;
    // We need the current mask to toggle a single channel's bit.
    // We track it locally since the worklet holds the authoritative copy.
    if (gain === 0) {
      this._muteMask |= bit;
    } else {
      this._muteMask &= ~bit;
    }
    this.setMuteMask(this._muteMask);
  }

  private _muteMask = 0;

  /** Request full FM channel data (alg, fb, pan + 4 operator params) */
  requestFmChannel(ch: number): Promise<FmChannelData> {
    return new Promise((resolve) => {
      this._pendingFmRequests.set(ch, resolve);
      this.workletNode?.port.postMessage({ type: 'getFmChannel', ch });
    });
  }

  /** Request SSG channel data */
  requestSsgChannel(ch: number): Promise<SsgChannelData> {
    return new Promise((resolve) => {
      this._pendingSsgRequests.set(ch, resolve);
      this.workletNode?.port.postMessage({ type: 'getSsgChannel', ch });
    });
  }

  /** Set a single FM operator parameter */
  setFmSlotParam(ch: number, slot: number, paramId: number, value: number): void {
    this.workletNode?.port.postMessage({ type: 'setFmSlotParam', ch, slot, paramId, value });
  }

  /** Set a FM channel parameter (alg, fb, pan) */
  setFmChParam(ch: number, paramId: number, value: number): void {
    this.workletNode?.port.postMessage({ type: 'setFmChParam', ch, paramId, value });
  }

  /** Set a SSG parameter */
  setSsgParam(ch: number, paramId: number, value: number): void {
    this.workletNode?.port.postMessage({ type: 'setSsgParam', ch, paramId, value });
  }

  dispose(): void {
    this._disposed = true;
    this.workletNode?.port.postMessage({ type: 'dispose' });
    this.workletNode?.disconnect();
    this.workletNode = null;
    if (FmplayerEngine.instance === this) FmplayerEngine.instance = null;
  }
}
