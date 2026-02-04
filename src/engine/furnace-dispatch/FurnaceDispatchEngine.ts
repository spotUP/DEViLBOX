/**
 * FurnaceDispatchEngine - Singleton managing Furnace chip dispatch WASM instances
 *
 * Loads the FurnaceDispatch WASM module via AudioWorklet and manages:
 * - Chip instance lifecycle (create/destroy)
 * - DivCommand forwarding
 * - Oscilloscope data reception for visualization
 */

import { createAudioWorkletNode as toneCreateAudioWorkletNode } from 'tone/build/esm/core/context/AudioContext';
import { getNativeContext } from '@utils/audio-context';

/** Furnace platform types (matching C++ FurnacePlatformType enum) */
export const FurnaceDispatchPlatform = {
  GB: 0x80,
  NES: 0x83,
  SMS: 0x03,
  AY: 0x06,
  OPN2: 0x02,
  OPM: 0x1b,
} as const;

export type FurnaceDispatchPlatform = typeof FurnaceDispatchPlatform[keyof typeof FurnaceDispatchPlatform];

/** DivDispatchCmds subset (matching Furnace dispatch.h) */
export const DivCmd = {
  NOTE_ON: 0,
  NOTE_OFF: 1,
  NOTE_OFF_ENV: 2,
  ENV_RELEASE: 3,
  INSTRUMENT: 4,
  VOLUME: 5,
  GET_VOLUME: 6,
  GET_VOLMAX: 7,
  NOTE_PORTA: 8,
  PITCH: 9,
  PANNING: 10,
  LEGATO: 11,
  PRE_PORTA: 12,
  PRE_NOTE: 13,
  SAMPLE_MODE: 14,
  SAMPLE_FREQ: 15,
  SAMPLE_BANK: 16,
  SAMPLE_POS: 17,
  SAMPLE_DIR: 18,
  FM_HARD_RESET: 19,
  GB_SWEEP_DIR: 0x20,
  GB_SWEEP_TIME: 0x21,
  GB_SWEEP_SHIFT: 0x22,
  WAVE: 0x10,
} as const;

export type OscDataCallback = (channels: (Int16Array | null)[]) => void;

export class FurnaceDispatchEngine {
  private static instance: FurnaceDispatchEngine | null = null;

  private workletNode: AudioWorkletNode | null = null;
  private initialized = false;
  private initializing = false;
  private numChannels = 0;
  private platformType = 0;
  private dispatchHandle = 0;

  // Promise for worklet WASM ready
  private _wasmReadyResolve: (() => void) | null = null;
  private _wasmReadyReject: ((err: Error) => void) | null = null;
  private _wasmReadyPromise: Promise<void> | null = null;

  // Promise for chip creation
  private _chipCreatedResolve: (() => void) | null = null;
  private _chipCreatedPromise: Promise<void> | null = null;

  // Oscilloscope data
  private oscCallbacks: Set<OscDataCallback> = new Set();
  private latestOscData: (Int16Array | null)[] = [];

  // Cache for WASM binary and JS code
  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts: WeakSet<AudioContext> = new WeakSet();
  private static initPromises: WeakMap<AudioContext, Promise<void>> = new WeakMap();

  private constructor() {}

  static getInstance(): FurnaceDispatchEngine {
    if (!FurnaceDispatchEngine.instance) {
      FurnaceDispatchEngine.instance = new FurnaceDispatchEngine();
    }
    return FurnaceDispatchEngine.instance;
  }

  get isInitialized(): boolean { return this.initialized; }
  get channelCount(): number { return this.numChannels; }
  get platform(): number { return this.platformType; }
  get handle(): number { return this.dispatchHandle; }

