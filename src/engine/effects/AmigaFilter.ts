/**
 * AmigaFilter - 1:1 DSP emulation of Amiga hardware audio filters
 * 
 * Based on ProTracker 2.3D clone source (pt2_rcfilters.c)
 * and Amiga 500 hardware schematics.
 * 
 * Filters implemented:
 * 1. Fixed High-pass: ~5Hz (removes DC offset)
 * 2. Fixed A500 Low-pass: ~4.4kHz (6dB/octave RC)
 * 3. Switchable "LED" Low-pass: ~3.1kHz (12dB/octave Sallen-Key, Q~0.66)
 */

import * as Tone from 'tone';

export class AmigaFilter extends Tone.ToneAudioNode {
  readonly name: string = 'AmigaFilter';
  
  // Coefficients
  private hp_a1 = 0;
  private hp_a2 = 0;
  private lp1_a1 = 0;
  private lp1_a2 = 0;
  private lp2_a1 = 0;
  private lp2_a2 = 0;
  private lp2_b1 = 0;
  private lp2_b2 = 0;

  private _ledFilterEnabled = true;
  private _sampleRate: number;

  input: Tone.Gain;
  output: Tone.Gain;
  private _worklet: AudioWorkletNode | null = null;

  private _initialized = false;
  private _initializing = false;

  constructor() {
    super();
    this.input = new Tone.Gain();
    this.output = new Tone.Gain();
    this._sampleRate = Tone.getContext().sampleRate;

    this.setupCoefficients();

    // Connect bypass initially - worklet will be initialized lazily
    this.input.connect(this.output);

    // Try to initialize worklet when context is ready
    this.tryInitWorklet();
  }

  /**
   * Try to initialize the worklet, retrying if context isn't ready
   */
  private async tryInitWorklet() {
    if (this._initialized || this._initializing) return;

    const context = Tone.getContext();

    // Wait for context to be running (user interaction needed)
    if (context.state !== 'running') {
      // Listen for context state change
      const checkState = () => {
        if (context.state === 'running') {
          this.initWorklet();
        }
      };

      // Check periodically and on state change
      context.on('statechange', checkState);

      // Also try after a short delay (context might already be running)
      setTimeout(() => {
        if (context.state === 'running' && !this._initialized) {
          this.initWorklet();
        }
      }, 100);

      return;
    }

    await this.initWorklet();
  }

