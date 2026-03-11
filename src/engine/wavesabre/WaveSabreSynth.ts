import type { DevilboxSynth } from '@/types/synth';
import type {
  FalconConfig,
  SlaughterConfig,
  WaveSabreSynthType,
} from '@typedefs/wavesabreInstrument';
import { getDevilboxAudioContext } from '@/utils/audio-context';
import {
  DEFAULT_FALCON_CONFIG,
  DEFAULT_SLAUGHTER_CONFIG,
  FalconParamIndex,
  SlaughterParamIndex,
} from '@typedefs/wavesabreInstrument';

export class WaveSabreSynth implements DevilboxSynth {
  readonly name = 'WaveSabreSynth';
  readonly output: GainNode;

  private workletNode: AudioWorkletNode | null = null;
  private static loadedContexts: WeakSet<AudioContext> = new WeakSet();
  private static initPromises: WeakMap<AudioContext, Promise<void>> = new WeakMap();

  public synthType: WaveSabreSynthType;
  public config: FalconConfig | SlaughterConfig;
  public audioContext: AudioContext;
  private _disposed: boolean = false;
  private _initPromise: Promise<void>;
  private _resolveInit: (() => void) | null = null;
  private _pendingParams: Array<{ index: number; value: number }> = [];

  constructor(synthType: WaveSabreSynthType = 'falcon') {
    this.synthType = synthType;
    this.config =
      synthType === 'falcon'
        ? { ...DEFAULT_FALCON_CONFIG }
        : { ...DEFAULT_SLAUGHTER_CONFIG };

    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();

    this._initPromise = new Promise<void>((resolve) => {
      this._resolveInit = resolve;
    });

    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      const ctx = this.audioContext;

      // Load worklet module if not already loaded
      if (!WaveSabreSynth.loadedContexts.has(ctx)) {
        let initPromise = WaveSabreSynth.initPromises.get(ctx);
        if (!initPromise) {
          initPromise = ctx.audioWorklet.addModule('/wavesabre/WaveSabre.worklet.js');
          WaveSabreSynth.initPromises.set(ctx, initPromise);
        }
        await initPromise;
        WaveSabreSynth.loadedContexts.add(ctx);
      }

      // Create worklet node
      this.workletNode = new AudioWorkletNode(ctx, 'wavesabre-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });

      // Handle messages from worklet
      this.workletNode.port.onmessage = (e) => {
        const { type, error } = e.data;
        if (type === 'ready') {
          // Send pending params
          for (const { index, value } of this._pendingParams) {
            this.workletNode?.port.postMessage({
              type: 'setParameter',
              data: { index, value },
            });
          }
          this._pendingParams = [];

          // Apply initial config
          this.applyConfig(this.config);

          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
        } else if (type === 'error') {
          console.error('[WaveSabreSynth] WASM error:', error);
        }
      };

      // Connect to output
      this.workletNode.connect(this.output);

      // Load WASM + JS
      const [wasmRes, jsRes] = await Promise.all([
        fetch('/wavesabre/WaveSabreSynth.wasm'),
        fetch('/wavesabre/WaveSabreSynth.js'),
      ]);
      const [wasmBinary, jsText] = await Promise.all([
        wasmRes.arrayBuffer(),
        jsRes.text(),  // Decode as text in main thread (worklet doesn't have TextDecoder)
      ]);

      this.workletNode.port.postMessage({
        type: 'init',
        data: {
          wasmBytes: { wasmBinary, jsCode: jsText },
          synthType: this.synthType,
        },
      });
    } catch (err) {
      console.error('[WaveSabreSynth] Failed to initialize:', err);
    }
  }

  async ready(): Promise<void> {
    return this._initPromise;
  }

  /** Alias for ready() - used by InstrumentFactory */
  async ensureInitialized(): Promise<void> {
    return this.ready();
  }

  /** Set a parameter by index (for XRNS parameter arrays) */
  setParameter(index: number, value: number): void {
    if (this.workletNode) {
      this.workletNode.port.postMessage({
        type: 'setParameter',
        data: { index, value },
      });
    } else {
      this._pendingParams.push({ index, value });
    }
  }

  private getParamIndex(paramName: string): number {
    if (this.synthType === 'falcon') {
      return FalconParamIndex[paramName as keyof FalconConfig] ?? -1;
    } else {
      return SlaughterParamIndex[paramName as keyof SlaughterConfig] ?? -1;
    }
  }

  /** Set a single parameter by name (DevilboxSynth interface) */
  set(paramName: string, value: number): void {
    const index = this.getParamIndex(paramName);
    if (index < 0) return;

    (this.config as unknown as Record<string, number>)[paramName] = value;

    if (this.workletNode) {
      this.workletNode.port.postMessage({
        type: 'setParameter',
        data: { index, value },
      });
    } else {
      this._pendingParams.push({ index, value });
    }
  }

  /** Set multiple parameters at once */
  setParams(updates: Partial<FalconConfig | SlaughterConfig>): void {
    const params: Record<number, number> = {};
    for (const [key, value] of Object.entries(updates)) {
      const index = this.getParamIndex(key);
      if (index >= 0 && typeof value === 'number') {
        (this.config as unknown as Record<string, number>)[key] = value;
        params[index] = value;
      }
    }

    if (Object.keys(params).length > 0) {
      if (this.workletNode) {
        this.workletNode.port.postMessage({
          type: 'setParameters',
          data: { params },
        });
      } else {
        for (const [index, value] of Object.entries(params)) {
          this._pendingParams.push({ index: parseInt(index), value });
        }
      }
    }
  }

  applyConfig(config: FalconConfig | SlaughterConfig): void {
    this.config = { ...config };
    this.setParams(config);
  }

  noteOn(note: string | number, velocity: number = 1, _time?: number): void {
    const midi = typeof note === 'string' ? this.noteToMidi(note) : note;
    this.workletNode?.port.postMessage({
      type: 'noteOn',
      data: { note: midi, velocity },
    });
  }

  noteOff(note: string | number, _time?: number): void {
    const midi = typeof note === 'string' ? this.noteToMidi(note) : note;
    this.workletNode?.port.postMessage({
      type: 'noteOff',
      data: { note: midi },
    });
  }

  private noteToMidi(note: string): number {
    const match = note.match(/^([A-Ga-g])([#b]?)(-?\d+)$/);
    if (!match) return 60;
    const [, letter, accidental, octaveStr] = match;
    const noteNames: Record<string, number> = {
      C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
    };
    let midi = noteNames[letter.toUpperCase()] ?? 0;
    if (accidental === '#') midi += 1;
    if (accidental === 'b') midi -= 1;
    midi += (parseInt(octaveStr) + 1) * 12;
    return midi;
  }

  triggerAttack(note: string | number, velocity: number = 1, _time?: number): void {
    this.noteOn(note, velocity);
  }

  triggerRelease(note: string | number, _time?: number): void {
    this.noteOff(note);
  }

  triggerAttackRelease(
    note: string | number,
    duration: number | string,
    _time?: number,
    velocity: number = 1
  ): void {
    this.noteOn(note, velocity);
    const durationMs = typeof duration === 'string' ? parseFloat(duration) * 1000 : duration * 1000;
    setTimeout(() => {
      this.noteOff(note);
    }, durationMs);
  }

  connect(destination: AudioNode): void {
    this.output.connect(destination);
  }

  disconnect(): void {
    this.output.disconnect();
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;

    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    this.output.disconnect();
  }

  get isInitialized(): boolean {
    return this.workletNode !== null;
  }

  get disposed(): boolean {
    return this._disposed;
  }
}

export default WaveSabreSynth;