  /**
   * Initialize the engine with the given AudioContext.
   * Loads worklet module and WASM binary.
   */
  async init(context: any): Promise<void> {
    if (this.initialized || this.initializing) return;
    this.initializing = true;

    try {
      const nativeCtx = getNativeContext(context);
      if (!nativeCtx) throw new Error('Could not get native AudioContext');

      await FurnaceDispatchEngine.ensureModuleLoaded(nativeCtx);

      // Create worklet node
      this.workletNode = toneCreateAudioWorkletNode(nativeCtx, 'furnace-dispatch-processor', {
        outputChannelCount: [2],
        processorOptions: { sampleRate: nativeCtx.sampleRate }
      });

      // Handle messages from worklet
      this.workletNode.port.onmessage = (event) => {
        this.handleWorkletMessage(event.data);
      };

      // Create WASM ready promise with timeout before sending init
      this._wasmReadyPromise = new Promise<void>((resolve, reject) => {
        this._wasmReadyResolve = resolve;
        this._wasmReadyReject = reject;
        setTimeout(() => reject(new Error('FurnaceDispatch WASM ready timeout after 10s')), 10000);
      });

      // Send init message with WASM binary and JS code
      this.workletNode.port.postMessage({
        type: 'init',
        sampleRate: nativeCtx.sampleRate,
        wasmBinary: FurnaceDispatchEngine.wasmBinary,
        jsCode: FurnaceDispatchEngine.jsCode
      });

      // Wait for worklet WASM compilation to complete
      await this._wasmReadyPromise;

      // CRITICAL: Connect worklet through a silent keepalive to destination.
      // Without a path to destination, the browser never calls process().
      try {
        const keepalive = nativeCtx.createGain();
        keepalive.gain.value = 0;
        this.workletNode!.connect(keepalive);
        keepalive.connect(nativeCtx.destination);
      } catch (e) {
        console.warn('[FurnaceDispatch] Keepalive connection failed:', e);
      }

      this.initialized = true;
    } catch (err) {
      console.error('[FurnaceDispatch] Init failed:', err);
      throw err;
    } finally {
      this.initializing = false;
    }
  }

