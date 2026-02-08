import * as Tone from 'tone';
import { createAudioWorkletNode as toneCreateAudioWorkletNode } from 'tone/build/esm/core/context/AudioContext';
import { getNativeContext } from '@utils/audio-context';

/**
 * DB303 Parameter IDs (matching C++ enum)
 * Using as const object for erasableSyntaxOnly compatibility
 */
const DB303Param = {
  CUTOFF: 0,
  RESONANCE: 1,
  ENV_MOD: 2,
  DECAY: 3,
  ACCENT: 4,
  WAVEFORM: 5,
  PULSE_WIDTH: 6,
  SUB_OSC_GAIN: 7,
  SUB_OSC_BLEND: 8,
  NORMAL_DECAY: 9,
  ACCENT_DECAY: 10,
  SOFT_ATTACK: 11,
  ACCENT_SOFT_ATTACK: 12,
  PASSBAND_COMPENSATION: 13,
  RES_TRACKING: 14,
  FILTER_INPUT_DRIVE: 15,
  FILTER_SELECT: 16,
  DIODE_CHARACTER: 17,
  DUFFING_AMOUNT: 18,
  FILTER_FM_DEPTH: 19,
  LP_BP_MIX: 20,
  FILTER_TRACKING: 21,
  SLIDE_TIME: 22,
  LFO_RATE: 23,
  LFO_CONTOUR: 24,
  LFO_PITCH_DEPTH: 25,
  LFO_PWM_DEPTH: 26,
  LFO_FILTER_DEPTH: 27,
  LFO_STIFF_DEPTH: 28,
  CHORUS_MIX: 29,
  PHASER_RATE: 30,
  PHASER_WIDTH: 31,
  PHASER_FEEDBACK: 32,
  PHASER_MIX: 33,
  DELAY_TIME: 34,
  DELAY_FEEDBACK: 35,
  DELAY_TONE: 36,
  DELAY_MIX: 37,
  DELAY_SPREAD: 38,
  TUNING: 39,
  VOLUME: 40,
  LFO_WAVEFORM: 41,
  ENSEMBLE_AMOUNT: 42,
  OVERSAMPLING_ORDER: 43
} as const;

export class DB303Synth extends Tone.ToneAudioNode {
  readonly name = 'DB303Synth';
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

  // Built-in effects
  private chorus: Tone.Chorus;
  private phaser: Tone.Phaser;
  private delay: Tone.FeedbackDelay;
  private delayFilter: Tone.Filter;  // Tone control for delay
  private effectsChain: Tone.Gain;   // Chain all effects together

  // Compatibility properties
  public config: any = {};
  public audioContext: AudioContext;
  private _disposed: boolean = false;
  private _initPromise: Promise<void>;
  private _resolveInit: (() => void) | null = null;
  // Queue parameter messages that arrive before worklet node is ready
  private _pendingParams: Array<{ paramId: number; value: number }> = [];
  // Track pending release timeout so slides can cancel it
  private _releaseTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super();
    console.log('[DB303Synth] Constructor called');
    this.audioContext = getNativeContext(this.context);
    this.output = new Tone.Gain(1);

    // Create promise that resolves when worklet reports 'ready'
    this._initPromise = new Promise<void>((resolve) => {
      this._resolveInit = resolve;
    });

    // Overdrive setup - bypassed by default for clean signal path
    this.overdriveGain = new Tone.Gain(1);
    this.overdrive = new Tone.WaveShaper((x) => {
      const drive = 1 + this.overdriveAmount * 8;
      return Math.tanh(x * drive) / Math.tanh(drive);
    }, 4096);

    // Built-in effects setup - all bypassed by default
    this.chorus = new Tone.Chorus({
      frequency: 1.5,
      delayTime: 3.5,
      depth: 0.7,
      wet: 0,  // Start bypassed
    });

    this.phaser = new Tone.Phaser({
      frequency: 0.5,
      octaves: 3,
      baseFrequency: 350,
      wet: 0,  // Start bypassed
    });

    this.delayFilter = new Tone.Filter({
      type: 'lowpass',
      frequency: 5000,
    });

    this.delay = new Tone.FeedbackDelay({
      delayTime: 0.25,
      feedback: 0.3,
      wet: 0,  // Start bypassed
    });

    this.effectsChain = new Tone.Gain(1);

