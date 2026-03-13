/**
 * LibopenmptEngine — Singleton WASM engine for MOD/XM/IT/S3M playback via libopenmpt.
 *
 * Uses the chiptune3 AudioWorklet (public/chiptune3/chiptune3.worklet.js) which
 * wraps libopenmpt's C API compiled to WASM. Reports order/pattern/row position
 * so the pattern editor follows playback.
 *
 * Falls back gracefully: if the worklet fails to load, callers can detect via
 * isAvailable() and let ToneEngine handle note-by-note playback instead.
 */

import { getDevilboxAudioContext } from '@utils/audio-context';
import { getToneEngine } from '@engine/ToneEngine';

// ---------------------------------------------------------------------------
// Position callback type
// ---------------------------------------------------------------------------

export type LibopenmptPositionCallback = (order: number, pattern: number, row: number, audioTime?: number) => void;

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class LibopenmptEngine {
  private static instance: LibopenmptEngine | null = null;

  private context: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private gainNode: GainNode | null = null;
  private _ready = false;
  private _available = false;
  private _initPromise: Promise<void> | null = null;
  private _playing = false;
  private _onPosition: LibopenmptPositionCallback | null = null;
  private _onEnded: (() => void) | null = null;

  /** The raw Web Audio output node for routing into the stereo separation chain */
  public output!: GainNode;

  private constructor() {}

  static getInstance(): LibopenmptEngine {
    if (!LibopenmptEngine.instance) {
      LibopenmptEngine.instance = new LibopenmptEngine();
    }
    return LibopenmptEngine.instance;
  }

  static hasInstance(): boolean {
    return LibopenmptEngine.instance !== null;
  }

  /** Wait until the worklet is loaded and ready. */
  async ready(): Promise<void> {
    if (this._ready) return;
    if (this._initPromise) return this._initPromise;
    this._initPromise = this.init();
    return this._initPromise;
  }

  /** Whether libopenmpt worklet loaded successfully. */
  isAvailable(): boolean {
    return this._available;
  }

  private async init(): Promise<void> {
    try {
      this.context = getDevilboxAudioContext();
    } catch {
      this.context = new AudioContext();
    }

    if (this.context.state === 'suspended') {
      await this.context.resume();
    }

    this.gainNode = this.context.createGain();
    this.gainNode.gain.value = 1;
    this.output = this.gainNode;

    const baseUrl = import.meta.env.BASE_URL || '/';
    try {
      await this.context.audioWorklet.addModule(`${baseUrl}chiptune3/chiptune3.worklet.js`);
    } catch (err) {
      console.warn('[LibopenmptEngine] Failed to load worklet:', err);
      this._ready = true;
      this._available = false;
      return;
    }

    this.workletNode = new AudioWorkletNode(this.context, 'libopenmpt-processor', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

    this.workletNode.port.onmessage = this.handleMessage.bind(this);

    // Configure: repeat forever, 100% stereo separation, sinc interpolation
    this.workletNode.port.postMessage({
      cmd: 'config',
      val: { repeatCount: -1, stereoSeparation: 100, interpolationFilter: 0 },
    });

    this.workletNode.connect(this.gainNode);

    this._ready = true;
    this._available = true;
    console.log('[LibopenmptEngine] Ready');
  }

  private handleMessage(msg: MessageEvent): void {
    const { cmd, order, pattern, row, chLevels, audioTime } = msg.data;
    switch (cmd) {
      case 'pos':
        this._onPosition?.(order, pattern, row, audioTime);
        if (chLevels) {
          try {
            const engine = getToneEngine();
            // Update trigger meters only for significant level increases (note-on events)
            // This prevents constant small values from resetting the decay
            for (let i = 0; i < chLevels.length; i++) {
              // Only trigger if level is above noise floor threshold
              if (chLevels[i] > 0.05) {
                engine.triggerChannelMeter(i, chLevels[i]);
              }
            }
            // Always update realtime levels for realtime VU mode
            engine.updateRealtimeChannelLevels(chLevels);
          } catch { /* ToneEngine not ready */ }
        }
        break;
      case 'end':
        this._playing = false;
        this._onEnded?.();
        break;
      case 'err':
        console.error('[LibopenmptEngine] Worklet error:', msg.data.val);
        this._playing = false;
        break;
    }
  }

  /** Set callback for position updates (order, pattern, row). */
  set onPosition(cb: LibopenmptPositionCallback | null) {
    this._onPosition = cb;
  }

  /** Set callback for song end. */
  set onEnded(cb: (() => void) | null) {
    this._onEnded = cb;
  }

  /** Load a module file (raw binary) into the worklet. */
  async loadTune(data: ArrayBuffer): Promise<void> {
    if (!this._available || !this.workletNode) {
      throw new Error('LibopenmptEngine not available');
    }
    // Stop any current playback before loading new module
    this.stop();
    // The actual load happens in play() — we store the data
    this._pendingData = data;
  }

  private _pendingData: ArrayBuffer | null = null;

  play(): void {
    if (!this._available || !this.workletNode) {
      console.warn('[LibopenmptEngine] play() aborted: available =', this._available, 'workletNode =', !!this.workletNode);
      return;
    }
    const data = this._pendingData;
    if (!data) {
      console.warn('[LibopenmptEngine] play() aborted: no pending data');
      return;
    }
    console.log('[LibopenmptEngine] play(): sending', data.byteLength, 'bytes to worklet');
    this.workletNode.port.postMessage({ cmd: 'play', val: data });
    this._playing = true;
  }

  stop(): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ cmd: 'stop' });
    this._playing = false;
  }

  pause(): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ cmd: 'pause' });
  }

  resume(): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ cmd: 'unpause' });
  }

  /** Seek to a specific order and row. */
  seekTo(order: number, row: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ cmd: 'setOrderRow', val: { o: order, r: row } });
  }

  /** Set stereo separation (0-200, libopenmpt scale). */
  setStereoSeparation(percent: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({
      cmd: 'config',
      val: { stereoSeparation: percent },
    });
  }

  isPlaying(): boolean {
    return this._playing;
  }

  dispose(): void {
    this.stop();
    try { this.workletNode?.disconnect(); } catch { /* ignored */ }
    try { this.gainNode?.disconnect(); } catch { /* ignored */ }
    this.workletNode = null;
    this.gainNode = null;
    this._ready = false;
    this._available = false;
    this._pendingData = null;
    LibopenmptEngine.instance = null;
  }
}
