/**
 * MoogFilters.worklet.js - Moog Ladder Filter AudioWorklet Effect Processor
 * Loads and runs the MoogFilters WASM module as an audio EFFECT (input -> output).
 *
 * Unlike synth worklets (output only), this processes input audio through
 * the WASM filter and writes to output.
 *
 * WASM binary and JS code are received via postMessage.
 */

let processorRegistered = false;

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
  }

  async initialize(data) {
    try {
      const { wasmBinary, jsCode } = data;

      if (!wasmBinary || !jsCode) {
        throw new Error('Missing wasmBinary or jsCode in init message');
      }

      // Evaluate the JS code to get the module factory
      let createModule;
      try {
        const wrappedCode = `${jsCode}; return typeof createMoogFiltersModule !== 'undefined' ? createMoogFiltersModule : (typeof Module !== 'undefined' ? Module : null);`;
        createModule = new Function(wrappedCode)();
      } catch (evalErr) {
        console.error('Failed to evaluate MoogFilters JS:', evalErr);
        throw new Error('Could not evaluate MoogFilters module factory');
      }

      if (!createModule) {
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

      // Initialize the WASM module
      let Module;
      try {
        Module = await createModule({ wasmBinary });
      } finally {
        WebAssembly.instantiate = origInstantiate;
      }

      // Create effect instance
      this.effect = new Module.MoogFiltersEffect();
      this.effect.initialize(sampleRate);

      // Allocate input AND output buffers in WASM memory (4 buffers for stereo effect)
      const bufferSize = 128 * 4; // 128 samples * 4 bytes per float
      this.inputPtrL = Module._malloc(bufferSize);
      this.inputPtrR = Module._malloc(bufferSize);
      this.outputPtrL = Module._malloc(bufferSize);
      this.outputPtrR = Module._malloc(bufferSize);

      // Get WASM memory buffer
      const wasmMem = Module.wasmMemory || capturedMemory;
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
