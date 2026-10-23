/**
 * Tunefish 4 Synth Engine
 * TypeScript wrapper for Tunefish WASM synth
 */
import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext } from '@/utils/audio-context';
import { WasmVoiceHub, registerVoiceHub } from '@/engine/voiceStatus/wasmVoiceStatus';
import {
  type TunefishInstrumentConfig,
  TunefishParam,
  DEFAULT_TUNEFISH,
  tunefishConfigToParams,
  TUNEFISH_CONFIG_PARAM,
} from '@typedefs/tunefishInstrument';

export class TunefishSynth implements DevilboxSynth {
  readonly name = 'TunefishSynth';
  readonly output: GainNode;

  private workletNode: AudioWorkletNode | null = null;
  /** Live voice report for the editor curves' markers (wasmVoiceStatus.ts). */
  readonly voiceHub = new WasmVoiceHub((m) => this.workletNode?.port.postMessage(m));
  private readonly unregisterVoiceHub: () => void;
  private static loadedContexts: WeakSet<AudioContext> = new WeakSet();
  private static initPromises: WeakMap<AudioContext, Promise<void>> = new WeakMap();

  public config: TunefishInstrumentConfig;
  public audioContext: AudioContext;
  private _disposed: boolean = false;
  private _initPromise: Promise<void>;
  private _resolveInit: (() => void) | null = null;
  private _pendingParams: Array<{ index: number; value: number }> = [];
  private numParams: number = TunefishParam.PARAM_COUNT;

