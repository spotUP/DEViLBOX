/**
 * FurnaceChipEngine - Centralized manager for WASM-based chip emulators
 */

export const FurnaceChipType = {
  OPN2: 0, 
  OPM: 1,  
  OPL3: 2, 
  PSG: 3,  
  NES: 4,  
  GB: 5,   
  PCE: 6,  
  SCC: 7,  
  N163: 8, 
  VRC6: 9, 
  SID: 10,
  OPLL: 11,
  AY: 12,
  OPNA: 13,
  OPNB: 14,
  TIA: 15,
  FDS: 16,
  MMC5: 17,
  SAA: 18,
  SWAN: 19,
  OKI: 20,
  ES5506: 21,
  OPZ: 22,
  Y8950: 23,
  SNES: 24,
  LYNX: 25,
  OPL4: 26,
  SEGAPCM: 27,
  YMZ280B: 28,
  RF5C68: 29,
  GA20: 30,
  C140: 31,
  QSOUND: 32,
  VIC: 33,
  TED: 34,
  SUPERVISION: 35,
  VERA: 36,
  SM8521: 37,
  BUBBLE: 38,
  K007232: 39,
  K053260: 40,
  X1_010: 41,
  UPD1771: 42,
  T6W28: 43,
  VB: 44
} as const;

export type FurnaceChipType = typeof FurnaceChipType[keyof typeof FurnaceChipType];

export class FurnaceChipEngine {
  private static instance: FurnaceChipEngine | null = null;
  private isLoaded: boolean = false;
  private initPromise: Promise<void> | null = null;
  private initFailed: boolean = false;
  private workletNode: AudioWorkletNode | null = null;

  public static getInstance(): FurnaceChipEngine {
    if (!FurnaceChipEngine.instance) {
      FurnaceChipEngine.instance = new FurnaceChipEngine();
    }
    return FurnaceChipEngine.instance;
  }

  /**
   * Initialize the engine and load WASM
   * @param audioContext - Must be a native AudioContext (not a Tone.js wrapper)
   */
  public async init(audioContext: unknown): Promise<void> {
    // Already initialized successfully
    if (this.isLoaded) return;

    // Previous init attempt failed - don't retry
    if (this.initFailed) return;

    // Init already in progress - wait for it
    if (this.initPromise) {
      return this.initPromise;
    }

    // Start initialization
    this.initPromise = this.doInit(audioContext);
    return this.initPromise;
  }

  private async doInit(audioContext: unknown): Promise<void> {
    try {
      // Cast to any for duck typing checks
      const ctx = audioContext as any;

      // Validate audioContext using duck typing (constructor name is unreliable across realms)
      if (!ctx || !ctx.audioWorklet || typeof ctx.createGain !== 'function') {
        // Not a valid audio context - mark as failed
        this.initFailed = true;
        return;
      }

      // Check if this is a real native AudioContext, not a Tone.js wrapper
      // The browser's AudioWorkletNode constructor requires a BaseAudioContext instance
      const isNativeContext = (
        audioContext instanceof AudioContext ||
        audioContext instanceof OfflineAudioContext ||
        // Check constructor name as fallback for cross-realm scenarios
        ctx.constructor?.name === 'AudioContext' ||
        ctx.constructor?.name === 'OfflineAudioContext'
      );

      if (!isNativeContext) {
        // This is likely a Tone.js wrapped context - mark as failed
        this.initFailed = true;
        return;
      }

      // Ensure context is running
      if (ctx.state !== 'running') {
        // AudioContext not running - don't mark failed, could retry later
        this.initPromise = null;
        return;
      }

      // Now we know it's a real AudioContext
      const nativeContext = audioContext as AudioContext;
      const baseUrl = import.meta.env.BASE_URL || '/';

      // Try to add the worklet module (may already be registered)
      try {
        await nativeContext.audioWorklet.addModule(`${baseUrl}FurnaceChips.worklet.js`);
      } catch {
        // Module may already be registered, or doesn't exist - continue anyway
      }

      // Fetch WASM binary to pass to worklet
      const response = await fetch(`${baseUrl}FurnaceChips.wasm`);
      if (!response.ok) {
        // WASM file not available - mark as failed
        this.initFailed = true;
        return;
      }
      const wasmBinary = await response.arrayBuffer();

      // Try to create the AudioWorkletNode
      try {
        this.workletNode = new AudioWorkletNode(nativeContext, 'furnace-chips-processor', {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [2],
        });
      } catch {
        // AudioWorkletNode creation failed - mark as failed
        this.initFailed = true;
        return;
      }

      // Send binary and init command
      this.workletNode.port.postMessage({
        type: 'init',
        wasmBinary
      });

      this.isLoaded = true;
      console.log('[FurnaceChipEngine] WASM chips initialized');
    } catch {
      // Silently fail - Furnace chip engine is optional
      this.initFailed = true;
    }
  }

  /**
   * Write to a chip register
   */
  public write(chipType: FurnaceChipType, register: number, value: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({
      type: 'write',
      chipType,
      register,
      value
    });
  }

  /**
   * Set wavetable data for a chip
   */
  public setWavetable(chipType: FurnaceChipType, index: number, data: Uint8Array): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({
      type: 'setWavetable',
      chipType,
      index,
      data
    });
  }

  /**
   * Enable or disable hardware register logging
   */
  public setLogging(enabled: boolean): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({
      type: 'setLogging',
      enabled
    });
  }

  /**
   * Retrieve the captured register log
   */
  public async getLog(): Promise<Uint8Array> {
    if (!this.workletNode) return new Uint8Array(0);
    return new Promise((resolve) => {
      const handler = (event: MessageEvent) => {
        if (event.data.type === 'logData') {
          this.workletNode?.port.removeEventListener('message', handler);
          resolve(event.data.data);
        }
      };
      this.workletNode?.port.addEventListener('message', handler);
      this.workletNode?.port.postMessage({ type: 'getLog' });
    });
  }

  public getOutput(): AudioNode {
    if (!this.workletNode) throw new Error('Engine not initialized');
    return this.workletNode;
  }

  /**
   * Check if the engine is initialized and working
   */
  public isInitialized(): boolean {
    return this.isLoaded && this.workletNode !== null;
  }
}