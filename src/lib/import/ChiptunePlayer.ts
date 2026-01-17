/**
 * ChiptunePlayer - Custom wrapper for chiptune3 that handles Vite's bundling
 * Loads worklet from public folder to avoid import.meta.url issues
 */

export interface ChiptuneMetadata {
  dur: number;
  title?: string;
  type?: string;
  message?: string;
  song?: {
    channels: string[];
    instruments: string[];
    samples: string[];
    orders: { name: string; pat: number }[];
    patterns: {
      name: string;
      rows: number[][][];
    }[];
    numSubsongs: number;
  };
  [key: string]: unknown;
}

interface ChiptuneConfig {
  repeatCount?: number;
  stereoSeparation?: number;
  interpolationFilter?: number;
}

type EventHandler<T = void> = (data: T) => void;

export class ChiptunePlayer {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private processNode: AudioWorkletNode | null = null;
  private config: ChiptuneConfig;
  private handlers: Map<string, EventHandler<any>[]> = new Map();
  private initialized = false;
  private initError: string | null = null;
  private initPromise: Promise<void> | null = null;

  public meta: ChiptuneMetadata | null = null;
  public duration = 0;
  public currentTime = 0;
  public order = 0;
  public pattern = 0;
  public row = 0;

  constructor(config: ChiptuneConfig = {}) {
    this.config = {
      repeatCount: -1,
      stereoSeparation: 100,
      interpolationFilter: 0,
      ...config,
    };

    // Lazy initialization - don't create AudioContext until needed
    // This prevents errors on browsers/configs where worklet loading fails
  }

  /**
   * Initialize the audio context and worklet (lazy, called on first use)
   */
  private async ensureInitialized(): Promise<boolean> {
    // Already initialized
    if (this.initialized) return true;

    // Already failed
    if (this.initError) return false;

    // Already initializing - wait for it
    if (this.initPromise) {
      await this.initPromise;
      return this.initialized;
    }

    // Start initialization
    this.initPromise = this.initWorklet();
    await this.initPromise;
    return this.initialized;
  }

  private async initWorklet(): Promise<void> {
    try {
      this.context = new AudioContext();
      this.gain = this.context.createGain();
      this.gain.gain.value = 1;

      // Load worklet from public folder (use BASE_URL for proper path in dev/prod)
      const baseUrl = import.meta.env.BASE_URL || '/';
      await this.context.audioWorklet.addModule(`${baseUrl}chiptune3/chiptune3.worklet.js`);

      this.processNode = new AudioWorkletNode(this.context, 'libopenmpt-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });

      this.processNode.port.onmessage = this.handleMessage.bind(this);
      this.processNode.port.postMessage({ cmd: 'config', val: this.config });

      // Audio routing
      this.processNode.connect(this.gain);
      this.gain.connect(this.context.destination);

      this.initialized = true;
      this.fireEvent('onInitialized');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.initError = errorMessage;
      console.warn('[ChiptunePlayer] Failed to initialize worklet:', errorMessage);
      console.warn('[ChiptunePlayer] Module file import (.mod, .xm, .it, etc.) will not be available.');
      this.fireEvent('onError', { type: 'init', message: errorMessage });
    }
  }

  private handleMessage(msg: MessageEvent) {
    const { cmd, meta, pos, order, pattern, row, val } = msg.data;

    switch (cmd) {
      case 'meta':
        this.meta = meta;
        this.duration = meta?.dur || 0;
        this.fireEvent('onMetadata', meta);
        break;
      case 'pos':
        this.currentTime = pos;
        this.order = order;
        this.pattern = pattern;
        this.row = row;
        this.fireEvent('onProgress', msg.data);
        break;
      case 'end':
        this.fireEvent('onEnded');
        break;
      case 'err':
        this.fireEvent('onError', { type: val });
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
    this.handlers.get(eventName)!.push(handler);
  }

  // Event handlers
  onInitialized(handler: EventHandler): void {
    if (this.initialized) {
      handler();
    } else if (this.initError) {
      // Already failed - fire error handler instead
      this.fireEvent('onError', { type: 'init', message: this.initError });
    } else {
      this.addHandler('onInitialized', handler);
      // Trigger lazy initialization
      this.ensureInitialized();
    }
  }

  onEnded(handler: EventHandler): void {
    this.addHandler('onEnded', handler);
  }

  onError(handler: EventHandler<{ type: string }>): void {
    this.addHandler('onError', handler);
  }

  onMetadata(handler: EventHandler<ChiptuneMetadata>): void {
    this.addHandler('onMetadata', handler);
  }

  onProgress(handler: EventHandler<{ pos: number; order: number; pattern: number; row: number }>): void {
    this.addHandler('onProgress', handler);
  }

  // Playback controls
  async play(buffer: ArrayBuffer): Promise<void> {
    const ready = await this.ensureInitialized();
    if (!ready || !this.processNode || !this.context) {
      console.error('[ChiptunePlayer] Not initialized - worklet loading failed');
      this.fireEvent('onError', { type: 'not_initialized' });
      return;
    }
    // Resume context if suspended (required by browsers)
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
    this.processNode.port.postMessage({ cmd: 'play', val: buffer });
  }

  stop(): void {
    this.processNode?.port.postMessage({ cmd: 'stop' });
  }

  pause(): void {
    this.processNode?.port.postMessage({ cmd: 'pause' });
  }

  unpause(): void {
    this.processNode?.port.postMessage({ cmd: 'unpause' });
  }

  setVol(volume: number): void {
    if (this.gain) {
      this.gain.gain.value = volume;
    }
  }

  setPos(seconds: number): void {
    this.processNode?.port.postMessage({ cmd: 'setPos', val: seconds });
  }

  setRepeatCount(count: number): void {
    this.processNode?.port.postMessage({ cmd: 'repeatCount', val: count });
  }

  /**
   * Check if player is available (worklet loaded successfully)
   */
  isAvailable(): boolean {
    return this.initialized && !this.initError;
  }

  /**
   * Get the initialization error if any
   */
  getInitError(): string | null {
    return this.initError;
  }
}
