/**
 * DexedSynth.ts - DX7 FM Synthesizer wrapper for DEViLBOX
 * Provides a Tone.js compatible interface to the Dexed WASM engine
 *
 * Features:
 * - 16-voice polyphonic FM synthesis
 * - Full DX7 compatibility (SysEx patch loading)
 * - 32 FM algorithms
 * - 6 operators per voice
 */

import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';

/**
 * DX7 Algorithm definitions
 * Each algorithm defines how the 6 operators are connected
 */
export const DX7_ALGORITHMS = [
  '1→2→3→4→5→6 (Serial)',
  '1+2→3→4→5→6',
  '1→2+3→4→5→6',
  '1→2→3+4→5→6',
  '1→2→3→4+5→6',
  '1→2→3→4→5+6',
  // ... 32 total algorithms
] as const;

/**
 * DX7 Parameter IDs (matches C++ enum)
 * Using as const object for erasableSyntaxOnly compatibility
 */
export const DX7Param = {
  // Per-operator params (0-125): op * 21 + param
  OP_EG_RATE_1: 0,
  OP_EG_RATE_2: 1,
  OP_EG_RATE_3: 2,
  OP_EG_RATE_4: 3,
  OP_EG_LEVEL_1: 4,
  OP_EG_LEVEL_2: 5,
  OP_EG_LEVEL_3: 6,
  OP_EG_LEVEL_4: 7,
  OP_BREAK_POINT: 8,
  OP_L_DEPTH: 9,
  OP_R_DEPTH: 10,
  OP_L_CURVE: 11,
  OP_R_CURVE: 12,
  OP_RATE_SCALING: 13,
  OP_AMP_MOD: 14,
  OP_VELOCITY: 15,
  OP_LEVEL: 16,
  OP_MODE: 17,
  OP_COARSE: 18,
  OP_FINE: 19,
  OP_DETUNE: 20,

  // Global params (126-155)
  PITCH_EG_RATE_1: 126,
  PITCH_EG_RATE_2: 127,
  PITCH_EG_RATE_3: 128,
  PITCH_EG_RATE_4: 129,
  PITCH_EG_LEVEL_1: 130,
  PITCH_EG_LEVEL_2: 131,
  PITCH_EG_LEVEL_3: 132,
  PITCH_EG_LEVEL_4: 133,
  ALGORITHM: 134,
  FEEDBACK: 135,
  OSC_SYNC: 136,
  LFO_SPEED: 137,
  LFO_DELAY: 138,
  LFO_PMD: 139,
  LFO_AMD: 140,
  LFO_SYNC: 141,
  LFO_WAVE: 142,
  LFO_PMS: 143,
  TRANSPOSE: 144,
} as const;

/**
 * DX7 Operator configuration
 */
export interface DX7OperatorConfig {
  level?: number;         // 0-99 output level
  coarse?: number;        // 0-31 frequency ratio coarse
  fine?: number;          // 0-99 frequency ratio fine
  detune?: number;        // 0-14 (7 = center)
  mode?: number;          // 0 = ratio, 1 = fixed
  egRates?: [number, number, number, number];   // 0-99
  egLevels?: [number, number, number, number];  // 0-99
  breakPoint?: number;    // 0-99 (middle C = 39)
  leftDepth?: number;     // 0-99
  rightDepth?: number;    // 0-99
  leftCurve?: number;     // 0-3 (-lin, -exp, +exp, +lin)
  rightCurve?: number;    // 0-3
  rateScaling?: number;   // 0-7
  ampModSens?: number;    // 0-3
  velocitySens?: number;  // 0-7
}

/**
 * Configuration interface for Dexed synth
 */
export interface DexedConfig {
  // Algorithm and feedback
  algorithm?: number;     // 0-31
  feedback?: number;      // 0-7
  oscSync?: boolean;      // Oscillator sync on/off

  // 6 operators
  operators?: DX7OperatorConfig[];

  // Pitch envelope
  pitchEgRates?: [number, number, number, number];   // 0-99
  pitchEgLevels?: [number, number, number, number];  // 0-99

