/**
 * MAMEBaseSynth - Abstract Base Class for MAME-Emulated Synths
 *
 * Provides Furnace-level features for all MAME chip synths:
 * - Macro system (volume, arpeggio, duty, pitch, panning, phase reset)
 * - Tracker effects (0x00-0x0F and extended Exy)
 * - Per-operator control (for FM chips)
 * - Velocity scaling
 * - Oscilloscope data
 * - Gate enforcement
 */

import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, timeToSeconds } from '@/utils/audio-context';
import { ensureMAMEModuleLoaded, createMAMEWorkletNode } from './mame-wasm-loader';
import type {
  MacroState,
  OperatorMacroState,
  MAMEChipCapabilities,
} from './MAMEMacroTypes';
import {
  MacroType,
  getChipCapabilities,
} from './MAMEMacroTypes';
import type { MAMEEffectTarget, EffectFlowControl } from './MAMEEffectRouter';
import { MAMEEffectRouter } from './MAMEEffectRouter';
import {
  midiToFreq,
  noteNameToMidi,
  applyPitchOffset,
} from './MAMEPitchUtils';

/**
 * Oscilloscope data callback
 */
export type OscDataCallback = (data: Float32Array) => void;

/**
 * Macro configuration for instruments
 */
export interface MAMEMacroConfig {
  type: MacroType;
  data: number[];
  loop?: number;
  release?: number;
}

/**
 * Abstract base class for all MAME synths
 */
export abstract class MAMEBaseSynth implements DevilboxSynth, MAMEEffectTarget {
  abstract readonly name: string;
  readonly output: GainNode;

  // WASM worklet
  protected workletNode: AudioWorkletNode | null = null;
  protected _initPromise!: Promise<void>;
  protected _pendingCalls: Array<{ method: string; args: unknown[] }> = [];
  protected _isReady = false;
  protected _disposed = false;

  // Chip info (subclasses set these)
  protected abstract readonly chipName: string;
  protected abstract readonly workletFile: string;
  protected abstract readonly processorName: string;

  // Chip capabilities
  protected capabilities: MAMEChipCapabilities;

  // Configuration
  public config: Record<string, unknown> = {};

  // ROM loading status (for ROM-dependent chips)
  public romLoaded = false;

  // Note state
  protected currentNote: number = 60;  // MIDI note
  protected currentFreq: number = 261.63;  // Hz
  protected currentVelocity: number = 1.0;  // 0-1
  protected isNoteOn = false;
  protected noteOnTime: number = 0;

  // Gate enforcement
  protected static MIN_GATE_TIME = 50;  // 50ms minimum gate

  // Macro system
  protected macros: Map<MacroType, MacroState> = new Map();
  protected opMacros: OperatorMacroState[] = [];

  // Effect router
  protected effectRouter: MAMEEffectRouter;
  protected channelIndex: number = 0;

  // Pitch state
  protected basePitchOffset: number = 0;  // From pitch macro
  protected effectPitchOffset: number = 0;  // From effects

  // Oscilloscope
  protected oscBuffer: Float32Array | null = null;
  protected oscCallbacks: Set<OscDataCallback> = new Set();

  constructor() {
    this.output = getDevilboxAudioContext().createGain();
    this.effectRouter = new MAMEEffectRouter();

    // Set capabilities after chipName is defined by subclass
    // This will be called in subclass constructor after super()
    this.capabilities = getChipCapabilities('default');
  }

  /**
   * Initialize the synth - called by subclass after setting chip info
   */
  protected initSynth(): void {
    this.capabilities = getChipCapabilities(this.chipName);
    this._initPromise = this.initialize();

    // Initialize operator macros if FM chip
    if (this.capabilities.numOperators > 0) {
      this.opMacros = Array.from(
        { length: this.capabilities.numOperators },
        () => ({})
      );
    }
  }

