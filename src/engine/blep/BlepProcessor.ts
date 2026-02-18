/**
 * BLEP (Band-Limited Step) Processor
 *
 * WebAssembly wrapper for PT2-clone's BLEP implementation.
 * Reduces aliasing artifacts in digital audio synthesis.
 */

interface BlepModule {
  _blepInit: (bufferPtr: number) => void;
  _blepAdd: (bufferPtr: number, offset: number, amplitude: number) => void;
  _blepRun: (bufferPtr: number, input: number) => number;
  _malloc: (size: number) => number;
  _free: (ptr: number) => void;
}

declare function createBlepModule(): Promise<BlepModule>;

// BLEP buffer structure size (matches C struct)
// struct blep_t {
//   int32_t index;           // 4 bytes
//   int32_t samplesLeft;     // 4 bytes
//   double dBuffer[32];      // 32 * 8 = 256 bytes
//   double dLastValue;       // 8 bytes
// }
const BLEP_BUFFER_SIZE = 4 + 4 + (32 * 8) + 8; // 272 bytes

export class BlepProcessor {
  private module: BlepModule | null = null;
  private bufferPtr: number = 0;
  private ready = false;

  /**
   * Initialize the BLEP processor
   */
  async init(): Promise<void> {
    if (this.ready) return;

    try {
      // Load WASM module
      const script = document.createElement('script');
      script.src = '/blep/blep.js';

      await new Promise<void>((resolve, reject) => {
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load BLEP module'));
        document.head.appendChild(script);
      });

      // Initialize module
      this.module = await (window as any).createBlepModule();

      if (!this.module) {
        throw new Error('BLEP module failed to initialize');
      }

      // Allocate BLEP buffer
      this.bufferPtr = this.module._malloc(BLEP_BUFFER_SIZE);

      // Initialize buffer
      this.module._blepInit(this.bufferPtr);

      this.ready = true;
      console.log('BLEP processor initialized');
    } catch (error) {
      console.error('Failed to initialize BLEP processor:', error);
      throw error;
    }
  }

  /**
   * Add a band-limited step correction
   * @param offset Fractional offset within current sample (0.0 - 1.0)
   * @param amplitude Amplitude change (delta) to band-limit
   */
  add(offset: number, amplitude: number): void {
    if (!this.ready || !this.module || this.bufferPtr === 0) {
      console.warn('BLEP processor not ready');
      return;
    }
    this.module._blepAdd(this.bufferPtr, offset, amplitude);
  }

  /**
   * Process input sample with BLEP correction
   * @param input Input sample value
   * @returns Band-limited output sample
   */
  run(input: number): number {
    if (!this.ready || !this.module || this.bufferPtr === 0) {
      return input; // Bypass if not ready
    }
    return this.module._blepRun(this.bufferPtr, input);
  }

  /**
   * Reset the BLEP buffer
   */
  reset(): void {
    if (this.ready && this.module && this.bufferPtr !== 0) {
      this.module._blepInit(this.bufferPtr);
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.module && this.bufferPtr !== 0) {
      this.module._free(this.bufferPtr);
      this.bufferPtr = 0;
    }
    this.ready = false;
    this.module = null;
  }

  isReady(): boolean {
    return this.ready;
  }
}

/**
 * Per-voice BLEP processor for authentic Amiga-style synthesis
 */
export class VoiceBlepProcessor {
  private blep: BlepProcessor;
  private lastValue = 0;
  private enabled = true;

  constructor(blep: BlepProcessor) {
    this.blep = blep;
  }

  /**
   * Process a sample, detecting and correcting discontinuities
   * @param input Current sample value
   * @param offset Fractional sample offset (for sub-sample accuracy)
   * @returns Processed sample with BLEP correction
   */
  process(input: number, offset = 0.0): number {
    if (!this.enabled || !this.blep.isReady()) {
      return input;
    }

    // Detect discontinuity (sample value changed)
    if (input !== this.lastValue) {
      const delta = this.lastValue - input;

      // Only apply BLEP for significant changes (avoid noise)
      if (Math.abs(delta) > 0.0001) {
        this.blep.add(offset, delta);
      }

      this.lastValue = input;
    }

    // Apply BLEP correction
    return this.blep.run(input);
  }

  /**
   * Reset processor state (call when note triggers)
   */
  reset(): void {
    this.lastValue = 0;
    this.blep.reset();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}