  // LFO
  lfoSpeed?: number;      // 0-99
  lfoDelay?: number;      // 0-99
  lfoPmd?: number;        // 0-99 pitch mod depth
  lfoAmd?: number;        // 0-99 amp mod depth
  lfoSync?: boolean;      // LFO sync on/off
  lfoWave?: number;       // 0-5 (tri, sawDown, sawUp, square, sine, s&h)
  lfoPms?: number;        // 0-7 pitch mod sensitivity

  // Global
  transpose?: number;     // 0-48 (24 = C3)
}

/**
 * Classic DX7 presets
 */
export const DEXED_PRESETS: Record<string, Partial<DexedConfig>> = {
  'E.PIANO 1': {
    algorithm: 5,
    feedback: 6,
    operators: [
      { level: 99, coarse: 1, fine: 0, detune: 7 },
      { level: 70, coarse: 14, fine: 0, detune: 7 },
      { level: 99, coarse: 1, fine: 0, detune: 7 },
      { level: 60, coarse: 1, fine: 0, detune: 7 },
      { level: 99, coarse: 1, fine: 0, detune: 7 },
      { level: 80, coarse: 1, fine: 0, detune: 7 },
    ],
  },
  'BRASS 1': {
    algorithm: 22,
    feedback: 7,
  },
  'STRINGS 1': {
    algorithm: 2,
    feedback: 4,
  },
  'INIT VOICE': {
    algorithm: 0,
    feedback: 0,
  },
};

/**
 * DexedSynth - DX7 FM Synthesizer
 */
export class DexedSynth implements DevilboxSynth {
  readonly name = 'DexedSynth';
  readonly output: GainNode;

  private _worklet: AudioWorkletNode | null = null;
  private config: DexedConfig;
  private isInitialized = false;
  private pendingNotes: Array<{ note: number; velocity: number }> = [];

  // Static initialization tracking
  private static isWorkletLoaded = false;
  private static workletLoadPromise: Promise<void> | null = null;

  private _initPromise: Promise<void>;

  constructor(config: Partial<DexedConfig> = {}) {
    this.output = getDevilboxAudioContext().createGain();

    this.config = {
      algorithm: 0,
      feedback: 0,
      ...config,
    };

    // Start initialization and store promise for ensureInitialized()
    this._initPromise = this.initialize();
  }

  public async ensureInitialized(): Promise<void> {
    return this._initPromise;
  }

