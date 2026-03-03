/**
 * GTUltraEngine — TypeScript wrapper for GoatTracker Ultra WASM engine.
 *
 * Manages AudioWorklet lifecycle, WASM loading, and provides the
 * main-thread API for the tracker UI to interact with the engine.
 */

import { preprocessEmscriptenJS } from '../mame/mame-wasm-loader';

// Cache fetched WASM+JS across instances
let modulePromise: Promise<{ wasmBinary: ArrayBuffer; jsCode: string }> | null = null;
const workletLoaded = new WeakSet<AudioContext>();
const CACHE_BUST = `?t=${Date.now()}`;

export interface GTUltraPosition {
  row: number;
  pos: number;
}

export interface GTUltraCallbacks {
  onReady?: () => void;
  onError?: (error: string) => void;
  onSongLoaded?: (ok: boolean) => void;
  onPosition?: (pos: GTUltraPosition) => void;
  onAsidWrite?: (chip: number, reg: number, value: number) => void;
}

export class GTUltraEngine {
  private context: AudioContext;
  private workletNode: AudioWorkletNode | null = null;
  private outputNode: GainNode;
  private callbacks: GTUltraCallbacks;
  private readyResolve: (() => void) | null = null;
  private readyPromise: Promise<void>;
  private disposed = false;

  constructor(context: AudioContext, callbacks: GTUltraCallbacks = {}) {
    this.context = context;
    this.callbacks = callbacks;
    this.outputNode = context.createGain();
    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve;
    });
  }

  get output(): GainNode {
    return this.outputNode;
  }

  get ready(): Promise<void> {
    return this.readyPromise;
  }

  async init(sidModel: number = 0): Promise<void> {
    const baseUrl = import.meta.env.BASE_URL || '/';

    // Load worklet module (once per context)
    if (!workletLoaded.has(this.context)) {
      await this.context.audioWorklet.addModule(
        `${baseUrl}gtultra/GTUltra.worklet.js${CACHE_BUST}`
      );
      workletLoaded.add(this.context);
    }

    // Fetch WASM + JS (cached)
    if (!modulePromise) {
      modulePromise = (async () => {
        const [wasmResp, jsResp] = await Promise.all([
          fetch(`${baseUrl}gtultra/GTUltra.wasm`),
          fetch(`${baseUrl}gtultra/GTUltra.js`),
        ]);
        if (!wasmResp.ok) throw new Error(`Failed to load GTUltra.wasm: ${wasmResp.status}`);
        if (!jsResp.ok) throw new Error(`Failed to load GTUltra.js: ${jsResp.status}`);

        const [wasmBinary, jsCodeRaw] = await Promise.all([
          wasmResp.arrayBuffer(),
          jsResp.text(),
        ]);
        const jsCode = preprocessEmscriptenJS(jsCodeRaw, `${baseUrl}gtultra/`);
        return { wasmBinary, jsCode };
      })();
    }

    const { wasmBinary, jsCode } = await modulePromise;

    // Create worklet node
    this.workletNode = new AudioWorkletNode(this.context, 'gtultra-processor', {
      outputChannelCount: [2],
      numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (e) => this.handleMessage(e.data);
    this.workletNode.connect(this.outputNode);

    // Keepalive — ensures process() runs even when idle
    const keepalive = this.context.createGain();
    keepalive.gain.value = 0;
    this.workletNode.connect(keepalive);
    keepalive.connect(this.context.destination);

    // Send init with WASM binary
    this.workletNode.port.postMessage(
      { type: 'init', wasmBinary, jsCode, sidModel },
      [wasmBinary]
    );
  }

  private handleMessage(msg: Record<string, unknown>): void {
    switch (msg.type) {
      case 'ready':
        this.readyResolve?.();
        this.callbacks.onReady?.();
        break;
      case 'error':
        this.callbacks.onError?.(msg.error as string);
        break;
      case 'songLoaded':
        this.callbacks.onSongLoaded?.(msg.ok as boolean);
        break;
      case 'position':
        this.callbacks.onPosition?.(msg as unknown as GTUltraPosition);
        break;
      case 'asid':
        this.callbacks.onAsidWrite?.(
          msg.chip as number,
          msg.reg as number,
          msg.value as number
        );
        break;
      case 'songCleared':
        break;
    }
  }

  private post(msg: Record<string, unknown>): void {
    this.workletNode?.port.postMessage(msg);
  }

  // --- Song I/O ---

  loadSong(data: ArrayBuffer): void {
    this.post({ type: 'loadSng', data });
  }

  newSong(): void {
    this.post({ type: 'newSong' });
  }

  // --- Playback ---

  play(songNum = 0, fromPos = 0, fromRow = 0): void {
    this.post({ type: 'play', songNum, fromPos, fromRow });
  }

  stop(): void {
    this.post({ type: 'stop' });
  }

  // --- Jam mode ---

  jamNoteOn(channel: number, note: number, instrument: number): void {
    this.post({ type: 'jamNoteOn', channel, note, instrument });
  }

  jamNoteOff(channel: number): void {
    this.post({ type: 'jamNoteOff', channel });
  }

  // --- Configuration ---

  setSidModel(model: number): void {
    this.post({ type: 'setSidModel', model });
  }

  setSidCount(count: number): void {
    this.post({ type: 'setSidCount', count });
  }

  enableAsid(enabled: boolean): void {
    this.post({ type: 'enableAsid', enabled });
  }

  // --- Lifecycle ---

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    this.outputNode.disconnect();
  }
}