  constructor(initialConfig?: Partial<TunefishInstrumentConfig>) {
    this.config = { ...DEFAULT_TUNEFISH, ...initialConfig };
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();
    this.unregisterVoiceHub = registerVoiceHub('TunefishSynth', this.voiceHub);

    this._initPromise = new Promise<void>((resolve) => {
      this._resolveInit = resolve;
    });

    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      const ctx = this.audioContext;

      // Load worklet module if not already loaded
      if (!TunefishSynth.loadedContexts.has(ctx)) {
        let initPromise = TunefishSynth.initPromises.get(ctx);
        if (!initPromise) {
          // Add cache-busting query param
          initPromise = ctx.audioWorklet.addModule('/tunefish/Tunefish.worklet.js?v=' + Date.now());
          TunefishSynth.initPromises.set(ctx, initPromise);
        }
        await initPromise;
        TunefishSynth.loadedContexts.add(ctx);
      }

      // Create worklet node
      this.workletNode = new AudioWorkletNode(ctx, 'tunefish-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });

      // Handle messages from worklet
      this.workletNode.port.onmessage = (e) => {
        if (this.voiceHub.handleMessage(e.data)) return;
        const { type, error, numParams } = e.data;
        if (type === 'ready') {
          this.voiceHub.resume();
          if (numParams) {
            this.numParams = numParams;
          }

          // Send pending params (from XRNS import or early setParameters calls)
          const hadPendingParams = this._pendingParams.length > 0;
          for (const { index, value } of this._pendingParams) {
            this.workletNode?.port.postMessage({
              type: 'setParameter',
              data: { index, value },
            });
          }
          this._pendingParams = [];

          // Only apply initial config if no XRNS params were queued
          // (XRNS params override the default config)
          if (!hadPendingParams) {
            this.applyConfig(this.config);
          }

          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
        } else if (type === 'error') {
          console.error('[TunefishSynth] WASM error:', error);
        }
      };

      // Connect to output
      this.workletNode.connect(this.output);

      // Load WASM + JS
      const [wasmRes, jsRes] = await Promise.all([
        fetch('/tunefish/TunefishSynth.wasm'),
        fetch('/tunefish/TunefishSynth.js'),
      ]);
      const [wasmBinary, jsText] = await Promise.all([
        wasmRes.arrayBuffer(),
        jsRes.text(),  // Decode as text in main thread (worklet doesn't have TextDecoder)
      ]);

      this.workletNode.port.postMessage({
        type: 'init',
        data: {
          wasmBytes: { wasmBinary, jsCode: jsText },
        },
      });
    } catch (err) {
      console.error('[TunefishSynth] Failed to initialize:', err);
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
    if (index < 0 || index >= this.numParams) return;

    if (this.workletNode) {
      this.workletNode.port.postMessage({
        type: 'setParameter',
        data: { index, value },
      });
    } else {
      this._pendingParams.push({ index, value });
    }
  }

  /** Set all parameters from array (for XRNS import) */
  setParameters(params: number[]): void {
    const paramsObj: Record<number, number> = {};
    for (let i = 0; i < Math.min(params.length, this.numParams); i++) {
      paramsObj[i] = params[i];
    }

    if (this.workletNode) {
      this.workletNode.port.postMessage({
        type: 'setParameters',
        data: { params: paramsObj },
      });
    } else {
      for (let i = 0; i < Math.min(params.length, this.numParams); i++) {
        this._pendingParams.push({ index: i, value: params[i] });
      }
    }
  }

  /** Map parameter name to the engine's parameter index */
  private getParamIndex(paramName: keyof TunefishInstrumentConfig): number {
    return TUNEFISH_CONFIG_PARAM[paramName] ?? -1;
  }

  /** Set a single parameter by name (DevilboxSynth interface) */
  set(paramName: string, value: number): void {
    const key = paramName as keyof TunefishInstrumentConfig;
    const index = this.getParamIndex(key);
    if (index < 0) return;

    this.config[key] = value;

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
  setParams(updates: Partial<TunefishInstrumentConfig>): void {
    const params: Record<number, number> = {};
    for (const [key, value] of Object.entries(updates)) {
      const typedKey = key as keyof TunefishInstrumentConfig;
      const index = this.getParamIndex(typedKey);
      if (index >= 0 && typeof value === 'number') {
        this.config[typedKey] = value;
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

  private _prevParams: Record<number, number> = {};

  applyConfig(config: TunefishInstrumentConfig): void {
    this.config = { ...config };
    const params = tunefishConfigToParams(config);
    // Only send what changed: redundant messages glitch the audio, and the first call sends everything
    const changed: Record<number, number> = {};
    let any = false;
    for (const [index, value] of Object.entries(params)) {
      if (this._prevParams[Number(index)] !== value) { changed[Number(index)] = value; any = true; }
    }
    if (!any) return;
    this._prevParams = { ...params };
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'setParameters', data: { params: changed } });
    } else {
      for (const [index, value] of Object.entries(changed)) this._pendingParams.push({ index: parseInt(index), value });
    }
  }

  private _currentMidiNote = 69;

  noteOn(note: string | number, velocity: number = 1, time?: number): void {
    const midi = typeof note === 'string' ? this.noteToMidi(note) : note;
    this._currentMidiNote = midi;
    const vel = Math.round(velocity * 127);
    this.workletNode?.port.postMessage({
      type: 'noteOn',
      data: { note: midi, velocity: vel, time },
    });
  }

  noteOff(note: string | number, time?: number): void {
    const midi = typeof note === 'string' ? this.noteToMidi(note) : note;
    this.workletNode?.port.postMessage({
      type: 'noteOff',
      data: { note: midi, time },
    });
  }

  allNotesOff(): void {
    this.workletNode?.port.postMessage({
      type: 'allNotesOff',
      data: {},
    });
  }

  pitchBend(semitones: number, cents: number = 0): void {
    this.workletNode?.port.postMessage({
      type: 'pitchBend',
      data: { semitones, cents },
    });
  }

  /**
   * Set oscillator frequency in Hz for tracker effect commands.
   * Converts to semitone offset for Tunefish pitch bend.
   */
  setFrequency(hz: number): void {
    if (hz <= 0) return;
    const currentNoteHz = 440 * Math.pow(2, (this._currentMidiNote - 69) / 12);
    const semitoneOffset = 12 * Math.log2(hz / currentNoteHz);
    const wholeSemitones = Math.trunc(semitoneOffset);
    const cents = (semitoneOffset - wholeSemitones) * 100;
    this.pitchBend(wholeSemitones, cents);
  }

  modWheel(amount: number): void {
    this.workletNode?.port.postMessage({
      type: 'modWheel',
      data: { amount },
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

  // (note, time, velocity) is the DevilboxSynth order every caller uses
  triggerAttack(note: string | number, time?: number, velocity: number = 1): void {
    this.noteOn(note, velocity, time);
  }

  triggerRelease(note: string | number, time?: number): void {
    this.noteOff(note, time);
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
    this.unregisterVoiceHub();
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

export default TunefishSynth;
