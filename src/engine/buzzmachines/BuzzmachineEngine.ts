/**
 * BuzzmachineEngine - Singleton manager for buzzmachine WASM modules
 *
 * Handles loading WASM buzzmachines (Arguru Distortion, Elak SVF, etc.)
 * and routing audio through AudioWorklet.
 *
 * Similar architecture to FurnaceChipEngine.ts
 */

import { getNativeContext } from '@utils/audio-context';

export const BuzzmachineType = {
  // Distortion/Saturation
  ARGURU_DISTORTION: 'ArguruDistortion',
  ELAK_DIST2: 'ElakDist2',
  JESKOLA_DISTORTION: 'JeskolaDistortion',
  GEONIK_OVERDRIVE: 'GeonikOverdrive',
  GRAUE_SOFTSAT: 'GraueSoftSat',
  WHITENOISE_STEREODIST: 'WhiteNoiseStereoDist',

  // Filters
  ELAK_SVF: 'ElakSVF',
  CYANPHASE_NOTCH: 'CyanPhaseNotch',
  Q_ZFILTER: 'QZfilter',
  FSM_PHILTA: 'FSMPhilta',

  // Delay/Reverb
  JESKOLA_DELAY: 'JeskolaDelay',
  JESKOLA_CROSSDELAY: 'JeskolaCrossDelay',
  JESKOLA_FREEVERB: 'JeskolaFreeverb',
  FSM_PANZERDELAY: 'FSMPanzerDelay',

  // Chorus/Modulation
  FSM_CHORUS: 'FSMChorus',
  FSM_CHORUS2: 'FSMChorus2',
  WHITENOISE_WHITECHORUS: 'WhiteNoiseWhiteChorus',
  BIGYO_FREQUENCYSHIFTER: 'BigyoFrequencyShifter',

  // Dynamics
  GEONIK_COMPRESSOR: 'GeonikCompressor',
  LD_SLIMIT: 'LdSLimit',
  OOMEK_EXCITER: 'OomekExciter',
  OOMEK_MASTERIZER: 'OomekMasterizer',
  DEDACODE_STEREOGAIN: 'DedaCodeStereoGain',

  // Generators
  FSM_KICK: 'FSMKick',
  FSM_KICKXP: 'FSMKickXP',
  JESKOLA_TRILOK: 'JeskolaTrilok',
  JESKOLA_NOISE: 'JeskolaNoise',
  OOMEK_AGGRESSOR: 'OomekAggressor',
  OOMEK_AGGRESSOR_DF: 'OomekAggressorDF', // Devil Fish enhanced 303
  MADBRAIN_4FM2F: 'MadBrain4FM2F',
  MADBRAIN_DYNAMITE6: 'MadBrainDynamite6',
  MAKK_M3: 'MakkM3',
  MAKK_M4: 'MakkM4',
  CYANPHASE_DTMF: 'CyanPhaseDTMF',
  ELENZIL_FREQUENCYBOMB: 'ElenzilFrequencyBomb',
} as const;

export type BuzzmachineType = typeof BuzzmachineType[keyof typeof BuzzmachineType];

export interface BuzzmachineParameter {
  index: number;
  name: string;
  description: string;
  minValue: number;
  maxValue: number;
  defaultValue: number;
  type: 'byte' | 'word'; // pt_byte or pt_word
}

export interface BuzzmachineInfo {
  name: string;
  shortName: string;
  author: string;
  type: 'effect' | 'generator' | 'master';
  parameters: BuzzmachineParameter[];
}