  private async initWorklet() {
    if (this._initialized || this._initializing) return;
    this._initializing = true;

    try {
      // Get the native AudioContext - use Tone.js's internal context access
      const toneContext = Tone.getContext();
      let rawContext: AudioContext | null = null;

      // Method 1: Tone.js exposes rawContext which should be the native AudioContext
      const rawCtx = toneContext.rawContext;
      if (rawCtx && rawCtx instanceof AudioContext) {
        rawContext = rawCtx;
      } else if (rawCtx && rawCtx instanceof OfflineAudioContext) {
        rawContext = rawCtx as unknown as AudioContext;
      }

      // Method 2: If rawContext isn't a proper instance, try extracting from internal property
      if (!rawContext) {
        // Tone.Context wraps BaseAudioContext - try to get _context
        const internalContext = (toneContext as any)._context;
        if (internalContext instanceof AudioContext) {
          rawContext = internalContext;
        }
      }

      // Method 3: Get from a native node's context property
      if (!rawContext) {
        // Create a temporary native oscillator to get the context
        try {
          const tempOsc = new Tone.Oscillator();
          const nativeOsc = (tempOsc as any)._oscillator;
          if (nativeOsc?.context instanceof AudioContext) {
            rawContext = nativeOsc.context;
          }
          tempOsc.dispose();
        } catch {
          // Ignore
        }
      }

      // Verify we have a valid AudioContext with audioWorklet support
      if (!rawContext || !rawContext.audioWorklet) {
        console.warn('[AmigaFilter] AudioWorklet not supported or no valid context');
        this._initializing = false;
        return;
      }

      // Additional check: verify the context is in running state
      if (rawContext.state !== 'running') {
        console.warn('[AmigaFilter] Context not running, deferring init');
        this._initializing = false;
        return;
      }

      const baseUrl = import.meta.env.BASE_URL || '/';

      // Try to add the worklet module - might fail if already registered
      try {
        await rawContext.audioWorklet.addModule(`${baseUrl}AmigaFilter.worklet.js`);
      } catch (e) {
        // Module might already be registered - this is fine
        if (!(e instanceof DOMException && e.name === 'InvalidStateError')) {
          throw e;
        }
      }

      // Construct the node
      this._worklet = new AudioWorkletNode(rawContext, 'amiga-filter-processor');
      
      // Initialize worklet with coefficients
      this._worklet.port.postMessage({
        type: 'INIT',
        coeffs: {
          hp: { a1: this.hp_a1, a2: this.hp_a2 },
          lp1: { a1: this.lp1_a1, a2: this.lp1_a2 },
          lp2: { a1: this.lp2_a1, a2: this.lp2_a2, b1: this.lp2_b1, b2: this.lp2_b2 }
        }
      });

      // Connect Tone.Gain -> native AudioWorkletNode -> Tone.Gain
      // Use the internal Tone.js properties to get native GainNodes
      const getNativeNode = (toneNode: Tone.Gain): GainNode | null => {
        // Tone.Gain stores native node in different properties depending on version
        const node = (toneNode as any)._gainNode ||
                     (toneNode as any).input ||
                     (toneNode as any)._node;
        if (node instanceof GainNode) return node;
        // Try to access through context
        if (node?.context instanceof AudioContext) return node;
        return null;
      };

      const nativeInput = getNativeNode(this.input);
      const nativeOutput = getNativeNode(this.output);

      if (nativeInput && nativeOutput && this._worklet) {
        // Disconnect bypass before connecting through worklet
        try { this.input.disconnect(this.output); } catch {}

        nativeInput.connect(this._worklet);
        this._worklet.connect(nativeOutput);
        this._initialized = true;
        console.log('[AmigaFilter] 1:1 hardware filter initialized successfully');
      } else {
        console.warn('[AmigaFilter] Could not find native nodes, using bypass');
        this._initializing = false;
      }
    } catch (e) {
      console.error('[AmigaFilter] Failed to load worklet:', e);
      // Keep bypass connection (already connected in constructor)
      this._initializing = false;
    }
  }

  private setupCoefficients(): void {
    const sr = this._sampleRate;
    const PI = Math.PI;

    // 1. High-pass (~5.128Hz)
    const hp_cutoff = 5.128;
    const a_hp = 2.0 - Math.cos((2.0 * PI * hp_cutoff) / sr);
    const b_hp = a_hp - Math.sqrt(a_hp * a_hp - 1.0);
    this.hp_a1 = 1.0 - b_hp;
    this.hp_a2 = b_hp;

    // 2. Fixed Low-pass (~4420.971Hz)
    const lp1_cutoff = 4420.971;
    const a_lp1 = 2.0 - Math.cos((2.0 * PI * lp1_cutoff) / sr);
    const b_lp1 = a_lp1 - Math.sqrt(a_lp1 * a_lp1 - 1.0);
    this.lp1_a1 = 1.0 - b_lp1;
    this.lp1_a2 = b_lp1;

    // 3. LED Filter (~3090.533Hz, Q ~0.660225)
    const lp2_cutoff = 3090.533;
    const qfactor = 0.660225;
    const a_lp2 = 1.0 / Math.tan((PI * lp2_cutoff) / sr);
    const b_lp2 = 1.0 / qfactor;
    this.lp2_a1 = 1.0 / (1.0 + b_lp2 * a_lp2 + a_lp2 * a_lp2);
    this.lp2_a2 = 2.0 * this.lp2_a1;
    this.lp2_b1 = 2.0 * (1.0 - a_lp2 * a_lp2) * this.lp2_a1;
    this.lp2_b2 = (1.0 - b_lp2 * a_lp2 + a_lp2 * a_lp2) * this.lp2_a1;
  }

  get ledFilterEnabled(): boolean {
    return this._ledFilterEnabled;
  }

  set ledFilterEnabled(value: boolean) {
    this._ledFilterEnabled = value;
    if (this._worklet) {
      this._worklet.port.postMessage({ type: 'SET_LED', enabled: value });
    }
  }

  dispose(): this {
    super.dispose();
    this.input.dispose();
    this.output.dispose();
    return this;
  }
}
