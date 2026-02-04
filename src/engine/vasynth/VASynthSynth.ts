import * as Tone from 'tone';
import { createAudioWorkletNode as toneCreateAudioWorkletNode } from 'tone/build/esm/core/context/AudioContext';
import { getNativeContext } from '@utils/audio-context';

/**
 * VASynth Parameter IDs (matching C++ enum)
 */
const VASynthParam = {
  VOLUME: 0,
  OSC1_WAVE: 1,
  OSC2_WAVE: 2,
  OSC_MIX: 3,
  OSC2_DETUNE: 4,
  FILTER_CUTOFF: 5,
  FILTER_RES: 6,
  FILTER_ENV_DEPTH: 7,
} as const;

/**
 * VASynth Presets
 */
export const VASynthPreset = {
  BASS: 0,      // Deep saw bass with filter sweep
  LEAD: 1,      // Bright square lead
  PAD: 2,       // Lush detuned pad
  BRASS: 3,     // Punchy brass stab
  STRINGS: 4,   // Slow evolving strings
  PLUCK: 5,     // Short percussive pluck
  KEYS: 6,      // Electric piano style
  FX: 7,        // Resonant sweep
} as const;

/**
 * VASynth Waveforms
 */
export const VASynthWaveform = {
  SAW: 0,
  SQUARE: 1,
  TRIANGLE: 2,
  SINE: 3,
  PULSE: 4,
} as const;

/**
 * VASynth - Virtual Analog Subtractive Synthesizer (WASM)
 *
 * Combines MAME Virtual Analog building blocks (va_eg, va_vca, va_vcf)
 * into a complete subtractive synthesizer. Compiled to WebAssembly for
 * authentic analog-style synthesis with real-time filter modulation.
 *
 * Signal chain: OSC1 + OSC2 → 4th-order resonant LPF → VCA → Output
 *
 * The 4th-order lowpass filter uses Zavalishin's TPT (Topology Preserving
 * Transform) discretization with Oberheim variation, producing authentic
 * analog-style resonance with tanh() saturation. This is the same algorithm
 * used in MAME's va_vcf.cpp for emulating CEM3320 and similar analog filters.
 *
 * The envelope generators use RC-based exponential curves matching real
 * analog RC charge/discharge behavior, as in MAME's va_eg.cpp.
 *
 * Features:
 * - 2 oscillators per voice (saw, square, triangle, sine, pulse)
 * - Oscillator mix and detune controls
 * - 4th-order resonant lowpass filter (TPT ladder, self-oscillation above res=4)
 * - tanh() saturation for analog warmth
 * - 2 RC envelopes per voice (amplitude + filter cutoff modulation)
 * - Filter envelope depth control
 * - 8 presets: Bass, Lead, Pad, Brass, Strings, Pluck, Keys, FX
 * - 8-voice polyphony, MIDI-controlled
 *
 * Based on: CEM3320/CEM3360/CA3280 analog synth IC emulations from MAME
 */
export class VASynthSynth extends Tone.ToneAudioNode {
  readonly name = 'VASynthSynth';
  readonly input: undefined;
  readonly output: Tone.Gain;

  private workletNode: AudioWorkletNode | null = null;
  private static isWorkletLoaded: boolean = false;
  private static initializationPromise: Promise<void> | null = null;

  public config: Record<string, unknown> = {};
  public audioContext: AudioContext;
  private _disposed: boolean = false;
  private _initPromise!: Promise<void>;
  private _pendingCalls: Array<{ method: string; args: any[] }> = [];
  private _isReady = false;

  constructor() {
    super();
    this.audioContext = getNativeContext(this.context);
    this.output = new Tone.Gain(1);
    this._initPromise = this.initialize();
  }

  public async ensureInitialized(): Promise<void> {
    return this._initPromise;
  }

  private async initialize(): Promise<void> {
    try {
      const context = getNativeContext(this.context);
      await VASynthSynth.ensureInitialized(context);
      if (this._disposed) return;
      this.createNode();
    } catch (err) {
      console.error('[VASynth] Initialization failed:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.isWorkletLoaded) return;
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';
      if (!this.isWorkletLoaded) {
        try {
          await context.audioWorklet.addModule(`${baseUrl}mame/VASynth.worklet.js`);
        } catch (_e) {
          // Module might already be added
        }
        this.isWorkletLoaded = true;
      }
    })();

    return this.initializationPromise;
  }

  private createNode(): void {
    if (this._disposed) return;

    const toneContext = this.context as any;
    const rawContext = toneContext.rawContext || toneContext._context;

    this.workletNode = toneCreateAudioWorkletNode(rawContext, 'vasynth-processor', {
      outputChannelCount: [2],
      processorOptions: {
        sampleRate: rawContext.sampleRate,
      },
    });

    this.workletNode.port.onmessage = (event) => {
      if (event.data.type === 'ready') {
        console.log('[VASynth] WASM node ready');
        this._isReady = true;
        for (const call of this._pendingCalls) {
          if (call.method === 'setParam') this.setParam(call.args[0], call.args[1]);
          else if (call.method === 'loadPreset') this.loadPreset(call.args[0]);
        }
        this._pendingCalls = [];
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: rawContext.sampleRate,
    });

    const targetNode = this.output.input as AudioNode;
    this.workletNode.connect(targetNode);

    // CRITICAL: Connect through silent keepalive to destination to force process() calls
    try {
      const keepalive = rawContext.createGain();
      keepalive.gain.value = 0;
      this.workletNode.connect(keepalive);
      keepalive.connect(rawContext.destination);
    } catch (_e) { /* keepalive failed */ }
  }