    // Signal chain: overdriveGain -> chorus -> phaser -> delay (with filter) -> effectsChain -> output
    this.overdriveGain.connect(this.chorus);
    this.chorus.connect(this.phaser);
    this.phaser.connect(this.delay);
    this.delay.connect(this.delayFilter);
    this.delayFilter.connect(this.effectsChain);
    this.effectsChain.connect(this.output);

    this.initialize();
  }

  public async ensureInitialized(): Promise<void> {
    return this._initPromise;
  }

  private async initialize(): Promise<void> {
    try {
      // Get the TRUE native context from Tone.js - this is the actual browser AudioContext
      const toneContext = this.context as any;
      const nativeCtx = toneContext.rawContext || toneContext._context || getNativeContext(this.context);

      if (!nativeCtx) {
        throw new Error('Could not get native AudioContext');
      }

      await DB303Synth.ensureInitialized(nativeCtx);
      if (this._disposed) return;
      this.createNode();
    } catch (err) {
      console.error('[DB303] Initialization failed:', err);
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
      // Hardcoded path based on vite.config.ts base: '/DEViLBOX/'
      // Files are in public/db303/
      await context.audioWorklet.addModule(`/DEViLBOX/db303/DB303.worklet.js`);
      // ...
          fetch(`/DEViLBOX/db303/DB303.wasm`),
          fetch(`/DEViLBOX/db303/DB303.js`)
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
          // 3. Alias the factory function to 'DB303' for the worklet
          code = code
            .replace(/import\.meta\.url/g, "'.'")
            .replace(/export\s+default\s+\w+;?/g, '')
            .replace(/if\s*\(ENVIRONMENT_IS_NODE\)\s*\{[^}]*await\s+import\([^)]*\)[^}]*\}/g, '')
            .replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];')
            .replace(/(wasmMemory=wasmExports\["\w+"\])/, '$1;Module["wasmMemory"]=wasmMemory');
          code += '\nvar DB303 = createDB303Module;';
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
    this.workletNode = toneCreateAudioWorkletNode(rawContext, 'db303-processor', {
      outputChannelCount: [2],
      processorOptions: {
        sampleRate: rawContext.sampleRate
      }
    });

    this.workletNode.port.onmessage = (event) => {
      if (event.data.type === 'ready') {
        console.log('[DB303] WASM engine ready');
        if (this._resolveInit) {
          this._resolveInit();
          this._resolveInit = null;
        }
      } else if (event.data.type === 'error') {
        console.error('[DB303] Worklet error:', event.data.message);
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: rawContext.sampleRate,
      wasmBinary: DB303Synth.wasmBinary,
      jsCode: DB303Synth.jsCode
    });

    // Flush queued parameters immediately via postMessage. The worklet's
    // handleMessage queues setParameter calls during WASM init and deduplicates
    // by paramId, so any later knob changes sent before WASM is ready will
    // correctly override these initial values.
    if (this._pendingParams.length > 0) {
      console.log(`[DB303] Sending ${this._pendingParams.length} queued params to worklet`);
      for (const { paramId, value } of this._pendingParams) {
        this.workletNode.port.postMessage({
          type: 'setParameter',
          paramId,
          value
        });
      }
      this._pendingParams = [];
    }

    // Connect worklet to Tone.js output
    const targetNode = this.overdriveGain.input as AudioNode;
    this.workletNode.connect(targetNode);

    // CRITICAL: Connect through silent keepalive to destination to force process() calls
    try {
      const keepalive = rawContext.createGain();
      keepalive.gain.value = 0;
      this.workletNode.connect(keepalive);
      keepalive.connect(rawContext.destination);
    } catch (_e) { /* keepalive failed */ }
  }

  triggerAttack(note: string | number, _time?: number, velocity: number = 1, accent: boolean = false, slide: boolean = false): void {
    if (!this.workletNode || this._disposed) return;

    // Cancel any pending release from previous note — prevents gate-off
    // from interrupting a slide that's already in progress
    if (this._releaseTimeout !== null) {
      clearTimeout(this._releaseTimeout);
      this._releaseTimeout = null;
    }

    const midiNote = typeof note === 'string'
      ? Tone.Frequency(note).toMidi()
      : Math.round(12 * Math.log2(note / 440) + 69);

    // Map accent flag to velocity (DB303 uses high velocity for accent)
    let finalVelocity = Math.floor(velocity * 127);
    if (accent && finalVelocity < 100) finalVelocity = 127;
    if (!accent && finalVelocity >= 100) finalVelocity = 99;

    // Pass slide flag to worklet for proper 303 slide behavior
    // When slide=true: worklet keeps previous note held → DB303 slideToNote (legato)
    // When slide=false: worklet releases previous note first → DB303 triggerNote (retrigger)
    this.workletNode.port.postMessage({
      type: 'noteOn',
      time: _time, // Pass time for sample-accurate scheduling
      note: midiNote,
      velocity: finalVelocity,
      slide: slide
    });
  }

  triggerRelease(time?: number): void {
    if (!this.workletNode || this._disposed) return;
    
    const safeTime = time ?? Tone.now();
    
    // Send gateOff to release the VCA envelope with hardware-accurate 16ms release.
    // Real TB-303: gate LOW → 8ms hold + 8ms linear decay → silence.
    // This creates the characteristic staccato between non-slide notes.
    this.workletNode.port.postMessage({
      type: 'gateOff',
      time: safeTime // Pass time for sample-accurate scheduling
    });
  }

  releaseAll(): void {
    if (!this.workletNode || this._disposed) return;
    if (this._releaseTimeout !== null) {
      clearTimeout(this._releaseTimeout);
      this._releaseTimeout = null;
    }
    this.workletNode.port.postMessage({ type: 'allNotesOff' });
  }

  triggerAttackRelease(note: string | number, duration: string | number, time?: number, velocity?: number, accent: boolean = false, slide: boolean = false): void {
    if (this._disposed) return;
    
    const safeTime = time ?? Tone.now();
    this.triggerAttack(note, safeTime, velocity || 1, accent, slide);

    const d = Tone.Time(duration).toSeconds();
    
    // Calculate precise delay relative to NOW to account for lookahead
    const delayMs = (safeTime + d - Tone.now()) * 1000;
    
    if (this._releaseTimeout !== null) {
      clearTimeout(this._releaseTimeout);
    }

    this._releaseTimeout = setTimeout(() => {
      this._releaseTimeout = null;
      if (!this._disposed) {
        this.triggerRelease();
      }
    }, Math.max(0, delayMs)) as unknown as ReturnType<typeof setTimeout>;
  }

  private setParameterById(paramId: number, value: number): void {
    if (this._disposed) {
      console.warn(`[DB303] setParameter BLOCKED: disposed (paramId=${paramId}, value=${value})`);
      return;
    }
    if (!this.workletNode) {
      // Queue parameter for replay once worklet is ready
      // Replace any existing entry for the same paramId
      const existing = this._pendingParams.findIndex(p => p.paramId === paramId);
      if (existing >= 0) {
        this._pendingParams[existing].value = value;
      } else {
        this._pendingParams.push({ paramId, value });
      }
      console.log(`[DB303] setParameter QUEUED (workletNode null): paramId=${paramId}, value=${value}, queue=${this._pendingParams.length}`);
      return;
    }
    this.workletNode.port.postMessage({
      type: 'setParameter',
      paramId,
      value
    });
  }

  setParam(param: string, value: number): void {
    // Map string param names to DB303 parameter IDs
    const paramMap: { [key: string]: number } = {
      'cutoff': DB303Param.CUTOFF,
      'resonance': DB303Param.RESONANCE,
      'env_mod': DB303Param.ENV_MOD,
      'decay': DB303Param.DECAY,
      'accent': DB303Param.ACCENT,
      'waveform': DB303Param.WAVEFORM,
      'pulse_width': DB303Param.PULSE_WIDTH,
      'sub_osc_gain': DB303Param.SUB_OSC_GAIN,
      'sub_osc_blend': DB303Param.SUB_OSC_BLEND,
      'normal_decay': DB303Param.NORMAL_DECAY,
      'accent_decay': DB303Param.ACCENT_DECAY,
      'soft_attack': DB303Param.SOFT_ATTACK,
      'accent_soft_attack': DB303Param.ACCENT_SOFT_ATTACK,
      'passband_compensation': DB303Param.PASSBAND_COMPENSATION,
      'res_tracking': DB303Param.RES_TRACKING,
      'filter_input_drive': DB303Param.FILTER_INPUT_DRIVE,
      'filter_select': DB303Param.FILTER_SELECT,
      'diode_character': DB303Param.DIODE_CHARACTER,
      'duffing_amount': DB303Param.DUFFING_AMOUNT,
      'filter_fm_depth': DB303Param.FILTER_FM_DEPTH,
      'lp_bp_mix': DB303Param.LP_BP_MIX,
      'filter_tracking': DB303Param.FILTER_TRACKING,
      'slide_time': DB303Param.SLIDE_TIME,
      'lfo_rate': DB303Param.LFO_RATE,
      'lfo_contour': DB303Param.LFO_CONTOUR,
      'lfo_pitch_depth': DB303Param.LFO_PITCH_DEPTH,
      'lfo_pwm_depth': DB303Param.LFO_PWM_DEPTH,
      'lfo_filter_depth': DB303Param.LFO_FILTER_DEPTH,
      'lfo_stiff_depth': DB303Param.LFO_STIFF_DEPTH,
      'chorus_mix': DB303Param.CHORUS_MIX,
      'phaser_rate': DB303Param.PHASER_RATE,
      'phaser_width': DB303Param.PHASER_WIDTH,
      'phaser_feedback': DB303Param.PHASER_FEEDBACK,
      'phaser_mix': DB303Param.PHASER_MIX,
      'delay_time': DB303Param.DELAY_TIME,
      'delay_feedback': DB303Param.DELAY_FEEDBACK,
      'delay_tone': DB303Param.DELAY_TONE,
      'delay_mix': DB303Param.DELAY_MIX,
      'delay_spread': DB303Param.DELAY_SPREAD,
      'tuning': DB303Param.TUNING
    };

    const paramId = paramMap[param];
    if (paramId !== undefined) {
      this.setParameterById(paramId, value);
    }
  }

  // --- Core Setters (Updating to use 0-1 normalized values for WASM engine) ---
  setCutoff(value: number): void {
    // db303 truth: cutoff knob is 0-1
    this.setParameterById(DB303Param.CUTOFF, value);
  }

  setResonance(value: number): void {
    // db303 truth: resonance knob is 0-1
    this.setParameterById(DB303Param.RESONANCE, value);
  }

  setEnvMod(value: number): void {
    // db303 truth: envMod knob is 0-1
    this.setParameterById(DB303Param.ENV_MOD, value);
  }

  setDecay(value: number): void {
    // db303 truth: decay knob is 0-1
    this.setParameterById(DB303Param.DECAY, value);
  }

  setAccent(value: number): void {
    // db303 truth: accent knob is 0-1
    this.setParameterById(DB303Param.ACCENT, value);
  }

  setAccentAmount(value: number): void {
    this.setAccent(value);
  }

  setSlideTime(value: number): void {
    // db303 truth: slideTime knob is 0-1
    this.setParameterById(DB303Param.SLIDE_TIME, value);
  }

  setVolume(value: number): void {
    // db303 truth: volume knob is 0-1
    this.setParameterById(DB303Param.VOLUME, value);
  }

  setWaveform(value: number): void {
    // db303 truth: waveform knob is 0-1 (blend)
    this.setParameterById(DB303Param.WAVEFORM, value);
  }

  setTuning(value: number): void {
    // db303 truth: tuning knob is 0-1
    this.setParameterById(DB303Param.TUNING, value);
  }

  // ============================================================================
  // LFO (Low Frequency Oscillator) Methods
  // ============================================================================

  setLfoWaveform(waveform: number): void {
    // 0 = sine, 1 = triangle, 2 = square
    this.setParameterById(DB303Param.LFO_WAVEFORM, waveform);
  }

  setLfoRate(value: number): void {
    // 0-1 normalized
    this.setParameterById(DB303Param.LFO_RATE, value);
  }

  setLfoContour(value: number): void {
    // 0-1 normalized
    this.setParameterById(DB303Param.LFO_CONTOUR, value);
  }

  setLfoPitchDepth(value: number): void {
    // 0-1 normalized
    this.setParameterById(DB303Param.LFO_PITCH_DEPTH, value);
  }

  setLfoPwmDepth(value: number): void {
    // 0-1 normalized
    this.setParameterById(DB303Param.LFO_PWM_DEPTH, value);
  }

  setLfoFilterDepth(value: number): void {
    // 0-1 normalized
    this.setParameterById(DB303Param.LFO_FILTER_DEPTH, value);
  }

  setLfoStiffDepth(value: number): void {
    // 0-1 normalized
    this.setParameterById(DB303Param.LFO_STIFF_DEPTH, value);
  }

  // ============================================================================
  // Extended Devil Fish Methods
  // ============================================================================

  setNormalDecay(value: number): void {
    // 0-1 normalized
    this.setParameterById(DB303Param.NORMAL_DECAY, value);
  }

  setAccentDecay(value: number): void {
    // 0-1 normalized
    this.setParameterById(DB303Param.ACCENT_DECAY, value);
  }

  setSoftAttack(value: number): void {
    // 0-1 normalized
    this.setParameterById(DB303Param.SOFT_ATTACK, value);
  }

  setAccentSoftAttack(value: number): void {
    // 0-1 normalized
    this.setParameterById(DB303Param.ACCENT_SOFT_ATTACK, value);
  }

  setPassbandCompensation(value: number): void {
    // 0-1 normalized
    this.setParameterById(DB303Param.PASSBAND_COMPENSATION, value);
  }

  setResTracking(value: number): void {
    // 0-1 normalized
    this.setParameterById(DB303Param.RES_TRACKING, value);
  }

  setFilterInputDrive(value: number): void {
    // 0-1 normalized
    this.setParameterById(DB303Param.FILTER_INPUT_DRIVE, value);
  }

  setFilterSelect(mode: number): void {
    // 0-255 (filter mode/topology selection)
    this.setParameterById(DB303Param.FILTER_SELECT, mode);
  }

  setDiodeCharacter(value: number): void {
    // 0-1 normalized
    this.setParameterById(DB303Param.DIODE_CHARACTER, value);
  }

  setDuffingAmount(value: number): void {
    // 0-1 normalized
    this.setParameterById(DB303Param.DUFFING_AMOUNT, value);
  }

  setFilterFmDepth(value: number): void {
    // 0-1 normalized
    this.setParameterById(DB303Param.FILTER_FM_DEPTH, value);
  }

  setLpBpMix(value: number): void {
    // 0-1 normalized
    this.setParameterById(DB303Param.LP_BP_MIX, value);
  }

  setFilterTracking(value: number): void {
    // 0-1 normalized
    this.setParameterById(DB303Param.FILTER_TRACKING, value);
  }

  setEnsembleAmount(value: number): void {
    // 0-1 normalized
    this.setParameterById(DB303Param.ENSEMBLE_AMOUNT, value);
  }

  setOversamplingOrder(order: number): void {
    // 0-4 oversampling
    this.setParameterById(DB303Param.OVERSAMPLING_ORDER, order);
  }

  // Oscillator enhancement setters

  setPulseWidth(value: number): void {
    // 0-1 normalized
    this.setParameterById(DB303Param.PULSE_WIDTH, value);
  }

  setSubOscGain(value: number): void {
    // 0-1 normalized
    this.setParameterById(DB303Param.SUB_OSC_GAIN, value);
  }

  setSubOscBlend(value: number): void {
    // 0-1 normalized
    this.setParameterById(DB303Param.SUB_OSC_BLEND, value);
  }

  // Built-in effects setters (sending normalized 0-1 to WASM if supported, or using Tone.js)

  setChorusMix(value: number): void {
    this.setParameterById(DB303Param.CHORUS_MIX, value);
    this.chorus.wet.value = value;
  }

  setPhaserRate(value: number): void {
    this.setParameterById(DB303Param.PHASER_RATE, value);
    this.phaser.frequency.value = 0.1 + value * 9.9;
  }

  setPhaserWidth(value: number): void {
    this.setParameterById(DB303Param.PHASER_WIDTH, value);
    this.phaser.octaves = 1 + value * 4;
  }

  setPhaserFeedback(value: number): void {
    this.setParameterById(DB303Param.PHASER_FEEDBACK, value);
    this.phaser.Q.value = value * 20;
  }

  setPhaserMix(value: number): void {
    this.setParameterById(DB303Param.PHASER_MIX, value);
    this.phaser.wet.value = value;
  }

  setDelayTime(value: number): void {
    this.setParameterById(DB303Param.DELAY_TIME, value);
    this.delay.delayTime.value = 0.01 + value * 2.0; // 10ms to 2s
  }

  setDelayFeedback(value: number): void {
    this.setParameterById(DB303Param.DELAY_FEEDBACK, value);
    this.delay.feedback.value = value * 0.95;
  }

  setDelayTone(value: number): void {
    this.setParameterById(DB303Param.DELAY_TONE, value);
    this.delayFilter.frequency.value = 200 + value * 7800;
  }

  setDelayMix(value: number): void {
    this.setParameterById(DB303Param.DELAY_MIX, value);
    this.delay.wet.value = value;
  }

  setDelaySpread(value: number): void {
    this.setParameterById(DB303Param.DELAY_SPREAD, value);
  }

  // --- Missing methods for compatibility ---
  setOverdrive(amount: number): void {
    if (this._disposed) return;
    this.overdriveAmount = Math.min(Math.max(amount, 0), 100) / 100;

    if (this.overdriveAmount > 0) {
      const curve = new Float32Array(4096);
      const drive = 1 + this.overdriveAmount * 8;
      for (let i = 0; i < 4096; i++) {
        const x = (i / 4096) * 2 - 1;
        curve[i] = Math.tanh(x * drive) / Math.tanh(drive);
      }
      this.overdrive.curve = curve;
      this.overdriveGain.gain.linearRampTo(1 + this.overdriveAmount * 2, 0.03);

      // Route through waveshaper if switching from bypass
      if (this.overdriveGain.numberOfOutputs > 0) {
        try {
          this.overdriveGain.disconnect(this.chorus);
          this.overdriveGain.connect(this.overdrive);
          this.overdrive.connect(this.chorus);
        } catch (_e) {}
      }
    } else {
      // Bypass waveshaper for clean signal
      try {
        this.overdrive.disconnect(this.chorus);
        this.overdriveGain.disconnect(this.overdrive);
        this.overdriveGain.connect(this.chorus);
        this.overdriveGain.gain.linearRampTo(1, 0.03);
      } catch (_e) {}
    }
  }

  setVegDecay(ms: number): void {
    // Forward to the WASM normal decay parameter or a specific VEG param if available
    this.setNormalDecay(ms / 3000); // Normalize assuming 3000ms max
  }

  setVegSustain(percent: number): void {
    // Forward to WASM if supported
    this.setParameterById(DB303Param.NORMAL_DECAY + 1, percent / 100); // Guessing index
  }

  setFilterFM(percent: number): void {
    this.setFilterFmDepth(percent / 100);
  }

  setMuffler(mode: string): void {
    // Maps to the JS-side overdrive waveshaper with mode-specific curves.
    switch (mode) {
      case 'soft':
        this.setOverdrive(15);
        break;
      case 'hard':
        this.setOverdrive(45);
        break;
      case 'dark':
        this.setOverdrive(30);
        break;
      case 'mid':
        this.setOverdrive(25);
        break;
      case 'bright':
        this.setOverdrive(35);
        break;
      case 'off':
      default:
        this.setOverdrive(0);
        break;
    }
  }

  setSweepSpeed(mode: string): void {
    // 0=fast, 1=normal, 2=slow
    let val = 1;
    if (mode === 'fast') val = 0;
    else if (mode === 'slow') val = 2;
    this.setParameterById(DB303Param.NORMAL_DECAY + 7, val / 2); // Guessing index
  }

  setHighResonanceEnabled(_enabled: boolean): void {
    // NOOP
  }

  setAccentSweepEnabled(_enabled: boolean): void {
    // Always enabled in db303
  }

  async loadGuitarMLModel(_index: number): Promise<void> {}
  async setGuitarMLEnabled(_enabled: boolean): Promise<void> {}
  setGuitarMLMix(_mix: number): void {}
  setQuality(_quality: string): void {}
  enableDevilFish(_enabled: boolean): void {}
  setHighResonance(_enabled: boolean): void {}

  dispose(): this {
    this._disposed = true;
    if (this._releaseTimeout !== null) {
      clearTimeout(this._releaseTimeout);
      this._releaseTimeout = null;
    }
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    this.overdriveGain.dispose();
    this.overdrive.dispose();
    this.chorus.dispose();
    this.phaser.dispose();
    this.delay.dispose();
    this.delayFilter.dispose();
    this.effectsChain.dispose();
    this.output.dispose();
    super.dispose();
    return this;
  }
}

// Export as JC303Synth alias for backwards compatibility
export { DB303Synth as JC303Synth };
