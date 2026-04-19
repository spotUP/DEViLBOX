/**
 * StartrekkerAMEngine.ts — Singleton WASM engine for StarTrekker AM replayer.
 *
 * Follows the ArtOfNoiseEngine pattern: WASM binary and JS are fetched on the
 * main thread and sent to the AudioWorklet via 'init' message (no fetch in worklet).
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

export class StartrekkerAMEngine extends WASMSingletonBase {
  private static instance: StartrekkerAMEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  // Per-channel voice state: { instrumentId, samplePosition (0-1) }
  private _voiceState: Array<{ instr: number; pos: number }> = [
    { instr: 0, pos: 0 }, { instr: 0, pos: 0 },
    { instr: 0, pos: 0 }, { instr: 0, pos: 0 },
  ];
  private _voiceListeners: Set<(voices: Array<{ instr: number; pos: number }>) => void> = new Set();

  private constructor() {
    super();
    this.initialize(StartrekkerAMEngine.cache);
  }

  static getInstance(): StartrekkerAMEngine {
    // AudioContext-swap guard (see JamCrackerEngine:48-63 for the reference).
    // Without this, the engine stays attached to a dead context on HMR /
    // iOS suspend / page reload and goes silent with no error.
    const currentCtx = getDevilboxAudioContext();
    if (
      !StartrekkerAMEngine.instance ||
      StartrekkerAMEngine.instance._disposed ||
      StartrekkerAMEngine.instance.audioContext !== currentCtx
    ) {
      if (StartrekkerAMEngine.instance && !StartrekkerAMEngine.instance._disposed) {
        StartrekkerAMEngine.instance.dispose();
      }
      StartrekkerAMEngine.instance = new StartrekkerAMEngine();
    }
    return StartrekkerAMEngine.instance;
  }

  static hasInstance(): boolean {
    return !!StartrekkerAMEngine.instance && !StartrekkerAMEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'startrekker-am',
      workletFile: 'StartrekkerAM.worklet.js',
      wasmFile: 'StartrekkerAM.wasm',
      jsFile: 'StartrekkerAM.js',
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;

    this.workletNode = new AudioWorkletNode(ctx, 'startrekker-am-processor', {
      outputChannelCount: [2],
      numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data as { type: string; [k: string]: unknown };
      switch (data.type) {
        case 'ready':
          console.log('[StartrekkerAMEngine] WASM ready');
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;
        case 'loaded':
          console.log('[StartrekkerAMEngine] Module loaded:', data.title);
          break;
        case 'modLoaded':
          console.log('[StartrekkerAMEngine] MOD file loaded, waiting for NT');
          break;
        case 'error':
          console.error('[StartrekkerAMEngine] Error:', data.msg);
          break;
        case 'voiceState': {
          const voices = data.voices as Array<{ instr: number; pos: number }>;
          if (voices) {
            this._voiceState = voices;
            for (const cb of this._voiceListeners) cb(voices);
          }
          break;
        }
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: ctx.sampleRate,
      wasmBinary: StartrekkerAMEngine.cache.wasmBinary,
      jsCode: StartrekkerAMEngine.cache.jsCode,
    });

    this.workletNode.connect(this.output);
  }

  /**
   * Load a StarTrekker AM module.
   * @param modData  The .mod / .adsc file bytes
   * @param ntData   The .nt companion file bytes (optional)
   */
  async loadTune(modData: ArrayBuffer, ntData?: ArrayBuffer | null): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('StartrekkerAMEngine not initialized');

    if (ntData && ntData.byteLength > 0) {
      // Two-file path: send MOD first, then NT
      this.workletNode.port.postMessage(
        { type: 'loadMod', data: modData.slice(0) },
        [modData.slice(0)]
      );
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      this.workletNode.port.postMessage(
        { type: 'loadNt', data: ntData.slice(0) },
        [ntData.slice(0)]
      );
    } else {
      // Single-file path: MOD only
      const copy = modData.slice(0);
      this.workletNode.port.postMessage({ type: 'load', data: copy }, [copy]);
    }
  }

  play(): void {
    // StarTrekker AM starts playing immediately on load — no explicit play needed
  }

  stop(): void {
    this.workletNode?.port.postMessage({ type: 'stop' });
  }

  pause(): void {
    this.workletNode?.port.postMessage({ type: 'stop' });
  }

  setChannelGain(channel: number, gain: number): void {
    this.workletNode?.port.postMessage({ type: 'setChannelGain', channel, gain });
  }

  /** Write a 4-byte ProTracker pattern cell. Takes effect on next row read. */
  setPatternCell(pattern: number, row: number, channel: number, b0: number, b1: number, b2: number, b3: number): void {
    this.workletNode?.port.postMessage({ type: 'setPatternCell', pattern, row, channel, b0, b1, b2, b3 });
  }

  /** Write a 16-bit NT instrument parameter. Takes effect immediately during playback. */
  setNtParam(instr: number, offset: number, value: number): void {
    this.workletNode?.port.postMessage({ type: 'setNtParam', instr, offset, value: value & 0xFFFF });
  }

  /** Get current voice state snapshot */
  getVoiceState(): Array<{ instr: number; pos: number }> {
    return this._voiceState;
  }

  /** Subscribe to voice state updates (~15 Hz). Returns unsubscribe function. */
  onVoiceState(cb: (voices: Array<{ instr: number; pos: number }>) => void): () => void {
    this._voiceListeners.add(cb);
    return () => this._voiceListeners.delete(cb);
  }

  /** Get playback position (0-1) for a specific instrument across all channels.
   *  Returns the max position if the instrument is active on multiple channels, or -1 if not playing. */
  getInstrumentPosition(instrumentId: number): number {
    let maxPos = -1;
    for (const v of this._voiceState) {
      if (v.instr === instrumentId && v.pos >= 0) {
        if (v.pos > maxPos) maxPos = v.pos;
      }
    }
    return maxPos;
  }

  /** Set per-channel mute mask. Bit N=1 means channel N is active, 0=muted. */
  setMuteMask(mask: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'setMuteMask', mask });
  }

  override dispose(): void {
    // Custom shutdown (stop message, not dispose) preserved from original.
    this._disposed = true;
    this._voiceListeners.clear();
    try { this.workletNode?.port.postMessage({ type: 'stop' }); } catch { /* */ }
    try { this.workletNode?.disconnect(); } catch { /* */ }
    this.workletNode = null;
    if (StartrekkerAMEngine.instance === this) {
      StartrekkerAMEngine.instance = null;
    }
  }
}