  /**
   * Initialize the WASM engine and AudioWorklet
   */
  private async initialize(): Promise<void> {
    try {
      // Get native AudioContext
      const rawContext = getDevilboxAudioContext();
      const baseUrl = import.meta.env.BASE_URL || '/';

      // Load worklet module (once per session)
      if (!DexedSynth.isWorkletLoaded) {
        if (!DexedSynth.workletLoadPromise) {
          DexedSynth.workletLoadPromise = rawContext.audioWorklet.addModule(
            `${baseUrl}dexed/Dexed.worklet.js`
          );
        }
        await DexedSynth.workletLoadPromise;
        DexedSynth.isWorkletLoaded = true;
      }

      // Fetch WASM binary and JS code in parallel
      const [wasmResponse, jsResponse] = await Promise.all([
        fetch(`${baseUrl}dexed/Dexed.wasm`),
        fetch(`${baseUrl}dexed/Dexed.js`)
      ]);

      if (!wasmResponse.ok) {
        throw new Error(`Failed to load Dexed.wasm: ${wasmResponse.status}`);
      }
      if (!jsResponse.ok) {
        throw new Error(`Failed to load Dexed.js: ${jsResponse.status}`);
      }

      const [wasmBinary, jsCodeRaw] = await Promise.all([
        wasmResponse.arrayBuffer(),
        jsResponse.text()
      ]);

      // Preprocess JS code for AudioWorklet new Function() compatibility:
      // 1. Replace import.meta.url (not available in Function constructor scope)
      // 2. Remove ES module export statement (invalid syntax in Function body)
      // 3. Strip Node.js-specific dynamic import block (fails in worklet context)
      const jsCode = jsCodeRaw
        .replace(/import\.meta\.url/g, `"${baseUrl}dexed/"`)
        .replace(/export\s+default\s+\w+;?\s*$/, '')
        .replace(/if\s*\(ENVIRONMENT_IS_NODE\)\s*\{[^}]*await\s+import\([^)]*\)[^}]*\}/g, '')
        .replace(/(wasmMemory=wasmExports\["\w+"\])/, '$1;Module["wasmMemory"]=wasmMemory');

      // Create worklet node using native AudioWorkletNode constructor
      this._worklet = new AudioWorkletNode(rawContext, 'dexed-processor');

      // Set up message handler
      this._worklet.port.onmessage = (event) => {
        if (event.data.type === 'ready') {
          this.isInitialized = true;

          // Apply initial config
          this.applyConfig(this.config);

          // Process pending notes
          for (const { note, velocity } of this.pendingNotes) {
            this.triggerAttack(note, undefined, velocity / 127);
          }
          this.pendingNotes = [];
        } else if (event.data.type === 'error') {
          console.error('Dexed error:', event.data.error);
        }
      };

      // Initialize WASM engine with binary and JS code
      this._worklet.port.postMessage({
        type: 'init',
        wasmBinary,
        jsCode
      });

      // Connect worklet to native GainNode output
      this._worklet.connect(this.output);

      // CRITICAL: Connect through silent keepalive to destination to force process() calls
      try {
        const keepalive = rawContext.createGain();
        keepalive.gain.value = 0;
        this._worklet.connect(keepalive);
        keepalive.connect(rawContext.destination);
      } catch (_e) { /* keepalive failed */ }

    } catch (error) {
      console.error('Failed to initialize DexedSynth:', error);
      throw error;
    }
  }

  /**
   * Apply configuration to the synth
   */
  private applyConfig(config: DexedConfig): void {
    if (!this._worklet || !this.isInitialized) return;

    // Global parameters
    if (config.algorithm !== undefined) {
      this.setParameter(DX7Param.ALGORITHM, config.algorithm);
    }
    if (config.feedback !== undefined) {
      this.setParameter(DX7Param.FEEDBACK, config.feedback);
    }
    if (config.oscSync !== undefined) {
      this.setParameter(DX7Param.OSC_SYNC, config.oscSync ? 1 : 0);
    }
    if (config.transpose !== undefined) {
      this.setParameter(DX7Param.TRANSPOSE, config.transpose);
    }

    // LFO parameters
    if (config.lfoSpeed !== undefined) {
      this.setParameter(DX7Param.LFO_SPEED, config.lfoSpeed);
    }
    if (config.lfoDelay !== undefined) {
      this.setParameter(DX7Param.LFO_DELAY, config.lfoDelay);
    }
    if (config.lfoPmd !== undefined) {
      this.setParameter(DX7Param.LFO_PMD, config.lfoPmd);
    }
    if (config.lfoAmd !== undefined) {
      this.setParameter(DX7Param.LFO_AMD, config.lfoAmd);
    }
    if (config.lfoSync !== undefined) {
      this.setParameter(DX7Param.LFO_SYNC, config.lfoSync ? 1 : 0);
    }
    if (config.lfoWave !== undefined) {
      this.setParameter(DX7Param.LFO_WAVE, config.lfoWave);
    }
    if (config.lfoPms !== undefined) {
      this.setParameter(DX7Param.LFO_PMS, config.lfoPms);
    }

    // Pitch envelope
    if (config.pitchEgRates) {
      this.setParameter(DX7Param.PITCH_EG_RATE_1, config.pitchEgRates[0]);
      this.setParameter(DX7Param.PITCH_EG_RATE_2, config.pitchEgRates[1]);
      this.setParameter(DX7Param.PITCH_EG_RATE_3, config.pitchEgRates[2]);
      this.setParameter(DX7Param.PITCH_EG_RATE_4, config.pitchEgRates[3]);
    }
    if (config.pitchEgLevels) {
      this.setParameter(DX7Param.PITCH_EG_LEVEL_1, config.pitchEgLevels[0]);
      this.setParameter(DX7Param.PITCH_EG_LEVEL_2, config.pitchEgLevels[1]);
      this.setParameter(DX7Param.PITCH_EG_LEVEL_3, config.pitchEgLevels[2]);
      this.setParameter(DX7Param.PITCH_EG_LEVEL_4, config.pitchEgLevels[3]);
    }

    // Apply operator settings
    if (config.operators) {
      config.operators.forEach((op, index) => {
        if (index >= 6) return;
        const baseParam = index * 21;

        // Basic operator params
        if (op.level !== undefined) {
          this.setParameter(baseParam + DX7Param.OP_LEVEL, op.level);
        }
        if (op.coarse !== undefined) {
          this.setParameter(baseParam + DX7Param.OP_COARSE, op.coarse);
        }
        if (op.fine !== undefined) {
          this.setParameter(baseParam + DX7Param.OP_FINE, op.fine);
        }
        if (op.detune !== undefined) {
          this.setParameter(baseParam + DX7Param.OP_DETUNE, op.detune);
        }
        if (op.mode !== undefined) {
          this.setParameter(baseParam + DX7Param.OP_MODE, op.mode);
        }

        // Envelope rates and levels
        if (op.egRates) {
          this.setParameter(baseParam + DX7Param.OP_EG_RATE_1, op.egRates[0]);
          this.setParameter(baseParam + DX7Param.OP_EG_RATE_2, op.egRates[1]);
          this.setParameter(baseParam + DX7Param.OP_EG_RATE_3, op.egRates[2]);
          this.setParameter(baseParam + DX7Param.OP_EG_RATE_4, op.egRates[3]);
        }
        if (op.egLevels) {
          this.setParameter(baseParam + DX7Param.OP_EG_LEVEL_1, op.egLevels[0]);
          this.setParameter(baseParam + DX7Param.OP_EG_LEVEL_2, op.egLevels[1]);
          this.setParameter(baseParam + DX7Param.OP_EG_LEVEL_3, op.egLevels[2]);
          this.setParameter(baseParam + DX7Param.OP_EG_LEVEL_4, op.egLevels[3]);
        }

        // Keyboard scaling
        if (op.breakPoint !== undefined) {
          this.setParameter(baseParam + DX7Param.OP_BREAK_POINT, op.breakPoint);
        }
        if (op.leftDepth !== undefined) {
          this.setParameter(baseParam + DX7Param.OP_L_DEPTH, op.leftDepth);
        }
        if (op.rightDepth !== undefined) {
          this.setParameter(baseParam + DX7Param.OP_R_DEPTH, op.rightDepth);
        }
        if (op.leftCurve !== undefined) {
          this.setParameter(baseParam + DX7Param.OP_L_CURVE, op.leftCurve);
        }
        if (op.rightCurve !== undefined) {
          this.setParameter(baseParam + DX7Param.OP_R_CURVE, op.rightCurve);
        }

        // Sensitivity parameters
        if (op.rateScaling !== undefined) {
          this.setParameter(baseParam + DX7Param.OP_RATE_SCALING, op.rateScaling);
        }
        if (op.ampModSens !== undefined) {
          this.setParameter(baseParam + DX7Param.OP_AMP_MOD, op.ampModSens);
        }
        if (op.velocitySens !== undefined) {
          this.setParameter(baseParam + DX7Param.OP_VELOCITY, op.velocitySens);
        }
      });
    }
  }

  /**
   * Set a parameter value
   */
  setParameter(paramId: number, value: number): void {
    this._worklet?.port.postMessage({
      type: 'parameter',
      paramId,
      value,
    });
  }

  /**
   * Load a DX7 SysEx patch
   */
  loadSysEx(data: Uint8Array): void {
    this._worklet?.port.postMessage({
      type: 'loadSysEx',
      sysexData: Array.from(data),
    });
  }

  /**
   * Load a preset by name
   */
  loadPreset(name: keyof typeof DEXED_PRESETS): void {
    const preset = DEXED_PRESETS[name];
    if (preset) {
      this.config = { ...this.config, ...preset };
      this.applyConfig(this.config);
    }
  }

  /**
   * Set the FM algorithm (0-31)
   */
  setAlgorithm(algorithm: number): void {
    this.config.algorithm = Math.max(0, Math.min(31, algorithm));
    this.setParameter(DX7Param.ALGORITHM, this.config.algorithm);
  }

  /**
   * Set feedback amount (0-7)
   */
  setFeedback(feedback: number): void {
    this.config.feedback = Math.max(0, Math.min(7, feedback));
    this.setParameter(DX7Param.FEEDBACK, this.config.feedback);
  }

  /**
   * Set operator level (0-99)
   */
  setOperatorLevel(opIndex: number, level: number): void {
    if (opIndex < 0 || opIndex >= 6) return;
    const baseParam = opIndex * 21;
    this.setParameter(baseParam + DX7Param.OP_LEVEL, Math.max(0, Math.min(99, level)));
  }

  /**
   * Set operator frequency ratio coarse (0-31)
   */
  setOperatorCoarse(opIndex: number, coarse: number): void {
    if (opIndex < 0 || opIndex >= 6) return;
    const baseParam = opIndex * 21;
    this.setParameter(baseParam + DX7Param.OP_COARSE, Math.max(0, Math.min(31, coarse)));
  }

  /**
   * Set operator frequency ratio fine (0-99)
   */
  setOperatorFine(opIndex: number, fine: number): void {
    if (opIndex < 0 || opIndex >= 6) return;
    const baseParam = opIndex * 21;
    this.setParameter(baseParam + DX7Param.OP_FINE, Math.max(0, Math.min(99, fine)));
  }

  /**
   * Set operator detune (0-14, 7 = center)
   */
  setOperatorDetune(opIndex: number, detune: number): void {
    if (opIndex < 0 || opIndex >= 6) return;
    const baseParam = opIndex * 21;
    this.setParameter(baseParam + DX7Param.OP_DETUNE, Math.max(0, Math.min(14, detune)));
  }

  /**
   * Set LFO speed (0-99)
   */
  setLfoSpeed(speed: number): void {
    this.config.lfoSpeed = Math.max(0, Math.min(99, speed));
    this.setParameter(DX7Param.LFO_SPEED, this.config.lfoSpeed);
  }

  /**
   * Set LFO pitch mod depth (0-99)
   */
  setLfoPitchModDepth(depth: number): void {
    this.config.lfoPmd = Math.max(0, Math.min(99, depth));
    this.setParameter(DX7Param.LFO_PMD, this.config.lfoPmd);
  }

  /**
   * Set LFO amp mod depth (0-99)
   */
  setLfoAmpModDepth(depth: number): void {
    this.config.lfoAmd = Math.max(0, Math.min(99, depth));
    this.setParameter(DX7Param.LFO_AMD, this.config.lfoAmd);
  }

  /**
   * Set LFO waveform (0-5)
   */
  setLfoWaveform(wave: number): void {
    this.config.lfoWave = Math.max(0, Math.min(5, wave));
    this.setParameter(DX7Param.LFO_WAVE, this.config.lfoWave);
  }

  /**
   * Set transpose (0-48, 24 = C3)
   */
  setTranspose(transpose: number): void {
    this.config.transpose = Math.max(0, Math.min(48, transpose));
    this.setParameter(DX7Param.TRANSPOSE, this.config.transpose);
  }

  /**
   * Trigger a note
   */
  triggerAttack(
    frequency: number | string,
    _time?: number,
    velocity = 1
  ): this {
    const midiNote = noteToMidi(frequency);

    const vel = Math.round(velocity * 127);

    if (!this.isInitialized) {
      this.pendingNotes.push({ note: midiNote, velocity: vel });
      return this;
    }

    this._worklet?.port.postMessage({
      type: 'noteOn',
      note: midiNote,
      velocity: vel,
    });

    return this;
  }

  /**
   * Release a note
   */
  triggerRelease(frequency?: number | string, _time?: number): this {
    if (!this._worklet) return this;

    if (frequency !== undefined) {
      const midiNote = noteToMidi(frequency);

      this._worklet.port.postMessage({
        type: 'noteOff',
        note: midiNote,
      });
    } else {
      // Release all notes
      this._worklet.port.postMessage({ type: 'allNotesOff' });
    }

    return this;
  }

  /**
   * Send MIDI Control Change
   */
  controlChange(cc: number, value: number): void {
    this._worklet?.port.postMessage({
      type: 'controlChange',
      cc,
      value,
    });
  }

  /**
   * Send pitch bend (0-16383, 8192 = center)
   */
  pitchBend(value: number): void {
    this._worklet?.port.postMessage({
      type: 'pitchBend',
      value,
    });
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this._worklet?.port.postMessage({ type: 'allNotesOff' });
    this._worklet?.disconnect();
    this._worklet = null;
    this.output.disconnect();
  }
}

export default DexedSynth;
