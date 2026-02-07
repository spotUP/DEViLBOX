/**
 * MAMEEngine - TypeScript wrapper for the MAME WASM modules
 * Supports multiple instances via handles.
 */
export const MAMESynthType = {
  VFX: 'vfx',           // ES5506 (Ensoniq VFX/TS-10)
  DOC: 'doc',           // ES5503 (Ensoniq DOC/Mirage)
  RSA: 'rsa',           // Roland SA (D-50/D-550)
  SWP30: 'swp30',       // Yamaha SWP30 (MU-2000)
  SEGAPCM: 'segapcm',   // Sega PCM (Out Run, After Burner)
  GA20: 'ga20',         // Irem GA20 (R-Type Leo, In The Hunt)
  UPD933: 'upd933',     // Casio CZ Phase Distortion (CZ-101/1000)
} as const;

export type MAMESynthType = typeof MAMESynthType[keyof typeof MAMESynthType];

const TYPE_MAP: Record<MAMESynthType, number> = {
  'vfx': 0,
  'doc': 1,
  'rsa': 2,
  'swp30': 3,
  'segapcm': 4,
  'ga20': 5,
  'upd933': 6
};

export class MAMEEngine {
  private static instance: MAMEEngine;
  private module: any = null;
  private isInitialized: boolean = false;
  private heapU8: Uint8Array | null = null;

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

    const baseUrl = import.meta.env?.BASE_URL || '/';

    try {
      // Load the Emscripten module JS code
      const response = await fetch(`${baseUrl}mame/MAMEChips.js`);
      const jsCode = await response.text();

      // Evaluate the IIFE and extract the MAMEChips factory function
      // The Emscripten-generated code is an IIFE that assigns to var MAMEChips
      // We wrap it to capture and return the function
      const wrappedCode = `${jsCode}; return MAMEChips;`;
      const moduleFactory = new Function(wrappedCode)();

      // Fetch WASM binary
      const wasmResponse = await fetch(`${baseUrl}mame/MAMEChips.wasm`);
      const wasmBinary = await wasmResponse.arrayBuffer();

      // Initialize the module
      this.module = await moduleFactory({ wasmBinary });

      // Create HEAP view from wasmMemory (HEAPU8 is not exported, but wasmMemory is)
      if (this.module.wasmMemory) {
        this.heapU8 = new Uint8Array(this.module.wasmMemory.buffer);
      }

      this.isInitialized = true;
      console.log('🎹 MAMEEngine: WASM Module Loaded (Multi-Instance)');
    } catch (err) {
      console.error('MAMEEngine init failed:', err);
      throw new Error(`MAMEChips WASM failed to load: ${err}`);
    }
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
    if (!this.isInitialized || !this.heapU8) return;

    const ptr = this.module._malloc(data.length);
    this.heapU8.set(data, ptr);
    this.module._mame_set_rom(bank, ptr, data.length);
  }

  /**
   * Send MIDI/SysEx event to the instance
   */
  public addMidiEvent(handle: number, data: Uint8Array): void {
    if (!this.isInitialized || handle === 0 || !this.heapU8) return;

    const ptr = this.module._malloc(data.length);
    this.heapU8.set(data, ptr);
    this.module._mame_add_midi_event(handle, ptr, data.length);
    this.module._free(ptr);
  }

  /**
   * Load specialized Roland SA ROMs
   */
  public rsaLoadRoms(handle: number, ic5: Uint8Array, ic6: Uint8Array, ic7: Uint8Array): void {
    if (!this.isInitialized || handle === 0 || !this.heapU8) return;

    const ptr5 = this.module._malloc(ic5.length);
    const ptr6 = this.module._malloc(ic6.length);
    const ptr7 = this.module._malloc(ic7.length);

    this.heapU8.set(ic5, ptr5);
    this.heapU8.set(ic6, ptr6);
    this.heapU8.set(ic7, ptr7);

    this.module._rsa_load_roms(handle, ptr5, ptr6, ptr7);
  }

  /**
   * Render audio
   */
  public render(handle: number, numSamples: number = 128): { left: Float32Array, right: Float32Array } {
    if (!this.isInitialized || handle === 0 || !this.module.wasmMemory) {
      return { left: new Float32Array(numSamples), right: new Float32Array(numSamples) };
    }

    const leftPtr = this.module._malloc(numSamples * 4);
    const rightPtr = this.module._malloc(numSamples * 4);

    this.module._mame_render(handle, leftPtr, rightPtr, numSamples);

    const buffer = this.module.wasmMemory.buffer;
    const left = new Float32Array(buffer, leftPtr, numSamples).slice();
    const right = new Float32Array(buffer, rightPtr, numSamples).slice();

    this.module._free(leftPtr);
    this.module._free(rightPtr);

    return { left, right };
  }
}
