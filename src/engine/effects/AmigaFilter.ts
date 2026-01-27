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

  constructor() {
    super();
    this.input = new Tone.Gain();
    this.output = new Tone.Gain();
    this._sampleRate = Tone.getContext().sampleRate;
    
    this.setupCoefficients();
    this.initWorklet();
  }

  private async initWorklet() {
    const context = Tone.getContext();
    // In Tone.js v14+, getContext().rawContext is the native BaseAudioContext (AudioContext or OfflineAudioContext)
    const rawContext = context.rawContext;

    if (!rawContext || !rawContext.audioWorklet) {
      console.warn('[AmigaFilter] AudioWorklet not supported or context not ready');
      this.input.connect(this.output);
      return;
    }

    try {
      // Diagnostic log to verify context type
      const contextType = rawContext.constructor.name;
      console.log('[AmigaFilter] Initializing on context type:', contextType);
      
      // If we are in a non-standard environment where rawContext might be a wrapper, 
      // we try to reach deeper or fail gracefully
      if (contextType !== 'AudioContext' && contextType !== 'OfflineAudioContext' && contextType !== 'webkitAudioContext') {
        console.warn('[AmigaFilter] Context is not a native BaseAudioContext, falling back to bypass');
        this.input.connect(this.output);
        return;
      }

      const baseUrl = import.meta.env.BASE_URL || '/';
      await rawContext.audioWorklet.addModule(`${baseUrl}AmigaFilter.worklet.js`);
      
      // Construct the node using the native context
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
      // We use the internal native gain nodes for the connection to the native worklet
      // This is the most reliable way to bridge Tone.js and native nodes
      const nativeInput = (this.input as any)._gainNode || (this.input as any)._node || this.input.input;
      const nativeOutput = (this.output as any)._gainNode || (this.output as any)._node || this.output.input;

      if (nativeInput && nativeInput.connect && this._worklet) {
        nativeInput.connect(this._worklet);
        this._worklet.connect(nativeOutput);
        console.log('[AmigaFilter] 1:1 hardware filter initialized successfully');
      } else {
        throw new Error('Could not find native nodes for connection');
      }
    } catch (e) {
      console.error('[AmigaFilter] Failed to load worklet:', e);
      // Ensure we don't break the audio chain on failure
      try { this.input.disconnect(); } catch {}
      this.input.connect(this.output);
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
