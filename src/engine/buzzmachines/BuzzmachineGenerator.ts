import * as Tone from 'tone';
import {
  BuzzmachineEngine,
  BuzzmachineType,
  BUZZMACHINE_INFO,
  type BuzzmachineParameter,
} from './BuzzmachineEngine';

/**
 * BuzzmachineGenerator - Tone.js wrapper for buzzmachine WASM generators
 *
 * Unlike BuzzmachineSynth (for effects), this class handles generators
 * that produce audio (synths, drums, etc.)
 */
export class BuzzmachineGenerator extends Tone.ToneAudioNode {
  readonly name = 'BuzzmachineGenerator';
  readonly input: undefined = undefined;  // Generators don't have input
  readonly output: Tone.Gain;

  private engine = BuzzmachineEngine.getInstance();
  private machineType: BuzzmachineType;
  private workletNode: AudioWorkletNode | null = null;
  private initInProgress = false;
  private useWasmEngine = false;

  // Fallback synth when WASM isn't available
  private fallbackSynth: Tone.Synth | Tone.MembraneSynth | Tone.NoiseSynth | null = null;

  constructor(machineType: BuzzmachineType) {
    super();
    this.machineType = machineType;

    // Create output gain
    this.output = new Tone.Gain(1);

    // Create fallback synth
    this.createFallbackSynth();

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
      const context = this.context as unknown as AudioContext;

      // Initialize engine
      await this.engine.init(context);

      // Create worklet node for this machine
      this.workletNode = await this.engine.createMachineNode(
        context,
        this.machineType
      );

      // Connect worklet to output
      (this.workletNode as unknown as Tone.ToneAudioNode).connect(this.output);

      // Disconnect fallback
      if (this.fallbackSynth) {
        this.fallbackSynth.disconnect(this.output);
      }

      this.useWasmEngine = true;
      console.log(`[BuzzmachineGenerator] ${this.machineType} WASM engine active`);
    } catch (err) {
      console.warn(`[BuzzmachineGenerator] WASM init failed, using fallback:`, err);
      this.useWasmEngine = false;
    } finally {
      this.initInProgress = false;
    }
  }

  /**
   * Create a fallback synth when WASM isn't available
   */
  private createFallbackSynth(): void {
    const info = BUZZMACHINE_INFO[this.machineType];
    void info; // Machine info available for future parameter mapping

    // Check if this is a kick/drum type
    if (this.machineType === BuzzmachineType.FSM_KICK ||
        this.machineType === BuzzmachineType.FSM_KICKXP ||
        this.machineType === BuzzmachineType.JESKOLA_TRILOK) {
      this.fallbackSynth = new Tone.MembraneSynth({
        pitchDecay: 0.05,
        octaves: 4,
        oscillator: { type: 'sine' },
        envelope: {
          attack: 0.001,
          decay: 0.4,
          sustain: 0.01,
          release: 0.4,
        },
      });
    } else if (this.machineType === BuzzmachineType.JESKOLA_NOISE) {
      this.fallbackSynth = new Tone.NoiseSynth({
        noise: { type: 'white' },
        envelope: {
          attack: 0.01,
          decay: 0.2,
          sustain: 0.5,
          release: 0.5,
        },
      });
    } else if (this.machineType === BuzzmachineType.OOMEK_AGGRESSOR) {
      // TB-303 style - use MonoSynth with filter
      this.fallbackSynth = new Tone.Synth({
        oscillator: { type: 'sawtooth' },
        envelope: {
          attack: 0.005,
          decay: 0.2,
          sustain: 0.3,
          release: 0.2,
        },
      });
    } else {
      // Generic synth fallback
      this.fallbackSynth = new Tone.Synth({
        oscillator: { type: 'sawtooth' },
        envelope: {
          attack: 0.01,
          decay: 0.3,
          sustain: 0.4,
          release: 0.5,
        },
      });
    }

    // Connect fallback
    this.fallbackSynth.connect(this.output);
  }

  /**
   * Trigger a note
   */
  public triggerAttack(
    note: Tone.Unit.Frequency,
    time?: Tone.Unit.Time,
    velocity: number = 1
  ): this {
    // Normalize null to undefined for Tone.js compatibility
    const normalizedTime = time ?? undefined;

    if (this.useWasmEngine && this.workletNode) {
      // Send note-on message to WASM
      const freq = Tone.Frequency(note).toFrequency();
      this.workletNode.port.postMessage({
        type: 'noteOn',
        frequency: freq,
        velocity: Math.round(velocity * 127),
        time: normalizedTime !== undefined ? Tone.Time(normalizedTime).toSeconds() : undefined,
      });
    } else if (this.fallbackSynth) {
      if (this.fallbackSynth instanceof Tone.NoiseSynth) {
        this.fallbackSynth.triggerAttack(normalizedTime, velocity);
      } else {
        (this.fallbackSynth as Tone.Synth).triggerAttack(note, normalizedTime, velocity);
      }
    }
    return this;
  }

  /**
   * Release a note
   */
  public triggerRelease(time?: Tone.Unit.Time): this {
    // Normalize null to undefined for Tone.js compatibility
    // IMPORTANT: Don't pass undefined to Tone.js - call without argument instead
    const normalizedTime = time ?? undefined;

    if (this.useWasmEngine && this.workletNode) {
      this.workletNode.port.postMessage({
        type: 'noteOff',
        time: normalizedTime !== undefined ? Tone.Time(normalizedTime).toSeconds() : undefined,
      });
    } else if (this.fallbackSynth) {
      // Call without argument if time is undefined - don't pass undefined explicitly
      if (normalizedTime !== undefined) {
        this.fallbackSynth.triggerRelease(normalizedTime);
      } else {
        this.fallbackSynth.triggerRelease();
      }
    }
    return this;
  }

  /**
   * Trigger attack and release
   */
  public triggerAttackRelease(
    note: Tone.Unit.Frequency,
    duration: Tone.Unit.Time,
    time?: Tone.Unit.Time,
    velocity: number = 1
  ): this {
    // Normalize null to undefined for Tone.js compatibility
    const normalizedTime = time ?? undefined;
    const computedTime = normalizedTime !== undefined ? Tone.Time(normalizedTime).toSeconds() : Tone.now();
    const computedDuration = Tone.Time(duration).toSeconds();

    this.triggerAttack(note, computedTime, velocity);
    this.triggerRelease(computedTime + computedDuration);
    return this;
  }

  /**
   * Set a parameter value
   */
  public setParameter(paramIndex: number, value: number): void {
    if (this.useWasmEngine && this.workletNode) {
      this.engine.setParameter(this.workletNode, paramIndex, value);
    }
    // Fallback parameter mapping could be added here
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
    if (this.fallbackSynth) {
      this.fallbackSynth.triggerRelease();
    }
  }

  /**
   * Dispose of resources
   */
  public dispose(): this {
    super.dispose();
    this.output.dispose();

    if (this.fallbackSynth) {
      this.fallbackSynth.dispose();
    }

    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }

    return this;
  }
}
