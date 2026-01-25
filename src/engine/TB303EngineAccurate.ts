/**
 * TB303EngineAccurate - Accurate TB-303 Emulator using AudioWorklet
 *
 * This is a 1:1 port of the Open303 DSP engine to Web Audio API.
 * Uses a custom AudioWorklet processor for sample-accurate DSP.
 *
 * Based on:
 * - Open303 by Robin Schmidt (rosic)
 * - db303 / JC303 by various contributors
 *
 * Key improvements over Tone.js-based implementation:
 * - Exact TeeBeeFilter algorithm (4-pole ladder with feedback highpass)
 * - Accurate envelope generators (MEG, VEG, RC filters)
 * - PolyBLEP oscillator for perfect anti-aliasing
 * - Sample-accurate parameter modulation
 * - True 303 resonance curve
 */

import type { TB303Config } from '@typedefs/instrument';
// import type { NeuralPedalboard } from '@typedefs/pedalboard';
// import { PedalboardEngine } from './PedalboardEngine';
// import { DEFAULT_PEDALBOARD } from '@typedefs/pedalboard';

export interface TB303AccurateConfig {
  // Basic parameters
  waveform?: number;      // 0=saw, 1=square
  cutoff?: number;        // Hz, 20-20000
  resonance?: number;     // 0-100 (converted to 0-1 internally)
  envMod?: number;        // 0-100 (envelope modulation depth)
  decay?: number;         // ms, 200-2000 (filter envelope decay - MEG in stock, VEG in Devil Fish)
  accent?: number;        // 0-100 (accent amount)
  volume?: number;        // 0-100

  // Advanced parameters (Devil Fish)
  normalDecay?: number;   // ms - MEG decay for non-accented notes (Devil Fish only)
  accentDecay?: number;   // ms - MEG decay for accented notes (Devil Fish only)
  vegDecay?: number;      // ms - VEG (amplitude envelope) decay (Devil Fish only)
  vegSustain?: number;    // 0-1 - VEG sustain level (Devil Fish only)
  normalAttack?: number;  // ms
  accentAttack?: number;  // ms
  slideTime?: number;     // ms

  // Oversampling (1, 2, or 4)
  oversampling?: number;
}

export class TB303EngineAccurate {
  private audioContext: AudioContext;
  private workletNode: AudioWorkletNode | null = null;
  private isInitialized: boolean = false;
  private config: TB303AccurateConfig;
  // private tb303Config: TB303Config; // Removed - pedalboard feature disabled

  // Neural Pedalboard (multi-effect chain) - DISABLED
  // private pedalboard: PedalboardEngine | null = null;
  // private pedalboardInitialized: boolean = false;

  // Output connection point
  private outputGain: GainNode;

  // Current note state (for future features, currently unused)
  // private currentNote: number | null = null;
  // private currentVelocity: number = 100;

  constructor(audioContext: AudioContext, config: TB303Config) {
    this.audioContext = audioContext;
    // this.tb303Config = config; // Removed - pedalboard feature disabled
    this.config = this.convertConfig(config);

    // Create output gain
    this.outputGain = audioContext.createGain();
    this.outputGain.gain.value = 1.0;

    // Pedalboard removed - using simple overdrive instead
  }

  /**
   * Convert legacy TB303Config to accurate config
   */
  private convertConfig(config: TB303Config): TB303AccurateConfig {
    const dfEnabled = config.devilFish?.enabled ?? false;

    return {
      waveform: config.oscillator.type === 'sawtooth' ? 0.0 : 1.0,
      cutoff: config.filter?.cutoff ?? 800,
      resonance: config.filter?.resonance ?? 50,
      envMod: config.filterEnvelope?.envMod ?? 50,
      decay: config.filterEnvelope?.decay ?? 200,  // Keep for backward compatibility
      accent: config.accent?.amount ?? 50,
      volume: 75,

      // CRITICAL: Decay knob routing changes based on Devil Fish state
      // When DF disabled: decay knob controls MEG (filter envelope)
      // When DF enabled: decay knob controls VEG (amplitude envelope), separate knobs for MEG
      normalDecay: dfEnabled
        ? (config.devilFish?.normalDecay ?? 200)  // DF: use dedicated knob
        : (config.filterEnvelope?.decay ?? 200),  // Stock: use decay knob for MEG

      accentDecay: dfEnabled
        ? (config.devilFish?.accentDecay ?? 200)  // DF: use dedicated knob
        : (config.filterEnvelope?.decay ?? 200),  // Stock: same as normal (MEG)

      vegDecay: dfEnabled
        ? (config.devilFish?.vegDecay ?? 3000)    // DF: decay knob controls VEG
        : 3000,                                    // Stock: fixed ~3-4 sec

      vegSustain: config.devilFish?.vegSustain ?? 0,  // 0-100%, converted to 0-1 by worklet

      normalAttack: 3.0,
      accentAttack: 3.0,
      slideTime: config.slide?.time ?? 60,
    };
  }

  // Track if worklet is loaded (shared across all instances)
  private static workletLoaded = false;