// Machine metadata (parsed from compiled WASM)
export const BUZZMACHINE_INFO: Record<BuzzmachineType, BuzzmachineInfo> = {
  [BuzzmachineType.ARGURU_DISTORTION]: {
    name: 'Arguru Distortion',
    shortName: 'Distortion',
    author: 'Arguru',
    type: 'effect',
    parameters: [
      {
        index: 0,
        name: 'Input Gain',
        description: 'Input Gain',
        minValue: 0x0001,
        maxValue: 0x0800,
        defaultValue: 0x0100,
        type: 'word',
      },
      {
        index: 1,
        name: 'Threshold (-)',
        description: 'Threshold level (negative)',
        minValue: 0x0001,
        maxValue: 0x8000,
        defaultValue: 0x200,
        type: 'word',
      },
      {
        index: 2,
        name: 'Threshold (+)',
        description: 'Threshold level (positive)',
        minValue: 0x0001,
        maxValue: 0x8000,
        defaultValue: 0x200,
        type: 'word',
      },
      {
        index: 3,
        name: 'Output Gain',
        description: 'Output Gain',
        minValue: 0x0001,
        maxValue: 0x0800,
        defaultValue: 0x0400,
        type: 'word',
      },
      {
        index: 4,
        name: 'Phase Inversor',
        description: 'Stereo phase inversor',
        minValue: 0x00,
        maxValue: 0x01,
        defaultValue: 0x00,
        type: 'byte',
      },
      {
        index: 5,
        name: 'Mode',
        description: 'Operational mode (0=Clip, 1=Saturate)',
        minValue: 0x00,
        maxValue: 0x01,
        defaultValue: 0x00,
        type: 'byte',
      },
    ],
  },
  [BuzzmachineType.ELAK_SVF]: {
    name: 'Elak SVF Filter',
    shortName: 'SVF',
    author: 'Elak',
    type: 'effect',
    parameters: [
      {
        index: 0,
        name: 'Cutoff',
        description: 'Cut-off frequency',
        minValue: 0,
        maxValue: 1000,
        defaultValue: 0x200,
        type: 'word',
      },
      {
        index: 1,
        name: 'Resonance',
        description: 'Resonance',
        minValue: 0,
        maxValue: 0xFFFE,
        defaultValue: 0x200,
        type: 'word',
      },
    ],
  },
  [BuzzmachineType.FSM_KICK]: {
    name: 'FSM Kick',
    shortName: 'Kick',
    author: 'FSM',
    type: 'generator',
    parameters: [],
  },
  [BuzzmachineType.FSM_KICKXP]: {
    name: 'FSM KickXP',
    shortName: 'KickXP',
    author: 'FSM',
    type: 'generator',
    parameters: [],
  },
  [BuzzmachineType.JESKOLA_TRILOK]: {
    name: 'Jeskola Trilok',
    shortName: 'Trilok',
    author: 'Jeskola',
    type: 'generator',
    parameters: [],
  },
  [BuzzmachineType.JESKOLA_NOISE]: {
    name: 'Jeskola Noise',
    shortName: 'Noise',
    author: 'Jeskola',
    type: 'generator',
    parameters: [],
  },
  [BuzzmachineType.OOMEK_AGGRESSOR]: {
    name: 'Oomek Aggressor',
    shortName: 'Aggressor',
    author: 'Oomek',
    type: 'generator',
    parameters: [
      // Global parameters (TB-303 style controls)
      {
        index: 0,
        name: 'Osc Type',
        description: 'Oscillator type (0 = Saw, 1 = Square)',
        minValue: 0,
        maxValue: 1,
        defaultValue: 0,
        type: 'byte',
      },
      {
        index: 1,
        name: 'Cutoff',
        description: 'Filter cutoff frequency',
        minValue: 0x00,
        maxValue: 0xF0,
        defaultValue: 0x78,
        type: 'byte',
      },
      {
        index: 2,
        name: 'Resonance',
        description: 'Filter resonance',
        minValue: 0x00,
        maxValue: 0x80,
        defaultValue: 0x40,
        type: 'byte',
      },
      {
        index: 3,
        name: 'Env Mod',
        description: 'Envelope modulation depth',
        minValue: 0x00,
        maxValue: 0x80,
        defaultValue: 0x40,
        type: 'byte',
      },
      {
        index: 4,
        name: 'Decay',
        description: 'Envelope decay time',
        minValue: 0x00,
        maxValue: 0x80,
        defaultValue: 0x40,
        type: 'byte',
      },
      {
        index: 5,
        name: 'Accent Level',
        description: 'Accent level boost',
        minValue: 0x00,
        maxValue: 0x80,
        defaultValue: 0x40,
        type: 'byte',
      },
      {
        index: 6,
        name: 'Finetune',
        description: 'Fine tuning in cents (-100 to +100)',
        minValue: 0x00,
        maxValue: 0xC8,
        defaultValue: 0x64, // 100 = center (0 cents)
        type: 'byte',
      },
      {
        index: 7,
        name: 'Volume',
        description: 'Output volume',
        minValue: 0x00,
        maxValue: 0xC8,
        defaultValue: 0x64, // 100%
        type: 'byte',
      },
    ],
  },
  [BuzzmachineType.OOMEK_AGGRESSOR_DF]: {
    name: 'Oomek Aggressor Devil Fish',
    shortName: 'AggressorDF',
    author: 'Oomek + Devil Fish Mods',
    type: 'generator',
    parameters: [
      // Original global parameters (0-7)
      {
        index: 0,
        name: 'Osc Type',
        description: 'Oscillator type (0 = Saw, 1 = Square)',
        minValue: 0,
        maxValue: 1,
        defaultValue: 0,
        type: 'byte',
      },
      {
        index: 1,
        name: 'Cutoff',
        description: 'Filter cutoff frequency',
        minValue: 0x00,
        maxValue: 0xF0,
        defaultValue: 0x78,
        type: 'byte',
      },
      {
        index: 2,
        name: 'Resonance',
        description: 'Filter resonance',
        minValue: 0x00,
        maxValue: 0x80,
        defaultValue: 0x40,
        type: 'byte',
      },
      {
        index: 3,
        name: 'Env Mod',
        description: 'Envelope modulation depth',
        minValue: 0x00,
        maxValue: 0x80,
        defaultValue: 0x40,
        type: 'byte',
      },
      {
        index: 4,
        name: 'Decay',
        description: 'Normal envelope decay time',
        minValue: 0x00,
        maxValue: 0x80,
        defaultValue: 0x40,
        type: 'byte',
      },
      {
        index: 5,
        name: 'Accent Level',
        description: 'Accent level boost',
        minValue: 0x00,
        maxValue: 0x80,
        defaultValue: 0x40,
        type: 'byte',
      },
      {
        index: 6,
        name: 'Finetune',
        description: 'Fine tuning in cents (-100 to +100)',
        minValue: 0x00,
        maxValue: 0xC8,
        defaultValue: 0x64, // 100 = center (0 cents)
        type: 'byte',
      },
      {
        index: 7,
        name: 'Volume',
        description: 'Output volume',
        minValue: 0x00,
        maxValue: 0xC8,
        defaultValue: 0x64, // 100%
        type: 'byte',
      },
      // Devil Fish parameters (8-16)
      {
        index: 8,
        name: 'Accent Decay',
        description: 'Accent envelope decay time (Devil Fish)',
        minValue: 0x00,
        maxValue: 0x80,
        defaultValue: 0x40,
        type: 'byte',
      },
      {
        index: 9,
        name: 'VEG Decay',
        description: 'Volume envelope decay (Devil Fish)',
        minValue: 0x00,
        maxValue: 0x80,
        defaultValue: 0x60,
        type: 'byte',
      },
      {
        index: 10,
        name: 'VEG Sustain',
        description: 'Volume envelope sustain 0-100% (Devil Fish)',
        minValue: 0x00,
        maxValue: 0x64,
        defaultValue: 0x00,
        type: 'byte',
      },
      {
        index: 11,
        name: 'Soft Attack',
        description: 'Soft attack time 0.3-30ms (Devil Fish)',
        minValue: 0x00,
        maxValue: 0x64,
        defaultValue: 0x00,
        type: 'byte',
      },
      {
        index: 12,
        name: 'Filter Tracking',
        description: 'Filter tracking 0-200% (Devil Fish)',
        minValue: 0x00,
        maxValue: 0xC8,
        defaultValue: 0x00,
        type: 'byte',
      },
      {
        index: 13,
        name: 'High Resonance',
        description: 'High resonance mode - self oscillation (Devil Fish)',
        minValue: 0,
        maxValue: 1,
        defaultValue: 0,
        type: 'byte',
      },
      {
        index: 14,
        name: 'Slide Time',
        description: 'Slide/glide time 10-500ms (Devil Fish)',
        minValue: 0x00,
        maxValue: 0x64,
        defaultValue: 0x1E, // ~60ms (original 303)
        type: 'byte',
      },
      {
        index: 15,
        name: 'Muffler',
        description: 'Output soft clipping 0=off, 1=soft, 2=hard (Devil Fish)',
        minValue: 0x00,
        maxValue: 0x02,
        defaultValue: 0x00,
        type: 'byte',
      },
      {
        index: 16,
        name: 'Sweep Speed',
        description: 'Accent sweep speed 0=fast, 1=normal, 2=slow (Devil Fish)',
        minValue: 0x00,
        maxValue: 0x02,
        defaultValue: 0x01,
        type: 'byte',
      },
    ],
  },
  [BuzzmachineType.MADBRAIN_4FM2F]: {
    name: 'MadBrain 4FM2F',
    shortName: '4FM2F',
    author: 'MadBrain',
    type: 'generator',
    parameters: [],
  },
  [BuzzmachineType.MADBRAIN_DYNAMITE6]: {
    name: 'MadBrain Dynamite6',
    shortName: 'Dynamite6',
    author: 'MadBrain',
    type: 'generator',
    parameters: [],
  },
  [BuzzmachineType.MAKK_M3]: {
    name: 'Makk M3',
    shortName: 'M3',
    author: 'Makk',
    type: 'generator',
    parameters: [],
  },
  [BuzzmachineType.MAKK_M4]: {
    name: 'Makk M4',
    shortName: 'M4',
    author: 'Makk',
    type: 'generator',
    parameters: [],
  },
  // New distortion/saturation effects
  [BuzzmachineType.ELAK_DIST2]: {
    name: 'Elak Dist2',
    shortName: 'Dist2',
    author: 'Elak',
    type: 'effect',
    parameters: [],
  },
  [BuzzmachineType.JESKOLA_DISTORTION]: {
    name: 'Jeskola Distortion',
    shortName: 'JDist',
    author: 'Jeskola',
    type: 'effect',
    parameters: [],
  },
  [BuzzmachineType.GEONIK_OVERDRIVE]: {
    name: 'Geonik Overdrive',
    shortName: 'Overdrive',
    author: 'Geonik',
    type: 'effect',
    parameters: [],
  },
  [BuzzmachineType.GRAUE_SOFTSAT]: {
    name: 'Graue SoftSat',
    shortName: 'SoftSat',
    author: 'Graue',
    type: 'effect',
    parameters: [],
  },
  [BuzzmachineType.WHITENOISE_STEREODIST]: {
    name: 'WhiteNoise StereoDist',
    shortName: 'StereoDist',
    author: 'WhiteNoise',
    type: 'effect',
    parameters: [],
  },
  // Filters
  [BuzzmachineType.CYANPHASE_NOTCH]: {
    name: 'CyanPhase Notch',
    shortName: 'Notch',
    author: 'CyanPhase',
    type: 'effect',
    parameters: [],
  },
  [BuzzmachineType.Q_ZFILTER]: {
    name: 'Q Zfilter',
    shortName: 'Zfilter',
    author: 'Q',
    type: 'effect',
    parameters: [],
  },
  [BuzzmachineType.FSM_PHILTA]: {
    name: 'FSM Philta',
    shortName: 'Philta',
    author: 'FSM',
    type: 'effect',
    parameters: [],
  },
  // Delay/Reverb
  [BuzzmachineType.JESKOLA_DELAY]: {
    name: 'Jeskola Delay',
    shortName: 'JDelay',
    author: 'Jeskola',
    type: 'effect',
    parameters: [],
  },
  [BuzzmachineType.JESKOLA_CROSSDELAY]: {
    name: 'Jeskola CrossDelay',
    shortName: 'CrossDelay',
    author: 'Jeskola',
    type: 'effect',
    parameters: [],
  },
  [BuzzmachineType.JESKOLA_FREEVERB]: {
    name: 'Jeskola Freeverb',
    shortName: 'Freeverb',
    author: 'Jeskola',
    type: 'effect',
    parameters: [],
  },
  [BuzzmachineType.FSM_PANZERDELAY]: {
    name: 'FSM PanzerDelay',
    shortName: 'PanzerDelay',
    author: 'FSM',
    type: 'effect',
    parameters: [],
  },
  // Chorus/Modulation
  [BuzzmachineType.FSM_CHORUS]: {
    name: 'FSM Chorus',
    shortName: 'Chorus',
    author: 'FSM',
    type: 'effect',
    parameters: [],
  },
  [BuzzmachineType.FSM_CHORUS2]: {
    name: 'FSM Chorus2',
    shortName: 'Chorus2',
    author: 'FSM',
    type: 'effect',
    parameters: [],
  },
  [BuzzmachineType.WHITENOISE_WHITECHORUS]: {
    name: 'WhiteNoise WhiteChorus',
    shortName: 'WhiteChorus',
    author: 'WhiteNoise',
    type: 'effect',
    parameters: [],
  },
  [BuzzmachineType.BIGYO_FREQUENCYSHIFTER]: {
    name: 'Bigyo FrequencyShifter',
    shortName: 'FreqShift',
    author: 'Bigyo',
    type: 'effect',
    parameters: [],
  },
  // Dynamics
  [BuzzmachineType.GEONIK_COMPRESSOR]: {
    name: 'Geonik Compressor',
    shortName: 'Compressor',
    author: 'Geonik',
    type: 'effect',
    parameters: [],
  },
  [BuzzmachineType.LD_SLIMIT]: {
    name: 'Ld SLimit',
    shortName: 'SLimit',
    author: 'Ld',
    type: 'effect',
    parameters: [],
  },
  [BuzzmachineType.OOMEK_EXCITER]: {
    name: 'Oomek Exciter',
    shortName: 'Exciter',
    author: 'Oomek',
    type: 'effect',
    parameters: [],
  },
  [BuzzmachineType.OOMEK_MASTERIZER]: {
    name: 'Oomek Masterizer',
    shortName: 'Masterizer',
    author: 'Oomek',
    type: 'master',
    parameters: [],
  },
  [BuzzmachineType.DEDACODE_STEREOGAIN]: {
    name: 'DedaCode StereoGain',
    shortName: 'StereoGain',
    author: 'DedaCode',
    type: 'effect',
    parameters: [],
  },
  // Additional generators
  [BuzzmachineType.CYANPHASE_DTMF]: {
    name: 'CyanPhase DTMF',
    shortName: 'DTMF',
    author: 'CyanPhase',
    type: 'generator',
    parameters: [],
  },
  [BuzzmachineType.ELENZIL_FREQUENCYBOMB]: {
    name: 'Elenzil FrequencyBomb',
    shortName: 'FreqBomb',
    author: 'Elenzil',
    type: 'generator',
    parameters: [],
  },
};

