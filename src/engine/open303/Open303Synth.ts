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

    // Start with clean bypass (no waveshaper coloring at amount=0)
    this.overdriveGain.connect(this.output);

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
            .replace(/export\s+default\s+\w+;?/g, '')
            .replace(/if\s*\(ENVIRONMENT_IS_NODE\)\s*\{[^}]*await\s+import\([^)]*\)[^}]*\}/g, '')
            .replace(/(wasmMemory=wasmExports\["\w+"\])/, '$1;Module["wasmMemory"]=wasmMemory');
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
        if (this._resolveInit) {
          this._resolveInit();
          this._resolveInit = null;
        }
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

    // Flush queued parameters immediately via postMessage. The worklet's
    // handleMessage queues setParameter calls during WASM init and deduplicates
    // by paramId, so any later knob changes sent before WASM is ready will
    // correctly override these initial values.
    if (this._pendingParams.length > 0) {
      console.log(`[Open303] Sending ${this._pendingParams.length} queued params to worklet`);
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

    // Map accent flag to velocity (Open303 uses high velocity for accent)
    let finalVelocity = Math.floor(velocity * 127);
    if (accent && finalVelocity < 100) finalVelocity = 127;
    if (!accent && finalVelocity >= 100) finalVelocity = 99;

    // Track note for filter tracking
    this._lastMidiNote = midiNote;
    if (this._filterTracking > 0) {
      this.applyFilterTracking();
    }

    // Pass slide flag to worklet for proper 303 slide behavior
    // When slide=true: worklet keeps previous note held → Open303 slideToNote (legato)
    // When slide=false: worklet releases previous note first → Open303 triggerNote (retrigger)
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
      console.warn(`[Open303] setParameter BLOCKED: disposed (paramId=${paramId}, value=${value})`);
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
      console.log(`[Open303] setParameter QUEUED (workletNode null): paramId=${paramId}, value=${value}, queue=${this._pendingParams.length}`);
      return;
    }
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
    this._baseCutoff = hz;
    // Apply filter tracking if active, otherwise send directly
    if (this._filterTracking > 0) {
      this.applyFilterTracking();
    } else {
      this.setParameterById(Open303Param.CUTOFF, hz);
    }
  }

  setResonance(val: number): void {
    this._baseResonance = val;
    this.applyResonance();
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

  // --- Filter Tracking & Resonance Helpers ---
  private applyFilterTracking(): void {
    if (this._filterTracking <= 0) {
      // No tracking - send base cutoff as-is
      this.setParameterById(Open303Param.CUTOFF, this._baseCutoff);
      return;
    }
    // Scale cutoff based on note distance from C2 (MIDI 36)
    // At 100% tracking: cutoff doubles per octave (follows pitch 1:1)
    // At 200% tracking: cutoff quadruples per octave
    const semitoneOffset = this._lastMidiNote - 36;
    const trackingScale = (this._filterTracking / 100);
    const cutoffMultiplier = Math.pow(2, (semitoneOffset / 12) * trackingScale);
    const adjustedCutoff = Math.max(20, Math.min(20000, this._baseCutoff * cutoffMultiplier));
    this.setParameterById(Open303Param.CUTOFF, adjustedCutoff);
  }

  private applyResonance(): void {
    let reso = this._baseResonance;
    if (!this._highResonance) {
      // Stock 303: resonance pot limited to ~85% of range (no self-oscillation)
      reso = Math.min(reso, 85);
    }
    // Full range: 0-100% where 100% = self-oscillation
    this.setParameterById(Open303Param.RESONANCE, reso);
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
      this.setParameterById(Open303Param.ENV_MOD, Math.min(100, 25 + envModBoost));
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
        this.setParameterById(Open303Param.TANH_DRIVE, 1.5);
        this.setParameterById(Open303Param.TANH_OFFSET, 0.0);
        break;
      case 'hard':
        // Aggressive clipping - gnarly distortion
        this.setOverdrive(45);
        this.setParameterById(Open303Param.TANH_DRIVE, 3.0);
        this.setParameterById(Open303Param.TANH_OFFSET, 0.05);
        break;
      case 'dark':
        // Low-pass character clipping - muffled growl
        this.setOverdrive(30);
        this.setParameterById(Open303Param.TANH_DRIVE, 2.0);
        this.setParameterById(Open303Param.TANH_OFFSET, -0.1);
        this.setParameterById(Open303Param.POST_FILTER_HP, 20);
        break;
      case 'mid':
        // Mid-focused clipping
        this.setOverdrive(25);
        this.setParameterById(Open303Param.TANH_DRIVE, 2.5);
        this.setParameterById(Open303Param.TANH_OFFSET, 0.0);
        this.setParameterById(Open303Param.POST_FILTER_HP, 80);
        break;
      case 'bright':
        // High-presence clipping - biting aggression
        this.setOverdrive(35);
        this.setParameterById(Open303Param.TANH_DRIVE, 2.0);
        this.setParameterById(Open303Param.TANH_OFFSET, 0.1);
        this.setParameterById(Open303Param.POST_FILTER_HP, 150);
        break;
      case 'off':
      default:
        // Clean signal - no muffler
        this.setOverdrive(0);
        this.setParameterById(Open303Param.TANH_DRIVE, 1.0);
        this.setParameterById(Open303Param.TANH_OFFSET, 0.0);
        this.setParameterById(Open303Param.POST_FILTER_HP, 44);
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
        this.setParameterById(Open303Param.ACCENT_ATTACK, 0.5);
        this.setParameterById(Open303Param.ACCENT_DECAY, 80);
        break;
      case 'slow':
        // Slow charge/discharge - long sweeping accents
        this.setParameterById(Open303Param.ACCENT_ATTACK, 10);
        this.setParameterById(Open303Param.ACCENT_DECAY, 800);
        break;
      case 'normal':
      default:
        // Stock 303 accent timing
        this.setParameterById(Open303Param.ACCENT_ATTACK, 3);
        this.setParameterById(Open303Param.ACCENT_DECAY, 200);
        break;
    }
  }

  setAccentSweepEnabled(enabled: boolean): void {
    // Devil Fish: enable/disable accent sweep circuit.
    // When disabled, accented notes have no filter envelope sweep.
    if (!enabled) {
      this.setParameterById(Open303Param.ACCENT, 0);
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
    this.output.dispose();
    super.dispose();
    return this;
  }
}

// Export as JC303Synth alias for backwards compatibility
export { Open303Synth as JC303Synth };
