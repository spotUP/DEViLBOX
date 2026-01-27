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
  private workletNode: AudioWorkletNode | null = null;

  public static getInstance(): FurnaceChipEngine {
    if (!FurnaceChipEngine.instance) {
      FurnaceChipEngine.instance = new FurnaceChipEngine();
    }
    return FurnaceChipEngine.instance;
  }

  /**
   * Initialize the engine and load WASM
   */
  public async init(audioContext: AudioContext): Promise<void> {
    if (this.isLoaded) return;

    try {
      const baseUrl = import.meta.env.BASE_URL || '/';
      await audioContext.audioWorklet.addModule(`${baseUrl}FurnaceChips.worklet.js`);

      // Fetch WASM binary to pass to worklet (more reliable than letting it fetch itself)
      const response = await fetch(`${baseUrl}FurnaceChips.wasm`);
      const wasmBinary = await response.arrayBuffer();

      this.workletNode = new AudioWorkletNode(audioContext, 'furnace-chips-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });

      // Send binary and init command
      this.workletNode.port.postMessage({
        type: 'init',
        wasmBinary
      });

      this.isLoaded = true;
      console.log('[FurnaceChipEngine] WASM chips initialized with binary injection');
    } catch (err) {
      console.error('[FurnaceChipEngine] Initialization failed:', err);
      throw err;
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
}