/**
 * Singleton engine for managing buzzmachine WASM modules
 */
export class BuzzmachineEngine {
  private static instance: BuzzmachineEngine | null = null;

  private isLoaded = false;
  private initPromise: Promise<void> | null = null;
  public workletNode: AudioWorkletNode | null = null;
  public nativeContext: AudioContext | null = null;

  private constructor() {}

  public static getInstance(): BuzzmachineEngine {
    if (!BuzzmachineEngine.instance) {
      BuzzmachineEngine.instance = new BuzzmachineEngine();
    }
    return BuzzmachineEngine.instance;
  }

  /**
   * Initialize the buzzmachine engine with an AudioContext
   */
  public async init(context: AudioContext): Promise<void> {
    if (this.isLoaded) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.doInit(context);
    return this.initPromise;
  }

  private async doInit(context: AudioContext): Promise<void> {
    try {
      // Extract native context from Tone.js wrapper
      // Try direct property access first (matches Open303Synth pattern),
      // then fall back to BFS search via getNativeContext
      const ctx = context as any;
      const nativeCtx = ctx.rawContext || ctx._context || getNativeContext(context);
      this.nativeContext = nativeCtx;

      // Check if we got a valid context with AudioWorklet
      if (!nativeCtx || !nativeCtx.audioWorklet) {
        console.warn('[BuzzmachineEngine] No AudioWorklet on context, type:', typeof nativeCtx,
          'rawContext:', typeof ctx.rawContext, '_context:', typeof ctx._context);
        this.initPromise = null; // Allow retry
        return;
      }

      // Ensure context is running - try to resume, then wait up to 5s
      if (nativeCtx.state !== 'running') {
        console.log('[BuzzmachineEngine] AudioContext state:', nativeCtx.state, '- attempting resume');
        try {
          await nativeCtx.resume();
        } catch {
          // Ignore resume errors
        }
        if (nativeCtx.state !== 'running') {
          console.log('[BuzzmachineEngine] Waiting up to 5s for AudioContext to start...');
          const started = await Promise.race([
            new Promise<boolean>((resolve) => {
              const check = () => {
                if (nativeCtx.state === 'running') resolve(true);
                else setTimeout(check, 100);
              };
              setTimeout(check, 100);
            }),
            new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5000))
          ]);
          if (!started) {
            console.warn('[BuzzmachineEngine] AudioContext not running after 5s wait');
            this.initPromise = null; // Allow retry
            return;
          }
          console.log('[BuzzmachineEngine] AudioContext became running');
        }
      }

