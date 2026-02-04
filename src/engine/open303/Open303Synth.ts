import * as Tone from 'tone';
import { createAudioWorkletNode as toneCreateAudioWorkletNode } from 'tone/build/esm/core/context/AudioContext';
import { getNativeContext } from '@utils/audio-context';

/**
 * Open303 Parameter IDs (matching C++ enum)
 * Using as const object for erasableSyntaxOnly compatibility
 */
const Open303Param = {
  WAVEFORM: 0,
  TUNING: 1,
  CUTOFF: 2,
  RESONANCE: 3,
  ENV_MOD: 4,
  DECAY: 5,
  ACCENT: 6,
  VOLUME: 7,
  AMP_SUSTAIN: 10,
  SLIDE_TIME: 11,
  NORMAL_ATTACK: 12,
  ACCENT_ATTACK: 13,
  ACCENT_DECAY: 14,
  AMP_DECAY: 15,
  AMP_RELEASE: 16,
  PRE_FILTER_HP: 20,
  FEEDBACK_HP: 21,
  POST_FILTER_HP: 22,
  SQUARE_PHASE: 23,
  TANH_DRIVE: 30,
  TANH_OFFSET: 31
} as const;

export class Open303Synth extends Tone.ToneAudioNode {
  readonly name = 'Open303Synth';
  readonly input: undefined;
  readonly output: Tone.Gain;

  private workletNode: AudioWorkletNode | null = null;
  // Track which contexts have the worklet module loaded
  private static loadedContexts: WeakSet<AudioContext> = new WeakSet();
  private static initPromises: WeakMap<AudioContext, Promise<void>> = new WeakMap();

  // Post-processing effects
  private overdrive: Tone.WaveShaper;
  private overdriveGain: Tone.Gain;
  private overdriveAmount: number = 0;

  // Compatibility properties
  public config: any = {};
  public audioContext: AudioContext;
  private _disposed: boolean = false;

