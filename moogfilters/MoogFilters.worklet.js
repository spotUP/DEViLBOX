/**
 * MoogFilters.worklet.js - Moog Ladder Filter AudioWorklet Effect Processor
 * Loads and runs the MoogFilters WASM module as an audio EFFECT (input -> output).
 *
 * IMPORTANT: Shares a single WASM module across all processor instances to avoid
 * AudioWorklet memory exhaustion (each Emscripten module allocates ~16MB).
 *
 * WASM binary and JS code are received via postMessage.
 */

// Polyfill URL for AudioWorklet scope — Emscripten's findWasmBinary() calls
// new URL('file.wasm', base) even when wasmBinary is provided directly.
// We just need it to not crash; the URL is never actually fetched.
if (typeof URL === 'undefined') {
  globalThis.URL = class URL {
    constructor(path, base) {
      this.href = base ? (base + '/' + path) : path;
      this.pathname = path;
    }
    toString() { return this.href; }
  };
}

let processorRegistered = false;

// Shared WASM module (single instance for all processors)
let sharedModule = null;
let sharedModulePromise = null;

async function getOrCreateModule(wasmBinary, jsCode) {
  // Return cached module if already initialized
  if (sharedModule) return sharedModule;

  // If initialization is in progress, wait for it
  if (sharedModulePromise) return sharedModulePromise;

  sharedModulePromise = (async () => {
    // Evaluate the JS code to get the module factory
    let createModule;
    try {
      const wrappedCode = `${jsCode}; return typeof createMoogFiltersModule !== 'undefined' ? createMoogFiltersModule : (typeof Module !== 'undefined' ? Module : null);`;
      createModule = new Function(wrappedCode)();
    } catch (evalErr) {
      console.error('Failed to evaluate MoogFilters JS:', evalErr);
      sharedModulePromise = null;
      throw new Error('Could not evaluate MoogFilters module factory');
    }

    if (!createModule) {
      sharedModulePromise = null;
      throw new Error('Could not load MoogFilters module factory');
    }

    // Intercept WebAssembly.instantiate to capture WASM memory
    let capturedMemory = null;
    const origInstantiate = WebAssembly.instantiate;
    WebAssembly.instantiate = async function(...args) {
      const result = await origInstantiate.apply(this, args);
      const instance = result.instance || result;
      if (instance.exports) {
        for (const value of Object.values(instance.exports)) {
          if (value instanceof WebAssembly.Memory) {
            capturedMemory = value;
            break;
          }
        }
      }
      return result;
    };

    let Module;
    try {
      Module = await createModule({ wasmBinary });
    } finally {
      WebAssembly.instantiate = origInstantiate;
    }

    // Store captured memory on Module for later use
    if (capturedMemory && !Module.wasmMemory) {
      Module.wasmMemory = capturedMemory;
    }

    sharedModule = Module;
    return Module;
  })();

  return sharedModulePromise;
}

class MoogFiltersProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.effect = null;
    this.isInitialized = false;
    this.pendingMessages = [];
    this.Module = null;

    // WASM buffer pointers
    this.inputPtrL = 0;
    this.inputPtrR = 0;
    this.outputPtrL = 0;
    this.outputPtrR = 0;

    // Typed array views into WASM memory
    this.inputBufferL = null;
    this.inputBufferR = null;
    this.outputBufferL = null;
    this.outputBufferR = null;

    this._wasmMemory = null;

    this.port.onmessage = this.handleMessage.bind(this);
  }

  async handleMessage(event) {
    const { type, ...data } = event.data;

    switch (type) {
      case 'init':
        await this.initialize(data);
        break;

      case 'parameter':
        if (this.effect && this.isInitialized) {
          this.effect.setParameter(data.paramId, data.value);
        } else {
          this.pendingMessages.push(event.data);
        }
        break;

      case 'dispose':
        this.cleanup();
        break;
    }
  }

  cleanup() {
    if (this.Module) {
      if (this.inputPtrL) this.Module._free(this.inputPtrL);
      if (this.inputPtrR) this.Module._free(this.inputPtrR);
      if (this.outputPtrL) this.Module._free(this.outputPtrL);
      if (this.outputPtrR) this.Module._free(this.outputPtrR);
    }
    this.inputPtrL = 0;
    this.inputPtrR = 0;
    this.outputPtrL = 0;
    this.outputPtrR = 0;
    this.inputBufferL = null;
    this.inputBufferR = null;
    this.outputBufferL = null;
    this.outputBufferR = null;
    // Call .delete() on Embind object to invoke C++ destructor
    if (this.effect) {
      try { this.effect.delete(); } catch(_) {}
    }
    this.effect = null;
    this.isInitialized = false;
    // Note: Do NOT null out this.Module — it's shared across instances
  }

  async initialize(data) {
    try {
      const { wasmBinary, jsCode } = data;

      if (!wasmBinary || !jsCode) {
        throw new Error('Missing wasmBinary or jsCode in init message');
      }

      // Get or create the shared WASM module (single instance for all processors)
      const Module = await getOrCreateModule(wasmBinary, jsCode);

      // Create a NEW effect instance from the shared module
      this.effect = new Module.MoogFiltersEffect();
      this.effect.initialize(sampleRate);

      // Allocate input AND output buffers in WASM memory (4 buffers for stereo effect)
      const bufferSize = 128 * 4; // 128 samples * 4 bytes per float
      this.inputPtrL = Module._malloc(bufferSize);
      this.inputPtrR = Module._malloc(bufferSize);
      this.outputPtrL = Module._malloc(bufferSize);
      this.outputPtrR = Module._malloc(bufferSize);

      // Get WASM memory buffer
      const wasmMem = Module.wasmMemory;
      const heapBuffer = Module.HEAPF32
        ? Module.HEAPF32.buffer
        : (wasmMem ? wasmMem.buffer : null);

      if (!heapBuffer) {
        throw new Error('Cannot access WASM memory buffer');
      }

      this._wasmMemory = wasmMem;

      // Create typed array views into WASM memory
      this.inputBufferL = new Float32Array(heapBuffer, this.inputPtrL, 128);
      this.inputBufferR = new Float32Array(heapBuffer, this.inputPtrR, 128);
      this.outputBufferL = new Float32Array(heapBuffer, this.outputPtrL, 128);
      this.outputBufferR = new Float32Array(heapBuffer, this.outputPtrR, 128);

      this.Module = Module;
      this.isInitialized = true;

      // Process any pending messages
      for (const msg of this.pendingMessages) {
        this.handleMessage({ data: msg });
      }
      this.pendingMessages = [];

      // Notify main thread
      this.port.postMessage({ type: 'ready' });

    } catch (error) {
      console.error('MoogFilters initialization error:', error);
      this.port.postMessage({
        type: 'error',
        error: error.message
      });
    }
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    const outputL = output[0];
    const outputR = output[1] || output[0];

    // If no input connected or no effect ready, passthrough silence
    if (!input || !input[0] || !input[0].length) {
      if (outputL) outputL.fill(0);
      if (outputR) outputR.fill(0);
      return true;
    }

    const inputL = input[0];
    const inputR = input[1] || input[0]; // Mono->stereo if needed
    const numSamples = inputL.length;

    if (!this.effect || !this.isInitialized) {
      // Passthrough when WASM not ready
      outputL.set(inputL);
      outputR.set(inputR);
      return true;
    }

    try {
      // Recreate views if WASM memory was resized
      const currentBuffer = this._wasmMemory
        ? this._wasmMemory.buffer
        : (this.Module.HEAPF32 ? this.Module.HEAPF32.buffer : null);

      if (currentBuffer && this.inputBufferL.buffer !== currentBuffer) {
        this.inputBufferL = new Float32Array(currentBuffer, this.inputPtrL, 128);
        this.inputBufferR = new Float32Array(currentBuffer, this.inputPtrR, 128);
        this.outputBufferL = new Float32Array(currentBuffer, this.outputPtrL, 128);
        this.outputBufferR = new Float32Array(currentBuffer, this.outputPtrR, 128);
      }

      // Copy input audio into WASM memory
      this.inputBufferL.set(inputL.subarray(0, numSamples));
      this.inputBufferR.set(inputR.subarray(0, numSamples));

      // Process through WASM effect (input -> output)
      this.effect.process(
        this.inputPtrL, this.inputPtrR,
        this.outputPtrL, this.outputPtrR,
        numSamples
      );

      // Copy WASM output to Web Audio output
      outputL.set(this.outputBufferL.subarray(0, numSamples));
      outputR.set(this.outputBufferR.subarray(0, numSamples));

      // DIAGNOSTIC: Log input/output peak levels every 500 frames (~5sec)
      if (!this._diagCounter) this._diagCounter = 0;
      this._diagCounter++;
      if (this._diagCounter % 500 === 0) {
        let maxIn = 0, maxOut = 0;
        for (let i = 0; i < numSamples; i++) {
          maxIn = Math.max(maxIn, Math.abs(inputL[i]));
          maxOut = Math.max(maxOut, Math.abs(outputL[i]));
        }
        console.warn('[MoogWorklet] frame', this._diagCounter,
          'inPeak:', maxIn.toFixed(6), 'outPeak:', maxOut.toFixed(6),
          'init:', this.isInitialized, 'hasEffect:', !!this.effect);
      }

    } catch (error) {
      // Passthrough on error
      outputL.set(inputL);
      outputR.set(inputR);
    }

    return true;
  }
}

// Register processor only once
if (!processorRegistered) {
  registerProcessor('moogfilters-processor', MoogFiltersProcessor);
  processorRegistered = true;
}