  // ========================================================================
  // MIDI-style note interface
  // ========================================================================

  triggerAttack(note: string | number, _time?: number, velocity: number = 1): void {
    if (!this.workletNode || this._disposed) return;

    const midiNote =
      typeof note === 'string'
        ? Tone.Frequency(note).toMidi()
        : Math.round(12 * Math.log2(note / 440) + 69);

    this.workletNode.port.postMessage({
      type: 'noteOn',
      note: midiNote,
      velocity: Math.floor(velocity * 127),
    });
  }

  triggerRelease(note?: string | number, _time?: number): void {
    if (!this.workletNode || this._disposed) return;
    if (note !== undefined) {
      const midiNote =
        typeof note === 'string'
          ? Tone.Frequency(note).toMidi()
          : Math.round(12 * Math.log2(note / 440) + 69);
      this.workletNode.port.postMessage({ type: 'noteOff', note: midiNote });
    } else {
      this.workletNode.port.postMessage({ type: 'allNotesOff' });
    }
  }

  releaseAll(): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'allNotesOff' });
  }

  triggerAttackRelease(
    note: string | number,
    duration: string | number,
    time?: number,
    velocity?: number
  ): void {
    if (this._disposed) return;
    this.triggerAttack(note, time, velocity || 1);

    const d = Tone.Time(duration).toSeconds();
    setTimeout(() => {
      if (!this._disposed) {
        this.triggerRelease(note);
      }
    }, d * 1000);
  }

  // ========================================================================
  // Parameter interface
  // ========================================================================

  private setParameterById(paramId: number, value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'setParameter', paramId, value });
  }

  setParam(param: string, value: number): void {
    if (!this._isReady) {
      this._pendingCalls.push({ method: 'setParam', args: [param, value] });
      return;
    }
    const paramMap: Record<string, number> = {
      volume: VASynthParam.VOLUME,
      osc1_wave: VASynthParam.OSC1_WAVE,
      osc2_wave: VASynthParam.OSC2_WAVE,
      osc_mix: VASynthParam.OSC_MIX,
      osc2_detune: VASynthParam.OSC2_DETUNE,
      filter_cutoff: VASynthParam.FILTER_CUTOFF,
      filter_res: VASynthParam.FILTER_RES,
      filter_env_depth: VASynthParam.FILTER_ENV_DEPTH,
    };

    const paramId = paramMap[param];
    if (paramId !== undefined) {
      this.setParameterById(paramId, value);
    }
  }

  // ========================================================================
  // Convenience setters
  // ========================================================================

  /** Set output volume (0-1) */
  setVolume(value: number): void {
    this.sendMessage('setVolume', value);
  }

  /** Load a preset (0-7). Use VASynthPreset constants. */
  loadPreset(program: number): void {
    if (!this._isReady) {
      this._pendingCalls.push({ method: 'loadPreset', args: [program] });
      return;
    }
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'programChange', program });
  }

  /** Set oscillator 1 waveform (0-4). Use VASynthWaveform constants. */
  setOsc1Wave(waveform: number): void {
    this.setParameterById(VASynthParam.OSC1_WAVE, waveform);
  }

  /** Set oscillator 2 waveform (0-4). Use VASynthWaveform constants. */
  setOsc2Wave(waveform: number): void {
    this.setParameterById(VASynthParam.OSC2_WAVE, waveform);
  }

  /** Set oscillator mix (0 = OSC1 only, 1 = OSC2 only) */
  setOscMix(mix: number): void {
    this.setParameterById(VASynthParam.OSC_MIX, mix);
  }

  /** Set oscillator 2 detune in semitones (-12 to +12) */
  setOsc2Detune(semitones: number): void {
    this.setParameterById(VASynthParam.OSC2_DETUNE, semitones);
  }

  /** Set filter cutoff frequency in Hz (20-20000) */
  setFilterCutoff(hz: number): void {
    this.setParameterById(VASynthParam.FILTER_CUTOFF, hz);
  }

  /** Set filter resonance (0-4.5, self-oscillation above 4) */
  setFilterResonance(resonance: number): void {
    this.setParameterById(VASynthParam.FILTER_RES, resonance);
  }

  /** Set filter envelope depth (0-1) */
  setFilterEnvDepth(depth: number): void {
    this.setParameterById(VASynthParam.FILTER_ENV_DEPTH, depth);
  }

  // ========================================================================
  // MIDI CC and pitch bend
  // ========================================================================

  controlChange(cc: number, value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'controlChange', cc, value });
  }

  pitchBend(value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'pitchBend', value });
  }

  // ========================================================================
  // Internal
  // ========================================================================

  private sendMessage(type: string, value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type, value });
  }

  dispose(): this {
    this._disposed = true;
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'dispose' });
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    this.output.dispose();
    super.dispose();
    return this;
  }
}

export default VASynthSynth;