  constructor() {
    super();
    this.audioContext = getNativeContext(this.context);
    this.output = new Tone.Gain(1);

    // Overdrive setup (Tone.js fallback/booster)
    this.overdriveGain = new Tone.Gain(1);
    this.overdrive = new Tone.WaveShaper((x) => {
      const drive = 1 + this.overdriveAmount * 8;
      return Math.tanh(x * drive) / Math.tanh(drive);
    }, 4096);

    this.overdriveGain.connect(this.overdrive);
    this.overdrive.connect(this.output);

    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      // Get the TRUE native context from Tone.js - this is the actual browser AudioContext
      const toneContext = this.context as any;
      const nativeCtx = toneContext.rawContext || toneContext._context || getNativeContext(this.context);

      if (!nativeCtx) {
        throw new Error('Could not get native AudioContext');
      }

      await Open303Synth.ensureInitialized(nativeCtx);
      if (this._disposed) return;
      this.createNode();
    } catch (err) {
      console.error('[Open303] Initialization failed:', err);
    }
  }

  // Cache for WASM binary and JS code
  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    // Check if this specific context already has the worklet loaded
    if (this.loadedContexts.has(context)) return;

    // Check if there's already an initialization in progress for this context
    const existingPromise = this.initPromises.get(context);
    if (existingPromise) return existingPromise;

    const initPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';

      // Load worklet module for THIS context
      try {
        await context.audioWorklet.addModule(`${baseUrl}open303/Open303.worklet.js`);
      } catch (e) {
        // Module might already be added to this context
      }

      // Fetch WASM and JS code (shared across all contexts)
      if (!this.wasmBinary || !this.jsCode) {
        const [wasmResponse, jsResponse] = await Promise.all([
          fetch(`${baseUrl}open303/Open303.wasm`),
          fetch(`${baseUrl}open303/Open303.js`)
        ]);

        if (wasmResponse.ok) {
          this.wasmBinary = await wasmResponse.arrayBuffer();
        }
        if (jsResponse.ok) {
          let code = await jsResponse.text();
          // Transform Emscripten ES module output to be compatible with
          // new Function() execution in AudioWorklet scope:
          // 1. Replace import.meta.url (not available outside ES modules)
          // 2. Remove export default statement
          // 3. Alias the factory function to 'Open303' for the worklet
          code = code
            .replace(/import\.meta\.url/g, "'.'")
            .replace(/export\s+default\s+\w+;?/g, '');
          code += '\nvar Open303 = createOpen303Module;';
          this.jsCode = code;
        }
      }

      this.loadedContexts.add(context);
    })();

    this.initPromises.set(context, initPromise);
    return initPromise;
  }

  private createNode(): void {
    if (this._disposed) return;

    const toneContext = this.context as any;
    const rawContext = toneContext.rawContext || toneContext._context;

    // Create worklet using Tone.js's createAudioWorkletNode which uses standardized-audio-context
    this.workletNode = toneCreateAudioWorkletNode(rawContext, 'open303-processor', {
      outputChannelCount: [2],
      processorOptions: {
        sampleRate: rawContext.sampleRate
      }
    });

    this.workletNode.port.onmessage = (event) => {
      if (event.data.type === 'ready') {
        console.log('[Open303] WASM engine ready');
      } else if (event.data.type === 'error') {
        console.error('[Open303] Worklet error:', event.data.message);
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: rawContext.sampleRate,
      wasmBinary: Open303Synth.wasmBinary,
      jsCode: Open303Synth.jsCode
    });

    // Connect worklet to Tone.js output
    const targetNode = this.overdriveGain.input as AudioNode;
    this.workletNode.connect(targetNode);
  }

  triggerAttack(note: string | number, _time?: number, velocity: number = 1, accent: boolean = false, slide: boolean = false): void {
    if (!this.workletNode || this._disposed) return;

    const midiNote = typeof note === 'string'
      ? Tone.Frequency(note).toMidi()
      : Math.round(12 * Math.log2(note / 440) + 69);

    // Map accent flag to velocity (Open303 uses high velocity for accent)
    let finalVelocity = Math.floor(velocity * 127);
    if (accent && finalVelocity < 100) finalVelocity = 127;
    if (!accent && finalVelocity >= 100) finalVelocity = 99;

    // Pass slide flag to worklet for proper 303 slide behavior
    // When slide=true, the worklet should:
    // 1. NOT retrigger envelopes
    // 2. Glide pitch from previous note to new note
    // 3. Keep gate HIGH for legato
    this.workletNode.port.postMessage({
      type: 'noteOn',
      note: midiNote,
      velocity: finalVelocity,
      slide: slide  // Pass slide flag to worklet
    });
  }

  triggerRelease(_time?: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'noteOff',
      note: 0
    });
  }

  releaseAll(): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'allNotesOff' });
  }

  triggerAttackRelease(note: string | number, duration: string | number, time?: number, velocity?: number, accent: boolean = false, slide: boolean = false): void {
    if (this._disposed) return;
    this.triggerAttack(note, time, velocity || 1, accent, slide);

    const d = Tone.Time(duration).toSeconds();
    setTimeout(() => {
      if (!this._disposed) {
        this.triggerRelease();
      }
    }, d * 1000);
  }

  private setParameterById(paramId: number, value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setParameter',
      paramId,
      value
    });
  }

  setParam(param: string, value: number): void {
    // Map string param names to Open303 parameter IDs
    const paramMap: { [key: string]: number } = {
      'waveform': Open303Param.WAVEFORM,
      'tuning': Open303Param.TUNING,
      'cutoff': Open303Param.CUTOFF,
      'resonance': Open303Param.RESONANCE,
      'env_mod': Open303Param.ENV_MOD,
      'decay': Open303Param.DECAY,
      'accent': Open303Param.ACCENT,
      'volume': Open303Param.VOLUME,
      'amp_sustain': Open303Param.AMP_SUSTAIN,
      'slide_time': Open303Param.SLIDE_TIME,
      'normal_attack': Open303Param.NORMAL_ATTACK,
      'accent_attack': Open303Param.ACCENT_ATTACK,
      'accent_decay': Open303Param.ACCENT_DECAY,
      'amp_decay': Open303Param.AMP_DECAY,
      'amp_release': Open303Param.AMP_RELEASE,
      'pre_filter_hp': Open303Param.PRE_FILTER_HP,
      'feedback_hp': Open303Param.FEEDBACK_HP,
      'post_filter_hp': Open303Param.POST_FILTER_HP,
      'square_phase': Open303Param.SQUARE_PHASE,
      'tanh_drive': Open303Param.TANH_DRIVE,
      'tanh_offset': Open303Param.TANH_OFFSET
    };

    const paramId = paramMap[param];
    if (paramId !== undefined) {
      this.setParameterById(paramId, value);
    }
  }

  // --- Core Setters ---
  setCutoff(hz: number): void {
    this.setParameterById(Open303Param.CUTOFF, hz);
  }

  setResonance(val: number): void {
    this.setParameterById(Open303Param.RESONANCE, val);
  }

  setEnvMod(val: number): void {
    this.setParameterById(Open303Param.ENV_MOD, val);
  }

  setDecay(ms: number): void {
    this.setParameterById(Open303Param.DECAY, ms);
  }

  setAccent(val: number): void {
    this.setParameterById(Open303Param.ACCENT, val);
  }

  setAccentAmount(val: number): void {
    this.setAccent(val);
  }

  setSlideTime(ms: number): void {
    this.setParameterById(Open303Param.SLIDE_TIME, ms);
  }

  setVolume(volumeDb: number): void {
    this.setParameterById(Open303Param.VOLUME, volumeDb);
  }

  setWaveform(mix: number | string): void {
    let val = 0;
    if (typeof mix === 'string') {
      val = mix === 'square' ? 1.0 : 0.0;
    } else {
      val = mix;
    }
    this.setParameterById(Open303Param.WAVEFORM, val);
  }

  setTuning(cents: number): void {
    const hz = 440 * Math.pow(2, cents / 1200);
    this.setParameterById(Open303Param.TUNING, hz);
  }

  // --- Advanced / Devil Fish Setters ---
  enableDevilFish(_enabled: boolean, _config?: any): void {
    // Open303 advanced params are always available
  }

  setNormalDecay(ms: number): void {
    this.setParameterById(Open303Param.DECAY, ms);
  }

  setAccentDecay(ms: number): void {
    this.setParameterById(Open303Param.ACCENT_DECAY, ms);
  }

  setVegDecay(ms: number): void {
    this.setParameterById(Open303Param.AMP_DECAY, ms);
  }

  setVegSustain(percent: number): void {
    const db = Tone.gainToDb(percent / 100);
    this.setParameterById(Open303Param.AMP_SUSTAIN, db);
  }

  setSoftAttack(ms: number): void {
    this.setParameterById(Open303Param.NORMAL_ATTACK, ms);
  }

  setFilterTracking(_percent: number): void {
    // Not directly supported in Open303
  }

  setFilterFM(_percent: number): void {
    // Not directly supported in Open303
  }

  setMuffler(_mode: string): void {
    // Not directly supported in Open303
  }

  setSweepSpeed(_mode: string): void {}
  setAccentSweepEnabled(_enabled: boolean): void {}
  setQuality(_quality: string): void {}

  setHighResonance(_enabled: boolean): void {}
  setHighResonanceEnabled(enabled: boolean): void {
    this.setHighResonance(enabled);
  }

  setOverdrive(amount: number): void {
    if (this._disposed) return;
    this.overdriveAmount = Math.min(Math.max(amount, 0), 100) / 100;

    const curve = new Float32Array(4096);
    const drive = 1 + this.overdriveAmount * 8;
    for (let i = 0; i < 4096; i++) {
      const x = (i / 4096) * 2 - 1;
      curve[i] = Math.tanh(x * drive) / Math.tanh(drive);
    }
    this.overdrive.curve = curve;
    this.overdriveGain.gain.linearRampTo(1 + this.overdriveAmount * 2, 0.03);
  }

  async loadGuitarMLModel(_index: number): Promise<void> {}
  async setGuitarMLEnabled(_enabled: boolean): Promise<void> {}
  setGuitarMLMix(_mix: number): void {}

  dispose(): this {
    this._disposed = true;
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    this.overdriveGain.dispose();
    this.overdrive.dispose();
    this.output.dispose();
    super.dispose();
    return this;
  }
}

// Export as JC303Synth alias for backwards compatibility
export { Open303Synth as JC303Synth };
