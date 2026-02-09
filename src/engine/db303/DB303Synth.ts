import * as Tone from 'tone';
import { createAudioWorkletNode as toneCreateAudioWorkletNode } from 'tone/build/esm/core/context/AudioContext';
import { getNativeContext } from '@utils/audio-context';

/**
 * DB303 Parameter Names
 * These map to WASM setters like setCutoff, setResonance, etc.
 * The worklet constructs the setter name by capitalizing the first letter.
 * 
 * NOTE: Some parameters have special WASM function names (Korg filter params):
 * - diodeCharacter -> setKorgWarmth
 * - duffingAmount -> setKorgStiffness (with sticky-zero transform)
 * - filterFmDepth -> setKorgFilterFm
 * - resTracking -> setKorgIbiasScale (with 0.1 + value * 3.9 transform)
 */
const DB303Param = {
  CUTOFF: 'cutoff',
  CUTOFF_HZ: 'cutoffHz',           // Extended mode: direct Hz (10-5000Hz)
  RESONANCE: 'resonance',
  ENV_MOD: 'envMod',
  ENV_MOD_PERCENT: 'envModPercent', // Extended mode: 0-300%
  DECAY: 'decay',
  ACCENT: 'accent',
  WAVEFORM: 'waveform',
  PULSE_WIDTH: 'pulseWidth',
  PITCH_TO_PW: 'pitchToPw',        // Pitch-to-pulse-width modulation
  SUB_OSC_GAIN: 'subOscGain',
  SUB_OSC_BLEND: 'subOscBlend',
  NORMAL_DECAY: 'normalDecay',
  ACCENT_DECAY: 'accentDecay',
  SOFT_ATTACK: 'softAttack',
  ACCENT_SOFT_ATTACK: 'accentSoftAttack',
  PASSBAND_COMPENSATION: 'passbandCompensation',
  RES_TRACKING: 'resTracking',
  FILTER_INPUT_DRIVE: 'filterInputDrive',
  FILTER_SELECT: 'filterSelect',
  // Korg filter parameters - WASM has both aliases (diodeCharacter=korgWarmth, etc)
  DIODE_CHARACTER: 'diodeCharacter',   // setDiodeCharacter (alias: setKorgWarmth)
  DUFFING_AMOUNT: 'duffingAmount',     // setDuffingAmount (alias: setKorgStiffness)
  FILTER_FM_DEPTH: 'filterFmDepth',    // setFilterFmDepth (alias: setKorgFilterFm)
  KORG_IBIAS_SCALE: 'korgIbiasScale',  // setKorgIbiasScale (resTracking formula)
  KORG_BITE: 'korgBite',               // setKorgBite - filter bite/edge
  KORG_CLIP: 'korgClip',               // setKorgClip - soft clipping
  KORG_CROSSMOD: 'korgCrossmod',       // setKorgCrossmod - cross modulation
  KORG_Q_SAG: 'korgQSag',              // setKorgQSag - resonance sag
  KORG_SHARPNESS: 'korgSharpness',     // setKorgSharpness - filter sharpness
  KORG_WARMTH: 'korgWarmth',           // setKorgWarmth - alias for diodeCharacter
  KORG_STIFFNESS: 'korgStiffness',     // setKorgStiffness - alias for duffingAmount
  KORG_FILTER_FM: 'korgFilterFm',      // setKorgFilterFm - alias for filterFmDepth
  LP_BP_MIX: 'lpBpMix',
  FILTER_TRACKING: 'filterTracking',
  STAGE_NL_AMOUNT: 'stageNLAmount',    // Per-stage non-linearity
  ENSEMBLE_AMOUNT: 'ensembleAmount',   // Built-in ensemble effect
  SLIDE_TIME: 'slideTime',
  LFO_RATE: 'lfoRate',
  LFO_CONTOUR: 'lfoContour',
  LFO_PITCH_DEPTH: 'lfoPitchDepth',
  LFO_PWM_DEPTH: 'lfoPwmDepth',
  LFO_FILTER_DEPTH: 'lfoFilterDepth',
  LFO_STIFF_DEPTH: 'lfoStiffDepth',
  CHORUS_MIX: 'chorusMix',
  PHASER_RATE: 'phaserLfoRate',        // WASM uses 'setPhaserLfoRate'
  PHASER_WIDTH: 'phaserLfoWidth',      // WASM uses 'setPhaserLfoWidth'
  PHASER_FEEDBACK: 'phaserFeedback',
  PHASER_MIX: 'phaserMix',
  DELAY_TIME: 'delayTime',
  DELAY_FEEDBACK: 'delayFeedback',
  DELAY_TONE: 'delayTone',
  DELAY_MIX: 'delayMix',
  DELAY_SPREAD: 'delaySpread',
  TUNING: 'tuning',
  VOLUME: 'volume',
  LFO_WAVEFORM: 'lfoWaveform',
  CHORUS_MODE: 'chorusMode',
  OVERSAMPLING_ORDER: 'oversamplingOrder'
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
  private _pendingParams: Array<{ paramId: string; value: number }> = [];
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

  // Store current slideTime for hammer restoration
  private _savedSlideTime: number = 0.5;
  private _currentSlideTime: number = 0.5;

  triggerAttack(note: string | number, _time?: number, velocity: number = 1, accent: boolean = false, slide: boolean = false, hammer: boolean = false): void {
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

    // Hammer: temporarily set slideTime to 0 for instant pitch change
    // TT-303 Hammer = legato but NO pitch glide
    // When hammer is set, we want instant pitch (no glide), but slide=true keeps gate high
    if (hammer) {
      this._savedSlideTime = this._currentSlideTime;
      this.setSlideTime(0); // Instant pitch change
    }

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

    // Restore slideTime after hammer note
    if (hammer) {
      // Use setTimeout to restore after the note attack settles
      setTimeout(() => {
        if (!this._disposed) {
          this.setSlideTime(this._savedSlideTime);
        }
      }, 50); // 50ms should be enough for the pitch to settle
    }
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

  /**
   * SequencerEngine compatibility methods
   * Maps MIDI-style noteOn/noteOff to TB-303 trigger methods
   */
  noteOn(midiNote: number, velocity: number, accent: boolean, slide: boolean): void {
    // Convert MIDI note number to frequency for triggerAttack
    const freq = Tone.Frequency(midiNote, 'midi').toFrequency();
    this.triggerAttack(freq, undefined, velocity / 127, accent, slide, false);
  }

  noteOff(): void {
    this.triggerRelease();
  }

  triggerAttackRelease(note: string | number, duration: string | number, time?: number, velocity?: number, accent: boolean = false, slide: boolean = false, hammer: boolean = false): void {
    if (this._disposed) return;
    
    const safeTime = time ?? Tone.now();
    this.triggerAttack(note, safeTime, velocity || 1, accent, slide, hammer);

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

  /**
   * Send a parameter to the WASM engine via the worklet.
   * Parameters are sent by name (e.g., 'cutoff') and the worklet constructs
   * the setter name (e.g., 'setCutoff') to call on the WASM engine.
   */
  private setParameterByName(paramName: string, value: number): void {
    if (this._disposed) {
      console.warn(`[DB303] setParameter BLOCKED: disposed (paramName=${paramName}, value=${value})`);
      return;
    }
    if (!this.workletNode) {
      // Queue parameter for replay once worklet is ready
      // Replace any existing entry for the same paramName
      const existing = this._pendingParams.findIndex(p => p.paramId === paramName);
      if (existing >= 0) {
        this._pendingParams[existing].value = value;
      } else {
        this._pendingParams.push({ paramId: paramName, value });
      }
      console.log(`[DB303] setParameter QUEUED (workletNode null): paramName=${paramName}, value=${value}, queue=${this._pendingParams.length}`);
      return;
    }
    this.workletNode.port.postMessage({
      type: 'setParameter',
      paramId: paramName,  // String param name, worklet constructs setter
      value
    });
  }

  setParam(param: string, value: number): void {
    // Map external param names to setter method calls
    // This ensures transformations (like sticky-zero for duffing) are applied
    switch (param) {
      case 'cutoff': this.setCutoff(value); break;
      case 'cutoff_hz': this.setCutoffHz(value); break;
      case 'resonance': this.setResonance(value); break;
      case 'env_mod': this.setEnvMod(value); break;
      case 'env_mod_percent': this.setEnvModPercent(value); break;
      case 'decay': this.setDecay(value); break;
      case 'accent': this.setAccent(value); break;
      case 'waveform': this.setWaveform(value); break;
      case 'pulse_width': this.setPulseWidth(value); break;
      case 'pitch_to_pw': this.setPitchToPw(value); break;
      case 'sub_osc_gain': this.setSubOscGain(value); break;
      case 'sub_osc_blend': this.setSubOscBlend(value); break;
      case 'normal_decay': this.setNormalDecay(value); break;
      case 'accent_decay': this.setAccentDecay(value); break;
      case 'soft_attack': this.setSoftAttack(value); break;
      case 'accent_soft_attack': this.setAccentSoftAttack(value); break;
      case 'passband_compensation': this.setPassbandCompensation(value); break;
      case 'res_tracking': this.setResTracking(value); break;
      case 'filter_input_drive': this.setFilterInputDrive(value); break;
      case 'filter_select': this.setFilterSelect(value); break;
      case 'diode_character': this.setDiodeCharacter(value); break;
      case 'duffing_amount': this.setDuffingAmount(value); break;
      case 'filter_fm_depth': this.setFilterFmDepth(value); break;
      case 'korg_bite': this.setKorgBite(value); break;
      case 'korg_clip': this.setKorgClip(value); break;
      case 'korg_crossmod': this.setKorgCrossmod(value); break;
      case 'korg_q_sag': this.setKorgQSag(value); break;
      case 'korg_sharpness': this.setKorgSharpness(value); break;
      case 'lp_bp_mix': this.setLpBpMix(value); break;
      case 'filter_tracking': this.setFilterTracking(value); break;
      case 'stage_nl_amount': this.setStageNLAmount(value); break;
      case 'ensemble_amount': this.setEnsembleAmount(value); break;
      case 'slide_time': this.setSlideTime(value); break;
      case 'lfo_rate': this.setLfoRate(value); break;
      case 'lfo_contour': this.setLfoContour(value); break;
      case 'lfo_pitch_depth': this.setLfoPitchDepth(value); break;
      case 'lfo_pwm_depth': this.setLfoPwmDepth(value); break;
      case 'lfo_filter_depth': this.setLfoFilterDepth(value); break;
      case 'lfo_stiff_depth': this.setLfoStiffDepth(value); break;
      case 'chorus_mix': this.setChorusMix(value); break;
      case 'phaser_rate': this.setPhaserRate(value); break;
      case 'phaser_width': this.setPhaserWidth(value); break;
      case 'phaser_feedback': this.setPhaserFeedback(value); break;
      case 'phaser_mix': this.setPhaserMix(value); break;
      case 'delay_time': this.setDelayTime(value); break;
      case 'delay_feedback': this.setDelayFeedback(value); break;
      case 'delay_tone': this.setDelayTone(value); break;
      case 'delay_mix': this.setDelayMix(value); break;
      case 'delay_spread': this.setDelaySpread(value); break;
      case 'tuning': this.setTuning(value); break;
      case 'volume': this.setVolume(value); break;
      case 'lfo_waveform': this.setLfoWaveform(value); break;
      case 'chorus_mode': this.setChorusMode(value); break;
      case 'oversampling_order': this.setOversamplingOrder(value); break;
      default:
        console.warn(`[DB303] Unknown parameter: ${param}`);
    }
  }

  // --- Core Setters ---
  // The reference db303 WASM expects normalized 0-1 values for all parameters
  // It handles Hz/ms/% conversion internally
  setCutoff(value: number): void {
    // Reference WASM expects 0-1 normalized, converts to Hz internally
    const clamped = Math.max(0, Math.min(1, value));
    this.setParameterByName(DB303Param.CUTOFF, clamped);
  }

  setResonance(value: number): void {
    // Reference WASM expects 0-1 normalized
    this.setParameterByName(DB303Param.RESONANCE, value);
  }

  setEnvMod(value: number): void {
    // Reference WASM expects 0-1 normalized
    this.setParameterByName(DB303Param.ENV_MOD, value);
  }

  setDecay(value: number): void {
    // Reference WASM expects 0-1 normalized, converts to ms internally
    const clamped = Math.max(0, Math.min(1, value));
    this.setParameterByName(DB303Param.DECAY, clamped);
  }

  setAccent(value: number): void {
    // Reference WASM expects 0-1 normalized
    this.setParameterByName(DB303Param.ACCENT, value);
  }

  setAccentAmount(value: number): void {
    this.setAccent(value);
  }

  setSlideTime(value: number): void {
    // Reference WASM expects 0-1 normalized, converts to ms internally
    const clamped = Math.max(0, Math.min(1, value));
    this._currentSlideTime = value;
    this.setParameterByName(DB303Param.SLIDE_TIME, clamped);
  }

  setVolume(value: number): void {
    // Reference WASM expects 0-1 normalized, NOT dB
    this.setParameterByName(DB303Param.VOLUME, value);
  }

  setWaveform(value: number): void {
    // 0-1 (saw to square blend)
    this.setParameterByName(DB303Param.WAVEFORM, value);
  }

  setTuning(value: number): void {
    // Reference WASM expects raw tuning value
    // Pass through - the WASM handles conversion
    this.setParameterByName(DB303Param.TUNING, value);
  }

  // ============================================================================
  // LFO (Low Frequency Oscillator) Methods
  // ============================================================================

  setLfoWaveform(waveform: number): void {
    // 0 = sine, 1 = triangle, 2 = square
    this.setParameterByName(DB303Param.LFO_WAVEFORM, waveform);
  }

  setLfoRate(value: number): void {
    // 0-1 normalized
    this.setParameterByName(DB303Param.LFO_RATE, value);
  }

  setLfoContour(value: number): void {
    // 0-1 normalized
    this.setParameterByName(DB303Param.LFO_CONTOUR, value);
  }

  setLfoPitchDepth(value: number): void {
    // 0-1 normalized
    this.setParameterByName(DB303Param.LFO_PITCH_DEPTH, value);
  }

  setLfoPwmDepth(value: number): void {
    // 0-1 normalized
    this.setParameterByName(DB303Param.LFO_PWM_DEPTH, value);
  }

  setLfoFilterDepth(value: number): void {
    // 0-1 normalized
    this.setParameterByName(DB303Param.LFO_FILTER_DEPTH, value);
  }

  setLfoStiffDepth(value: number): void {
    // 0-1 normalized
    this.setParameterByName(DB303Param.LFO_STIFF_DEPTH, value);
  }

  // ============================================================================
  // Extended Devil Fish Methods
  // ============================================================================

  setNormalDecay(value: number): void {
    // 0-1 normalized
    this.setParameterByName(DB303Param.NORMAL_DECAY, value);
  }

  setAccentDecay(value: number): void {
    // 0-1 normalized
    this.setParameterByName(DB303Param.ACCENT_DECAY, value);
  }

  setSoftAttack(value: number): void {
    // 0-1 normalized
    this.setParameterByName(DB303Param.SOFT_ATTACK, value);
  }

  setAccentSoftAttack(value: number): void {
    // 0-1 normalized
    this.setParameterByName(DB303Param.ACCENT_SOFT_ATTACK, value);
  }

  setPassbandCompensation(value: number): void {
    // 0-1 normalized
    this.setParameterByName(DB303Param.PASSBAND_COMPENSATION, value);
  }

  setResTracking(value: number): void {
    // Reference WASM has setResTracking - pass 0-1 normalized
    // The inversion and korgIbiasScale formula is handled internally
    this.setParameterByName(DB303Param.RES_TRACKING, value);
  }

  setFilterInputDrive(value: number): void {
    // 0-1 normalized
    this.setParameterByName(DB303Param.FILTER_INPUT_DRIVE, value);
  }

  setFilterSelect(mode: number): void {
    // 0-255 (filter mode/topology selection)
    this.setParameterByName(DB303Param.FILTER_SELECT, mode);
  }

  setDiodeCharacter(value: number): void {
    // 0-1 normalized - maps to setKorgWarmth in WASM
    this.setParameterByName(DB303Param.DIODE_CHARACTER, value);
  }

  setDuffingAmount(value: number): void {
    // Apply sticky-zero transformation from db303 reference:
    // Values within ±0.16 (±8% of center) snap to 0
    // This creates a dead zone in the middle of the knob
    let transformed: number;
    if (Math.abs(value) < 0.16) {
      transformed = 0;
    } else {
      const sign = value > 0 ? 1 : -1;
      transformed = sign * (Math.abs(value) - 0.16) / 0.84;
    }
    this.setParameterByName(DB303Param.DUFFING_AMOUNT, transformed);
  }

  setFilterFmDepth(value: number): void {
    // 0-1 normalized - maps to setKorgFilterFm in WASM
    this.setParameterByName(DB303Param.FILTER_FM_DEPTH, value);
  }

  setLpBpMix(value: number): void {
    // 0-1 normalized
    this.setParameterByName(DB303Param.LP_BP_MIX, value);
  }

  setFilterTracking(value: number): void {
    // 0-1 normalized
    this.setParameterByName(DB303Param.FILTER_TRACKING, value);
  }

  // Korg filter advanced parameters (for authentic 303 filter behavior)
  setKorgBite(value: number): void {
    // 0-1 normalized - filter "bite" or edge character
    this.setParameterByName(DB303Param.KORG_BITE, value);
  }

  setKorgClip(value: number): void {
    // 0-1 normalized - soft clipping in filter
    this.setParameterByName(DB303Param.KORG_CLIP, value);
  }

  setKorgCrossmod(value: number): void {
    // 0-1 normalized - cross modulation between filter stages
    this.setParameterByName(DB303Param.KORG_CROSSMOD, value);
  }

  setKorgQSag(value: number): void {
    // 0-1 normalized - resonance sag behavior
    this.setParameterByName(DB303Param.KORG_Q_SAG, value);
  }

  setKorgSharpness(value: number): void {
    // 0-1 normalized - filter sharpness/precision
    this.setParameterByName(DB303Param.KORG_SHARPNESS, value);
  }

  setPitchToPw(value: number): void {
    // 0-1 normalized - pitch-to-pulse-width modulation
    this.setParameterByName(DB303Param.PITCH_TO_PW, value);
  }

  // Extended mode setters (for direct Hz/percent control)
  setCutoffHz(value: number): void {
    // Direct Hz value (10-5000Hz) - bypasses the normalized 0-1 conversion
    this.setParameterByName(DB303Param.CUTOFF_HZ, Math.max(10, Math.min(5000, value)));
  }

  setEnvModPercent(value: number): void {
    // Direct percent value (0-300%) - bypasses the normalized 0-1 conversion
    this.setParameterByName(DB303Param.ENV_MOD_PERCENT, Math.max(0, Math.min(300, value)));
  }

  setStageNLAmount(value: number): void {
    // 0-1 normalized - per-stage non-linearity in the filter
    this.setParameterByName(DB303Param.STAGE_NL_AMOUNT, value);
  }

  setEnsembleAmount(value: number): void {
    // 0-1 normalized - built-in ensemble/chorus effect amount
    this.setParameterByName(DB303Param.ENSEMBLE_AMOUNT, value);
  }

  setChorusMode(mode: number): void {
    // 0-3 chorus mode
    this.setParameterByName(DB303Param.CHORUS_MODE, mode);
  }

  setOversamplingOrder(order: number): void {
    // 0-4 oversampling
    this.setParameterByName(DB303Param.OVERSAMPLING_ORDER, order);
  }

  // Oscillator enhancement setters

  setPulseWidth(value: number): void {
    // 0-1 normalized
    this.setParameterByName(DB303Param.PULSE_WIDTH, value);
  }

  setSubOscGain(value: number): void {
    // 0-1 normalized
    this.setParameterByName(DB303Param.SUB_OSC_GAIN, value);
  }

  setSubOscBlend(value: number): void {
    // 0-1 normalized
    this.setParameterByName(DB303Param.SUB_OSC_BLEND, value);
  }

  // Built-in effects setters (sending normalized 0-1 to WASM if supported, or using Tone.js)

  setChorusMix(value: number): void {
    const clamped = Math.max(0, Math.min(1, value));
    this.setParameterByName(DB303Param.CHORUS_MIX, clamped);
    this.chorus.wet.value = clamped;
  }

  setPhaserRate(value: number): void {
    const clamped = Math.max(0, Math.min(1, value));
    this.setParameterByName(DB303Param.PHASER_RATE, clamped);
    const targetFreq = 0.1 + clamped * 9.9;
    try {
      this.phaser.frequency.exponentialRampToValueAtTime(
        Math.max(0.01, targetFreq),
        this.context.currentTime + 0.1
      );
    } catch {
      this.phaser.frequency.value = Math.max(0.01, targetFreq);
    }
  }

  setPhaserWidth(value: number): void {
    // Clamp to 0-1 range to prevent overflow
    const clamped = Math.max(0, Math.min(1, value));
    this.setParameterByName(DB303Param.PHASER_WIDTH, clamped);
    this.phaser.octaves = 1 + clamped * 4;
  }

  setPhaserFeedback(value: number): void {
    const clamped = Math.max(0, Math.min(1, value));
    this.setParameterByName(DB303Param.PHASER_FEEDBACK, clamped);
    const targetQ = clamped * 20;
    try {
      this.phaser.Q.linearRampToValueAtTime(
        Math.min(30, targetQ),
        this.context.currentTime + 0.1
      );
    } catch {
      this.phaser.Q.value = Math.min(30, targetQ);
    }
  }

  setPhaserMix(value: number): void {
    const clamped = Math.max(0, Math.min(1, value));
    this.setParameterByName(DB303Param.PHASER_MIX, clamped);
    this.phaser.wet.value = clamped;
  }

  setDelayTime(value: number): void {
    const clamped = Math.max(0, Math.min(1, value));
    this.setParameterByName(DB303Param.DELAY_TIME, clamped);
    // db303 delay time range: 0.25 to 16 seconds (beat-sync friendly)
    // Map 0-1 input to 0.25-16 seconds
    const DELAY_MIN = 0.25;
    const DELAY_MAX = 16;
    const targetTime = DELAY_MIN + clamped * (DELAY_MAX - DELAY_MIN);
    try {
      this.delay.delayTime.linearRampToValueAtTime(
        targetTime,
        this.context.currentTime + 0.1
      );
    } catch {
      this.delay.delayTime.value = targetTime;
    }
  }

  setDelayFeedback(value: number): void {
    const clamped = Math.max(0, Math.min(1, value));
    this.setParameterByName(DB303Param.DELAY_FEEDBACK, clamped);
    this.delay.feedback.value = clamped * 0.95;
  }

  setDelayTone(value: number): void {
    const clamped = Math.max(0, Math.min(1, value));
    this.setParameterByName(DB303Param.DELAY_TONE, clamped);
    const targetFreq = 200 + clamped * 7800;
    // Use exponentialRampToValueAtTime for smooth filter changes (100ms for stability)
    try {
      this.delayFilter.frequency.exponentialRampToValueAtTime(
        Math.max(20, targetFreq),
        this.context.currentTime + 0.1
      );
    } catch {
      this.delayFilter.frequency.value = Math.max(20, targetFreq);
    }
  }

  setDelayMix(value: number): void {
    const clamped = Math.max(0, Math.min(1, value));
    this.setParameterByName(DB303Param.DELAY_MIX, clamped);
    this.delay.wet.value = clamped;
  }

  setDelaySpread(value: number): void {
    this.setParameterByName(DB303Param.DELAY_SPREAD, value);
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
    this.setParameterByName(DB303Param.NORMAL_DECAY + 1, percent / 100); // Guessing index
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
    this.setParameterByName(DB303Param.NORMAL_DECAY + 7, val / 2); // Guessing index
  }

  setHighResonanceEnabled(_enabled: boolean): void {
    // NOOP
  }

  setAccentSweepEnabled(_enabled: boolean): void {
    // Always enabled in db303
  }

  // Enable/disable methods for effects
  setChorusEnabled(enabled: boolean): void {
    // Toggle chorus wet to enable/disable
    if (!enabled) {
      this.chorus.wet.value = 0;
    }
  }

  setPhaserEnabled(enabled: boolean): void {
    // Toggle phaser wet to enable/disable
    if (!enabled) {
      this.phaser.wet.value = 0;
    }
  }

  setPhaserDepth(value: number): void {
    // Map to phaser octaves (like setPhaserWidth)
    this.phaser.octaves = 1 + value * 4;
  }

  setDelayEnabled(enabled: boolean): void {
    // Toggle delay wet to enable/disable
    if (!enabled) {
      this.delay.wet.value = 0;
    }
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