  /**
   * Initialize the AudioWorklet
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Load the worklet module only if not already loaded
      // (AudioWorklet processors can only be registered once per context)
      if (!TB303EngineAccurate.workletLoaded) {
        const baseUrl = import.meta.env.BASE_URL || '/';
        try {
          await this.audioContext.audioWorklet.addModule(`${baseUrl}TB303.worklet.js`);
          TB303EngineAccurate.workletLoaded = true;
        } catch (error) {
          // Check if error is due to already registered processor
          if (error instanceof Error && error.message.includes('already registered')) {
            TB303EngineAccurate.workletLoaded = true;
          } else {
            throw error;
          }
        }
      }

      // Create worklet node
      this.workletNode = new AudioWorkletNode(this.audioContext, 'tb303-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });

      // Pedalboard will be lazy-loaded when first enabled
      // Connect audio chain: TB303 → Output (Pedalboard routing happens when enabled)
      this.workletNode.connect(this.outputGain);
      console.log('[TB303EngineAccurate] Initial routing direct to output (Pedalboard lazy loading)');

      // Send initial parameters
      this.updateAllParameters();

      this.isInitialized = true;
    } catch (error) {
      console.error('[TB303EngineAccurate] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Initialize Pedalboard engine (lazy loading) - DISABLED
   */
  // private async initializePedalboard(): Promise<void> {
  //   if (this.pedalboardInitialized) return;
  //
  //   try {
  //     // Pedalboard removed - using simple overdrive instead
  //     console.log('[TB303EngineAccurate] Pedalboard feature disabled');
  //     this.pedalboardInitialized = true;
  //   } catch (error) {
  //     console.error('[TB303EngineAccurate] Failed to initialize Pedalboard:', error);
  //     throw error;
  //   }
  // }

  /**
   * Send all current parameters to worklet
   */
  private updateAllParameters(): void {
    if (!this.workletNode) return;

    const params = [
      { param: 'waveform', value: this.config.waveform ?? 1.0 },
      { param: 'cutoff', value: this.config.cutoff ?? 800 },
      { param: 'resonance', value: (this.config.resonance ?? 50) / 100.0 },
      { param: 'envMod', value: ((this.config.envMod ?? 50) / 100.0) * 4000 },
      { param: 'normalDecay', value: this.config.normalDecay ?? 200 },
      { param: 'accentDecay', value: this.config.accentDecay ?? 200 },
      { param: 'vegDecay', value: this.config.vegDecay ?? 3000 },
      { param: 'vegSustain', value: (this.config.vegSustain ?? 0) / 100.0 },
      { param: 'slideTime', value: this.config.slideTime ?? 60 },
      { param: 'accent', value: (this.config.accent ?? 50) / 100.0 },
      { param: 'volume', value: (this.config.volume ?? 75) / 100.0 },
      { param: 'oversampling', value: this.config.oversampling ?? 4 },
    ];

    params.forEach(({ param, value }) => {
      this.workletNode!.port.postMessage({
        type: 'setParameter',
        param,
        value,
      });
    });
  }

  /**
   * Set a parameter value
   */
  setParameter(param: string, value: number): void {
    // Update local config
    switch (param) {
      case 'waveform':
        this.config.waveform = value;
        break;
      case 'cutoff':
        this.config.cutoff = value;
        break;
      case 'resonance':
        this.config.resonance = value;
        break;
      case 'envMod':
        this.config.envMod = value;
        break;
      case 'decay':
        this.config.decay = value;
        this.config.normalDecay = value;
        break;
      case 'normalDecay':
        this.config.normalDecay = value;
        break;
      case 'accentDecay':
        this.config.accentDecay = value;
        break;
      case 'accent':
        this.config.accent = value;
        break;
      case 'volume':
        this.config.volume = value;
        break;
      case 'slideTime':
        this.config.slideTime = value;
        break;
      case 'oversampling':
        this.config.oversampling = value;
        break;
    }

    // Send to worklet
    if (this.workletNode) {
      let workletValue = value;

      // Convert percentage parameters to 0-1
      if (['resonance', 'accent', 'volume'].includes(param)) {
        workletValue = value / 100.0;
      }

      // Convert envMod (percentage) to Hz
      if (param === 'envMod') {
        workletValue = (value / 100.0) * 4000;
      }

      this.workletNode.port.postMessage({
        type: 'setParameter',
        param,
        value: workletValue,
      });
    }
  }

  /**
   * Trigger a note
   */
  noteOn(note: number, velocity: number = 100, accent: boolean = false, slide: boolean = false): void {
    if (!this.workletNode) {
      console.warn('[TB303EngineAccurate] Not initialized - call initialize() first');
      return;
    }

    // console.log(`[TB303EngineAccurate] noteOn: note=${note}, velocity=${velocity}, accent=${accent}, slide=${slide}`);

    // this.currentNote = note;
    // this.currentVelocity = velocity;

    this.workletNode.port.postMessage({
      type: 'noteOn',
      note,
      velocity,
      accent,
      slide,
    });
  }

  /**
   * Release note
   */
  noteOff(): void {
    if (!this.workletNode) return;

    this.workletNode.port.postMessage({
      type: 'noteOff',
    });

    // this.currentNote = null;
  }

