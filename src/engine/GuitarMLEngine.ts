/**
 * GuitarMLEngine - Neural Network Amp/Pedal Simulation
 *
 * TypeScript wrapper for the GuitarML AudioWorklet processor.
 * Provides neural network-based guitar amp and pedal modeling using LSTM models.
 *
 * Based on the GuitarML project and BYOD plugin integration.
 *
 * Features:
 * - 37 built-in models (pedals, amps, bass amps)
 * - Real-time LSTM inference
 * - Support for conditioned (with knob) and non-conditioned models
 * - Sample rate correction for different training sample rates
 * - DC blocking and filtering
 */

export interface GuitarMLModel {
  name: string;
  fileName: string;
  type: 'pedal' | 'amp' | 'bass';
  description?: string;
}

export class GuitarMLEngine {
  private audioContext: AudioContext;
  private workletNode: AudioWorkletNode | null = null;
  private isInitialized: boolean = false;
  private currentModel: GuitarMLModel | null = null;

  // Output connection
  private outputGain: GainNode;

  // Available models
  public static readonly BUILT_IN_MODELS: GuitarMLModel[] = [
    { name: 'Ibanez TS9', fileName: 'TS9_DriveKnob.json', type: 'pedal' },
    { name: 'Ibanez Mostortion Clone', fileName: 'Ibanez_Mostortion_Clone_GainKnob.json', type: 'pedal' },
    { name: 'Mooer CaliMkIV', fileName: 'Mooer_CaliMkIV_GainKnob.json', type: 'pedal' },
    { name: 'Boss MT2', fileName: 'BossMT2_PedalHighGain.json', type: 'pedal' },
    { name: 'Pro Co RAT Distortion', fileName: 'ProcoRatPedal_HighGain.json', type: 'pedal' },
    { name: 'MXR 78', fileName: 'MXR78_pedal_DistKnob.json', type: 'pedal' },
    { name: 'Ibanez TS808', fileName: 'Ibanez808TubeScreamer.json', type: 'pedal' },
    { name: 'RevvG3 Pedal', fileName: 'RevvG3_Pedal_GainKnob.json', type: 'pedal' },
    { name: 'Jeckyl and Hyde Distortion', fileName: 'Jeckyl_and_Hyde_Distortion_DriveKnob.json', type: 'pedal' },
    { name: 'Friedman BEOD Pedal', fileName: 'Friedman_BEOD_Pedal_GainKnob.json', type: 'pedal' },
    { name: 'Blackstar HT40 Clean', fileName: 'BlackstarHT40_AmpClean.json', type: 'amp' },
    { name: 'Mesa Mini Rec High Gain', fileName: 'MesaMiniRec_HighGain_DirectOut.json', type: 'amp' },
    { name: 'Splawn OD High Gain', fileName: 'Splawn_OD_FractalFM3_HighGain.json', type: 'amp' },
    { name: 'Ethos Lead Channel', fileName: 'EthosLeadChan_GainKnob.json', type: 'amp' },
    { name: 'Princeton Amp Clean', fileName: 'PrincetonAmp_Clean.json', type: 'amp' },
    { name: 'Dumble Kit High Gain', fileName: 'DumbleKit_HighG_DirectOut.json', type: 'amp' },
    { name: 'Blackstar HT40 Gain', fileName: 'BlackstarHT40_GainKnob_SM57mic.json', type: 'amp' },
    { name: 'T-Rex Mudhoney + Pork Loin', fileName: 'TRexMudhoney_plus_PorkLoin_HighGain.json', type: 'pedal' },
    { name: 'Prince Of Tone OD', fileName: 'PrinceOfToneClone_OD_Knob.json', type: 'pedal' },
    { name: 'Pork Loin Pedal', fileName: 'PorkLoinPedal_LowGain.json', type: 'pedal' },
    { name: 'Prince Of Tone Dist', fileName: 'PrinceOfToneClone_Dist_Knob.json', type: 'pedal' },
    { name: 'Aguilar Agro Bright Bass', fileName: 'AguilarAgro_Bright_Bass.json', type: 'bass' },
    { name: 'Aguilar Agro Dark Bass', fileName: 'AguilarAgro_Dark_Bass.json', type: 'bass' },
    { name: 'BadCat50 Med Gain', fileName: 'BadCat50_MedGain_PREAMP.json', type: 'amp' },
    { name: 'ShiftTwin Clean2', fileName: 'ShiftTwin_Clean2_PREAMP.json', type: 'amp' },
    { name: 'Sovtek50 Med Gain', fileName: 'Sovtek50_MedGain_DIRECT.json', type: 'amp' },
    { name: 'ShiftTwin StampedeDT', fileName: 'ShiftTwin_StampedeDT_PREAMP.json', type: 'amp' },
    { name: 'Sovtek50 Dod FX56B', fileName: 'Sovtek50_DodFX56B_DIRECT.json', type: 'amp' },
    { name: 'ENGL E645 Clean', fileName: 'ENGL_E645_Clean_EdoardoNapoli.json', type: 'amp' },
    { name: 'Filmosound with Cab', fileName: 'Filmosound_with_cab.json', type: 'amp' },
    { name: 'ENGL E430 Clean', fileName: 'ENGL_E430_Clean_EdoardoNapoli.json', type: 'amp' },
    { name: 'El Coyote Trainwreck', fileName: 'ElCoyote_Trainwreck_Crunch.json', type: 'amp' },
    { name: 'Supro Bold Drive', fileName: 'Supro_Bold_DriveKnob.json', type: 'amp' },
    { name: 'Goat Pedal High Gain', fileName: 'GoatPedal_HighGain.json', type: 'pedal' },
    { name: 'Protein Blue Pedal', fileName: 'ProteinBlue_pedal_DriveKnob.json', type: 'pedal' },
    { name: 'Little Big Muff', fileName: 'LittleBigMuff_HighGainPedal.json', type: 'pedal' },
    { name: 'Big Muff V6', fileName: 'BigMuff_V6_T3_S5.json', type: 'pedal' },
  ];

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;

