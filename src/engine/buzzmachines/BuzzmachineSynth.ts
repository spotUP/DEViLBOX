import * as Tone from 'tone';
import {
  BuzzmachineEngine,
  BuzzmachineType,
  type BuzzmachineParameter,
} from './BuzzmachineEngine';

/**
 * BuzzmachineSynth - Tone.js wrapper for buzzmachine WASM effects
 *
 * Provides a Tone.js-compatible interface to buzzmachines.
 * Similar to FurnaceSynth but for effects processing.
 */
export class BuzzmachineSynth extends Tone.ToneAudioNode {
  readonly name = 'BuzzmachineSynth';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private engine = BuzzmachineEngine.getInstance();
  private machineType: BuzzmachineType;
  private workletNode: AudioWorkletNode | null = null;
  private initInProgress = false;
  private useWasmEngine = false;

  // Fallback effect when WASM isn't available
  private fallbackEffect: Tone.ToneAudioNode | null = null;

  constructor(machineType: BuzzmachineType) {
    super();
    this.machineType = machineType;

    // Create input/output gains
    this.input = new Tone.Gain(1);
    this.output = new Tone.Gain(1);

    // Create fallback effect
    this.createFallbackEffect();

    // Initialize WASM engine asynchronously
    this.initEngine();
  }

  /**
   * Ensure WASM engine is initialized
   */
  public async ensureInitialized(): Promise<void> {
    if (this.useWasmEngine) return;

    if (this.initInProgress) {
      // Poll until init completes
      for (let i = 0; i < 40; i++) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        if (this.useWasmEngine || !this.initInProgress) break;
      }
      return;
    }

    await this.initEngine();
  }

  /**
   * Initialize the WASM engine
   */
  private async initEngine(): Promise<void> {
    if (this.initInProgress || this.useWasmEngine) return;

    this.initInProgress = true;

    try {
      const context = this.context.rawContext as AudioContext;

      // Initialize engine
      await this.engine.init(context);

      // Create worklet node for this machine
      this.workletNode = await this.engine.createMachineNode(
        context,
        this.machineType
      );

      // Connect worklet
      this.input.connect(this.workletNode as unknown as Tone.ToneAudioNode);
      (this.workletNode as unknown as Tone.ToneAudioNode).connect(this.output);

      // Disconnect fallback
      if (this.fallbackEffect) {
        this.input.disconnect(this.fallbackEffect);
        this.fallbackEffect.disconnect(this.output);
      }

      this.useWasmEngine = true;
      console.log(`[BuzzmachineSynth] ${this.machineType} WASM engine active`);
    } catch (err) {
      console.warn(`[BuzzmachineSynth] WASM init failed, using fallback:`, err);
      this.useWasmEngine = false;
    } finally {
      this.initInProgress = false;
    }
  }

  /**
   * Create a fallback effect when WASM isn't available
   */
  private createFallbackEffect(): void {
    switch (this.machineType) {
      case BuzzmachineType.ARGURU_DISTORTION:
        // Fallback: Tone.js Distortion
        this.fallbackEffect = new Tone.Distortion(0.5);
        break;

      case BuzzmachineType.ELAK_SVF:
        // Fallback: Tone.js Filter
        this.fallbackEffect = new Tone.Filter(1000, 'lowpass', -12);
        break;

      default:
        // Generic pass-through
        this.fallbackEffect = new Tone.Gain(1);
    }

    // Connect fallback
    this.input.connect(this.fallbackEffect);
    this.fallbackEffect.connect(this.output);
  }

  /**
   * Set a parameter value
   */
  public setParameter(paramIndex: number, value: number): void {
    if (this.useWasmEngine && this.workletNode) {
      this.engine.setParameter(this.workletNode, paramIndex, value);
    } else {
      // Map to fallback effect parameters
      this.setFallbackParameter(paramIndex, value);
    }
  }

  /**
   * Set parameter on fallback effect
   */
  private setFallbackParameter(paramIndex: number, value: number): void {
    if (!this.fallbackEffect) return;

    switch (this.machineType) {
      case BuzzmachineType.ARGURU_DISTORTION:
        if (paramIndex === 3 && this.fallbackEffect instanceof Tone.Distortion) {
          // Map output gain (index 3) to distortion amount
          const normalizedValue = value / 0x0800;
          this.fallbackEffect.distortion = normalizedValue;
        }
        break;

      case BuzzmachineType.ELAK_SVF:
        if (this.fallbackEffect instanceof Tone.Filter) {
          if (paramIndex === 0) {
            // Cutoff frequency (0-1000 range)
            const freqHz = 20 + (value / 1000) * 20000;
            this.fallbackEffect.frequency.value = freqHz;
          } else if (paramIndex === 1) {
            // Resonance (0-0xFFFE range)
            const q = 1 + (value / 0xFFFE) * 30;
            this.fallbackEffect.Q.value = q;
          }
        }
        break;
    }
  }

  /**
   * Get parameter info
   */
  public getParameters(): BuzzmachineParameter[] {
    const info = this.engine.getMachineInfo(this.machineType);
    return info.parameters;
  }

  /**
   * Stop the machine
   */
  public stop(): void {
    if (this.useWasmEngine && this.workletNode) {
      this.engine.stop(this.workletNode);
    }
  }

  /**
   * Dispose of resources
   */
  public dispose(): this {
    super.dispose();
    this.input.dispose();
    this.output.dispose();

    if (this.fallbackEffect) {
      this.fallbackEffect.dispose();
    }

    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }

    return this;
  }
}