  // ============================================================================
  // DEVIL FISH METHODS
  // ============================================================================

  /**
   * Enable/disable Devil Fish mod with configuration
   */
  public enableDevilFish(enabled: boolean): void {
    this.setWorkletParameter('devilFishEnabled', enabled ? 1 : 0);
  }

  /**
   * Set MEG (Main Envelope Generator) decay for normal (non-accented) notes
   */
  public setNormalDecay(decayMs: number): void {
    this.config.normalDecay = decayMs;
    this.setWorkletParameter('normalDecay', decayMs);
  }

  /**
   * Set MEG decay for accented notes
   */
  public setAccentDecay(decayMs: number): void {
    this.config.accentDecay = decayMs;
    this.setWorkletParameter('accentDecay', decayMs);
  }

  /**
   * Set VEG (Volume Envelope Generator) decay
   */
  public setVegDecay(decayMs: number): void {
    this.setWorkletParameter('vegDecay', decayMs);
  }

  /**
   * Set VEG sustain level (0-100%)
   */
  public setVegSustain(percent: number): void {
    this.setWorkletParameter('vegSustain', percent / 100.0);
  }

  /**
   * Set attack time for non-accented notes
   */
  public setSoftAttack(timeMs: number): void {
    this.setWorkletParameter('softAttack', timeMs);
  }

  /**
   * Set filter tracking amount (0-200%)
   */
  public setFilterTracking(percent: number): void {
    this.setWorkletParameter('filterTracking', percent / 100.0);
  }

  /**
   * Set Filter FM amount (0-100%)
   */
  public setFilterFM(percent: number): void {
    this.setWorkletParameter('filterFM', percent / 100.0);
  }

  /**
   * Set sweep speed mode (0=fast, 1=normal, 2=slow)
   */
  public setSweepSpeed(mode: 'fast' | 'normal' | 'slow'): void {
    const modeValue = mode === 'fast' ? 0 : mode === 'slow' ? 2 : 1;
    this.setWorkletParameter('sweepSpeed', modeValue);
  }

  /**
   * Set muffler mode (0=off, 1=soft, 2=hard)
   */
  public setMuffler(mode: 'off' | 'soft' | 'hard'): void {
    const modeValue = mode === 'off' ? 0 : mode === 'soft' ? 1 : 2;
    this.setWorkletParameter('muffler', modeValue);
  }

  /**
   * Enable/disable high resonance mode
   */
  public setHighResonance(enabled: boolean): void {
    this.setWorkletParameter('highResonance', enabled ? 1 : 0);
  }

  /**
   * Enable/disable accent sweep circuit
   */
  public setAccentSweepEnabled(enabled: boolean): void {
    this.setWorkletParameter('accentSweepEnabled', enabled ? 1 : 0);
  }

  /**
   * Helper to send parameter to worklet
   */
  private setWorkletParameter(param: string, value: number): void {
    if (this.workletNode) {
      this.workletNode.port.postMessage({
        type: 'setParameter',
        param,
        value,
      });
    }
  }

  // ============================================================================
  // END DEVIL FISH METHODS
  // ============================================================================

  /**
   * Connect to destination
   */
  connect(destination: AudioNode): void {
    this.outputGain.connect(destination);
  }

  /**
   * Disconnect from all destinations
   */
  disconnect(): void {
    this.outputGain.disconnect();
  }

  /**
   * Enable/disable pedalboard (DISABLED - using simple overdrive instead)
   */
  async setPedalboardEnabled(_enabled: boolean): Promise<void> {
    // Pedalboard feature disabled
    console.log('[TB303EngineAccurate] Pedalboard feature disabled');
  }

  /**
   * Update pedalboard configuration (DISABLED - using simple overdrive instead)
   */
  async updatePedalboard(_pedalboardConfig: any): Promise<void> {
    // Pedalboard feature disabled
    console.log('[TB303EngineAccurate] Pedalboard feature disabled');
    return;
  }

  /**
   * Set effect parameter in pedalboard - DISABLED
   */
  setEffectParameter(_effectId: string, _paramId: string, _value: number): void {
    // Pedalboard feature disabled
    console.log('[TB303EngineAccurate] Pedalboard feature disabled');
  }

  /**
   * Enable/disable specific effect in chain - DISABLED
   */
  setEffectEnabled(_effectId: string, _enabled: boolean): void {
    // Pedalboard feature disabled
    console.log('[TB303EngineAccurate] Pedalboard feature disabled');
  }

  /**
   * Get Pedalboard engine (for direct access) - DISABLED
   */
  getPedalboard(): null {
    return null;
  }

  /**
   * Dispose and cleanup
   */
  dispose(): void {
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }

    // Pedalboard removed - no longer needs disposal
    // if (this.pedalboard) {
    //   this.pedalboard.dispose();
    //   this.pedalboard = null;
    // }

    this.outputGain.disconnect();
    this.isInitialized = false;

    console.log('[TB303EngineAccurate] Disposed');
  }

  /**
   * Get output node for connection
   */
  getOutput(): AudioNode {
    return this.outputGain;
  }

  /**
   * Check if initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }
}
