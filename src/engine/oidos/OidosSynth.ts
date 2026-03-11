import type { DevilboxSynth } from '@/types/synth';
import type { OidosConfig } from '@typedefs/oidosInstrument';
import { getDevilboxAudioContext } from '@/utils/audio-context';
import { DEFAULT_OIDOS_CONFIG } from '@typedefs/oidosInstrument';

/**
 * Oidos Parameter Indices (matching WASM exports)
 * These map to oidossynth_set_parameter(ptr, index, value)
 */
export const OidosParam = {
  SEED: 0,
  MODES: 1,
  FAT: 2,
  WIDTH: 3,
  OVERTONES: 4,
  SHARPNESS: 5,
  HARMONICITY: 6,
  DECAY_LOW: 7,
  DECAY_HIGH: 8,
  FILTER_LOW: 9,
  FILTER_SLOPE_LOW: 10,
  FILTER_SWEEP_LOW: 11,
  FILTER_HIGH: 12,
  FILTER_SLOPE_HIGH: 13,
  FILTER_SWEEP_HIGH: 14,
  GAIN: 15,
  ATTACK: 16,
  RELEASE: 17,
} as const;

const PARAM_MAP: Record<keyof OidosConfig, number> = {
  seed: OidosParam.SEED,
  modes: OidosParam.MODES,
  fat: OidosParam.FAT,
  width: OidosParam.WIDTH,
  overtones: OidosParam.OVERTONES,
  sharpness: OidosParam.SHARPNESS,
  harmonicity: OidosParam.HARMONICITY,
  decayLow: OidosParam.DECAY_LOW,
  decayHigh: OidosParam.DECAY_HIGH,
  filterLow: OidosParam.FILTER_LOW,
  filterSlopeLow: OidosParam.FILTER_SLOPE_LOW,
  filterSweepLow: OidosParam.FILTER_SWEEP_LOW,
  filterHigh: OidosParam.FILTER_HIGH,
  filterSlopeHigh: OidosParam.FILTER_SLOPE_HIGH,
  filterSweepHigh: OidosParam.FILTER_SWEEP_HIGH,
  gain: OidosParam.GAIN,
  attack: OidosParam.ATTACK,
  release: OidosParam.RELEASE,
  // Quantization params are not sent to WASM (used for export only)
  qDecayDiff: -1,
  qDecayLow: -1,
  qHarmonicity: -1,
  qSharpness: -1,
  qWidth: -1,
  qFilterLow: -1,
  qFilterSlopeLow: -1,
  qFilterSweepLow: -1,
  qFilterHigh: -1,
  qFilterSlopeHigh: -1,
  qFilterSweepHigh: -1,
  qGain: -1,
  qAttack: -1,
  qRelease: -1,
};

export class OidosSynth implements DevilboxSynth {
  readonly name = 'OidosSynth';
  readonly output: GainNode;

  private workletNode: AudioWorkletNode | null = null;
  private static loadedContexts: WeakSet<AudioContext> = new WeakSet();
  private static initPromises: WeakMap<AudioContext, Promise<void>> = new WeakMap();

  public config: OidosConfig = { ...DEFAULT_OIDOS_CONFIG };
  public audioContext: AudioContext;
  private _disposed: boolean = false;
  private _initPromise: Promise<void>;
  private _resolveInit: (() => void) | null = null;
  private _pendingParams: Array<{ index: number; value: number }> = [];

  constructor() {
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

      // Load worklet module if not already loaded for this context
      if (!OidosSynth.loadedContexts.has(ctx)) {
        let initPromise = OidosSynth.initPromises.get(ctx);
        if (!initPromise) {
          initPromise = ctx.audioWorklet.addModule('/oidos/Oidos.worklet.js');
          OidosSynth.initPromises.set(ctx, initPromise);
        }
        await initPromise;
        OidosSynth.loadedContexts.add(ctx);
      }

      // Create worklet node
      this.workletNode = new AudioWorkletNode(ctx, 'oidos-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });

      // Handle messages from worklet
      this.workletNode.port.onmessage = (e) => {
        const { type, error } = e.data;
        if (type === 'ready') {
          // Send any pending params
          // Send pending params (from XRNS import)
          const hadPendingParams = this._pendingParams.length > 0;
          for (const { index, value } of this._pendingParams) {
            this.workletNode?.port.postMessage({
              type: 'setParameter',
              data: { index, value },
            });
          }
          this._pendingParams = [];

          // Only apply initial config if no XRNS params were queued
          if (!hadPendingParams) {
            this.applyConfig(this.config);
          }

          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
        } else if (type === 'error') {
          console.error('[OidosSynth] WASM error:', error);
        }
      };

      // Connect to output
      this.workletNode.connect(this.output);

      // Load WASM
      const wasmResponse = await fetch('/oidos/Oidos.wasm');
      const wasmBytes = await wasmResponse.arrayBuffer();
      this.workletNode.port.postMessage({
        type: 'init',
        data: { wasmBytes },
      });
    } catch (err) {
      console.error('[OidosSynth] Failed to initialize:', err);
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

  /** Set a single parameter by name (DevilboxSynth interface) */
  set(paramName: string, value: number): void {
    const index = PARAM_MAP[paramName as keyof OidosConfig];
    if (index === undefined || index < 0) return; // Unknown or quantization params

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
  setParams(updates: Partial<OidosConfig>): void {
    const params: Record<number, number> = {};
    for (const [key, value] of Object.entries(updates)) {
      const index = PARAM_MAP[key as keyof OidosConfig];
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

  applyConfig(config: OidosConfig): void {
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

  // Compatibility getters
  get isInitialized(): boolean {
    return this.workletNode !== null;
  }

  get disposed(): boolean {
    return this._disposed;
  }
}

export default OidosSynth;