  /**
   * Wait for synth to be initialized
   */
  public async ensureInitialized(): Promise<void> {
    return this._initPromise;
  }

  /**
   * Initialize WASM worklet
   */
  protected async initialize(): Promise<void> {
    try {
      const rawContext = getDevilboxAudioContext();

      const { wasmBinary, jsCode } = await ensureMAMEModuleLoaded(
        rawContext, this.chipName, this.workletFile
      );
      if (this._disposed) return;

      const targetNode = this.output as AudioNode;
      const { workletNode, readyPromise } = createMAMEWorkletNode(
        rawContext, this.processorName, wasmBinary, jsCode, targetNode
      );
      this.workletNode = workletNode;

      // Handle messages from worklet
      const origHandler = this.workletNode.port.onmessage;
      this.workletNode.port.onmessage = (event) => {
        this.handleWorkletMessage(event.data);
        if (origHandler) origHandler.call(this.workletNode!.port, event);
      };

      await readyPromise;
    } catch (err) {
      console.error(`[${this.chipName}] Initialization failed:`, err);
    }
  }

  /**
   * Handle messages from worklet
   */
  protected handleWorkletMessage(data: Record<string, unknown>): void {
    switch (data.type) {
      case 'ready':
        console.log(`[${this.chipName}] WASM node ready`);
        this._isReady = true;
        // Process pending calls
        for (const call of this._pendingCalls) {
          this.processPendingCall(call);
        }
        this._pendingCalls = [];
        break;

      case 'oscData':
        // Oscilloscope data from worklet
        if (data.buffer) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          this.oscBuffer = new Float32Array(data.buffer as any);
          this.oscCallbacks.forEach(cb => cb(this.oscBuffer!));
        }
        break;

      case 'error':
        console.error(`[${this.chipName}] Worklet error:`, data.message);
        break;
    }
  }

  /**
   * Process a pending call (override in subclasses for custom params)
   */
  protected processPendingCall(call: { method: string; args: unknown[] }): void {
    if (call.method === 'setParam') {
      this.setParam(call.args[0] as string, call.args[1] as number);
    } else if (call.method === 'triggerAttack') {
      this.triggerAttack(call.args[0] as string | number, call.args[1] as number | undefined, call.args[2] as number);
    }
  }

  // ===========================================================================
  // Note Control (MAMEEffectTarget interface)
  // ===========================================================================

  /**
   * Trigger attack
   */
  triggerAttack(note: string | number, _time?: number, velocity: number = 1): void {
    if (this._disposed) return;

    // If worklet isn't ready yet, queue the note attack
    if (!this._isReady || !this.workletNode) {
      console.log(`[${this.chipName}] triggerAttack: not ready (ready=${this._isReady}, worklet=${!!this.workletNode}), queueing note ${note}`);
      this._pendingCalls.push({ method: 'triggerAttack', args: [note, _time, velocity] });
      return;
    }

    // Convert note to MIDI number and frequency
    if (typeof note === 'string') {
      this.currentNote = noteNameToMidi(note);
    } else if (note > 127) {
      // Assume frequency
      this.currentNote = Math.round(12 * Math.log2(note / 440) + 69);
    } else {
      this.currentNote = note;
    }

    this.currentFreq = midiToFreq(this.currentNote);
    this.currentVelocity = velocity;
    this.isNoteOn = true;
    this.noteOnTime = Date.now();

    // Reset macros
    this.resetMacros();

    // Reset effect channel memory
    this.effectRouter.resetChannel(this.channelIndex);

    // Write to worklet
    this.writeKeyOn(this.currentNote, velocity);
  }

  /**
   * Trigger release
   */
  triggerRelease(time?: number): void {
    if (this._disposed) return;

    // Enforce minimum gate time
    const elapsed = Date.now() - this.noteOnTime;
    if (elapsed < MAMEBaseSynth.MIN_GATE_TIME) {
      setTimeout(() => this.triggerRelease(time), MAMEBaseSynth.MIN_GATE_TIME - elapsed);
      return;
    }

    this.isNoteOn = false;

    // Trigger macro release phase
    this.releaseMacros();

    // Write to worklet
    this.writeKeyOff();
  }

  /**
   * Attack + Release with duration
   */
  triggerAttackRelease(note: string | number, duration: string | number, time?: number, velocity?: number): void {
    if (this._disposed) return;
    this.triggerAttack(note, time, velocity || 1);

    const d = timeToSeconds(duration);
    setTimeout(() => {
      if (!this._disposed) {
        this.triggerRelease();
      }
    }, d * 1000);
  }

  /**
   * Release all notes
   */
  releaseAll(): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'allNotesOff' });
    this.isNoteOn = false;
  }

  // ===========================================================================
  // MAMEEffectTarget Interface Implementation
  // ===========================================================================

  /**
   * Set frequency directly
   */
  setFrequency(freq: number): void {
    this.currentFreq = freq;
    this.writeFrequency(freq);
  }

  /**
   * Set pitch offset (in linear frequency units)
   */
  setPitchOffset(offset: number): void {
    this.effectPitchOffset = offset;
    const freq = applyPitchOffset(this.currentFreq, this.basePitchOffset + offset);
    this.writeFrequency(freq);
  }

  /**
   * Set volume (0-64 XM scale)
   */
  setVolume(volume: number): void {
    const normalized = volume / 64;
    this.writeVolume(normalized * this.currentVelocity);
  }

  /**
   * Set panning (0-255, 128 = center)
   */
  setPanning(pan: number): void {
    this.writePanning(pan);
  }

  /**
   * Set sample offset (for PCM chips)
   */
  setSampleOffset(offset: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setSampleOffset',
      offset,
    });
  }

  /**
   * Retrigger note
   */
  retriggerNote(velocity: number): void {
    this.writeKeyOn(this.currentNote, velocity);
  }

  /**
   * Cut note (instant silence)
   */
  cutNote(): void {
    this.writeVolume(0);
    this.isNoteOn = false;
  }

  // ===========================================================================
  // Abstract Methods - Subclasses Must Implement
  // ===========================================================================

  /**
   * Write key-on to chip
   */
  protected abstract writeKeyOn(note: number, velocity: number): void;

  /**
   * Write key-off to chip
   */
  protected abstract writeKeyOff(): void;

  /**
   * Write frequency to chip
   */
  protected abstract writeFrequency(freq: number): void;

  /**
   * Write volume to chip (0-1 normalized)
   */
  protected abstract writeVolume(volume: number): void;

  /**
   * Write panning to chip (0-255, 128 = center)
   */
  protected abstract writePanning(pan: number): void;

  // ===========================================================================
  // Optional Override Methods
  // ===========================================================================

  /**
   * Write duty cycle / noise mode (PSG/NES style chips)
   */
  protected writeDuty(duty: number): void {
    // Override in subclasses that support duty cycle
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setParameter',
      paramId: 100,  // Duty param ID - chip specific
      value: duty,
    });
  }

  /**
   * Write wavetable select (wavetable chips)
   */
  protected writeWavetableSelect(index: number): void {
    // Override in subclasses that support wavetables
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'selectWavetable',
      index,
    });
  }

  /**
   * Write phase reset
   */
  protected writePhaseReset(): void {
    // Override in subclasses that support phase reset
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'phaseReset',
    });
  }

  // ===========================================================================
  // FM Operator Control (override in FM synths)
  // ===========================================================================

  /**
   * Set operator Total Level (amplitude)
   */
  setOperatorTL(op: number, tl: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setOperatorParam',
      op,
      param: 'tl',
      value: tl,
    });
  }

  /**
   * Set operator Attack Rate
   */
  setOperatorAR(op: number, ar: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setOperatorParam',
      op,
      param: 'ar',
      value: ar,
    });
  }

  /**
   * Set operator Decay Rate
   */
  setOperatorDR(op: number, dr: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setOperatorParam',
      op,
      param: 'dr',
      value: dr,
    });
  }

  /**
   * Set operator Sustain Level
   */
  setOperatorSL(op: number, sl: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setOperatorParam',
      op,
      param: 'sl',
      value: sl,
    });
  }

  /**
   * Set operator Release Rate
   */
  setOperatorRR(op: number, rr: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setOperatorParam',
      op,
      param: 'rr',
      value: rr,
    });
  }

  /**
   * Set operator Multiplier
   */
  setOperatorMult(op: number, mult: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setOperatorParam',
      op,
      param: 'mult',
      value: mult,
    });
  }

  /**
   * Set operator Detune
   */
  setOperatorDetune(op: number, dt: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setOperatorParam',
      op,
      param: 'dt',
      value: dt,
    });
  }

  // ===========================================================================
  // Macro System
  // ===========================================================================

  /**
   * Set a macro for this instrument
   */
  setMacro(config: MAMEMacroConfig): void {
    const state: MacroState = {
      type: config.type,
      data: config.data,
      loop: config.loop ?? -1,
      release: config.release ?? -1,
      position: 0,
      active: config.data.length > 0,
      released: false,
    };
    this.macros.set(config.type, state);
  }

  /**
   * Set multiple macros at once
   */
  setMacros(configs: MAMEMacroConfig[]): void {
    for (const config of configs) {
      this.setMacro(config);
    }
  }

  /**
   * Clear all macros
   */
  clearMacros(): void {
    this.macros.clear();
  }

  /**
   * Reset macro positions (on note-on)
   */
  protected resetMacros(): void {
    this.macros.forEach(macro => {
      macro.position = 0;
      macro.released = false;
    });

    // Reset operator macros too
    for (const opMacro of this.opMacros) {
      for (const key of Object.keys(opMacro) as Array<keyof OperatorMacroState>) {
        const macro = opMacro[key];
        if (macro) {
          macro.position = 0;
          macro.released = false;
        }
      }
    }
  }

  /**
   * Trigger macro release phase
   */
  protected releaseMacros(): void {
    this.macros.forEach(macro => {
      macro.released = true;
      // Jump to release point if set
      if (macro.release >= 0 && macro.release < macro.data.length) {
        macro.position = macro.release;
      }
    });

    // Release operator macros
    for (const opMacro of this.opMacros) {
      for (const key of Object.keys(opMacro) as Array<keyof OperatorMacroState>) {
        const macro = opMacro[key];
        if (macro) {
          macro.released = true;
          if (macro.release >= 0 && macro.release < macro.data.length) {
            macro.position = macro.release;
          }
        }
      }
    }
  }

  /**
   * Process a single tracker tick (call from tracker replayer)
   *
   * Advances macros and applies their values to the synth.
   */
  processTick(): void {
    if (!this.isNoteOn) return;

    // Process each active macro
    this.macros.forEach((macro, type) => {
      if (!macro.active || macro.data.length === 0) return;

      // Get current value
      let pos = macro.position;
      if (pos >= macro.data.length) pos = macro.data.length - 1;
      const val = macro.data[pos];

      // Apply macro value
      this.applyMacroValue(type, val);

      // Advance position
      pos++;
      if (pos >= macro.data.length) {
        // Handle loop
        if (macro.loop >= 0) {
          pos = macro.loop;
        } else {
          pos = macro.data.length - 1;  // Stay at last value
        }
      }
      macro.position = pos;
    });

    // Process operator macros (for FM chips)
    this.processOperatorMacros();
  }

  /**
   * Apply a single macro value
   */
  protected applyMacroValue(type: MacroType, value: number): void {
    switch (type) {
      case MacroType.VOLUME: {
        // Volume: 0-127 scale
        const vol = (value / 127) * this.currentVelocity;
        this.writeVolume(vol);
        break;
      }

      case MacroType.ARPEGGIO: {
        // Arpeggio: relative semitones (signed)
        const semitones = value > 127 ? value - 256 : value;
        const freq = this.currentFreq * Math.pow(2, semitones / 12);
        this.writeFrequency(freq);
        break;
      }

      case MacroType.DUTY:
        // Duty cycle / noise mode
        this.writeDuty(value);
        break;

      case MacroType.WAVETABLE:
        // Wavetable select
        this.writeWavetableSelect(value);
        break;

      case MacroType.PITCH: {
        // Pitch: relative cents (signed)
        const signedPitch = value > 127 ? value - 256 : value;
        this.basePitchOffset = signedPitch;
        const pitchedFreq = applyPitchOffset(
          this.currentFreq,
          this.basePitchOffset + this.effectPitchOffset
        );
        this.writeFrequency(pitchedFreq);
        break;
      }

      case MacroType.PANNING: {
        // Panning: -127 to 127, convert to 0-255
        const pan = value > 127 ? value - 256 : value;
        this.writePanning(128 + pan);
        break;
      }

      case MacroType.PHASE_RESET:
        // Phase reset on non-zero
        if (value !== 0) {
          this.writePhaseReset();
        }
        break;

      // FM-specific macros
      case MacroType.ALG:
        this.setFMAlgorithm(value);
        break;

      case MacroType.FB:
        this.setFMFeedback(value);
        break;

      case MacroType.FMS:
        this.setFMSensitivity(value);
        break;

      case MacroType.AMS:
        this.setAMSensitivity(value);
        break;
    }
  }

  /**
   * Process operator-level macros
   */
  protected processOperatorMacros(): void {
    for (let op = 0; op < this.opMacros.length; op++) {
      const opMacro = this.opMacros[op];
      if (!opMacro) continue;

      // TL macro
      if (opMacro.tl?.active) {
        const val = this.advanceOpMacro(opMacro.tl);
        this.setOperatorTL(op, val);
      }

      // AR macro
      if (opMacro.ar?.active) {
        const val = this.advanceOpMacro(opMacro.ar);
        this.setOperatorAR(op, val);
      }

      // DR macro
      if (opMacro.dr?.active) {
        const val = this.advanceOpMacro(opMacro.dr);
        this.setOperatorDR(op, val);
      }

      // SL macro
      if (opMacro.sl?.active) {
        const val = this.advanceOpMacro(opMacro.sl);
        this.setOperatorSL(op, val);
      }

      // RR macro
      if (opMacro.rr?.active) {
        const val = this.advanceOpMacro(opMacro.rr);
        this.setOperatorRR(op, val);
      }

      // MULT macro
      if (opMacro.mult?.active) {
        const val = this.advanceOpMacro(opMacro.mult);
        this.setOperatorMult(op, val);
      }

      // DT macro
      if (opMacro.dt?.active) {
        const val = this.advanceOpMacro(opMacro.dt);
        this.setOperatorDetune(op, val);
      }
    }
  }

  /**
   * Advance an operator macro and return current value
   */
  protected advanceOpMacro(macro: MacroState): number {
    if (!macro.active || macro.data.length === 0) return 0;

    let pos = macro.position;
    if (pos >= macro.data.length) pos = macro.data.length - 1;
    const val = macro.data[pos];

    // Advance
    pos++;
    if (pos >= macro.data.length) {
      pos = macro.loop >= 0 ? macro.loop : macro.data.length - 1;
    }
    macro.position = pos;

    return val;
  }

  // ===========================================================================
  // FM Chip Settings (override in FM synths)
  // ===========================================================================

  /**
   * Set FM algorithm
   */
  protected setFMAlgorithm(alg: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setParameter',
      paramId: 200,  // Algorithm param ID
      value: alg,
    });
  }

  /**
   * Set FM feedback
   */
  protected setFMFeedback(fb: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setParameter',
      paramId: 201,  // Feedback param ID
      value: fb,
    });
  }

  /**
   * Set FM sensitivity
   */
  protected setFMSensitivity(fms: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setParameter',
      paramId: 202,  // FMS param ID
      value: fms,
    });
  }

  /**
   * Set AM sensitivity
   */
  protected setAMSensitivity(ams: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setParameter',
      paramId: 203,  // AMS param ID
      value: ams,
    });
  }

  // ===========================================================================
  // Effect Processing
  // ===========================================================================

  /**
   * Process effect on tick 0
   */
  processEffectTick0(
    effect: string | null,
    baseFreq: number,
    currentRow: number
  ): EffectFlowControl {
    return this.effectRouter.processTickZero(
      effect,
      this.channelIndex,
      baseFreq,
      currentRow,
      this
    );
  }

  /**
   * Process effect on tick N
   */
  processEffectTickN(effect: string | null, tick: number): void {
    this.effectRouter.processTickN(effect, this.channelIndex, tick, this);
  }

  /**
   * Check if effect has note delay
   */
  hasNoteDelay(effect: string | null): boolean {
    return this.effectRouter.hasNoteDelay(effect);
  }

  /**
   * Get note delay tick
   */
  getNoteDelayTick(effect: string | null): number {
    return this.effectRouter.getNoteDelayTick(effect);
  }

  /**
   * Set effect channel index
   */
  setChannelIndex(channel: number): void {
    this.channelIndex = channel;
  }

  // ===========================================================================
  // Oscilloscope
  // ===========================================================================

  /**
   * Get oscilloscope data (latest buffer)
   */
  getOscData(): Float32Array | null {
    return this.oscBuffer;
  }

  /**
   * Subscribe to oscilloscope data updates
   * Returns unsubscribe function
   */
  onOscData(callback: OscDataCallback): () => void {
    this.oscCallbacks.add(callback);

    // Request oscilloscope data from worklet
    if (this.workletNode && this._isReady) {
      this.workletNode.port.postMessage({ type: 'enableOsc', enabled: true });
    }

    return () => {
      this.oscCallbacks.delete(callback);
      if (this.oscCallbacks.size === 0 && this.workletNode && this._isReady) {
        this.workletNode.port.postMessage({ type: 'enableOsc', enabled: false });
      }
    };
  }

  // ===========================================================================
  // Parameters
  // ===========================================================================

  /**
   * Set a named parameter (generic)
   */
  setParam(param: string, value: number): void {
    if (!this._isReady) {
      this._pendingCalls.push({ method: 'setParam', args: [param, value] });
      return;
    }
    // Subclasses should override to map param names to IDs
    console.log(`[${this.chipName}] setParam not implemented: ${param} = ${value}`);
  }

  /**
   * Load sample data into chip RAM (for PCM chips)
   */
  loadSample(offset: number, data: Uint8Array): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'loadSample',
      offset,
      data: data.buffer,
      size: data.length,
    }, [data.buffer.slice(0)]);
  }

  /**
   * Configure a voice/slot for sample playback
   */
  configureSlot(
    slot: number,
    sampleAddr: number,
    loopStart: number,
    loopEnd: number,
    loop: boolean,
    format?: number
  ): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'configureSlot',
      slot,
      sampleAddr,
      loopStart,
      loopEnd,
      loop,
      format: format ?? 0,
    });
  }

  // ===========================================================================
  // Audio Diagnostics
  // ===========================================================================

  /**
   * Diagnostic: bypass Tone.js routing and test worklet audio directly.
   *
   * Call from browser console:
   *   window._toneEngine.instruments.get((0 << 16) | 0xFFFF).debugTestAudio()
   *
   * If you hear sound → routing chain is broken (worklet is fine).
   * If silence → worklet/WASM is the issue.
   */
  debugTestAudio(): void {
    const ctx = getDevilboxAudioContext();
    console.log(`[${this.chipName}] === DEBUG TEST AUDIO ===`);
    console.log(`  AudioContext state: ${ctx.state}`);
    console.log(`  sampleRate: ${ctx.sampleRate}`);
    console.log(`  workletNode: ${this.workletNode ? 'exists' : 'NULL'}`);
    console.log(`  _isReady: ${this._isReady}`);
    console.log(`  _disposed: ${this._disposed}`);
    console.log(`  output.gain.value: ${this.output.gain.value}`);
    console.log(`  currentNote: ${this.currentNote}`);

    if (!this.workletNode) {
      console.error(`[${this.chipName}] Cannot test: workletNode is null`);
      return;
    }

    // Create a bypass gain node connected directly to destination
    const bypass = ctx.createGain();
    bypass.gain.value = 0.3;

    // Connect: workletNode → bypass → destination
    this.workletNode.connect(bypass);
    bypass.connect(ctx.destination);

    // Also create an AnalyserNode to measure if audio is present
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    this.workletNode.connect(analyser);

    console.log(`[${this.chipName}] Bypass connected. Sending noteOn...`);

    // Send a note
    this.workletNode.port.postMessage({
      type: 'noteOn',
      note: 60,
      velocity: 100,
    });

    // Check analyser data after a short delay
    setTimeout(() => {
      const dataArray = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(dataArray);
      const maxVal = dataArray.reduce((max, v) => Math.max(max, Math.abs(v)), 0);
      console.log(`[${this.chipName}] Analyser peak after 200ms: ${maxVal.toFixed(6)}`);
      if (maxVal > 0.0001) {
        console.log(`[${this.chipName}] ✓ Worklet IS producing audio! Peak: ${maxVal.toFixed(4)}`);
        console.log(`[${this.chipName}] → The bug is in the Tone.js routing chain, not in WASM.`);
      } else {
        console.log(`[${this.chipName}] ✗ Worklet is NOT producing audio.`);
        console.log(`[${this.chipName}] → The bug is in the WASM/worklet, not in routing.`);
      }
    }, 200);

    // Clean up after 3 seconds
    setTimeout(() => {
      this.workletNode?.port.postMessage({ type: 'noteOff', note: 60 });
      try {
        this.workletNode?.disconnect(bypass);
        this.workletNode?.disconnect(analyser);
        bypass.disconnect();
        analyser.disconnect();
      } catch { /* ignore */ }
      console.log(`[${this.chipName}] Bypass test cleaned up.`);
    }, 3000);
  }

  /**
   * Diagnostic: dump the full audio routing state for this synth.
   * Call from browser console:
   *   window._toneEngine.instruments.get((0 << 16) | 0xFFFF).debugDumpRouting()
   */
  debugDumpRouting(): void {
    const ctx = getDevilboxAudioContext();
    console.log(`[${this.chipName}] === ROUTING DEBUG ===`);
    console.log(`  AudioContext.state: ${ctx.state}`);
    console.log(`  output: GainNode, gain=${this.output.gain.value.toFixed(4)}`);
    console.log(`  output.numberOfOutputs: ${this.output.numberOfOutputs}`);
    console.log(`  output.context === audioCtx: ${this.output.context === ctx}`);
    console.log(`  workletNode: ${this.workletNode ? 'exists' : 'NULL'}`);
    if (this.workletNode) {
      console.log(`  workletNode.numberOfOutputs: ${this.workletNode.numberOfOutputs}`);
      console.log(`  workletNode.channelCount: ${this.workletNode.channelCount}`);
    }
    console.log(`  _isReady: ${this._isReady}`);
    console.log(`  _disposed: ${this._disposed}`);
    console.log(`  isNoteOn: ${this.isNoteOn}`);
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  /**
   * Dispose of the synth
   */
  dispose(): void {
    this._disposed = true;
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'dispose' });
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    this.oscCallbacks.clear();
    this.output.disconnect();
  }
}