    // Create output gain
    this.outputGain = audioContext.createGain();
    this.outputGain.gain.value = 1.0;
  }

  /**
   * Initialize the AudioWorklet
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Load the worklet module (use BASE_URL for proper path in dev/prod)
      const baseUrl = import.meta.env.BASE_URL || '/';
      await this.audioContext.audioWorklet.addModule(`${baseUrl}GuitarML.worklet.js`);

      // Create worklet node
      this.workletNode = new AudioWorkletNode(this.audioContext, 'guitarml-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });

      // Connect to output
      this.workletNode.connect(this.outputGain);

      // Listen for worklet messages
      this.workletNode.port.onmessage = (e) => this.handleWorkletMessage(e.data);

      this.isInitialized = true;

      console.log('[GuitarMLEngine] Initialized');
    } catch (error) {
      console.error('[GuitarMLEngine] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Handle messages from worklet
   */
  private handleWorkletMessage(data: any): void {
    switch (data.type) {
      case 'modelLoaded':
        if (data.success) {
          console.log('[GuitarMLEngine] Model loaded successfully');
        } else {
          console.error('[GuitarMLEngine] Model load failed:', data.error);
        }
        break;
    }
  }

  /**
   * Load a model by index
   */
  async loadModel(modelIndex: number): Promise<void> {
    if (!this.isInitialized || !this.workletNode) {
      throw new Error('GuitarMLEngine not initialized');
    }

    if (modelIndex < 0 || modelIndex >= GuitarMLEngine.BUILT_IN_MODELS.length) {
      throw new Error(`Invalid model index: ${modelIndex}`);
    }

    const model = GuitarMLEngine.BUILT_IN_MODELS[modelIndex];

    try {
      // Fetch model JSON
      const baseUrl = import.meta.env.BASE_URL || '/';
      const response = await fetch(`${baseUrl}models/guitarml/${model.fileName}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch model: ${response.statusText}`);
      }

      const modelData = await response.json();

      // Send to worklet
      this.workletNode.port.postMessage({
        type: 'loadModel',
        modelData,
      });

      this.currentModel = model;

      console.log(`[GuitarMLEngine] Loading model: ${model.name}`);
    } catch (error) {
      console.error('[GuitarMLEngine] Model load error:', error);
      throw error;
    }
  }

  /**
   * Load a custom model from URL
   */
  async loadModelFromURL(url: string, modelName: string): Promise<void> {
    if (!this.isInitialized || !this.workletNode) {
      throw new Error('GuitarMLEngine not initialized');
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch model: ${response.statusText}`);
      }

      const modelData = await response.json();

      this.workletNode.port.postMessage({
        type: 'loadModel',
        modelData,
      });

      this.currentModel = {
        name: modelName,
        fileName: url,
        type: 'pedal',
      };

      console.log(`[GuitarMLEngine] Loading custom model: ${modelName}`);
    } catch (error) {
      console.error('[GuitarMLEngine] Custom model load error:', error);
      throw error;
    }
  }

  /**
   * Set parameter value
   */
  setParameter(param: string, value: number): void {
    if (!this.workletNode) return;

    this.workletNode.port.postMessage({
      type: 'setParameter',
      param,
      value,
    });
  }

  /**
   * Set gain (for non-conditioned models)
   * @param gain - Gain in dB (-18 to +18)
   */
  setGain(gain: number): void {
    this.setParameter('gain', gain);
  }

  /**
   * Set condition (for conditioned models)
   * @param condition - Condition value (0-1)
   */
  setCondition(condition: number): void {
    this.setParameter('condition', condition);
  }

  /**
   * Set dry/wet mix
   * @param dryWet - Mix amount (0=dry, 1=wet)
   */
  setDryWet(dryWet: number): void {
    this.setParameter('dryWet', dryWet);
  }

  /**
   * Enable/disable processing
   */
  setEnabled(enabled: boolean): void {
    this.setParameter('enabled', enabled ? 1 : 0);
  }

  /**
   * Enable/disable sample rate correction filter
   */
  setUseSRCFilter(enabled: boolean): void {
    this.setParameter('useSRCFilter', enabled ? 1 : 0);
  }

  /**
   * Reset LSTM state
   */
  reset(): void {
    if (!this.workletNode) return;

    this.workletNode.port.postMessage({
      type: 'reset',
    });
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
   * Get input node (worklet node accepts input)
   */
  getInput(): AudioNode {
    if (!this.workletNode) {
      throw new Error('GuitarML not initialized - call initialize() first');
    }
    return this.workletNode;
  }

  /**
   * Get output node
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

  /**
   * Get current model
   */
  getCurrentModel(): GuitarMLModel | null {
    return this.currentModel;
  }

  /**
   * Dispose and cleanup
   */
  dispose(): void {
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }

    this.outputGain.disconnect();
    this.isInitialized = false;
  }
}
