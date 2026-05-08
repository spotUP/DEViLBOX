/**
 * Tunefish 4 Synth Engine
 * TypeScript wrapper for Tunefish WASM synth
 */
import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext } from '@/utils/audio-context';
import {
  type TunefishInstrumentConfig,
  TunefishParam,
  DEFAULT_TUNEFISH,
  tunefishConfigToParams,
} from '@typedefs/tunefishInstrument';

export class TunefishSynth implements DevilboxSynth {
  readonly name = 'TunefishSynth';
  readonly output: GainNode;

  private workletNode: AudioWorkletNode | null = null;
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
        const { type, error, numParams } = e.data;
        if (type === 'ready') {
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

  /** Map parameter name to index */
  private getParamIndex(paramName: keyof TunefishInstrumentConfig): number {
    const mapping: Record<keyof TunefishInstrumentConfig, number> = {
      globalGain: TunefishParam.GLOBAL_GAIN,
      genBandwidth: TunefishParam.GEN_BANDWIDTH,
      genNumHarmonics: TunefishParam.GEN_NUMHARMONICS,
      genDamp: TunefishParam.GEN_DAMP,
      genModulation: TunefishParam.GEN_MODULATION,
      genVolume: TunefishParam.GEN_VOLUME,
      genPanning: TunefishParam.GEN_PANNING,
      genSlop: TunefishParam.GEN_SLOP,
      genOctave: TunefishParam.GEN_OCTAVE,
      genGlide: TunefishParam.GEN_GLIDE,
      genDetune: TunefishParam.GEN_DETUNE,
      genFreq: TunefishParam.GEN_FREQ,
      genPolyphony: TunefishParam.GEN_POLYPHONY,
      genDrive: TunefishParam.GEN_DRIVE,
      genUnisono: TunefishParam.GEN_UNISONO,
      genSpread: TunefishParam.GEN_SPREAD,
      genScale: TunefishParam.GEN_SCALE,
      noiseAmount: TunefishParam.NOISE_AMOUNT,
      noiseFreq: TunefishParam.NOISE_FREQ,
      noiseBw: TunefishParam.NOISE_BW,
      lpFilterOn: TunefishParam.LP_FILTER_ON,
      lpFilterCutoff: TunefishParam.LP_FILTER_CUTOFF,
      lpFilterResonance: TunefishParam.LP_FILTER_RESONANCE,
      hpFilterOn: TunefishParam.HP_FILTER_ON,
      hpFilterCutoff: TunefishParam.HP_FILTER_CUTOFF,
      hpFilterResonance: TunefishParam.HP_FILTER_RESONANCE,
      bpFilterOn: TunefishParam.BP_FILTER_ON,
      bpFilterCutoff: TunefishParam.BP_FILTER_CUTOFF,
      bpFilterQ: TunefishParam.BP_FILTER_Q,
      ntFilterOn: TunefishParam.NT_FILTER_ON,
      ntFilterCutoff: TunefishParam.NT_FILTER_CUTOFF,
      ntFilterQ: TunefishParam.NT_FILTER_Q,
      distortAmount: TunefishParam.DISTORT_AMOUNT,
      chorusRate: TunefishParam.CHORUS_RATE,
      chorusDepth: TunefishParam.CHORUS_DEPTH,
      chorusGain: TunefishParam.CHORUS_GAIN,
      delayLeft: TunefishParam.DELAY_LEFT,
      delayRight: TunefishParam.DELAY_RIGHT,
      delayDecay: TunefishParam.DELAY_DECAY,
      reverbRoomsize: TunefishParam.REVERB_ROOMSIZE,
      reverbDamp: TunefishParam.REVERB_DAMP,
      reverbWet: TunefishParam.REVERB_WET,
      reverbWidth: TunefishParam.REVERB_WIDTH,
      flangerLfo: TunefishParam.FLANGER_LFO,
      flangerFrequency: TunefishParam.FLANGER_FREQUENCY,
      flangerAmplitude: TunefishParam.FLANGER_AMPLITUDE,
      flangerWet: TunefishParam.FLANGER_WET,
      formantMode: TunefishParam.FORMANT_MODE,
      formantWet: TunefishParam.FORMANT_WET,
      eqLow: TunefishParam.EQ_LOW,
      eqMid: TunefishParam.EQ_MID,
      eqHigh: TunefishParam.EQ_HIGH,
      pitchwheelUp: TunefishParam.PITCHWHEEL_UP,
      pitchwheelDown: TunefishParam.PITCHWHEEL_DOWN,
    };
    return mapping[paramName] ?? -1;
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

  private _prevParams: number[] = [];

  applyConfig(config: TunefishInstrumentConfig): void {
    this.config = { ...config };
    const params = tunefishConfigToParams(config);
    // Only send if params actually changed — avoids audio glitches from redundant messages
    if (this._prevParams.length === params.length && params.every((v, i) => v === this._prevParams[i])) return;
    this._prevParams = [...params];
    this.setParameters(params);
  }

  private _currentMidiNote = 69;

  noteOn(note: string | number, velocity: number = 1, _time?: number): void {
    const midi = typeof note === 'string' ? this.noteToMidi(note) : note;
    this._currentMidiNote = midi;
    const vel = Math.round(velocity * 127);
    this.workletNode?.port.postMessage({
      type: 'noteOn',
      data: { note: midi, velocity: vel },
    });
  }

  noteOff(note: string | number, _time?: number): void {
    const midi = typeof note === 'string' ? this.noteToMidi(note) : note;
    this.workletNode?.port.postMessage({
      type: 'noteOff',
      data: { note: midi },
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

export default TunefishSynth;
