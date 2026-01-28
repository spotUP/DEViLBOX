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
  private initFailedPermanently: boolean = false; // Only for permanent failures (bad context type)
  private workletNode: AudioWorkletNode | null = null;
  private lastInitAttempt: number = 0;

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

    // Previous init attempt failed permanently - don't retry
    if (this.initFailedPermanently) return;

    // Init already in progress - wait for it
    if (this.initPromise) {
      return this.initPromise;
    }

    // Rate limit retries to once per 2 seconds
    const now = Date.now();
    if (now - this.lastInitAttempt < 2000) return;
    this.lastInitAttempt = now;

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
        console.warn('[FurnaceChipEngine] Invalid audio context - no audioWorklet');
        this.initFailedPermanently = true;
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
        console.warn('[FurnaceChipEngine] Not a native AudioContext:', ctx.constructor?.name);
        this.initFailedPermanently = true;
        return;
      }

      // Ensure context is running
      if (ctx.state !== 'running') {
        console.log('[FurnaceChipEngine] AudioContext state:', ctx.state, '- will retry later');
        this.initPromise = null;
        return;
      }

      // Now we know it's a real AudioContext
      const nativeContext = audioContext as AudioContext;
      const baseUrl = import.meta.env.BASE_URL || '/';

      // Try to add the worklet module
      const workletUrl = `${baseUrl}FurnaceChips.worklet.js`;
      try {
        await nativeContext.audioWorklet.addModule(workletUrl);
        console.log('[FurnaceChipEngine] Worklet module loaded');
      } catch (err: any) {
        // Check if it's "already registered" vs actual error
        if (err?.message?.includes('already') || err?.name === 'InvalidStateError') {
          console.log('[FurnaceChipEngine] Worklet already registered');
        } else {
          console.error('[FurnaceChipEngine] Worklet load failed:', workletUrl, err);
          this.initPromise = null; // Allow retry
          return;
        }
      }

      // Fetch WASM binary to pass to worklet
      const wasmUrl = `${baseUrl}FurnaceChips.wasm`;
      console.log('[FurnaceChipEngine] Fetching WASM from:', wasmUrl);
      const response = await fetch(wasmUrl);
      if (!response.ok) {
        console.error('[FurnaceChipEngine] WASM fetch failed:', response.status, response.statusText);
        this.initPromise = null; // Allow retry
        return;
      }
      const wasmBinary = await response.arrayBuffer();
      console.log('[FurnaceChipEngine] WASM loaded, size:', wasmBinary.byteLength);

      // Try to create the AudioWorkletNode
      try {
        this.workletNode = new AudioWorkletNode(nativeContext, 'furnace-chips-processor', {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [2],
        });
        console.log('[FurnaceChipEngine] AudioWorkletNode created');
      } catch (err) {
        console.error('[FurnaceChipEngine] AudioWorkletNode creation failed:', err);
        this.initPromise = null; // Allow retry
        return;
      }

      // Send binary and init command
      this.workletNode.port.postMessage({
        type: 'init',
        wasmBinary
      });

      this.isLoaded = true;
      console.log('[FurnaceChipEngine] ✓ WASM chips initialized successfully');
    } catch (err) {
      console.error('[FurnaceChipEngine] Init error:', err);
      this.initPromise = null; // Allow retry
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