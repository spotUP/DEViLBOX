import * as Tone from 'tone';
import {
  BuzzmachineEngine,
  BuzzmachineType,
  BUZZMACHINE_INFO,
  type BuzzmachineParameter,
} from './BuzzmachineEngine';
import { reportSynthError } from '../../stores/useSynthErrorStore';

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

  // Error tracking - no fallback effects, report errors instead
  private initError: Error | null = null;
  private errorReported: boolean = false;

  constructor(machineType: BuzzmachineType) {
    super();
    this.machineType = machineType;

    // Create input/output gains
    this.input = new Tone.Gain(1);
    this.output = new Tone.Gain(1);

    // Connect input directly to output (pass-through until WASM loads)
    this.input.connect(this.output);

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
      for (let i = 0; i < 200; i++) {
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
      // Use the wrapped context (this.context)
      // The engines will extract the native context using getNativeContext where needed
      const context = this.context;

      // Initialize engine
      await this.engine.init(context as any);

      // Create worklet node for this machine
      this.workletNode = await this.engine.createMachineNode(
        context as any,
        this.machineType
      );

      // Disconnect pass-through
      this.input.disconnect(this.output);

      // Connect worklet
      this.input.connect(this.workletNode as unknown as Tone.ToneAudioNode);
      (this.workletNode as unknown as Tone.ToneAudioNode).connect(this.output);

      this.useWasmEngine = true;
      console.log(`[BuzzmachineSynth] ${this.machineType} WASM engine active`);
    } catch (err) {
      this.initError = err instanceof Error ? err : new Error(String(err));
      this.useWasmEngine = false;
      this.reportInitError();
    } finally {
      this.initInProgress = false;
    }
  }


  /**
   * Report initialization error to the error store
   */
  private reportInitError(): void {
    if (this.errorReported || !this.initError) return;

    this.errorReported = true;
    const info = BUZZMACHINE_INFO[this.machineType];

    reportSynthError('BuzzmachineSynth', this.initError.message, {
      synthName: info?.name ?? this.machineType,
      errorType: 'wasm',
      error: this.initError,
      debugData: {
        machineType: this.machineType,
        machineKind: info?.type,
        wasmSupported: typeof WebAssembly !== 'undefined',
      },
    });
  }

  /**
   * Set a parameter value
   */
  public setParameter(paramIndex: number, value: number): void {
    // If WASM not available, error was already reported at init
    if (this.useWasmEngine && this.workletNode) {
      this.engine.setParameter(this.workletNode, paramIndex, value);
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

    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }

    return this;
  }
}