      // Register AudioWorklet module (use BASE_URL for GitHub Pages compatibility)
      const baseUrl = import.meta.env.BASE_URL || '/';
      const cacheBuster = `?v=${Date.now()}`;
      await nativeCtx.audioWorklet.addModule(`${baseUrl}Buzzmachine.worklet.js${cacheBuster}`);
      console.log('[BuzzmachineEngine] AudioWorklet registered');

      this.isLoaded = true;
    } catch (err) {
      console.error('[BuzzmachineEngine] Init failed:', err);
      this.initPromise = null; // Allow retry on failure
      throw err;
    }
  }

  /**
   * Check if engine is initialized
   */
  public isInitialized(): boolean {
    return this.isLoaded;
  }

  /**
   * Create an AudioWorkletNode for a specific buzzmachine type
   */
  public async createMachineNode(
    context: AudioContext,
    machineType: BuzzmachineType
  ): Promise<AudioWorkletNode> {
    if (!this.isLoaded) {
      await this.init(context);
    }

    // Use native AudioWorkletNode directly (addModule was called on the native context)
    const ctx = context as any;
    const nativeCtx = ctx.rawContext || ctx._context || getNativeContext(context);
    const workletNode = new AudioWorkletNode(nativeCtx, 'buzzmachine-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

    // Load WASM module into worklet
    await this.loadMachineWasm(workletNode, machineType);

    return workletNode;
  }

  /**
   * Load WASM module for a specific machine type
   */
  private async loadMachineWasm(
    workletNode: AudioWorkletNode,
    machineType: BuzzmachineType
  ): Promise<void> {
    const machineFile = this.getMachineFilename(machineType);

    // Fetch JS and WASM files (use BASE_URL for GitHub Pages compatibility)
    const baseUrl = import.meta.env.BASE_URL || '/';
    const [jsResponse, wasmResponse] = await Promise.all([
      fetch(`${baseUrl}buzzmachines/${machineFile}.js`),
      fetch(`${baseUrl}buzzmachines/${machineFile}.wasm`),
    ]);

    if (!jsResponse.ok || !wasmResponse.ok) {
      throw new Error(`Failed to load buzzmachine: ${machineType}`);
    }

    const jsCode = await jsResponse.text();
    const wasmBinary = await wasmResponse.arrayBuffer();

    // Send to worklet
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Buzzmachine init timeout'));
      }, 5000);

      workletNode.port.onmessage = (event) => {
        if (event.data.type === 'initialized') {
          clearTimeout(timeout);
          console.log(`[BuzzmachineEngine] ${machineType} initialized`);
          resolve();
        } else if (event.data.type === 'error') {
          clearTimeout(timeout);
          reject(new Error(event.data.error));
        }
      };

      workletNode.port.postMessage({
        type: 'init',
        wasmBinary,
        jsCode,
        machineType,
      });
    });
  }

  /**
   * Get filename for a machine type
   */
  private getMachineFilename(machineType: BuzzmachineType): string {
    const filenameMap: Record<BuzzmachineType, string> = {
      // Distortion/Saturation
      [BuzzmachineType.ARGURU_DISTORTION]: 'Arguru_Distortion',
      [BuzzmachineType.ELAK_DIST2]: 'Elak_Dist2',
      [BuzzmachineType.JESKOLA_DISTORTION]: 'Jeskola_Distortion',
      [BuzzmachineType.GEONIK_OVERDRIVE]: 'Geonik_Overdrive',
      [BuzzmachineType.GRAUE_SOFTSAT]: 'Graue_SoftSat',
      [BuzzmachineType.WHITENOISE_STEREODIST]: 'WhiteNoise_StereoDist',
      // Filters
      [BuzzmachineType.ELAK_SVF]: 'Elak_SVF',
      [BuzzmachineType.CYANPHASE_NOTCH]: 'CyanPhase_Notch',
      [BuzzmachineType.Q_ZFILTER]: 'Q_Zfilter',
      [BuzzmachineType.FSM_PHILTA]: 'FSM_Philta',
      // Delay/Reverb
      [BuzzmachineType.JESKOLA_DELAY]: 'Jeskola_Delay',
      [BuzzmachineType.JESKOLA_CROSSDELAY]: 'Jeskola_CrossDelay',
      [BuzzmachineType.JESKOLA_FREEVERB]: 'Jeskola_Freeverb',
      [BuzzmachineType.FSM_PANZERDELAY]: 'FSM_PanzerDelay',
      // Chorus/Modulation
      [BuzzmachineType.FSM_CHORUS]: 'FSM_Chorus',
      [BuzzmachineType.FSM_CHORUS2]: 'FSM_Chorus2',
      [BuzzmachineType.WHITENOISE_WHITECHORUS]: 'WhiteNoise_WhiteChorus',
      [BuzzmachineType.BIGYO_FREQUENCYSHIFTER]: 'Bigyo_FrequencyShifter',
      // Dynamics
      [BuzzmachineType.GEONIK_COMPRESSOR]: 'Geonik_Compressor',
      [BuzzmachineType.LD_SLIMIT]: 'Ld_SLimit',
      [BuzzmachineType.OOMEK_EXCITER]: 'Oomek_Exciter',
      [BuzzmachineType.OOMEK_MASTERIZER]: 'Oomek_Masterizer',
      [BuzzmachineType.DEDACODE_STEREOGAIN]: 'DedaCode_StereoGain',
      // Generators
      [BuzzmachineType.FSM_KICK]: 'FSM_Kick',
      [BuzzmachineType.FSM_KICKXP]: 'FSM_KickXP',
      [BuzzmachineType.JESKOLA_TRILOK]: 'Jeskola_Trilok',
      [BuzzmachineType.JESKOLA_NOISE]: 'Jeskola_Noise',
      [BuzzmachineType.OOMEK_AGGRESSOR]: 'Oomek_Aggressor',
      [BuzzmachineType.OOMEK_AGGRESSOR_DF]: 'Oomek_Aggressor_DF',
      [BuzzmachineType.MADBRAIN_4FM2F]: 'MadBrain_4FM2F',
      [BuzzmachineType.MADBRAIN_DYNAMITE6]: 'MadBrain_Dynamite6',
      [BuzzmachineType.MAKK_M3]: 'Makk_M3',
      [BuzzmachineType.MAKK_M4]: 'Makk_M4',
      [BuzzmachineType.CYANPHASE_DTMF]: 'CyanPhase_DTMF',
      [BuzzmachineType.ELENZIL_FREQUENCYBOMB]: 'Elenzil_FrequencyBomb',
    };

    const filename = filenameMap[machineType];
    if (!filename) {
      throw new Error(`Unknown machine type: ${machineType}`);
    }
    return filename;
  }

  /**
   * Set a parameter value on a machine
   */
  public setParameter(
    workletNode: AudioWorkletNode,
    paramIndex: number,
    value: number
  ): void {
    workletNode.port.postMessage({
      type: 'setParameter',
      paramIndex,
      paramValue: value,
    });
  }

  /**
   * Stop a machine (release all notes)
   */
  public stop(workletNode: AudioWorkletNode): void {
    workletNode.port.postMessage({
      type: 'stop',
    });
  }

  /**
   * Get machine info
   */
  public getMachineInfo(machineType: BuzzmachineType): BuzzmachineInfo {
    return BUZZMACHINE_INFO[machineType];
  }
}
