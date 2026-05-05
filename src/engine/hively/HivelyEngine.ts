/**
 * HivelyEngine.ts - Singleton WASM engine wrapper for HivelyTracker replayer
 *
 * Manages the AudioWorklet node for HVL/AHX song playback.
 * Follows the DB303Synth pattern: static WASM/JS caching, per-context worklet loading.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';
import type { IsolationCapableEngine } from '@engine/tone/ChannelRoutedEffects';
import { registerIsolationEngineResolver } from '@engine/tone/ChannelRoutedEffects';
import { useOscilloscopeStore } from '@stores/useOscilloscopeStore';
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

/** Hively appends a defensive factory-name hint (see original source). */
function hivelyTransform(code: string): string {
  let out = code
    .replace(/import\.meta\.url/g, "'.'")
    .replace(/export\s+default\s+\w+;?/g, '')
    .replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];')
    .replace(/HEAPU8=new Uint8Array\(b\);/, 'HEAPU8=new Uint8Array(b);Module["HEAPU8"]=HEAPU8;')
    .replace(/HEAPF32=new Float32Array\(b\);/, 'HEAPF32=new Float32Array(b);Module["HEAPF32"]=HEAPF32;');
  // Dynamic-factory-name alias — preserve the original's two-step fallback exactly.
  out += '\nvar createHively = createHively || ' + (out.match(/var\s+(\w+)\s*=\s*\(\s*\)\s*=>/)?.[1] ?? 'createHively') + ';';
  if (!out.includes('var createHively =')) {
    out += '\n// Factory is already named createHively via EXPORT_NAME';
  }
  return out;
}

export interface HivelyTuneInfo {
  name: string;
  channels: number;
  positions: number;
  trackLength: number;
  subsongs: number;
  speedMultiplier: number;
  restart: number;
  mixGain: number;
  stereoMode: number;
  version: number;
}

export interface HivelyPositionUpdate {
  position: number;
  row: number;
  speed: number;
}

type PositionCallback = (update: HivelyPositionUpdate) => void;

export class HivelyEngine extends WASMSingletonBase implements IsolationCapableEngine {
  private static readonly MAX_ISOLATION_SLOTS = 4;
  /** Per-channel dub-send outputs. HVL songs are typically 4-6 channels but
   * the worklet exposes 32 slots for API consistency with LibOpenMPT. Unused
   * indices skip rendering entirely. */
  private static readonly MAX_DUB_CHANNELS = 32;
  private _isolationSlotMasks: (number | null)[] = new Array(4).fill(null);
  private static instance: HivelyEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private _tunePromise: Promise<HivelyTuneInfo> | null = null;
  private _resolveTune: ((info: HivelyTuneInfo) => void) | null = null;
  private _rejectTune: ((err: Error) => void) | null = null;
  private _tuneLoaded = false;
  private _positionCallbacks: Set<PositionCallback> = new Set();
  private _songEndCallbacks: Set<() => void> = new Set();
  private _playerHandleResolvers: Array<(handle: number) => void> = [];

  private constructor() {
    super();
    this.initialize(HivelyEngine.cache);
  }

  static getInstance(): HivelyEngine {
    const currentCtx = getDevilboxAudioContext();
    if (!HivelyEngine.instance || HivelyEngine.instance._disposed ||
        HivelyEngine.instance.audioContext !== currentCtx) {
      if (HivelyEngine.instance && !HivelyEngine.instance._disposed) {
        HivelyEngine.instance.dispose();
      }
      HivelyEngine.instance = new HivelyEngine();
      // Self-register on globalThis so consumers (mixer, dub moves) can find
      // the active instance without depending on module-graph identity.
      // Vite dev sometimes serves a static import as one module copy and a
      // dynamic import as another, so consumers that hold a different copy
      // of this class would read hasInstance()=false even when this copy has
      // a live singleton. The global slot bypasses that entirely.
      const g = globalThis as { __devilboxActiveHivelyEngine?: HivelyEngine };
      g.__devilboxActiveHivelyEngine = HivelyEngine.instance;
    }
    return HivelyEngine.instance;
  }

