import type { DevilboxSynth } from '@/types/synth';
import type { TB303Config } from '@typedefs/instrument';
import { getDevilboxAudioContext, noteToMidi, noteToFrequency, audioNow, timeToSeconds } from '@/utils/audio-context';

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

/** Signal chain trace logging — enable via `window.DB303_TRACE = true` in browser console */
function db303TraceEnabled(): boolean {
  return typeof window !== 'undefined' && !!(window as unknown as Record<string, boolean>).DB303_TRACE;
}

export class DB303Synth implements DevilboxSynth {
  readonly name = 'DB303Synth';
  readonly output: GainNode;

  private workletNode: AudioWorkletNode | null = null;
  // Track which contexts have the worklet module loaded
  private static loadedContexts: WeakSet<AudioContext> = new WeakSet();
  private static initPromises: WeakMap<AudioContext, Promise<void>> = new WeakMap();

  // Native overdrive nodes — created lazily when amount > 0
  private overdrive: WaveShaperNode | null = null;
  private overdriveGain: GainNode | null = null;
  private overdriveAmount: number = 0;

  // Compatibility properties
  public config: Record<string, unknown> = {};
  public audioContext: AudioContext;
  private _disposed: boolean = false;
  private _initPromise: Promise<void>;
  private _resolveInit: (() => void) | null = null;
  // Queue parameter messages that arrive before worklet node is ready
  private _pendingParams: Array<{ paramId: string; value: number }> = [];
  // Track pending release timeout so slides can cancel it
  private _releaseTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();

    // Create promise that resolves when worklet reports 'ready'
    this._initPromise = new Promise<void>((resolve) => {
      this._resolveInit = resolve;
    });

