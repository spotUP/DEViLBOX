/**
 * V2MPlayer - Plays Farbrausch V2 Synthesizer Music files (.v2m)
 * 
 * V2M is a demoscene music format used by the V2 synthesizer.
 * This player uses the jgilje v2m-player WASM module.
 */

import { getDevilboxAudioContext } from '@utils/audio-context';

export interface V2MMetadata {
  lengthSeconds: number;
}

type EventHandler<T = void> = (data: T) => void;

export class V2MPlayer {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private processNode: AudioWorkletNode | null = null;
  private handlers: Map<string, Array<(data?: unknown) => void>> = new Map();
  private initialized = false;
  private initError: string | null = null;
  private initPromise: Promise<void> | null = null;

  public meta: V2MMetadata | null = null;
  public duration = 0;
  public currentTime = 0;
  public playing = false;

  constructor() {
    // Lazy initialization
  }

  /**
   * Initialize the audio context and worklet (lazy, called on first use)
   */
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
      // Use the shared ToneEngine AudioContext
      try {
        this.context = getDevilboxAudioContext();
        console.log('[V2MPlayer] Using shared ToneEngine AudioContext');
      } catch {
        this.context = new AudioContext({ sampleRate: 44100 });
        console.log('[V2MPlayer] Created standalone AudioContext');
      }

      // Ensure context is running
      if (this.context.state === 'suspended') {
        await this.context.resume();
      }

      this.gain = this.context.createGain();
      this.gain.gain.value = 1;

      // Load WASM and JS
      const baseUrl = import.meta.env.BASE_URL || '/';
      const cacheBuster = `?v=${Date.now()}`;
      
      const [wasmResponse, jsResponse] = await Promise.all([
        fetch(`${baseUrl}V2MPlayer.wasm${cacheBuster}`),
        fetch(`${baseUrl}V2MPlayer.js${cacheBuster}`),
      ]);

      if (!wasmResponse.ok) {
        throw new Error(`Failed to load V2MPlayer.wasm: ${wasmResponse.status}`);
      }
      if (!jsResponse.ok) {
        throw new Error(`Failed to load V2MPlayer.js: ${jsResponse.status}`);
      }

      const [wasmBinary, jsCode] = await Promise.all([
        wasmResponse.arrayBuffer(),
        jsResponse.text(),
      ]);

      // Load worklet
      await this.context.audioWorklet.addModule(`${baseUrl}V2MPlayer.worklet.js${cacheBuster}`);

      this.processNode = new AudioWorkletNode(this.context, 'v2m-player-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });

      this.processNode.port.onmessage = this.handleMessage.bind(this);

      // Send WASM module to worklet
      this.processNode.port.postMessage({
        type: 'init',
        sampleRate: this.context.sampleRate,
        wasmBinary,
        jsCode,
      }, [wasmBinary]); // Transfer ownership

      // Wait for initialization confirmation
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('V2MPlayer initialization timeout'));
        }, 10000);

        const initHandler = (msg: MessageEvent) => {
          if (msg.data.type === 'initialized') {
            clearTimeout(timeout);
            this.processNode!.port.removeEventListener('message', initHandler);
            resolve();
          } else if (msg.data.type === 'error') {
            clearTimeout(timeout);
            this.processNode!.port.removeEventListener('message', initHandler);
            reject(new Error(msg.data.error));
          }
        };
        this.processNode!.port.addEventListener('message', initHandler);
      });

      // Audio routing
      this.processNode.connect(this.gain);
      this.gain.connect(this.context.destination);

      this.initialized = true;
      this.fireEvent('onInitialized');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.initError = errorMessage;
      console.warn('[V2MPlayer] Failed to initialize:', errorMessage);
      this.fireEvent('onError', { type: 'init', message: errorMessage });
    }
  }

  private handleMessage(msg: MessageEvent) {
    const { type, lengthSeconds, error } = msg.data;

    switch (type) {
      case 'loaded':
        this.meta = { lengthSeconds };
        this.duration = lengthSeconds;
        this.fireEvent('onMetadata', this.meta);
        break;
      case 'playing':
        this.playing = true;
        break;
      case 'stopped':
        this.playing = false;
        break;
      case 'finished':
        this.playing = false;
        this.fireEvent('onEnded');
        break;
      case 'error':
        this.fireEvent('onError', { type: 'playback', message: error });
        break;
    }
  }

  private fireEvent<T>(eventName: string, data?: T) {
    const handlers = this.handlers.get(eventName);
    if (handlers) {
      handlers.forEach((handler) => handler(data));
    }
  }

  private addHandler<T>(eventName: string, handler: EventHandler<T>) {
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, []);
    }
    this.handlers.get(eventName)!.push(handler as (data?: unknown) => void);
  }

  // Event handlers
  onInitialized(handler: EventHandler): void {
    if (this.initialized) {
      handler();
    } else if (this.initError) {
      this.fireEvent('onError', { type: 'init', message: this.initError });
    } else {
      this.addHandler('onInitialized', handler);
      this.ensureInitialized();
    }
  }

  onEnded(handler: EventHandler): void {
    this.addHandler('onEnded', handler);
  }

  onError(handler: EventHandler<{ type: string; message?: string }>): void {
    this.addHandler('onError', handler);
  }

  onMetadata(handler: EventHandler<V2MMetadata>): void {
    this.addHandler('onMetadata', handler);
  }

  // Playback controls
  async play(buffer: ArrayBuffer): Promise<void> {
    const ready = await this.ensureInitialized();
    if (!ready || !this.processNode || !this.context) {
      console.error('[V2MPlayer] Not initialized');
      this.fireEvent('onError', { type: 'not_initialized' });
      return;
    }

    // Resume context if suspended
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }

    // Load and play
    this.processNode.port.postMessage({
      type: 'load',
      data: new Uint8Array(buffer),
    });

    // Start playback after load completes
    await new Promise<void>((resolve) => {
      const loadHandler = (msg: MessageEvent) => {
        if (msg.data.type === 'loaded' || msg.data.type === 'error') {
          this.processNode!.port.removeEventListener('message', loadHandler);
          resolve();
        }
      };
      this.processNode!.port.addEventListener('message', loadHandler);
    });

    this.processNode.port.postMessage({ type: 'play', timeMs: 0 });
    this.playing = true;
  }

  stop(): void {
    this.processNode?.port.postMessage({ type: 'stop', fadeMs: 0 });
    this.playing = false;
  }

  pause(): void {
    // V2M doesn't have native pause - we stop
    this.stop();
  }

  unpause(): void {
    // Resume from beginning (V2M limitation)
    this.processNode?.port.postMessage({ type: 'play', timeMs: 0 });
    this.playing = true;
  }

  setVol(volume: number): void {
    if (this.gain) {
      this.gain.gain.value = volume;
    }
  }

  setPos(seconds: number): void {
    this.processNode?.port.postMessage({ type: 'seek', timeMs: seconds * 1000 });
  }

  isAvailable(): boolean {
    return this.initialized && !this.initError;
  }

  async cleanup(): Promise<void> {
    if (this.processNode) {
      this.processNode.disconnect();
      this.processNode = null;
    }
    if (this.gain) {
      this.gain.disconnect();
      this.gain = null;
    }
    this.initialized = false;
    this.playing = false;
  }
}

// Singleton instance for playback
let playerInstance: V2MPlayer | null = null;

export function getV2MPlayer(): V2MPlayer {
  if (!playerInstance) {
    playerInstance = new V2MPlayer();
  }
  return playerInstance;
}
