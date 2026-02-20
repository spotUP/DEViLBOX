import * as Tone from 'tone';
import { GuitarMLEngine } from '../GuitarMLEngine';
import { getNativeContext, getNativeAudioNode } from '@utils/audio-context';

/**
 * NeuralEffectWrapper
 *
 * Wraps GuitarML AudioWorklet to work seamlessly in Tone.js effect chains.
 * Provides:
 * - Dry/wet mixing like other Tone.js effects
 * - Parameter mapping (drive, tone, bass, mid, treble, presence, level, dryWet)
 * - EQ post-processing for amp-style controls
 * - Proper disposal to prevent memory leaks
 */
export class NeuralEffectWrapper extends Tone.ToneAudioNode {
  readonly name = 'NeuralEffectWrapper';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private guitarML: GuitarMLEngine;
  private _wet: number;
  private _level: number = 1.0;  // Tracked separately so level and wet compose correctly
  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private modelIndex: number;

  // Bridge gain node to connect native AudioNode to Tone.js chain
  private neuralOutputGain: Tone.Gain;

  // EQ nodes for bass/mid/treble/presence control (User Decision #1)
  private eq3: Tone.EQ3;
  private presenceFilter: Tone.Filter;

  constructor(options: {
    modelIndex: number;
    audioContext?: AudioContext;
    wet?: number;
  }) {
    super();

    this.modelIndex = options.modelIndex;
    this._wet = options.wet ?? 1.0;

    // Extract the TRUE native AudioContext (same as all MAME/WASM synths)
    const nativeContext = getNativeContext(this.context);

    // Create signal path nodes
    this.input = new Tone.Gain(1);
    this.output = new Tone.Gain(1);
    this.dryGain = new Tone.Gain(1 - this._wet);
    this.wetGain = new Tone.Gain(this._wet);

    // Create GuitarML engine
    this.guitarML = new GuitarMLEngine(nativeContext);

    // Create bridge gain node (native AudioNode -> Tone.js)
    this.neuralOutputGain = new Tone.Gain(1);

    // Create EQ chain for amp-style tone controls
    this.eq3 = new Tone.EQ3({
      low: 0,
      mid: 0,
      high: 0,
      lowFrequency: 400,
      highFrequency: 2500,
    });

    this.presenceFilter = new Tone.Filter({
      type: 'highshelf',
      frequency: 4000,
      gain: 0,
      Q: 0.7,
    });

    // Connect dry path and post-neural chain now;
    // guitarML connections are deferred to loadModel() after initialization
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    this.neuralOutputGain.connect(this.eq3);
    this.eq3.connect(this.presenceFilter);
    this.presenceFilter.connect(this.wetGain);
    this.wetGain.connect(this.output);
  }

  /**
   * Load neural model (must be called after construction)
   */
  async loadModel(): Promise<void> {
    await this.guitarML.initialize();

    // Connect guitarML into the signal path now that the worklet node exists.
    // Tone.js uses standardized-audio-context which wraps native AudioNodes.
    // GuitarML uses truly native AudioNodes. To connect across these worlds,
    // we must extract the browser-native node via _nativeAudioNode.
    const inputNode = getNativeAudioNode(this.input) as AudioNode & { _nativeAudioNode?: AudioNode } | null;
    const nativeInput = inputNode?._nativeAudioNode || inputNode;
    if (nativeInput) {
      nativeInput.connect(this.guitarML.getInput());
    }

    const targetNode = getNativeAudioNode(this.neuralOutputGain) as AudioNode & { _nativeAudioNode?: AudioNode } | null;
    const nativeTarget = targetNode?._nativeAudioNode || targetNode;
    if (nativeTarget) {
      this.guitarML.getOutput().connect(nativeTarget);
    }

    await this.guitarML.loadModel(this.modelIndex);
  }

  /**
   * Set effect parameter (0-100 range, normalized internally)
   * Handles ALL parameters from model schema dynamically
   */
  setParameter(param: string, value: number): void {
    const normalizedValue = Math.max(0, Math.min(100, value)) / 100;

    switch (param) {
      // Primary drive/gain control
      // - Conditioned models (2-input LSTM, filename contains 'Knob'): condition is the
      //   second LSTM input and directly controls saturation character.
      // - Non-conditioned models (1-input LSTM, fixed-state captures): condition is ignored
      //   by the worklet. Instead we control input gain (dB) so Drive reduces/increases
      //   how hard the signal hits the LSTM, giving useful distortion control.
      case 'drive':
      case 'gain':
      case 'condition': {
        const model = GuitarMLEngine.BUILT_IN_MODELS[this.modelIndex];
        const isConditioned = model?.fileName.includes('Knob') ?? false;
        if (isConditioned) {
          this.guitarML.setCondition(normalizedValue);
        } else {
          // Drive 0→50→100 maps to worklet gain -12→0→+12 dB.
          // At gain=0 the worklet applies its built-in -12 dB input correction.
          // Turning Drive down cleans up the distortion; turning it up adds saturation.
          this.guitarML.setGain(normalizedValue * 24 - 12);
        }
        break;
      }

      // Dry/wet mix
      case 'dryWet':
        this.guitarML.setDryWet(normalizedValue);
        break;

      // Output level — tracked separately so changing wet doesn't reset level
      case 'level':
      case 'output':
        this._level = normalizedValue;
        this.wetGain.gain.value = this._level * this._wet;
        break;

      // Tone control (high-frequency roll-off)
      case 'tone':
        // Tone control: 0 = dark (cut highs), 100 = bright (boost highs)
        // Map to presence filter gain: -10dB to +10dB
        this.presenceFilter.gain.value = (normalizedValue - 0.5) * 20;
        break;

      // EQ controls (User Decision #1 - Implemented)
      case 'bass':
        // -15dB to +15dB
        this.eq3.low.value = (normalizedValue - 0.5) * 30;
        break;

      case 'mid':
        // -15dB to +15dB
        this.eq3.mid.value = (normalizedValue - 0.5) * 30;
        break;

      case 'treble':
        // -15dB to +15dB
        this.eq3.high.value = (normalizedValue - 0.5) * 30;
        break;

      case 'presence':
        // High-shelf boost/cut at 4kHz
        // -10dB to +10dB
        this.presenceFilter.gain.value = (normalizedValue - 0.5) * 20;
        break;

      default:
        console.warn(`[NeuralEffectWrapper] Unknown parameter: ${param}`);
    }
  }

  /**
   * Get current wet/dry mix
   */
  get wet(): number {
    return this._wet;
  }

  /**
   * Set wet/dry mix (0-1)
   */
  set wet(value: number) {
    this._wet = Math.max(0, Math.min(1, value));
    this.wetGain.gain.value = this._wet * this._level;  // preserve level
    this.dryGain.gain.value = 1 - this._wet;
  }

  /**
   * Dispose of all resources
   */
  dispose(): this {
    super.dispose();
    this.guitarML.dispose();
    this.dryGain.dispose();
    this.wetGain.dispose();
    this.neuralOutputGain.dispose();
    this.eq3.dispose();
    this.presenceFilter.dispose();
    return this;
  }
}