    this.initialize();
  }

  public async ensureInitialized(): Promise<void> {
    return this._initPromise;
  }

  private async initialize(): Promise<void> {
    try {
      await DB303Synth.ensureInitialized(this.audioContext);
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
      } catch {
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

    const ctx = this.audioContext;

    this.workletNode = new AudioWorkletNode(ctx, 'db303-processor', {
      outputChannelCount: [2],
      processorOptions: {
        sampleRate: ctx.sampleRate
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
      sampleRate: ctx.sampleRate,
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

    // Connect worklet directly to output (no Tone.js effects in chain)
    this.workletNode.connect(this.output);

    // CRITICAL: Connect through silent keepalive to destination to force process() calls
    try {
      const keepalive = ctx.createGain();
      keepalive.gain.value = 0;
      this.workletNode.connect(keepalive);
      keepalive.connect(ctx.destination);
    } catch { /* keepalive failed */ }
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
      ? noteToMidi(note)
      : Math.round(12 * Math.log2(note / 440) + 69);

    // Map accent flag to velocity (DB303 uses high velocity for accent)
    let finalVelocity = Math.floor(velocity * 127);
    if (accent && finalVelocity < 100) finalVelocity = 127;
    if (!accent && finalVelocity >= 100) finalVelocity = 99;

    // DEBUG LOGGING for worklet message
    if (typeof window !== 'undefined' && (window as unknown as { TB303_DEBUG_ENABLED?: boolean }).TB303_DEBUG_ENABLED) {
      const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      const octave = Math.floor(midiNote / 12) - 1;
      const semitone = midiNote % 12;
      const noteName = `${noteNames[semitone]}${octave}`;
      console.log(
        `%c    └─► WORKLET: noteOn(%cmidi=${midiNote} (${noteName}), vel=${finalVelocity}, slide=${slide}, accent=${accent}, hammer=${hammer}%c)`,
        'color: #f80',
        'color: #fca',
        'color: #f80'
      );
    }

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
    const safeTime = _time ?? audioNow();
    this.workletNode.port.postMessage({
      type: 'noteOn',
      time: safeTime, // Always pass time for consistent queuing
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

    const safeTime = time ?? audioNow();

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
    const freq = noteToFrequency(midiNote);
    this.triggerAttack(freq, undefined, velocity / 127, accent, slide, false);
  }

  noteOff(): void {
    this.triggerRelease();
  }

  triggerAttackRelease(note: string | number, duration: string | number, time?: number, velocity?: number, accent: boolean = false, slide: boolean = false, hammer: boolean = false): void {
    if (this._disposed) return;

    const safeTime = time ?? audioNow();
    this.triggerAttack(note, safeTime, velocity || 1, accent, slide, hammer);

    const d = timeToSeconds(duration);

    // Calculate precise delay relative to NOW to account for lookahead
    const delayMs = (safeTime + d - audioNow()) * 1000;

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
    if (db303TraceEnabled()) console.log(`[DB303:WASM] ${paramName} = ${value}`);
    this.workletNode.port.postMessage({
      type: 'setParameter',
      paramId: paramName,  // String param name, worklet constructs setter
      value
    });
  }

  /**
   * Universal single-parameter API (implements DevilboxSynth.set).
   * All continuous values are 0-1 normalized. The synth owns all internal
   * transformations (Hz, ms, etc.). Callers never convert units.
   */
  set(param: string, value: number): void {
    if (db303TraceEnabled()) console.log(`[DB303:set] ${param} = ${value}`);
    switch (param) {
      case 'cutoff':        this.setCutoff(value); break;
      case 'resonance':     this.setResonance(value); break;
      case 'envMod':        this.setEnvMod(value); break;
      case 'decay':         this.setDecay(value); break;
      case 'accent':        this.setAccent(value); break;
      case 'tuning':        this.setTuning(value); break;
      case 'volume':        this.setVolume(value); break;
      case 'waveform':      this.setWaveform(value); break;
      case 'slideTime':     this.setSlideTime(value); break;
      case 'overdrive':     this.setOverdrive(value); break;
      case 'pulseWidth':    this.setPulseWidth(value); break;
      case 'subOscGain':    this.setSubOscGain(value); break;
      case 'subOscBlend':   this.setSubOscBlend(value); break;
      case 'pitchToPw':     this.setPitchToPw(value); break;
      // Devil Fish
      case 'normalDecay':   this.setNormalDecay(value); break;
      case 'accentDecay':   this.setAccentDecay(value); break;
      case 'softAttack':    this.setSoftAttack(value); break;
      case 'accentSoftAttack': this.setAccentSoftAttack(value); break;
      case 'filterTracking': this.setFilterTracking(value); break;
      case 'filterFmDepth':
        this.setFilterFmDepth(value);
        this.setKorgFilterFm(value);
        break;
      case 'filterInputDrive': this.setFilterInputDrive(value); break;
      case 'passbandCompensation': this.setPassbandCompensation(1 - value); break;
      case 'resTracking':
        this.setResTracking(1 - value);
        this.setKorgIbiasScale(0.1 + value * 3.9);
        break;
      case 'diodeCharacter':
        this.setDiodeCharacter(value);
        this.setKorgWarmth(value);
        break;
      case 'duffingAmount': {
        this.setDuffingAmount(value);
        const stiff = Math.abs(value) < 0.16 ? 0 : ((value > 0 ? 1 : -1) * (Math.abs(value) - 0.16)) / 0.84;
        this.setKorgStiffness(stiff);
        break;
      }
      case 'lpBpMix':       this.setLpBpMix(value); break;
      case 'korgBite':      this.setKorgBite(value); break;
      case 'korgClip':      this.setKorgClip(value); break;
      case 'korgCrossmod':  this.setKorgCrossmod(value); break;
      case 'korgQSag':      this.setKorgQSag(value); break;
      case 'korgSharpness': this.setKorgSharpness(value); break;
      case 'stageNLAmount': this.setStageNLAmount(value); break;
      case 'ensembleAmount': this.setEnsembleAmount(value); break;
      // LFO
      case 'lfoRate':       this.setLfoRate(value); break;
      case 'lfoContour':    this.setLfoContour(value); break;
      case 'lfoPitchDepth': this.setLfoPitchDepth(value); break;
      case 'lfoPwmDepth':   this.setLfoPwmDepth(value); break;
      case 'lfoFilterDepth': this.setLfoFilterDepth(value); break;
      case 'lfoStiffDepth': this.setLfoStiffDepth(value); break;
      // Effects
      case 'phaserRate':    this.setPhaserRate(value); break;
      case 'phaserWidth':   this.setPhaserWidth(value); break;
      case 'phaserFeedback': this.setPhaserFeedback(value); break;
      case 'phaserMix':     this.setPhaserMix(value); break;
      case 'delayTime':     this.setDelayTime(value); break;
      case 'delayFeedback': this.setDelayFeedback(value); break;
      case 'delayTone':     this.setDelayTone(value); break;
      case 'delayMix':      this.setDelayMix(value); break;
      case 'delaySpread':   this.setDelaySpread(value); break;
      // Discrete (integer values, not 0-1)
      case 'filterSelect':  this.setFilterSelect(value); break;
      case 'chorusMode':    this.setChorusMode(value); break;
      case 'chorusMix':     this.setChorusMix(value); break;
      case 'lfoWaveform':   this.setLfoWaveform(value); break;
      case 'oversamplingOrder': this.setOversamplingOrder(value); break;
      // No-ops (WASM doesn't have these)
      case 'vegDecay':      this.setVegDecay(value); break;
      case 'vegSustain':    this.setVegSustain(value); break;
      // Legacy snake_case aliases (for setParam compatibility)
      case 'filterFM':      this.setFilterFmDepth(value); break;
    }
  }

  // --- Core Setters ---
  // Try sending normalized 0-1 values directly - the site-rip WASM may expect this
  setCutoff(value: number): void {
    // Send normalized 0-1 value directly
    const clamped = Math.max(0, Math.min(1, value));
    this.setParameterByName(DB303Param.CUTOFF, clamped);
  }

  setResonance(value: number): void {
    // Send normalized 0-1 value directly
    const clamped = Math.max(0, Math.min(1, value));
    this.setParameterByName(DB303Param.RESONANCE, clamped);
  }

  setEnvMod(value: number): void {
    // Send normalized 0-1 value directly
    const clamped = Math.max(0, Math.min(1, value));
    this.setParameterByName(DB303Param.ENV_MOD, clamped);
  }

  setDecay(value: number): void {
    // Send normalized 0-1 value directly - WASM handles ms conversion
    const clamped = Math.max(0, Math.min(1, value));
    this.setParameterByName(DB303Param.DECAY, clamped);
    // CRITICAL: The WASM uses normalDecay (not decay) for the actual filter envelope.
    // Without this, the DF normalDecay default (0.5) always overrides the user's decay.
    this.setParameterByName('normalDecay', clamped);
  }

  setAccent(value: number): void {
    // Send normalized 0-1 value directly
    const clamped = Math.max(0, Math.min(1, value));
    this.setParameterByName(DB303Param.ACCENT, clamped);
  }

  setAccentAmount(value: number): void {
    this.setAccent(value);
  }

  setSlideTime(value: number): void {
    // Send normalized 0-1 value directly - WASM handles ms conversion
    const clamped = Math.max(0, Math.min(1, value));
    this._currentSlideTime = value;
    this.setParameterByName(DB303Param.SLIDE_TIME, clamped);
  }

  setVolume(value: number): void {
    // Convert normalized 0-1 to linear gain (0.0 to 1.0)
    // WASM expects linear gain, not dB
    const clamped = Math.max(0, Math.min(1, value));
    this.setParameterByName(DB303Param.VOLUME, clamped);
  }

  setWaveform(value: number): void {
    // 0-1 (saw to square blend) - this one stays normalized
    this.setParameterByName(DB303Param.WAVEFORM, value);
  }

  setTuning(value: number): void {
    // Send normalized 0-1 value directly - WASM handles Hz conversion
    const clamped = Math.max(0, Math.min(1, value));
    this.setParameterByName(DB303Param.TUNING, clamped);
  }

  // ============================================================================
  // LFO (Low Frequency Oscillator) Methods
  // Note: Most LFO params can stay normalized 0-1 as they're modulation depths
  // Only LFO rate needs Hz conversion
  // ============================================================================

  setLfoWaveform(waveform: number): void {
    // 0=triangle, 1=saw up, 2=saw down, 3=square, 4=random(S&H), 5=noise
    this.setParameterByName(DB303Param.LFO_WAVEFORM, waveform);
  }

  setLfoRate(value: number): void {
    // Send normalized 0-1 value directly - WASM handles Hz conversion
    const clamped = Math.max(0, Math.min(1, value));
    this.setParameterByName(DB303Param.LFO_RATE, clamped);
  }

  setLfoContour(value: number): void {
    // 0-1 normalized - modulation depth, keep as is
    this.setParameterByName(DB303Param.LFO_CONTOUR, value);
  }

  setLfoPitchDepth(value: number): void {
    // 0-1 normalized - modulation depth, keep as is
    this.setParameterByName(DB303Param.LFO_PITCH_DEPTH, value);
  }

  setLfoPwmDepth(value: number): void {
    // 0-1 normalized - modulation depth, keep as is
    this.setParameterByName(DB303Param.LFO_PWM_DEPTH, value);
  }

  setLfoFilterDepth(value: number): void {
    // 0-1 normalized - modulation depth, keep as is
    this.setParameterByName(DB303Param.LFO_FILTER_DEPTH, value);
  }

  setLfoStiffDepth(value: number): void {
    // 0-1 normalized - modulation depth, keep as is
    this.setParameterByName(DB303Param.LFO_STIFF_DEPTH, value);
  }

  // ============================================================================
  // Extended Devil Fish Methods
  // ============================================================================

  setNormalDecay(value: number): void {
    // Send normalized 0-1 value directly - WASM handles ms conversion
    const clamped = Math.max(0, Math.min(1, value));
    this.setParameterByName(DB303Param.NORMAL_DECAY, clamped);
  }

  setAccentDecay(value: number): void {
    // Send normalized 0-1 value directly - WASM handles ms conversion
    const clamped = Math.max(0, Math.min(1, value));
    this.setParameterByName(DB303Param.ACCENT_DECAY, clamped);
  }

  setSoftAttack(value: number): void {
    // Send normalized 0-1 value directly - WASM handles ms conversion
    const clamped = Math.max(0, Math.min(1, value));
    this.setParameterByName(DB303Param.SOFT_ATTACK, clamped);
  }

  setAccentSoftAttack(value: number): void {
    // Send normalized 0-1 value directly - WASM handles ms conversion
    const clamped = Math.max(0, Math.min(1, value));
    this.setParameterByName(DB303Param.ACCENT_SOFT_ATTACK, clamped);
  }

  setPassbandCompensation(value: number): void {
    // 0-1 normalized - keep as is for now
    this.setParameterByName(DB303Param.PASSBAND_COMPENSATION, value);
  }

  setFeedbackHighpass(value: number): void {
    // Send normalized 0-1 value directly
    const clamped = Math.max(0, Math.min(1, value));
    this.setParameterByName('feedbackHighpass', clamped);
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
  // These mirror the main filter params but target separate WASM functions
  setKorgWarmth(value: number): void {
    // Mirrors diodeCharacter - adds transistor warmth/nonlinearity
    this.setParameterByName(DB303Param.KORG_WARMTH, value);
  }

  setKorgStiffness(value: number): void {
    // Mirrors duffingAmount (after deadzone transform) - adds filter stiffness
    this.setParameterByName(DB303Param.KORG_STIFFNESS, value);
  }

  setKorgFilterFm(value: number): void {
    // Mirrors filterFmDepth - filter frequency modulation
    this.setParameterByName(DB303Param.KORG_FILTER_FM, value);
  }

  setKorgIbiasScale(value: number): void {
    // Controls resonance tracking bias current scaling
    // db303 web app: 0.1 + resTrackingKnob * 3.9 (range 0.1-4.0)
    this.setParameterByName(DB303Param.KORG_IBIAS_SCALE, value);
  }

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
    // 0-4 chorus mode (0=Off, 1=Subtle, 2=Standard, 3=Rich, 4=Dramatic)
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

  // Built-in effects setters — WASM-only, no Tone.js duplication

  setChorusMix(value: number): void {
    const clamped = Math.max(0, Math.min(1, value));
    this.setParameterByName(DB303Param.CHORUS_MIX, clamped);
  }

  setPhaserRate(value: number): void {
    const clamped = Math.max(0, Math.min(1, value));
    this.setParameterByName(DB303Param.PHASER_RATE, clamped);
  }

  setPhaserWidth(value: number): void {
    const clamped = Math.max(0, Math.min(1, value));
    this.setParameterByName(DB303Param.PHASER_WIDTH, clamped);
  }

  setPhaserFeedback(value: number): void {
    const clamped = Math.max(0, Math.min(1, value));
    this.setParameterByName(DB303Param.PHASER_FEEDBACK, clamped);
  }

  setPhaserMix(value: number): void {
    const clamped = Math.max(0, Math.min(1, value));
    this.setParameterByName(DB303Param.PHASER_MIX, clamped);
  }

  setDelayTime(value: number): void {
    // WASM expects raw 0-16 (16th note subdivisions), NOT 0-1 normalized
    const clamped = Math.max(0, Math.min(16, value));
    this.setParameterByName(DB303Param.DELAY_TIME, clamped);
  }

  setDelayFeedback(value: number): void {
    const clamped = Math.max(0, Math.min(1, value));
    this.setParameterByName(DB303Param.DELAY_FEEDBACK, clamped);
  }

  setDelayTone(value: number): void {
    const clamped = Math.max(0, Math.min(1, value));
    this.setParameterByName(DB303Param.DELAY_TONE, clamped);
  }

  setDelayMix(value: number): void {
    const clamped = Math.max(0, Math.min(1, value));
    this.setParameterByName(DB303Param.DELAY_MIX, clamped);
  }

  setDelaySpread(value: number): void {
    this.setParameterByName(DB303Param.DELAY_SPREAD, value);
  }

  // --- Missing methods for compatibility ---
  setOverdrive(amount: number): void {
    if (this._disposed || !this.workletNode) return;
    this.overdriveAmount = Math.max(0, Math.min(1, amount));

    const now = this.audioContext.currentTime;
    const RAMP = 0.03; // 30ms smooth transition

    if (this.overdriveAmount > 0) {
      // Lazy-create native overdrive nodes
      if (!this.overdrive || !this.overdriveGain) {
        this.overdriveGain = this.audioContext.createGain();
        this.overdrive = this.audioContext.createWaveShaper();
      }

      // Generate tanh distortion curve
      const curve = new Float32Array(4096);
      const drive = 1 + this.overdriveAmount * 8;
      for (let i = 0; i < 4096; i++) {
        const x = (i / 4096) * 2 - 1;
        curve[i] = Math.tanh(x * drive) / Math.tanh(drive);
      }
      this.overdrive.curve = curve;
      this.overdriveGain.gain.linearRampToValueAtTime(1 + this.overdriveAmount * 2, now + RAMP);

      // Rewire: worklet → overdriveGain → overdrive → output
      try {
        this.workletNode.disconnect(this.output);
      } catch { /* not connected */ }
      try {
        this.workletNode.connect(this.overdriveGain);
        this.overdriveGain.connect(this.overdrive);
        this.overdrive.connect(this.output);
      } catch { /* already connected */ }
    } else {
      // Bypass: worklet → output (direct)
      if (this.overdrive && this.overdriveGain) {
        try {
          this.workletNode.disconnect(this.overdriveGain);
          this.overdriveGain.disconnect(this.overdrive);
          this.overdrive.disconnect(this.output);
        } catch { /* not connected */ }
        this.overdriveGain.gain.linearRampToValueAtTime(1, now + RAMP);
      }
      try {
        this.workletNode.connect(this.output);
      } catch { /* already connected */ }
    }
  }

  // VEG (Volume Envelope Generator) decay
  // NOTE: This WASM doesn't have ampDecay/VegDecay - amplitude uses filter envelope
  setVegDecay(_ms: number): void { void _ms; }

  // VEG sustain
  // NOTE: This WASM doesn't have ampSustain/VegSustain - amplitude uses filter envelope
  setVegSustain(_percent: number): void { void _percent; }

  setFilterFM(percent: number): void {
    this.setFilterFmDepth(percent / 100);
  }

  setMuffler(mode: string): void {
    // Maps to the JS-side overdrive waveshaper with mode-specific curves.
    switch (mode) {
      case 'soft':
        this.setOverdrive(0.15);
        break;
      case 'hard':
        this.setOverdrive(0.45);
        break;
      case 'dark':
        this.setOverdrive(0.30);
        break;
      case 'mid':
        this.setOverdrive(0.25);
        break;
      case 'bright':
        this.setOverdrive(0.35);
        break;
      case 'off':
      default:
        this.setOverdrive(0);
        break;
    }
  }

  setSweepSpeed(_mode: string): void { void _mode;
    // Sweep speed is not a native TB-303/DB303 parameter
    // It's a UI abstraction for envelope attack/decay times
    // The actual parameters (normalAttack, accentAttack, decay) are set separately
    // This method is a no-op to maintain compatibility with the interface
  }

  setHighResonanceEnabled(_enabled: boolean): void { void _enabled; }

  setAccentSweepEnabled(_enabled: boolean): void { void _enabled; }

  // Enable/disable methods for effects — WASM-only
  setChorusEnabled(enabled: boolean): void {
    if (!enabled) {
      this.setParameterByName(DB303Param.CHORUS_MIX, 0);
    }
  }

  setPhaserEnabled(enabled: boolean): void {
    if (!enabled) {
      this.setParameterByName(DB303Param.PHASER_MIX, 0);
    }
  }

  setPhaserDepth(value: number): void {
    // Map to WASM phaser width
    this.setParameterByName(DB303Param.PHASER_WIDTH, value);
  }

  setDelayEnabled(enabled: boolean): void {
    if (!enabled) {
      this.setParameterByName(DB303Param.DELAY_MIX, 0);
    }
  }

  async loadGuitarMLModel(_index: number): Promise<void> { void _index; }
  async setGuitarMLEnabled(_enabled: boolean): Promise<void> { void _enabled; }
  setGuitarMLMix(_mix: number): void { void _mix; }
  setQuality(_quality: string): void { void _quality; }
  enableDevilFish(_enabled: boolean): void { void _enabled; }
  setHighResonance(_enabled: boolean): void { void _enabled; }

  /**
   * Apply a full TB303Config directly. All values are 0-1 normalized.
   * This is the single canonical place for config → WASM parameter mapping.
   * Called by both InstrumentFactory (init) and useInstrumentStore (runtime updates).
   */
  applyConfig(tb: TB303Config): void {
    if (db303TraceEnabled()) {
      const keys = Object.keys(tb).filter(k => (tb as unknown as Record<string, unknown>)[k] !== undefined);
      console.log('[DB303:applyConfig]', keys);
    }
    // --- Core parameters ---
    if (tb.tuning !== undefined) this.setTuning(tb.tuning);
    // Volume: reference never sets volume (WASM default is natural level).
    // Default is 1.0 — lower values attenuate but user should still have control.
    if (tb.volume !== undefined) this.setVolume(tb.volume);

    // Filter — check extendedCutoff (Wide toggle) for Hz mode
    if (tb.filter) {
      if (tb.devilFish?.extendedCutoff) {
        // Wide mode: 0-1 knob → 10-5000 Hz (logarithmic, matching reference)
        const hz = 10 * Math.pow(500, tb.filter.cutoff);
        this.setCutoffHz(hz);
      } else {
        this.setCutoff(tb.filter.cutoff);
      }
      this.setResonance(tb.filter.resonance);
    }

    // Filter envelope — check extendedEnvMod (Wide toggle) for percent mode
    if (tb.filterEnvelope) {
      if (tb.devilFish?.extendedEnvMod) {
        // Wide mode: 0-1 knob → 0-300% (linear, matching reference)
        this.setEnvModPercent(tb.filterEnvelope.envMod * 300);
      } else {
        this.setEnvMod(tb.filterEnvelope.envMod);
      }
      this.setDecay(tb.filterEnvelope.decay);
    }

    // Accent (0-1)
    if (tb.accent) {
      this.setAccent(tb.accent.amount);
    }

    // Slide (0-1)
    if (tb.slide) {
      this.setSlideTime(tb.slide.time);
    }

    // Overdrive (0-1 normalized)
    if (tb.overdrive) {
      this.setOverdrive(tb.overdrive.amount);
    }

    // --- Oscillator ---
    if (tb.oscillator) {
      const waveformValue = tb.oscillator.waveformBlend !== undefined
        ? tb.oscillator.waveformBlend
        : (tb.oscillator.type === 'square' ? 1.0 : 0.0);
      this.setWaveform(waveformValue);
      if (tb.oscillator.pulseWidth !== undefined) this.setPulseWidth(tb.oscillator.pulseWidth);
      if (tb.oscillator.subOscGain !== undefined) this.setSubOscGain(tb.oscillator.subOscGain);
      if (tb.oscillator.subOscBlend !== undefined) this.setSubOscBlend(tb.oscillator.subOscBlend);
      if (tb.oscillator.pitchToPw !== undefined) this.setPitchToPw(tb.oscillator.pitchToPw);
    }

    // --- MOJO: Filter character params (always active, independent of Devil Fish toggle) ---
    // The reference site always has these active. enableDevilFish() is a no-op in WASM —
    // there's no real toggle. The WASM always uses whatever params are set.
    const df = tb.devilFish;
    if (df) {
      this.enableDevilFish(true);
      // CRITICAL: Reference sets oversamplingOrder FIRST (line 2355 of db303-index-unmin.js),
      // then filterSelect (line 2358), before any other params. Changing oversampling rate
      // may reinitialize internal DSP state, so all filter params must come AFTER.
      if (df.oversamplingOrder !== undefined) this.setOversamplingOrder(df.oversamplingOrder);
      if (df.filterSelect !== undefined) this.setFilterSelect(df.filterSelect);

      // MOJO params — filter character shaping, always sent
      if (df.filterTracking !== undefined) this.setFilterTracking(df.filterTracking);
      if (df.filterFmDepth !== undefined) {
        this.setFilterFmDepth(df.filterFmDepth);
        this.setKorgFilterFm(df.filterFmDepth);
      }
      if (df.filterInputDrive !== undefined) this.setFilterInputDrive(df.filterInputDrive);
      if (df.passbandCompensation !== undefined) this.setPassbandCompensation(1 - df.passbandCompensation);
      if (df.resTracking !== undefined) {
        this.setResTracking(1 - df.resTracking);
        this.setKorgIbiasScale(0.1 + df.resTracking * 3.9);
      }
      if (df.duffingAmount !== undefined) {
        this.setDuffingAmount(df.duffingAmount);
        const da = df.duffingAmount;
        const stiffness = Math.abs(da) < 0.16 ? 0 : ((da > 0 ? 1 : -1) * (Math.abs(da) - 0.16)) / 0.84;
        this.setKorgStiffness(stiffness);
      }
      if (df.lpBpMix !== undefined) this.setLpBpMix(df.lpBpMix);
      if (df.diodeCharacter !== undefined) {
        this.setDiodeCharacter(df.diodeCharacter);
        this.setKorgWarmth(df.diodeCharacter);
      }
      if (df.stageNLAmount !== undefined) this.setStageNLAmount(df.stageNLAmount);
      if (df.ensembleAmount !== undefined) this.setEnsembleAmount(df.ensembleAmount);
    }

    // --- Devil Fish envelope mods (always active — reference has no DF toggle) ---
    // The WASM always has DF enabled (line above calls enableDevilFish(true)).
    // These params are always sent; no gating on df.enabled.
    if (df) {
      // normalDecay: setDecay() above syncs normalDecay to match the core decay.
      // If the user has set a different normalDecay via the DEVILFISH tab, override here.
      if (df.normalDecay !== undefined) this.setNormalDecay(df.normalDecay);
      if (df.accentDecay !== undefined) this.setAccentDecay(df.accentDecay);
      if (df.softAttack !== undefined) this.setSoftAttack(df.softAttack);
      if (df.accentSoftAttack !== undefined) this.setAccentSoftAttack(df.accentSoftAttack);
      if (df.muffler !== undefined) this.setMuffler(df.muffler);
      if (df.sweepSpeed !== undefined) this.setSweepSpeed(df.sweepSpeed);
      if (df.highResonance !== undefined) this.setHighResonanceEnabled(df.highResonance);
    }

    // --- Korg filter parameters (independent of Devil Fish mode) ---
    if (df?.korgEnabled) {
      if (df.korgBite !== undefined) this.setKorgBite(df.korgBite);
      if (df.korgClip !== undefined) this.setKorgClip(df.korgClip);
      if (df.korgCrossmod !== undefined) this.setKorgCrossmod(df.korgCrossmod);
      if (df.korgQSag !== undefined) this.setKorgQSag(df.korgQSag);
      if (df.korgSharpness !== undefined) this.setKorgSharpness(df.korgSharpness);
    } else if (df) {
      // Reset Korg filter params to neutral when disabled
      this.setKorgBite(0);
      this.setKorgClip(0);
      this.setKorgCrossmod(0);
      this.setKorgQSag(0);
      this.setKorgSharpness(0.5);
    }

    // --- LFO ---
    const lfo = tb.lfo;
    if (lfo?.enabled) {
      if (lfo.waveform !== undefined) this.setLfoWaveform(lfo.waveform);
      if (lfo.rate !== undefined) this.setLfoRate(lfo.rate);
      if (lfo.contour !== undefined) this.setLfoContour(lfo.contour);
      if (lfo.pitchDepth !== undefined) this.setLfoPitchDepth(lfo.pitchDepth);
      if (lfo.pwmDepth !== undefined) this.setLfoPwmDepth(lfo.pwmDepth);
      if (lfo.filterDepth !== undefined) this.setLfoFilterDepth(lfo.filterDepth);
      if (lfo.stiffDepth !== undefined) this.setLfoStiffDepth(lfo.stiffDepth);
    } else {
      // Reset LFO depths to zero when disabled
      this.setLfoRate(0);
      this.setLfoPitchDepth(0);
      this.setLfoPwmDepth(0);
      this.setLfoFilterDepth(0);
      this.setLfoStiffDepth(0);
    }

    // --- Built-in effects (all WASM-internal) ---
    if (tb.chorus) {
      if (tb.chorus.mode !== undefined) this.setChorusMode(tb.chorus.mode);
      this.setChorusMix(tb.chorus.enabled ? (tb.chorus.mix ?? 0) : 0);
    }
    if (tb.phaser) {
      if (tb.phaser.rate !== undefined) this.setPhaserRate(tb.phaser.rate);
      if (tb.phaser.depth !== undefined) this.setPhaserWidth(tb.phaser.depth);
      if (tb.phaser.feedback !== undefined) this.setPhaserFeedback(tb.phaser.feedback);
      this.setPhaserMix(tb.phaser.enabled ? (tb.phaser.mix ?? 0) : 0);
    }
    if (tb.delay) {
      if (tb.delay.time !== undefined) this.setDelayTime(tb.delay.time);
      if (tb.delay.feedback !== undefined) this.setDelayFeedback(tb.delay.feedback);
      if (tb.delay.tone !== undefined) this.setDelayTone(tb.delay.tone);
      this.setDelayMix(tb.delay.enabled ? (tb.delay.mix ?? 0) : 0);
      if (tb.delay.stereo !== undefined) this.setDelaySpread(tb.delay.stereo);
    }
  }

  /** Request WASM diagnostics readback from the worklet. Returns parameter state as seen by WASM. */
  getDiagnostics(): Promise<Record<string, number>> {
    return new Promise((resolve) => {
      if (!this.workletNode) { resolve({}); return; }
      const handler = (event: MessageEvent) => {
        if (event.data.type === 'diagnostics') {
          this.workletNode?.port.removeEventListener('message', handler);
          resolve(event.data);
        }
      };
      this.workletNode.port.addEventListener('message', handler);
      this.workletNode.port.postMessage({ type: 'getDiagnostics' });
      setTimeout(() => resolve({}), 500);
    });
  }

  dispose(): void {
    this._disposed = true;
    if (this._releaseTimeout !== null) {
      clearTimeout(this._releaseTimeout);
      this._releaseTimeout = null;
    }
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.overdrive) {
      this.overdrive.disconnect();
      this.overdrive = null;
    }
    if (this.overdriveGain) {
      this.overdriveGain.disconnect();
      this.overdriveGain = null;
    }
    this.output.disconnect();
  }
}

// Export as JC303Synth alias for backwards compatibility
export { DB303Synth as JC303Synth };
