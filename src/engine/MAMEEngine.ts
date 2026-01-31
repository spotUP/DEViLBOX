/**
 * MAMEEngine - TypeScript wrapper for the MAME WASM modules
 * Supports multiple instances via handles.
 */
export const MAMESynthType = {
  VFX: 'vfx',
  DOC: 'doc',
  RSA: 'rsa',
  SWP30: 'swp30',
} as const;

export type MAMESynthType = typeof MAMESynthType[keyof typeof MAMESynthType];

const TYPE_MAP: Record<MAMESynthType, number> = {
  'vfx': 0,
  'doc': 1,
  'rsa': 2,
  'swp30': 3
};

export class MAMEEngine {
  private static instance: MAMEEngine;
  private module: any = null;
  private isInitialized: boolean = false;

  private constructor() {}

  public static getInstance(): MAMEEngine {
    if (!MAMEEngine.instance) {
      MAMEEngine.instance = new MAMEEngine();
    }
    return MAMEEngine.instance;
  }

  /**
   * Load the WASM module
   */
  public async init(): Promise<void> {
    if (this.isInitialized) return;

    return new Promise((resolve, reject) => {
      // @ts-ignore
      if (typeof window !== 'undefined' && (window as any).MAMEChips) {
        // @ts-ignore
        (window as any).MAMEChips().then((mod: any) => {
          this.module = mod;
          this.isInitialized = true;
          console.log('🎹 MAMEEngine: WASM Module Loaded (Multi-Instance)');
          resolve();
        }).catch(reject);
      } else {
        reject(new Error('MAMEChips script not found in window'));
      }
    });
  }

  /**
   * Create a new synth instance
   * @returns handle to the instance
   */
  public createInstance(type: MAMESynthType, clock: number): number {
    if (!this.isInitialized) return 0;
    const typeInt = TYPE_MAP[type];
    return this.module._mame_create_instance(typeInt, clock);
  }

  /**
   * Delete a synth instance
   */
  public deleteInstance(handle: number): void {
    if (!this.isInitialized || handle === 0) return;
    this.module._mame_delete_instance(handle);
  }

  /**
   * Write to a chip register
   */
  public write(handle: number, offset: number, value: number): void {
    if (!this.isInitialized || handle === 0) return;
    this.module._mame_write(handle, offset, value);
  }

  /**
   * Write 16-bit word to a chip register
   */
  public write16(handle: number, offset: number, value: number): void {
    if (!this.isInitialized || handle === 0) return;
    this.module._mame_write16(handle, offset, value);
  }

  /**
   * Read from a chip register
   */
  public read(handle: number, offset: number): number {
    if (!this.isInitialized || handle === 0) return 0;
    return this.module._mame_read(handle, offset);
  }

  /**
   * Set a ROM bank
   */
  public setRom(bank: number, data: Uint8Array): void {
    if (!this.isInitialized) return;

    const ptr = this.module._malloc(data.length);
    this.module.HEAPU8.set(data, ptr);
    this.module._mame_set_rom(bank, ptr, data.length);
  }

  /**
   * Send MIDI/SysEx event to the instance
   */
  public addMidiEvent(handle: number, data: Uint8Array): void {
    if (!this.isInitialized || handle === 0) return;

    const ptr = this.module._malloc(data.length);
    this.module.HEAPU8.set(data, ptr);
    this.module._mame_add_midi_event(handle, ptr, data.length);
    this.module._free(ptr);
  }

  /**
   * Load specialized Roland SA ROMs
   */
  public rsaLoadRoms(handle: number, ic5: Uint8Array, ic6: Uint8Array, ic7: Uint8Array): void {
    if (!this.isInitialized || handle === 0) return;

    const ptr5 = this.module._malloc(ic5.length);
    const ptr6 = this.module._malloc(ic6.length);
    const ptr7 = this.module._malloc(ic7.length);

    this.module.HEAPU8.set(ic5, ptr5);
    this.module.HEAPU8.set(ic6, ptr6);
    this.module.HEAPU8.set(ic7, ptr7);

    this.module._rsa_load_roms(handle, ptr5, ptr6, ptr7);
  }

  /**
   * Render audio
   */
  public render(handle: number, numSamples: number = 128): { left: Float32Array, right: Float32Array } {
    if (!this.isInitialized || handle === 0) {
      return { left: new Float32Array(numSamples), right: new Float32Array(numSamples) };
    }

    const leftPtr = this.module._malloc(numSamples * 4);
    const rightPtr = this.module._malloc(numSamples * 4);

    this.module._mame_render(handle, leftPtr, rightPtr, numSamples);

    const left = new Float32Array(this.module.HEAPF32.buffer, leftPtr, numSamples).slice();
    const right = new Float32Array(this.module.HEAPF32.buffer, rightPtr, numSamples).slice();

    this.module._free(leftPtr);
    this.module._free(rightPtr);

    return { left, right };
  }
}
