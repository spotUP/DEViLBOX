/**
 * AdPlugPlayer — Plays OPL/AdLib music via AdPlug WASM
 *
 * Streaming audio player for 50+ OPL formats (RAD, ROL, CMF, DRO, IMF, A2M, etc.)
 * Uses the AdPlug C++ library compiled to WASM with Nuked OPL3 emulation.
 */

import { getDevilboxAudioContext } from '@utils/audio-context';
import { getToneEngine } from '@/engine/ToneEngine';

export interface AdPlugMetadata {
  title: string;
  formatType: string;
  subsongs: number;
  instruments: string[];
}

export class AdPlugPlayer {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private processNode: AudioWorkletNode | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private initError: string | null = null;

  public meta: AdPlugMetadata | null = null;
  public playing = false;

  /** Position callback — called ~15fps from the worklet with (order, row). */
  public onPosition: ((order: number, row: number) => void) | null = null;

  /** Called when the song ends (all patterns played). */
  public onEnded: (() => void) | null = null;

  constructor() {}

  private async ensureInitialized(): Promise<boolean> {
    if (this.initialized) return true;
    if (this.initError) return false;

    if (this.initPromise) {
      await this.initPromise;
      return this.initialized;
    }

    this.initPromise = this.initWorklet();
    await this.initPromise;
    return this.initialized;
  }

