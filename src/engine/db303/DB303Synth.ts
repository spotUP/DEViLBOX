import * as Tone from 'tone';
import { createAudioWorkletNode as toneCreateAudioWorkletNode } from 'tone/build/esm/core/context/AudioContext';
import { getNativeContext } from '@utils/audio-context';

/**
 * DB303 Parameter IDs (matching C++ enum)
 * Using as const object for erasableSyntaxOnly compatibility
 */
const DB303Param = {
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
  TANH_OFFSET: 31,
  // LFO parameters (32-37)
  LFO_WAVEFORM: 32,
  LFO_RATE: 33,
  LFO_CONTOUR: 34,
  LFO_PITCH_DEPTH: 35,
  LFO_PWM_DEPTH: 36,
  LFO_FILTER_DEPTH: 37,
  // Extended Devil Fish parameters (38-47)
  ACCENT_SOFT_ATTACK: 38,
  PASSBAND_COMPENSATION: 39,
  RES_TRACKING: 40,
  DUFFING_AMOUNT: 41,
  LP_BP_MIX: 42,
  STAGE_NL_AMOUNT: 43,
  FILTER_SELECT: 44,
  DIODE_CHARACTER: 45,
  ENSEMBLE_AMOUNT: 46,
  OVERSAMPLING_ORDER: 47,
  // Oscillator enhancements (48-50)
  PULSE_WIDTH: 48,
  SUB_OSC_GAIN: 49,
  SUB_OSC_BLEND: 50
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

  // Devil Fish state tracking
  private _baseCutoff: number = 1000;       // Base cutoff before filter tracking adjustment
  private _filterTracking: number = 0;      // 0-200% - filter frequency tracks note pitch
  private _highResonance: boolean = false;   // Enable self-oscillation range
  private _baseResonance: number = 50;       // Store base resonance for high-reso scaling
  private _lastMidiNote: number = 36;        // Last played note for filter tracking (C2 reference)

  constructor() {
    super();
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
      const baseUrl = import.meta.env.BASE_URL || '/';

      // Load worklet module for THIS context
      try {
        await context.audioWorklet.addModule(`${baseUrl}db303/DB303.worklet.js`);
      } catch (e) {
        // Module might already be added to this context
      }

      // Fetch WASM and JS code (shared across all contexts)
      if (!this.wasmBinary || !this.jsCode) {
        const [wasmResponse, jsResponse] = await Promise.all([
          fetch(`${baseUrl}db303/DB303.wasm`),
          fetch(`${baseUrl}db303/DB303.js`)
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

    // Track note for filter tracking
    this._lastMidiNote = midiNote;
    if (this._filterTracking > 0) {
      this.applyFilterTracking();
    }

    // Pass slide flag to worklet for proper 303 slide behavior
    // When slide=true: worklet keeps previous note held → DB303 slideToNote (legato)
    // When slide=false: worklet releases previous note first → DB303 triggerNote (retrigger)
    this.workletNode.port.postMessage({
      type: 'noteOn',
      note: midiNote,
      velocity: finalVelocity,
      slide: slide
    });
  }

  triggerRelease(_time?: number): void {
    if (!this.workletNode || this._disposed) return;
    // Send gateOff to release the VCA envelope with hardware-accurate 16ms release.
    // Real TB-303: gate LOW → 8ms hold + 8ms linear decay → silence.
    // This creates the characteristic staccato between non-slide notes.
    this.workletNode.port.postMessage({
      type: 'gateOff'
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
    this._releaseTimeout = setTimeout(() => {
      this._releaseTimeout = null;
      if (!this._disposed) {
        this.triggerRelease();
      }
    }, d * 1000);
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
    // Route through named setters for params that have special processing
    switch (param) {
      case 'resonance': this.setResonance(value); return;
      case 'cutoff': this.setCutoff(value); return;
    }

    // Map string param names to DB303 parameter IDs
    const paramMap: { [key: string]: number } = {
      'waveform': DB303Param.WAVEFORM,
      'tuning': DB303Param.TUNING,
      'env_mod': DB303Param.ENV_MOD,
      'decay': DB303Param.DECAY,
      'accent': DB303Param.ACCENT,
      'volume': DB303Param.VOLUME,
      'amp_sustain': DB303Param.AMP_SUSTAIN,
      'slide_time': DB303Param.SLIDE_TIME,
      'normal_attack': DB303Param.NORMAL_ATTACK,
      'accent_attack': DB303Param.ACCENT_ATTACK,
      'accent_decay': DB303Param.ACCENT_DECAY,
      'amp_decay': DB303Param.AMP_DECAY,
      'amp_release': DB303Param.AMP_RELEASE,
      'pre_filter_hp': DB303Param.PRE_FILTER_HP,
      'feedback_hp': DB303Param.FEEDBACK_HP,
      'post_filter_hp': DB303Param.POST_FILTER_HP,
      'square_phase': DB303Param.SQUARE_PHASE,
      'tanh_drive': DB303Param.TANH_DRIVE,
      'tanh_offset': DB303Param.TANH_OFFSET
    };

    const paramId = paramMap[param];
    if (paramId !== undefined) {
      this.setParameterById(paramId, value);
    }
  }

  // --- Core Setters ---
  setCutoff(hz: number): void {
    this._baseCutoff = hz;
    // Apply filter tracking if active, otherwise send directly
    if (this._filterTracking > 0) {
      this.applyFilterTracking();
    } else {
      this.setParameterById(DB303Param.CUTOFF, hz);
    }
  }

  setResonance(val: number): void {
    this._baseResonance = val;
    this.applyResonance();
  }

  setEnvMod(val: number): void {
    this.setParameterById(DB303Param.ENV_MOD, val);
  }

  setDecay(ms: number): void {
    this.setParameterById(DB303Param.DECAY, ms);
  }

  setAccent(val: number): void {
    this.setParameterById(DB303Param.ACCENT, val);
  }

  setAccentAmount(val: number): void {
    this.setAccent(val);
  }

  setSlideTime(ms: number): void {
    this.setParameterById(DB303Param.SLIDE_TIME, ms);
  }

  setVolume(volumeDb: number): void {
    this.setParameterById(DB303Param.VOLUME, volumeDb);
  }

  setWaveform(mix: number | string): void {
    let val = 0;
    if (typeof mix === 'string') {
      val = mix === 'square' ? 1.0 : 0.0;
    } else {
      val = mix;
    }
    this.setParameterById(DB303Param.WAVEFORM, val);
  }

  setTuning(cents: number): void {
    const hz = 440 * Math.pow(2, cents / 1200);
    this.setParameterById(DB303Param.TUNING, hz);
  }

  // --- Filter Tracking & Resonance Helpers ---
  private applyFilterTracking(): void {
    if (this._filterTracking <= 0) {
      // No tracking - send base cutoff as-is
      this.setParameterById(DB303Param.CUTOFF, this._baseCutoff);
      return;
    }
    // Scale cutoff based on note distance from C2 (MIDI 36)
    // At 100% tracking: cutoff doubles per octave (follows pitch 1:1)
    // At 200% tracking: cutoff quadruples per octave
    const semitoneOffset = this._lastMidiNote - 36;
    const trackingScale = (this._filterTracking / 100);
    const cutoffMultiplier = Math.pow(2, (semitoneOffset / 12) * trackingScale);
    const adjustedCutoff = Math.max(20, Math.min(20000, this._baseCutoff * cutoffMultiplier));
    this.setParameterById(DB303Param.CUTOFF, adjustedCutoff);
  }

  private applyResonance(): void {
    const reso = this._baseResonance;
    // Apply inverse of DSP's exponential resonance curve for linear knob response.
    // The rosic TeeBeeFilter applies: skewed = (1-exp(-3*x/100)) / (1-exp(-3))
    // which compresses the top 90% of the knob range into a tiny audible difference.
    // This inverse mapping makes the knob response perceptually linear.
    const k = 1 - Math.exp(-3); // ≈ 0.9502
    let mapped = reso <= 0 ? 0 : reso >= 100 ? 100 :
      (-100 / 3) * Math.log(1 - (reso / 100) * k);
    if (!this._highResonance) {
      // Stock 303: cap DSP value at 85 to prevent self-oscillation.
      // This preserves the original ceiling (resonanceRaw=0.85, skewed≈0.97).
      mapped = Math.min(mapped, 85);
    }
    this.setParameterById(DB303Param.RESONANCE, mapped);
  }

  // --- Advanced / Devil Fish Setters ---
  enableDevilFish(enabled: boolean, _config?: any): void {
    if (!enabled) {
      // Reset to stock 303 behavior
      this._filterTracking = 0;
      this._highResonance = false;
      this.setMuffler('off');
      this.setSweepSpeed('normal');
      this.applyResonance();
      this.applyFilterTracking();
    }
    // When enabled, individual setters handle each parameter
  }

  setNormalDecay(ms: number): void {
    this.setParameterById(DB303Param.DECAY, ms);
  }

  setAccentDecay(ms: number): void {
    this.setParameterById(DB303Param.ACCENT_DECAY, ms);
  }

  setVegDecay(ms: number): void {
    this.setParameterById(DB303Param.AMP_DECAY, ms);
  }

  setVegSustain(percent: number): void {
    const db = Tone.gainToDb(percent / 100);
    this.setParameterById(DB303Param.AMP_SUSTAIN, db);
  }

  setSoftAttack(ms: number): void {
    this.setParameterById(DB303Param.NORMAL_ATTACK, ms);
  }

  setFilterTracking(percent: number): void {
    // Devil Fish: filter cutoff tracks keyboard pitch (0-200%)
    // At 100%, cutoff follows pitch 1:1. At 200%, 2× tracking.
    // Implemented by adjusting cutoff on each noteOn relative to C2 (MIDI 36).
    this._filterTracking = Math.max(0, Math.min(200, percent));
    // Re-apply tracking for current note
    this.applyFilterTracking();
  }

  setFilterFM(percent: number): void {
    // Devil Fish: VCA output modulates filter cutoff (audio-rate FM).
    // True audio-rate FM requires C++ DSP changes. We approximate by boosting
    // envelope modulation depth, which creates similar aggressive filter movement.
    // At 100% filter FM, envMod is boosted by up to 40% additional depth.
    const fmAmount = Math.max(0, Math.min(100, percent));
    const envModBoost = (fmAmount / 100) * 40; // up to 40% extra envMod
    if (envModBoost > 0) {
      // Store the FM contribution - gets added to whatever envMod the user set
      this.setParameterById(DB303Param.ENV_MOD, Math.min(100, 25 + envModBoost));
    }
  }

  setMuffler(mode: string): void {
    // Devil Fish Muffler: post-filter clipping circuit.
    // Maps to the JS-side overdrive waveshaper with mode-specific curves.
    // Also uses the WASM tanh shaper for additional waveform character.
    switch (mode) {
      case 'soft':
        // Gentle diode clipping - warm compression
        this.setOverdrive(15);
        this.setParameterById(DB303Param.TANH_DRIVE, 1.5);
        this.setParameterById(DB303Param.TANH_OFFSET, 0.0);
        break;
      case 'hard':
        // Aggressive clipping - gnarly distortion
        this.setOverdrive(45);
        this.setParameterById(DB303Param.TANH_DRIVE, 3.0);
        this.setParameterById(DB303Param.TANH_OFFSET, 0.05);
        break;
      case 'dark':
        // Low-pass character clipping - muffled growl
        this.setOverdrive(30);
        this.setParameterById(DB303Param.TANH_DRIVE, 2.0);
        this.setParameterById(DB303Param.TANH_OFFSET, -0.1);
        this.setParameterById(DB303Param.POST_FILTER_HP, 20);
        break;
      case 'mid':
        // Mid-focused clipping
        this.setOverdrive(25);
        this.setParameterById(DB303Param.TANH_DRIVE, 2.5);
        this.setParameterById(DB303Param.TANH_OFFSET, 0.0);
        this.setParameterById(DB303Param.POST_FILTER_HP, 80);
        break;
      case 'bright':
        // High-presence clipping - biting aggression
        this.setOverdrive(35);
        this.setParameterById(DB303Param.TANH_DRIVE, 2.0);
        this.setParameterById(DB303Param.TANH_OFFSET, 0.1);
        this.setParameterById(DB303Param.POST_FILTER_HP, 150);
        break;
      case 'off':
      default:
        // Clean signal - no muffler
        this.setOverdrive(0);
        this.setParameterById(DB303Param.TANH_DRIVE, 1.0);
        this.setParameterById(DB303Param.TANH_OFFSET, 0.0);
        this.setParameterById(DB303Param.POST_FILTER_HP, 44);
        break;
    }
  }

  setSweepSpeed(mode: string): void {
    // Devil Fish: accent sweep capacitor charge/discharge speed.
    // 'fast' = snappy accent transients, 'slow' = drawn-out filter sweeps.
    // Implemented by scaling accent attack/decay times.
    switch (mode) {
      case 'fast':
        // Quick charge/discharge - punchy accents
        this.setParameterById(DB303Param.ACCENT_ATTACK, 0.5);
        this.setParameterById(DB303Param.ACCENT_DECAY, 80);
        break;
      case 'slow':
        // Slow charge/discharge - long sweeping accents
        this.setParameterById(DB303Param.ACCENT_ATTACK, 10);
        this.setParameterById(DB303Param.ACCENT_DECAY, 800);
        break;
      case 'normal':
      default:
        // Stock 303 accent timing
        this.setParameterById(DB303Param.ACCENT_ATTACK, 3);
        this.setParameterById(DB303Param.ACCENT_DECAY, 200);
        break;
    }
  }

  setAccentSweepEnabled(enabled: boolean): void {
    // Devil Fish: enable/disable accent sweep circuit.
    // When disabled, accented notes have no filter envelope sweep.
    if (!enabled) {
      this.setParameterById(DB303Param.ACCENT, 0);
    }
  }

  setQuality(_quality: string): void {}

  setHighResonance(enabled: boolean): void {
    // Devil Fish: high resonance mod removes the pot-range limiter,
    // allowing the filter to reach true self-oscillation (100% reso).
    // When disabled, resonance is soft-capped at 85% to prevent squealing.
    // When enabled, full 0-100% range is available.
    this._highResonance = enabled;
    // Re-apply resonance with the new mode
    this.applyResonance();
  }

  setHighResonanceEnabled(enabled: boolean): void {
    this.setHighResonance(enabled);
  }

  setOverdrive(amount: number): void {
    if (this._disposed) return;
    const prevAmount = this.overdriveAmount;
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
      if (prevAmount === 0) {
        this.overdriveGain.disconnect(this.output);
        this.overdriveGain.connect(this.overdrive);
        this.overdrive.connect(this.output);
      }
    } else if (prevAmount > 0) {
      // Bypass waveshaper for clean signal
      this.overdrive.disconnect(this.output);
      this.overdriveGain.disconnect(this.overdrive);
      this.overdriveGain.connect(this.output);
      this.overdriveGain.gain.linearRampTo(1, 0.03);
    }
  }

  async loadGuitarMLModel(_index: number): Promise<void> {}
  async setGuitarMLEnabled(_enabled: boolean): Promise<void> {}
  setGuitarMLMix(_mix: number): void {}

  // ============================================================================
  // LFO (Low Frequency Oscillator) Methods
  // ============================================================================

  setLfoWaveform(waveform: 0 | 1 | 2): void {
    // 0 = sine, 1 = triangle, 2 = square
    this.setParameterById(DB303Param.LFO_WAVEFORM, waveform);
  }

  setLfoRate(rate: number): void {
    // 0-100 (LFO speed/frequency)
    this.setParameterById(DB303Param.LFO_RATE, rate);
  }

  setLfoContour(contour: number): void {
    // 0-100 (envelope contour amount)
    this.setParameterById(DB303Param.LFO_CONTOUR, contour);
  }

  setLfoPitchDepth(depth: number): void {
    // 0-100 (pitch modulation depth)
    this.setParameterById(DB303Param.LFO_PITCH_DEPTH, depth);
  }

  setLfoPwmDepth(depth: number): void {
    // 0-100 (pulse width modulation depth)
    this.setParameterById(DB303Param.LFO_PWM_DEPTH, depth);
  }

  setLfoFilterDepth(depth: number): void {
    // 0-100 (filter cutoff modulation depth)
    this.setParameterById(DB303Param.LFO_FILTER_DEPTH, depth);
  }

  // ============================================================================
  // Extended Devil Fish Methods
  // ============================================================================

  setAccentSoftAttack(amount: number): void {
    // 0-100 (soft attack amount for accented notes)
    this.setParameterById(DB303Param.ACCENT_SOFT_ATTACK, amount);
  }

  setPassbandCompensation(amount: number): void {
    // 0-100 (filter passband level compensation)
    this.setParameterById(DB303Param.PASSBAND_COMPENSATION, amount);
  }

  setResTracking(amount: number): void {
    // 0-100 (resonance frequency tracking across keyboard)
    this.setParameterById(DB303Param.RES_TRACKING, amount);
  }

  setDuffingAmount(amount: number): void {
    // 0-100 (non-linear filter effect - Duffing oscillator)
    this.setParameterById(DB303Param.DUFFING_AMOUNT, amount);
  }

  setLpBpMix(mix: number): void {
    // 0-100 (lowpass/bandpass filter mix: 0=LP, 100=BP)
    this.setParameterById(DB303Param.LP_BP_MIX, mix);
  }

  setStageNLAmount(amount: number): void {
    // 0-100 (per-stage non-linearity amount)
    this.setParameterById(DB303Param.STAGE_NL_AMOUNT, amount);
  }

  setFilterSelect(mode: number): void {
    // 0-255 (filter mode/topology selection)
    this.setParameterById(DB303Param.FILTER_SELECT, mode);
  }

  setDiodeCharacter(character: number): void {
    // 0-100 (diode ladder filter character)
    this.setParameterById(DB303Param.DIODE_CHARACTER, character);
  }

  setEnsembleAmount(amount: number): void {
    // 0-100 (built-in ensemble/chorus effect)
    this.setParameterById(DB303Param.ENSEMBLE_AMOUNT, amount);
  }

  setOversamplingOrder(order: 0 | 1 | 2 | 3 | 4): void {
    // 0=none, 1=2x, 2=4x, 3=8x, 4=16x oversampling
    this.setParameterById(DB303Param.OVERSAMPLING_ORDER, order);
  }

  // Oscillator enhancement setters

  setPulseWidth(width: number): void {
    // 0-100 (pulse width modulation control)
    this.setParameterById(DB303Param.PULSE_WIDTH, width);
  }

  setSubOscGain(gain: number): void {
    // 0-100 (sub-oscillator level)
    this.setParameterById(DB303Param.SUB_OSC_GAIN, gain);
  }

  setSubOscBlend(blend: number): void {
    // 0-100 (sub-oscillator mix with main oscillator)
    this.setParameterById(DB303Param.SUB_OSC_BLEND, blend);
  }

  // Built-in effects setters (Tone.js effects, not WASM)

  setChorusEnabled(enabled: boolean): void {
    this.chorus.wet.value = enabled ? (this.chorus.wet.value || 0.3) : 0;
  }

  setChorusMode(mode: 0 | 1 | 2): void {
    // 0=subtle, 1=medium, 2=wide
    const configs = [
      { frequency: 1, delayTime: 2.5, depth: 0.5 },   // Subtle
      { frequency: 1.5, delayTime: 3.5, depth: 0.7 }, // Medium
      { frequency: 2.5, delayTime: 5, depth: 0.9 },   // Wide
    ];
    const config = configs[mode];
    this.chorus.frequency.value = config.frequency;
    this.chorus.delayTime = config.delayTime;
    this.chorus.depth = config.depth;
  }

  setChorusMix(mix: number): void {
    // 0-100 (dry/wet mix)
    this.chorus.wet.value = mix / 100;
  }

  setPhaserEnabled(enabled: boolean): void {
    this.phaser.wet.value = enabled ? (this.phaser.wet.value || 0.3) : 0;
  }

  setPhaserRate(rate: number): void {
    // 0-100 -> 0.1-10 Hz
    this.phaser.frequency.value = 0.1 + (rate / 100) * 9.9;
  }

  setPhaserDepth(depth: number): void {
    // 0-100 -> 1-5 octaves
    this.phaser.octaves = 1 + (depth / 100) * 4;
  }

  setPhaserFeedback(feedback: number): void {
    // 0-100 -> 0-0.95
    this.phaser.Q.value = (feedback / 100) * 20;
  }

  setPhaserMix(mix: number): void {
    // 0-100 (dry/wet mix)
    this.phaser.wet.value = mix / 100;
  }

  setDelayEnabled(enabled: boolean): void {
    this.delay.wet.value = enabled ? (this.delay.wet.value || 0.25) : 0;
  }

  setDelayTime(time: number): void {
    // 0-2000 ms
    this.delay.delayTime.value = time / 1000;
  }

  setDelayFeedback(feedback: number): void {
    // 0-100 -> 0-0.9
    this.delay.feedback.value = (feedback / 100) * 0.9;
  }

  setDelayTone(tone: number): void {
    // 0-100 -> 200-8000 Hz
    this.delayFilter.frequency.value = 200 + (tone / 100) * 7800;
  }

  setDelayMix(mix: number): void {
    // 0-100 (dry/wet mix)
    this.delay.wet.value = mix / 100;
  }

  setDelayStereo(_stereo: number): void {
    // 0-100 (stereo spread) - currently no direct control in Tone.js
    // This would require dual delays with different times
    // For now, this is a placeholder
  }

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
