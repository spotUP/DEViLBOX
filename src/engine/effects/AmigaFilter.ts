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
import { createAudioWorkletNode as toneCreateAudioWorkletNode } from 'tone/build/esm/core/context/AudioContext';

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
  private _retryCount = 0;
  private static readonly MAX_RETRIES = 3;

  // Static map to track loading promises per context to avoid multiple addModule calls
  private static _loadPromises = new WeakMap<any, Promise<void>>();

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
    if (this._retryCount >= AmigaFilter.MAX_RETRIES) {
      console.warn(`[AmigaFilter] Max retries (${AmigaFilter.MAX_RETRIES}) reached. Filter will remain in bypass mode.`);
      return;
    }
    
    this._initializing = true;

    try {
      // Get the Tone.js context wrapper (standardized-audio-context)
      // This is CRITICAL: we must use the wrapper for addModule so that 
      // createAudioWorkletNode (which also uses the wrapper) can find the processor.
      const toneCtx = this.context as any;
      const workletContext = toneCtx.rawContext || toneCtx._context;

      // Verify we have a valid context with audioWorklet support
      if (!workletContext || !workletContext.audioWorklet) {
        console.warn('[AmigaFilter] AudioWorklet not supported or no valid context');
        this._initializing = false;
        return;
      }

      // Verify the context is in running state
      if (workletContext.state !== 'running') {
        console.warn('[AmigaFilter] Context not running, deferring init');
        this._initializing = false;
        return;
      }

      const baseUrl = import.meta.env.BASE_URL || '/';
      const cacheBuster = `?v=${Date.now()}`;

      // Ensure we only call addModule once per context
      let loadPromise = AmigaFilter._loadPromises.get(workletContext);
      if (!loadPromise) {
        loadPromise = (async () => {
          try {
            await workletContext.audioWorklet.addModule(`${baseUrl}AmigaFilter.worklet.js${cacheBuster}`);
          } catch (e: any) {
            // Module might already be registered - this is fine
            const isAlreadyRegistered = e?.message?.includes('already') || e?.message?.includes('duplicate');
            if (isAlreadyRegistered) {
              console.log('[AmigaFilter] Worklet already registered');
            } else {
              // If it failed for any other reason (including InvalidStateError from a transitioning context),
              // allow retry by deleting from map.
              AmigaFilter._loadPromises.delete(workletContext);
              throw e;
            }
          }
        })();
        AmigaFilter._loadPromises.set(workletContext, loadPromise);
      }

      // Wait for module to be loaded
      await loadPromise;

      // Use Tone.js's createAudioWorkletNode for context compatibility
      try {
        this._worklet = toneCreateAudioWorkletNode(workletContext, 'amiga-filter-processor');
      } catch (e: any) {
        if (e?.name === 'InvalidStateError') {
          // This usually means the processor name is unknown, meaning addModule failed silently
          this._retryCount++;
          console.warn(`[AmigaFilter] Processor not registered after addModule (retry ${this._retryCount}/${AmigaFilter.MAX_RETRIES})`);
          AmigaFilter._loadPromises.delete(workletContext);
          this._initializing = false;
          
          // Retry once after a delay
          if (this._retryCount < AmigaFilter.MAX_RETRIES) {
            setTimeout(() => this.initWorklet(), 500);
          }
          return;
        }
        throw e;
      }

      // Initialize worklet with coefficients
      if (this._worklet) {
        this._worklet.port.postMessage({
          type: 'INIT',
          coeffs: {
            hp: { a1: this.hp_a1, a2: this.hp_a2 },
            lp1: { a1: this.lp1_a1, a2: this.lp1_a2 },
            lp2: { a1: this.lp2_a1, a2: this.lp2_a2, b1: this.lp2_b1, b2: this.lp2_b2 }
          }
        });
      }

      if (this._worklet) {
        // Disconnect bypass before connecting through worklet
        try { this.input.disconnect(this.output); } catch {}

        // Connect using Tone.js compatible nodes
        // input (Tone.Gain) -> worklet -> output (Tone.Gain)
        Tone.connect(this.input, this._worklet as any);
        Tone.connect(this._worklet as any, this.output);
        this._initialized = true;
        console.log('[AmigaFilter] 1:1 hardware filter initialized successfully');
      } else {
        console.warn('[AmigaFilter] Worklet creation failed, using bypass');
        this._initializing = false;
      }
    } catch (e) {
      console.error('[AmigaFilter] Failed to load worklet:', e);
      // Keep bypass connection (already connected in constructor)
      this._initializing = false;
      this._retryCount++;
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
