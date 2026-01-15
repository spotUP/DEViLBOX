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
  private context: AudioContext;
  private gain: GainNode;
  private processNode: AudioWorkletNode | null = null;
  private config: ChiptuneConfig;
  private handlers: Map<string, EventHandler<any>[]> = new Map();
  private initialized = false;

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

    this.context = new AudioContext();
    this.gain = this.context.createGain();
    this.gain.gain.value = 1;

    this.initWorklet();
  }

  private async initWorklet() {
    try {
      // Load worklet from public folder
      await this.context.audioWorklet.addModule('/chiptune3/chiptune3.worklet.js');

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
      console.error('[ChiptunePlayer] Failed to initialize worklet:', error);
      this.fireEvent('onError', { type: 'init' });
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
    } else {
      this.addHandler('onInitialized', handler);
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
  play(buffer: ArrayBuffer): void {
    if (!this.processNode) {
      console.error('[ChiptunePlayer] Not initialized');
      return;
    }
    // Resume context if suspended (required by browsers)
    if (this.context.state === 'suspended') {
      this.context.resume();
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
    this.gain.gain.value = volume;
  }

  setPos(seconds: number): void {
    this.processNode?.port.postMessage({ cmd: 'setPos', val: seconds });
  }

  setRepeatCount(count: number): void {
    this.processNode?.port.postMessage({ cmd: 'repeatCount', val: count });
  }
}
