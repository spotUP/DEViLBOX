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

import type { TB303Config, DevilFishConfig } from '@typedefs/instrument';
import { GuitarMLEngine } from './GuitarMLEngine';

export interface TB303AccurateConfig {
  // Basic parameters
  waveform?: number;      // 0=saw, 1=square
  cutoff?: number;        // Hz, 20-20000
  resonance?: number;     // 0-100 (converted to 0-1 internally)
  envMod?: number;        // 0-100 (envelope modulation depth)
  decay?: number;         // ms, 200-2000 (filter envelope decay)
  accent?: number;        // 0-100 (accent amount)
  volume?: number;        // 0-100

  // Advanced parameters (Devil Fish)
  normalDecay?: number;   // ms
  accentDecay?: number;   // ms
  normalAttack?: number;  // ms
  accentAttack?: number;  // ms
  slideTime?: number;     // ms

  // Overdrive (GuitarML)
  overdrive?: {
    enabled?: boolean;
    modelIndex?: number;
    drive?: number;       // 0-100 (gain or condition)
    dryWet?: number;      // 0-100 (mix)
  };
}

export class TB303EngineAccurate {
  private audioContext: AudioContext;
  private workletNode: AudioWorkletNode | null = null;
  private isInitialized: boolean = false;
  private config: TB303AccurateConfig;

  // Overdrive stage (GuitarML neural network)
  private guitarML: GuitarMLEngine | null = null;
  private overdriveEnabled: boolean = false;

  // Output connection point
  private outputGain: GainNode;

  // Current note state
  private currentNote: number | null = null;
  private currentVelocity: number = 100;

  constructor(audioContext: AudioContext, config: TB303Config) {
    this.audioContext = audioContext;
    this.config = this.convertConfig(config);

    // Create output gain
    this.outputGain = audioContext.createGain();
    this.outputGain.gain.value = 1.0;

    // Create GuitarML overdrive
    this.guitarML = new GuitarMLEngine(audioContext);
  }

  /**
   * Convert legacy TB303Config to accurate config
   */
  private convertConfig(config: TB303Config): TB303AccurateConfig {
    return {
      waveform: config.oscillator.type === 'sawtooth' ? 0.0 : 1.0,
      cutoff: config.filter?.cutoff ?? 800,
      resonance: config.filter?.resonance ?? 50,
      envMod: config.filterEnvelope?.envMod ?? 50,
      decay: config.filterEnvelope?.decay ?? 200,
      accent: config.accent?.amount ?? 50,
      volume: 75,

      // Devil Fish parameters
      normalDecay: config.devilFish?.normalDecay ?? 200,
      accentDecay: config.devilFish?.accentDecay ?? 200,
      normalAttack: 3.0,
      accentAttack: 3.0,
      slideTime: config.devilFish?.slideTime ?? 60,
    };
  }

  /**
   * Initialize the AudioWorklet
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Load the worklet module
      await this.audioContext.audioWorklet.addModule('/TB303.worklet.js');

      // Create worklet node
      this.workletNode = new AudioWorkletNode(this.audioContext, 'tb303-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });

      // Initialize GuitarML overdrive
      if (this.guitarML) {
        await this.guitarML.initialize();

        // Load default model if specified
        if (this.config.overdrive?.modelIndex !== undefined) {
          await this.guitarML.loadModel(this.config.overdrive.modelIndex);
        }

        // Set overdrive parameters
        if (this.config.overdrive?.drive !== undefined) {
          this.guitarML.setGain((this.config.overdrive.drive - 50) * 0.36); // Map 0-100 to -18..+18 dB
          this.guitarML.setCondition(this.config.overdrive.drive / 100);
        }
        if (this.config.overdrive?.dryWet !== undefined) {
          this.guitarML.setDryWet(this.config.overdrive.dryWet / 100);
        }
        this.overdriveEnabled = this.config.overdrive?.enabled ?? false;
        this.guitarML.setEnabled(this.overdriveEnabled);
      }

      // Connect audio chain: TB303 → GuitarML → Output
      if (this.overdriveEnabled && this.guitarML) {
        this.workletNode.connect(this.guitarML.getOutput());
        this.guitarML.connect(this.outputGain);
      } else {
        this.workletNode.connect(this.outputGain);
      }

      // Send initial parameters
      this.updateAllParameters();

      this.isInitialized = true;

      console.log('[TB303EngineAccurate] Initialized with Open303 DSP engine + GuitarML overdrive');
    } catch (error) {
      console.error('[TB303EngineAccurate] Failed to initialize:', error);
      throw error;
    }
  }

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
      { param: 'slideTime', value: this.config.slideTime ?? 60 },
      { param: 'accent', value: (this.config.accent ?? 50) / 100.0 },
      { param: 'volume', value: (this.config.volume ?? 75) / 100.0 },
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
      case 'accent':
        this.config.accent = value;
        break;
      case 'volume':
        this.config.volume = value;
        break;
      case 'slideTime':
        this.config.slideTime = value;
        break;
    }

    // Send to worklet
    if (this.workletNode) {
      let workletValue = value;

      // Convert percentage parameters to 0-1
      if (['resonance', 'envMod', 'accent', 'volume'].includes(param)) {
        workletValue = value / 100.0;
      }

      // Convert envMod to Hz
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

    this.currentNote = note;
    this.currentVelocity = velocity;

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

    this.currentNote = null;
  }

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
   * Enable/disable overdrive
   */
  setOverdriveEnabled(enabled: boolean): void {
    this.overdriveEnabled = enabled;

    if (this.guitarML) {
      this.guitarML.setEnabled(enabled);
    }

    // Reconnect audio chain
    if (this.workletNode) {
      this.workletNode.disconnect();

      if (this.overdriveEnabled && this.guitarML) {
        this.workletNode.connect(this.guitarML.getOutput());
        if (!this.guitarML.getOutput().numberOfOutputs) {
          this.guitarML.connect(this.outputGain);
        }
      } else {
        this.workletNode.connect(this.outputGain);
      }
    }
  }

  /**
   * Load overdrive model
   */
  async loadOverdriveModel(modelIndex: number): Promise<void> {
    if (this.guitarML) {
      await this.guitarML.loadModel(modelIndex);
    }
  }

  /**
   * Set overdrive drive amount
   */
  setOverdriveDrive(drive: number): void {
    if (this.guitarML) {
      // Map 0-100 to -18..+18 dB for gain
      this.guitarML.setGain((drive - 50) * 0.36);
      // Also set condition for conditioned models
      this.guitarML.setCondition(drive / 100);
    }
  }

  /**
   * Set overdrive dry/wet mix
   */
  setOverdriveMix(mix: number): void {
    if (this.guitarML) {
      this.guitarML.setDryWet(mix / 100);
    }
  }

  /**
   * Get GuitarML engine (for direct access)
   */
  getGuitarML(): GuitarMLEngine | null {
    return this.guitarML;
  }

  /**
   * Dispose and cleanup
   */
  dispose(): void {
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }

    if (this.guitarML) {
      this.guitarML.dispose();
      this.guitarML = null;
    }

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