  private async initWorklet(): Promise<void> {
    try {
      try {
        this.context = getDevilboxAudioContext();
      } catch {
        this.context = new AudioContext({ sampleRate: 48000 });
      }

      if (this.context.state === 'suspended') {
        await this.context.resume();
      }

      this.gain = this.context.createGain();
      this.gain.gain.value = 1;

      const baseUrl = import.meta.env.BASE_URL || '/';
      const cb = `?v=${Date.now()}`;

      const [wasmResponse, jsResponse] = await Promise.all([
        fetch(`${baseUrl}adplug/AdPlugPlayer.wasm${cb}`),
        fetch(`${baseUrl}adplug/AdPlugPlayer.js${cb}`),
      ]);

      if (!wasmResponse.ok) throw new Error(`Failed to load AdPlugPlayer.wasm: ${wasmResponse.status}`);
      if (!jsResponse.ok) throw new Error(`Failed to load AdPlugPlayer.js: ${jsResponse.status}`);

      const [wasmBinary, jsCode] = await Promise.all([
        wasmResponse.arrayBuffer(),
        jsResponse.text(),
      ]);

      await this.context.audioWorklet.addModule(`${baseUrl}adplug/AdPlugPlayer.worklet.js${cb}`);

      this.processNode = new AudioWorkletNode(this.context, 'adplug-player-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });

      this.processNode.port.onmessage = this.handleMessage.bind(this);

      this.processNode.port.postMessage({
        type: 'init',
        sampleRate: this.context.sampleRate,
        wasmBinary,
        jsCode,
      }, [wasmBinary]);

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('AdPlug initialization timeout')), 10000);

        const handler = (msg: MessageEvent) => {
          if (msg.data.type === 'initialized') {
            clearTimeout(timeout);
            this.processNode!.port.removeEventListener('message', handler);
            resolve();
          } else if (msg.data.type === 'error') {
            clearTimeout(timeout);
            this.processNode!.port.removeEventListener('message', handler);
            reject(new Error(msg.data.error));
          }
        };

        this.processNode!.port.addEventListener('message', handler);
      });

      this.processNode.connect(this.gain);

      // Route through ToneEngine's master mixer so audio goes through the
      // master effects chain, limiter, and is visible to AudioDataBus analyser.
      try {
        const engine = getToneEngine();
        const masterInput = (engine.masterEffectsInput as any).input as AudioNode;
        if (masterInput) {
          this.gain.connect(masterInput);
        } else {
          this.gain.connect(this.context.destination);
        }
      } catch {
        this.gain.connect(this.context.destination);
      }
      this.initialized = true;
      console.log('[AdPlugPlayer] Initialized');
    } catch (err) {
      this.initError = err instanceof Error ? err.message : String(err);
      console.error('[AdPlugPlayer] Init failed:', this.initError);
    }
  }

  private handleMessage(msg: MessageEvent) {
    const data = msg.data;
    switch (data.type) {
      case 'loaded':
        this.meta = {
          title: data.title,
          formatType: data.formatType,
          subsongs: data.subsongs,
          instruments: data.instruments,
        };
        // Don't set this.playing here — it's set in load() based on autoPlay
        console.log(`[AdPlugPlayer] Loaded: "${data.title}" (${data.formatType}), ${data.subsongs} subsong(s), ${data.instruments.length} instruments`);
        break;
      case 'position':
        this.onPosition?.(data.order, data.row);
        break;
      case 'ended':
        this.playing = false;
        this.onEnded?.();
        break;
      case 'error':
        console.error('[AdPlugPlayer] Error:', data.error);
        break;
    }
  }

  /**
   * Load a file from an ArrayBuffer.
   * @param buffer Raw file data
   * @param filename Filename with extension (used for format detection)
   * @param companions Optional companion files (e.g. patch.003 for SCI)
   * @param autoPlay If false, load but don't start playback (default: true)
   * @param ticksPerRow Optional ticks-per-row for tick-based position tracking (capture formats)
   * @returns true if loaded successfully
   */
  async load(buffer: ArrayBuffer, filename: string, companions?: Array<{ name: string; data: Uint8Array }>, autoPlay = true, ticksPerRow?: number): Promise<boolean> {
    const ok = await this.ensureInitialized();
    if (!ok || !this.processNode) return false;

    // Only restore gain if auto-playing; otherwise zero gain until explicit play()
    if (this.gain) {
      this.gain.gain.value = autoPlay ? 1 : 0;
    }

    return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => resolve(false), 10000);

      const handler = (msg: MessageEvent) => {
        if (msg.data.type === 'loaded') {
          clearTimeout(timeout);
          this.processNode!.port.removeEventListener('message', handler);
          if (autoPlay) this.playing = true;
          resolve(true);
        } else if (msg.data.type === 'error') {
          clearTimeout(timeout);
          this.processNode!.port.removeEventListener('message', handler);
          resolve(false);
        }
      };

      this.processNode!.port.addEventListener('message', handler);

      const data = new Uint8Array(buffer);
      this.processNode!.port.postMessage({ type: 'load', data, filename, companions: companions || [], autoPlay, ticksPerRow: ticksPerRow || 0 });
    });
  }

  play() {
    this.playing = true;
    if (this.processNode) {
      this.processNode.port.postMessage({ type: 'play' });
    }
    if (this.gain) {
      this.gain.gain.value = 1;
    }
  }

  stop() {
    this.playing = false;
    if (this.processNode) {
      this.processNode.port.postMessage({ type: 'stop' });
    }
    if (this.gain) {
      this.gain.gain.value = 0;
    }
  }

  rewind(subsong = 0) {
    if (this.processNode) {
      this.processNode.port.postMessage({ type: 'rewind', subsong });
    }
  }

  setVolume(vol: number) {
    if (this.gain) this.gain.gain.value = Math.max(0, Math.min(1, vol));
  }

  destroy() {
    this.stop();
    if (this.processNode) {
      this.processNode.disconnect();
      this.processNode = null;
    }
    if (this.gain) {
      this.gain.disconnect();
      this.gain = null;
    }
    this.initialized = false;
    this.initPromise = null;
    this.initError = null;
  }
}

// Singleton instance
let adplugInstance: AdPlugPlayer | null = null;

export function getAdPlugPlayer(): AdPlugPlayer {
  if (!adplugInstance) {
    adplugInstance = new AdPlugPlayer();
  }
  return adplugInstance;
}