  private static async ensureModuleLoaded(context: AudioContext): Promise<void> {
    if (this.loadedContexts.has(context)) return;

    const existingPromise = this.initPromises.get(context);
    if (existingPromise) return existingPromise;

    const initPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';
      const cacheBuster = `?v=${Date.now()}`;

      // Load worklet module
      try {
        await context.audioWorklet.addModule(`${baseUrl}furnace-dispatch/FurnaceDispatch.worklet.js${cacheBuster}`);
      } catch (e: any) {
        // Only swallow "already registered" errors; re-throw real failures
        const msg = e?.message || String(e);
        if (!msg.includes('already') && !msg.includes('duplicate')) {
          throw new Error(`Failed to load FurnaceDispatch worklet: ${msg}`);
        }
      }

      // Fetch WASM and JS code (shared across contexts)
      if (!this.wasmBinary || !this.jsCode) {
        const [wasmResponse, jsResponse] = await Promise.all([
          fetch(`${baseUrl}furnace-dispatch/FurnaceDispatch.wasm${cacheBuster}`, { cache: 'no-store' }),
          fetch(`${baseUrl}furnace-dispatch/FurnaceDispatch.js${cacheBuster}`, { cache: 'no-store' })
        ]);

        if (wasmResponse.ok) {
          this.wasmBinary = await wasmResponse.arrayBuffer();
        }
        if (jsResponse.ok) {
          let code = await jsResponse.text();
          // Transform Emscripten output for AudioWorklet scope
          // Polyfill URL (not available in AudioWorklet WorkletGlobalScope)
          const urlPolyfill = 'if(typeof URL==="undefined"){globalThis.URL=class{constructor(p,b){this.href=(b||"")+p;this.pathname=p;}};}\n';
          code = urlPolyfill + code
            .replace(/import\.meta\.url/g, "'.'")
            .replace(/export\s+default\s+\w+;?/g, '')
            .replace(/if\s*\(ENVIRONMENT_IS_NODE\)\s*\{[^}]*await\s+import\([^)]*\)[^}]*\}/g, '')
            .replace(/(wasmMemory=wasmExports\["\w+"\])/, '$1;Module["wasmMemory"]=wasmMemory');
          code += '\nvar createFurnaceDispatch = createFurnaceDispatch || Module;';
          this.jsCode = code;
        }
      }

      this.loadedContexts.add(context);
    })();

    this.initPromises.set(context, initPromise);
    return initPromise;
  }

  private handleWorkletMessage(data: any): void {
    switch (data.type) {
      case 'ready':
        console.log('[FurnaceDispatch] Worklet ready');
        if (this._wasmReadyResolve) {
          this._wasmReadyResolve();
          this._wasmReadyResolve = null;
        }
        break;

      case 'chipCreated':
        this.dispatchHandle = data.handle;
        this.numChannels = data.numChannels;
        this.platformType = data.platformType;
        this.latestOscData = new Array(this.numChannels).fill(null);
        console.log(`[FurnaceDispatch] Chip created: platform=${data.platformType}, channels=${data.numChannels}`);
        if (this._chipCreatedResolve) {
          this._chipCreatedResolve();
          this._chipCreatedResolve = null;
        }
        break;

      case 'oscData':
        this.latestOscData = data.channels;
        for (const cb of this.oscCallbacks) {
          cb(data.channels);
        }
        break;

      case 'error':
        console.error('[FurnaceDispatch] Worklet error:', data.message);
        if (this._wasmReadyReject) {
          this._wasmReadyReject(new Error(data.message));
          this._wasmReadyReject = null;
          this._wasmReadyResolve = null;
        }
        break;
    }
  }

  /**
   * Create a chip dispatch instance for the given platform.
   */
  createChip(platformType: number, sampleRate?: number): void {
    if (!this.workletNode) return;

    // Set up chip created promise before sending message
    this._chipCreatedPromise = new Promise<void>((resolve) => {
      this._chipCreatedResolve = resolve;
    });

    this.workletNode.port.postMessage({
      type: 'createChip',
      platformType,
      sampleRate
    });
  }

  /**
   * Wait for the chip to be created in the worklet.
   */
  async waitForChipCreated(): Promise<void> {
    if (this._chipCreatedPromise) {
      await this._chipCreatedPromise;
    }
  }

  /**
   * Send a raw dispatch command.
   */
  dispatch(cmd: number, chan: number, val1: number = 0, val2: number = 0): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({
      type: 'dispatch',
      cmd, chan, val1, val2
    });
  }

  /**
   * Send a note on command.
   */
  noteOn(chan: number, note: number): void {
    this.dispatch(DivCmd.NOTE_ON, chan, note, 0);
  }

  /**
   * Send a note off command.
   */
  noteOff(chan: number): void {
    this.dispatch(DivCmd.NOTE_OFF, chan, 0, 0);
  }

  /**
   * Set the instrument on a channel.
   */
  setInstrument(chan: number, insIndex: number): void {
    this.dispatch(DivCmd.INSTRUMENT, chan, insIndex, 0);
  }

  /**
   * Set channel volume.
   */
  setVolume(chan: number, volume: number): void {
    this.dispatch(DivCmd.VOLUME, chan, volume, 0);
  }

  /**
   * Set a Game Boy instrument via binary data.
   */
  setGBInstrument(insIndex: number, insData: Uint8Array): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({
      type: 'setGBInstrument',
      insIndex,
      insData
    });
  }

  /**
   * Set a wavetable via binary data.
   */
  setWavetable(waveIndex: number, waveData: Uint8Array): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({
      type: 'setWavetable',
      waveIndex,
      waveData
    });
  }

  /**
   * Set the engine tick rate.
   */
  setTickRate(hz: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'setTickRate', hz });
  }

  /**
   * Reset the dispatch instance.
   */
  reset(): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'reset' });
  }

  /**
   * Force re-send instruments on all channels.
   */
  forceIns(): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'forceIns' });
  }

  /**
   * Mute/unmute a channel.
   */
  mute(chan: number, muted: boolean): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'mute', chan, mute: muted });
  }

  /**
   * Subscribe to oscilloscope data updates (~30fps).
   */
  onOscData(callback: OscDataCallback): () => void {
    this.oscCallbacks.add(callback);
    return () => { this.oscCallbacks.delete(callback); };
  }

  /**
   * Get the latest oscilloscope data for all channels.
   */
  getOscData(): (Int16Array | null)[] {
    return this.latestOscData;
  }

  /**
   * Get the worklet node for audio graph connection.
   */
  getWorkletNode(): AudioWorkletNode | null {
    return this.workletNode;
  }

  /**
   * Dispose the engine and clean up resources.
   */
  dispose(): void {
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'dispose' });
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    this.initialized = false;
    this.dispatchHandle = 0;
    this.numChannels = 0;
    this.oscCallbacks.clear();
    this.latestOscData = [];
    FurnaceDispatchEngine.instance = null;
  }
}
