/**
 * MAMEChips AudioWorklet Processor
 * Handles ES5506 (VFX), ES5503 (DOC), Roland SA (D-50), SWP30 (MU-2000), etc.
 */

// Synth type constants (must match MAMEChips.cpp)
const SynthType = {
  VFX: 0,      // ES5506 (Ensoniq VFX/TS-10)
  DOC: 1,      // ES5503 (Ensoniq DOC/Mirage)
  RSA: 2,      // Roland SA (D-50/D-550)
  SWP30: 3,    // Yamaha SWP30 (MU-2000)
  SEGAPCM: 4,  // Sega PCM
  GA20: 5,     // Irem GA20
  UPD933: 6    // Casio CZ Phase Distortion
};

class MAMEChipsProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.wasmModule = null;
    this.isInitialized = false;
    this.instances = new Map(); // synthType -> handle

    // Output buffers
    this.leftBuffer = null;
    this.rightBuffer = null;
    this.leftPtr = 0;
    this.rightPtr = 0;

    // Pending operations
    this.pendingOps = [];

    this.port.onmessage = this.handleMessage.bind(this);
  }

  async handleMessage(event) {
    const { type, synthType, offset, value, data, romData, ic5, ic6, ic7 } = event.data;

    switch (type) {
      case 'init':
        await this.initWasm(event.data.wasmBinary, event.data.jsCode);
        break;

      case 'createInstance':
        this.createInstance(synthType, event.data.clock);
        break;

      case 'deleteInstance':
        this.deleteInstance(synthType);
        break;

      case 'write':
        this.pendingOps.push({ type: 'write', synthType, offset, value });
        break;

      case 'write16':
        this.pendingOps.push({ type: 'write16', synthType, offset, value });
        break;

      case 'setRom':
        this.setRom(event.data.bank, romData);
        break;

      case 'loadRSARoms':
        this.loadRSARoms(ic5, ic6, ic7);
        break;

      case 'getStatus':
        this.port.postMessage({
          type: 'status',
          initialized: this.isInitialized,
          instances: Array.from(this.instances.keys())
        });
        break;
    }
  }

  async initWasm(wasmBinary, jsCode) {
    try {
      if (!wasmBinary) {
        // Fetch WASM if not provided
        const response = await fetch('/mame/MAMEChips.wasm');
        wasmBinary = await response.arrayBuffer();
      }

      // Create module from JS code or fetch it
      let moduleFactory;
      if (jsCode) {
        // Evaluate the JS module code
        const blob = new Blob([jsCode], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        moduleFactory = (await import(url)).default;
        URL.revokeObjectURL(url);
      } else {
        // Minimal instantiation
        const wasmModule = await WebAssembly.compile(wasmBinary);
        const memory = new WebAssembly.Memory({ initial: 512, maximum: 2048 });

        this.wasmInstance = await WebAssembly.instantiate(wasmModule, {
          env: {
            memory,
            emscripten_memcpy_js: (dest, src, num) => {
              const heap = new Uint8Array(memory.buffer);
              heap.copyWithin(dest, src, src + num);
            },
            emscripten_resize_heap: () => 0,
            _abort: () => { throw new Error('abort'); },
          },
          wasi_snapshot_preview1: {
            fd_write: () => 0,
            fd_close: () => 0,
            fd_seek: () => 0,
            proc_exit: () => {},
          }
        });

        // Allocate output buffers
        this.allocateBuffers(128);

        this.isInitialized = true;
        this.port.postMessage({ type: 'initialized' });
        console.log('[MAMEChips.worklet] WASM initialized (minimal)');
        return;
      }

      // Full Emscripten module initialization
      this.wasmModule = await moduleFactory({
        wasmBinary,
        noInitialRun: true,
        noExitRuntime: true,
      });

      // Allocate output buffers
      this.allocateBuffers(128);

      this.isInitialized = true;
      this.port.postMessage({ type: 'initialized' });
      console.log('[MAMEChips.worklet] WASM initialized');

    } catch (err) {
      console.error('[MAMEChips.worklet] Init error:', err);
      this.port.postMessage({ type: 'error', message: err.message });
    }
  }

  allocateBuffers(numSamples) {
    if (!this.wasmModule && !this.wasmInstance) return;

    const mod = this.wasmModule || this.wasmInstance.exports;

    // Allocate left and right output buffers
    this.leftPtr = mod._malloc(numSamples * 4);
    this.rightPtr = mod._malloc(numSamples * 4);

    this.bufferSize = numSamples;
  }

  createInstance(synthType, clock) {
    if (!this.isInitialized) return;

    const mod = this.wasmModule || this.wasmInstance.exports;
    const handle = mod._mame_create_instance(synthType, clock);

    if (handle > 0) {
      this.instances.set(synthType, handle);
      console.log(`[MAMEChips.worklet] Created instance type=${synthType} handle=${handle}`);
    }
  }

  deleteInstance(synthType) {
    if (!this.isInitialized) return;

    const handle = this.instances.get(synthType);
    if (handle) {
      const mod = this.wasmModule || this.wasmInstance.exports;
      mod._mame_delete_instance(handle);
      this.instances.delete(synthType);
    }
  }

  setRom(bank, romData) {
    if (!this.isInitialized) return;

    const mod = this.wasmModule || this.wasmInstance.exports;
    const ptr = mod._malloc(romData.byteLength);
    const heap = new Uint8Array(mod.HEAPU8.buffer);
    heap.set(new Uint8Array(romData), ptr);
    mod._mame_set_rom(bank, ptr, romData.byteLength);

    console.log(`[MAMEChips.worklet] ROM bank ${bank} loaded: ${romData.byteLength} bytes`);
  }

  loadRSARoms(ic5, ic6, ic7) {
    if (!this.isInitialized) return;

    const handle = this.instances.get(SynthType.RSA);
    if (!handle) return;

    const mod = this.wasmModule || this.wasmInstance.exports;

    const ptr5 = mod._malloc(ic5.byteLength);
    const ptr6 = mod._malloc(ic6.byteLength);
    const ptr7 = mod._malloc(ic7.byteLength);

    const heap = new Uint8Array(mod.HEAPU8.buffer);
    heap.set(new Uint8Array(ic5), ptr5);
    heap.set(new Uint8Array(ic6), ptr6);
    heap.set(new Uint8Array(ic7), ptr7);

    mod._rsa_load_roms(handle, ptr5, ptr6, ptr7);

    console.log('[MAMEChips.worklet] Roland SA ROMs loaded');
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const left = output[0];
    const right = output[1] || left;
    const numSamples = left.length;

    if (!this.isInitialized) {
      left.fill(0);
      right.fill(0);
      return true;
    }

    const mod = this.wasmModule || this.wasmInstance.exports;

    // Process pending operations
    while (this.pendingOps.length > 0) {
      const op = this.pendingOps.shift();
      const handle = this.instances.get(op.synthType);
      if (!handle) continue;

      if (op.type === 'write') {
        mod._mame_write(handle, op.offset, op.value);
      } else if (op.type === 'write16') {
        mod._mame_write16(handle, op.offset, op.value);
      }
    }

    // Reallocate buffers if size changed
    if (numSamples !== this.bufferSize) {
      if (this.leftPtr) mod._free(this.leftPtr);
      if (this.rightPtr) mod._free(this.rightPtr);
      this.allocateBuffers(numSamples);
    }

    // Clear output
    left.fill(0);
    right.fill(0);

    // Render each active instance and mix
    for (const [synthType, handle] of this.instances) {
      mod._mame_render(handle, this.leftPtr, this.rightPtr, numSamples);

      // Get rendered audio from WASM heap
      const heap = new Float32Array(mod.HEAPF32.buffer);
      const leftOffset = this.leftPtr / 4;
      const rightOffset = this.rightPtr / 4;

      // Mix into output
      for (let i = 0; i < numSamples; i++) {
        left[i] += heap[leftOffset + i];
        right[i] += heap[rightOffset + i];
      }
    }

    // Clamp output
    for (let i = 0; i < numSamples; i++) {
      left[i] = Math.max(-1, Math.min(1, left[i]));
      right[i] = Math.max(-1, Math.min(1, right[i]));
    }

    return true;
  }
}

registerProcessor('mame-chips-processor', MAMEChipsProcessor);