  /** Check if a live singleton instance exists (without creating one). */
  static hasInstance(): boolean {
    return !!HivelyEngine.instance && !HivelyEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'hively',
      workletFile: 'Hively.worklet.js',
      wasmFile: 'Hively.wasm',
      jsFile: 'Hively.js',
      transformJS: hivelyTransform,
      workletCacheBust: true,
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;

    // 37 stereo outputs: [0]=main mix, [1..4]=isolation slots, [5..36]=dub sends.
    const TOTAL_OUTPUTS = 1 + HivelyEngine.MAX_ISOLATION_SLOTS + HivelyEngine.MAX_DUB_CHANNELS;
    this.workletNode = new AudioWorkletNode(ctx, 'hively-processor', {
      outputChannelCount: new Array(TOTAL_OUTPUTS).fill(2),
      numberOfOutputs: TOTAL_OUTPUTS,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[HivelyEngine] WASM ready');
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;

        case 'tuneLoaded':
          this._tuneLoaded = true;
          if (this._resolveTune) {
            const numCh = data.channels ?? 4;
            const chNames = Array.from({ length: numCh }, (_, i) => `CH${i + 1}`);
            useOscilloscopeStore.getState().setChipInfo(numCh, 0, chNames);
            this._resolveTune({
              name: data.name,
              channels: data.channels,
              positions: data.positions,
              trackLength: data.trackLength,
              subsongs: data.subsongs,
              speedMultiplier: data.speedMultiplier,
              restart: data.restart,
              mixGain: data.mixGain,
              stereoMode: data.stereoMode,
              version: data.version,
            });
            this._resolveTune = null;
            this._rejectTune = null;
          }
          break;

        case 'error':
          this._tuneLoaded = false;
          console.error('[HivelyEngine]', data.message);
          if (this._rejectTune) {
            this._rejectTune(new Error(data.message));
            this._resolveTune = null;
            this._rejectTune = null;
          }
          if (this._playerHandleResolvers.length > 0) {
            const resolve = this._playerHandleResolvers.shift()!;
            resolve(-1);
          }
          break;

        case 'position':
          for (const cb of this._positionCallbacks) {
            cb({ position: data.position, row: data.row, speed: data.speed });
          }
          break;

        case 'songEnd':
          for (const cb of this._songEndCallbacks) {
            cb();
          }
          break;

        case 'playerCreated':
          if (this._playerHandleResolvers.length > 0) {
            const resolve = this._playerHandleResolvers.shift()!;
            resolve(data.handle);
          }
          break;

        case 'oscData':
          useOscilloscopeStore.getState().updateChannelData(data.channels);
          break;

        case 'debug':
          console.warn('[HivelyWorklet]', data.msg);
          break;
      }
    };

    // Send init message with WASM binary and JS code
    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: ctx.sampleRate,
      wasmBinary: HivelyEngine.cache.wasmBinary,
      jsCode: HivelyEngine.cache.jsCode,
    });

    this.workletNode.connect(this.output);
  }

  /** Load a .hvl or .ahx tune from binary data */
  async loadTune(buffer: ArrayBuffer, defStereo = 2): Promise<HivelyTuneInfo> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('HivelyEngine not initialized');

    this._tunePromise = new Promise<HivelyTuneInfo>((resolve, reject) => {
      this._resolveTune = resolve;
      this._rejectTune = reject;
    });

    this.workletNode.port.postMessage(
      { type: 'loadTune', buffer, defStereo },
      [buffer] // transfer ownership
    );

    return this._tunePromise;
  }

  /** Switch to a different subsong */
  initSubsong(nr: number): void {
    this.workletNode?.port.postMessage({ type: 'initSubsong', nr });
  }

  setChannelGain(channel: number, gain: number): void {
    this.workletNode?.port.postMessage({ type: 'setChannelGain', channel, gain });
  }

  play(): void {
    this.workletNode?.port.postMessage({ type: 'play' });
    this.workletNode?.port.postMessage({ type: 'enableOsc' });
    // Re-hydrate per-channel dub sends (idempotent when no channels active).
    void import('../tone/ChannelRoutedEffects').then(({ getChannelRoutedEffectsManager }) => {
      try { void getChannelRoutedEffectsManager()?.rebuildDubConnections(); } catch { /* ok */ }
    });
  }

  stop(): void {
    this.workletNode?.port.postMessage({ type: 'stop' });
    this.workletNode?.port.postMessage({ type: 'disableOsc' });
    useOscilloscopeStore.getState().clear();
  }

  pause(): void {
    this.workletNode?.port.postMessage({ type: 'pause' });
  }

  setLooping(value: boolean): void {
    this.workletNode?.port.postMessage({ type: 'setLooping', value });
  }

  freeTune(): void {
    this.workletNode?.port.postMessage({ type: 'freeTune' });
    this._tuneLoaded = false;
  }

  hasLoadedTune(): boolean {
    return this._tuneLoaded;
  }

  /** Subscribe to position updates (~15fps). Returns unsubscribe function. */
  onPositionUpdate(cb: PositionCallback): () => void {
    this._positionCallbacks.add(cb);
    return () => this._positionCallbacks.delete(cb);
  }

  /**
   * Wire this engine's position-update stream into a PlaybackCoordinator.
   * Throttles to row-change events and dispatches via
   * coordinator.dispatchEnginePosition. Returns an unsubscribe function the
   * caller stores so it can detach on stop().
   *
   * Replaces ~20 lines of identical glue that previously lived inline in
   * TrackerReplayer.play() for every WASM engine.
   */
  subscribeToCoordinator(coordinator: import('@engine/PlaybackCoordinator').PlaybackCoordinator): () => void {
    let lastRow = -1;
    let lastPosition = -1;
    return this.onPositionUpdate((update) => {
      if (update.row === lastRow && update.position === lastPosition) return;
      lastRow = update.row;
      lastPosition = update.position;
      // No audioTime — coordinator falls back to its audio context's currentTime.
      // Hively's worklet doesn't expose per-callback audio timestamps.
      coordinator.dispatchEnginePosition(update.row, update.position);
    });
  }

  /** Subscribe to song end events. Returns unsubscribe function. */
  onSongEnd(cb: () => void): () => void {
    this._songEndCallbacks.add(cb);
    return () => this._songEndCallbacks.delete(cb);
  }

  /** Send a message to the worklet. Optional transferable list for ArrayBuffers. */
  sendMessage(msg: Record<string, unknown>, transfers?: Transferable[]): void {
    if (!this.workletNode) return;
    if (transfers) {
      this.workletNode.port.postMessage(msg, transfers);
    } else {
      this.workletNode.port.postMessage(msg);
    }
  }

  /** Wait for the next 'playerCreated' message and return the handle. */
  waitForPlayerHandle(): Promise<number> {
    return new Promise<number>((resolve) => {
      this._playerHandleResolvers.push(resolve);
    });
  }

  /** Set a single step in a track (for pattern editing) */
  setTrackStep(trackIdx: number, stepIdx: number,
               note: number, instrument: number,
               fx: number, fxParam: number,
               fxb: number, fxbParam: number): void {
    this.workletNode?.port.postMessage({
      type: 'setTrackStep',
      trackIdx, stepIdx, note, instrument, fx, fxParam, fxb, fxbParam,
    });
  }

  // ========== IsolationCapableEngine interface ==========

  isAvailable(): boolean {
    return this.workletNode !== null && !this._disposed;
  }

  getWorkletNode(): AudioWorkletNode | null {
    return this.workletNode;
  }

  getAudioContext(): AudioContext | null {
    try {
      return (getDevilboxAudioContext() as any)?.rawContext ?? null;
    } catch { return null; }
  }

  addIsolation(slotIndex: number, channelMask: number): void {
    if (!this.workletNode || slotIndex < 0 || slotIndex >= HivelyEngine.MAX_ISOLATION_SLOTS) return;
    this._isolationSlotMasks[slotIndex] = channelMask;
    this.workletNode.port.postMessage({ type: 'addIsolation', slotIndex, channelMask });
    console.log(`[HivelyEngine] addIsolation: slot=${slotIndex}, mask=0x${channelMask.toString(16)}`);
  }

  removeIsolation(slotIndex: number): void {
    if (!this.workletNode || slotIndex < 0 || slotIndex >= HivelyEngine.MAX_ISOLATION_SLOTS) return;
    this._isolationSlotMasks[slotIndex] = null;
    this.workletNode.port.postMessage({ type: 'removeIsolation', slotIndex });
  }

  diagIsolation(): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'diagIsolation' });
  }

  override dispose(): void {
    for (let i = 0; i < HivelyEngine.MAX_ISOLATION_SLOTS; i++) {
      if (this._isolationSlotMasks[i] !== null) this.removeIsolation(i);
    }
    this._isolationSlotMasks.fill(null);
    super.dispose();
    this._positionCallbacks.clear();
    this._songEndCallbacks.clear();
    if (HivelyEngine.instance === this) {
      HivelyEngine.instance = null;
    }
    const g = globalThis as { __devilboxActiveHivelyEngine?: HivelyEngine | null };
    if (g.__devilboxActiveHivelyEngine === this) {
      g.__devilboxActiveHivelyEngine = null;
    }
  }
}

// Register with the per-channel isolation system (hively editor mode)
registerIsolationEngineResolver(async () => {
  if (HivelyEngine.hasInstance()) {
    const engine = HivelyEngine.getInstance();
    if (engine.isAvailable()) return engine;
  }
  return null;
}, 'hively');
