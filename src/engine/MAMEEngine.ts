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

/** Emscripten WASM module interface for MAME chip emulation */
interface EmscriptenMAMEModule {
  wasmMemory: WebAssembly.Memory;
  _malloc(size: number): number;
  _free(ptr: number): void;
  _mame_create_instance(type: number, clock: number): number;
  _mame_delete_instance(handle: number): void;
  _mame_write(handle: number, offset: number, value: number): void;
  _mame_write16(handle: number, offset: number, value: number): void;
  _mame_read(handle: number, offset: number): number;
  _mame_set_rom(bank: number, ptr: number, length: number): void;
  _mame_add_midi_event(handle: number, ptr: number, length: number): void;
  _mame_render(handle: number, leftPtr: number, rightPtr: number, numSamples: number): void;
  _rsa_load_roms(handle: number, ptr5: number, ptr6: number, ptr7: number): void;
  [key: string]: unknown;
}

export class MAMEEngine {
  private static instance: MAMEEngine;
  private module: EmscriptenMAMEModule | null = null;
  private isInitialized: boolean = false;
  // heapU8 intentionally removed — always use fresh Uint8Array(module.wasmMemory.buffer)
  // after each _malloc to handle WASM heap growth correctly.

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

      // Intercept WebAssembly.instantiate to capture wasmMemory from exports.
      // The Emscripten JS does NOT expose wasmMemory on the Module object;
      // it's assigned as a local variable from wasmExports["c"]. We grab it here.
      let capturedMemory: WebAssembly.Memory | null = null;
      const origInstantiate = WebAssembly.instantiate.bind(WebAssembly);
      WebAssembly.instantiate = async function (...args: Parameters<typeof WebAssembly.instantiate>) {
        const result = await origInstantiate(...args);
        const inst = (result as { instance?: WebAssembly.Instance }).instance ?? result;
        if ((inst as WebAssembly.Instance).exports) {
          for (const v of Object.values((inst as WebAssembly.Instance).exports)) {
            if (v instanceof WebAssembly.Memory) { capturedMemory = v; break; }
          }
        }
        return result;
      } as typeof WebAssembly.instantiate;

      let mod: EmscriptenMAMEModule;
      try {
        mod = await moduleFactory({ wasmBinary }) as EmscriptenMAMEModule;
      } finally {
        WebAssembly.instantiate = origInstantiate;
      }

      // Attach captured memory so callers can always get a fresh heap view
      if (capturedMemory && !mod.wasmMemory) {
        mod.wasmMemory = capturedMemory;
      }

      this.module = mod;
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
    if (!this.isInitialized || !this.module) return 0;
    const typeInt = TYPE_MAP[type];
    return this.module._mame_create_instance(typeInt, clock);
  }

  /**
   * Delete a synth instance
   */
  public deleteInstance(handle: number): void {
    if (!this.isInitialized || handle === 0 || !this.module) return;
    this.module._mame_delete_instance(handle);
  }

  /**
   * Write to a chip register
   */
  public write(handle: number, offset: number, value: number): void {
    if (!this.isInitialized || handle === 0 || !this.module) return;
    this.module._mame_write(handle, offset, value);
  }

  /**
   * Write 16-bit word to a chip register
   */
  public write16(handle: number, offset: number, value: number): void {
    if (!this.isInitialized || handle === 0 || !this.module) return;
    this.module._mame_write16(handle, offset, value);
  }

  /**
   * Read from a chip register
   */
  public read(handle: number, offset: number): number {
    if (!this.isInitialized || handle === 0 || !this.module) return 0;
    return this.module._mame_read(handle, offset);
  }

  /**
   * Set a ROM bank
   */
  public setRom(bank: number, data: Uint8Array): void {
    if (!this.isInitialized || !this.module?.wasmMemory) return;

    const ptr = this.module._malloc(data.length);
    // Always create a fresh view after _malloc — heap may have grown, invalidating old views
    new Uint8Array(this.module.wasmMemory.buffer).set(data, ptr);
    this.module._mame_set_rom(bank, ptr, data.length);
  }

  /**
   * Send MIDI/SysEx event to the instance
   */
  public addMidiEvent(handle: number, data: Uint8Array): void {
    if (!this.isInitialized || handle === 0 || !this.module?.wasmMemory) return;

    const ptr = this.module._malloc(data.length);
    // Always create a fresh view after _malloc — heap may have grown, invalidating old views
    new Uint8Array(this.module.wasmMemory.buffer).set(data, ptr);
    this.module._mame_add_midi_event(handle, ptr, data.length);
    this.module._free(ptr);
  }

  /**
   * Load specialized Roland SA ROMs
   */
  public rsaLoadRoms(handle: number, ic5: Uint8Array, ic6: Uint8Array, ic7: Uint8Array): void {
    if (!this.isInitialized || handle === 0 || !this.module?.wasmMemory) return;

    const ptr5 = this.module._malloc(ic5.length);
    const ptr6 = this.module._malloc(ic6.length);
    const ptr7 = this.module._malloc(ic7.length);

    // Always create a fresh view after allocations — heap may have grown
    const heap = new Uint8Array(this.module.wasmMemory.buffer);
    heap.set(ic5, ptr5);
    heap.set(ic6, ptr6);
    heap.set(ic7, ptr7);

    this.module._rsa_load_roms(handle, ptr5, ptr6, ptr7);
  }

  /**
   * Render audio
   */
  public render(handle: number, numSamples: number = 128): { left: Float32Array, right: Float32Array } {
    if (!this.isInitialized || handle === 0 || !this.module || !this.module.wasmMemory) {
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
