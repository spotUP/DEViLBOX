/**
 * OBXd.worklet.js - Oberheim OB-X Synthesizer AudioWorklet Processor
 * Loads and runs the OB-Xd WASM module
 *
 * WASM binary and JS code are received via postMessage to avoid
 * dynamic import which is not allowed in WorkletGlobalScope.
 */

// Track processor registration
let processorRegistered = false;

class OBXdProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.synth = null;
    this.isInitialized = false;
    this.pendingMessages = [];
    this.outputBufferL = null;
    this.outputBufferR = null;

    this.port.onmessage = this.handleMessage.bind(this);
  }

  async handleMessage(event) {
    const { type, ...data } = event.data;

    switch (type) {
      case 'init':
        await this.initialize(data);
        break;

      case 'noteOn':
        if (this.synth && this.isInitialized) {
          this.synth.noteOn(data.note, data.velocity || 100);
        } else {
          this.pendingMessages.push(event.data);
        }
        break;

      case 'noteOff':
        if (this.synth && this.isInitialized) {
          this.synth.noteOff(data.note);
        }
        break;

      case 'allNotesOff':
        if (this.synth && this.isInitialized) {
          this.synth.allNotesOff();
        }
        break;

      case 'parameter':
        if (this.synth && this.isInitialized) {
          this.synth.setParameter(data.paramId, data.value);
        }
        break;

      case 'controlChange':
        if (this.synth && this.isInitialized) {
          this.synth.controlChange(data.cc, data.value);
        }
        break;

      case 'pitchBend':
        if (this.synth && this.isInitialized) {
          this.synth.pitchBend(data.value);
        }
        break;

      case 'setPreset':
        if (this.synth && this.isInitialized && data.preset) {
          // Apply all preset parameters
          for (const [paramId, value] of Object.entries(data.preset)) {
            this.synth.setParameter(parseInt(paramId), value);
          }
        }
        break;

      case 'dispose':
        this.cleanup();
        break;
    }
  }

  cleanup() {
    if (this.Module && this.outputPtrL) {
      this.Module._free(this.outputPtrL);
      this.outputPtrL = 0;
    }
    if (this.Module && this.outputPtrR) {
      this.Module._free(this.outputPtrR);
      this.outputPtrR = 0;
    }
    this.outputBufferL = null;
    this.outputBufferR = null;
    this.synth = null;
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
        const wrappedCode = `${jsCode}; return typeof createOBXdModule !== 'undefined' ? createOBXdModule : (typeof Module !== 'undefined' ? Module : null);`;
        createModule = new Function(wrappedCode)();
      } catch (evalErr) {
        console.error('Failed to evaluate OBXd JS:', evalErr);
        throw new Error('Could not evaluate OBXd module factory');
      }

      if (!createModule) {
        throw new Error('Could not load OBXd module factory');
      }

      // Intercept WebAssembly.instantiate to capture WASM memory
      // (Emscripten doesn't export HEAPF32/wasmMemory on Module object)
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

      // Initialize the WASM module with the provided binary
      let Module;
      try {
        Module = await createModule({ wasmBinary });
      } finally {
        WebAssembly.instantiate = origInstantiate;
      }

      // Create synth instance
      this.synth = new Module.OBXdSynth();
      this.synth.initialize(sampleRate);

      // Allocate output buffers in WASM memory
      const bufferSize = 128 * 4; // 128 samples * 4 bytes per float
      this.outputPtrL = Module._malloc(bufferSize);
      this.outputPtrR = Module._malloc(bufferSize);

      // Get WASM memory buffer - try multiple sources:
      // 1. Module.HEAPF32 (standard Emscripten export)
      // 2. Module.wasmMemory (exposed via JS preprocessing)
      // 3. capturedMemory (intercepted from WebAssembly.instantiate)
      const wasmMem = Module.wasmMemory || capturedMemory;
      const heapBuffer = Module.HEAPF32
        ? Module.HEAPF32.buffer
        : (wasmMem ? wasmMem.buffer : null);

      if (!heapBuffer) {
        throw new Error('Cannot access WASM memory buffer');
      }

      // Store the memory reference for buffer regeneration in process()
      this._wasmMemory = wasmMem;

      // Create typed array views into WASM memory
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
      console.error('OBXd initialization error:', error);
      this.port.postMessage({
        type: 'error',
        error: error.message
      });
    }
  }

  process(inputs, outputs, parameters) {
    if (!this.synth || !this.isInitialized) {
      return true;
    }

    const outputL = outputs[0][0];
    const outputR = outputs[0][1] || outputs[0][0];
    const numSamples = outputL.length;

    try {
      // Process audio through WASM
      this.synth.process(this.outputPtrL, this.outputPtrR, numSamples);

      // Copy from WASM memory to output
      // Need to recreate views if WASM memory was resized
      const currentBuffer = this._wasmMemory ? this._wasmMemory.buffer : (this.Module.HEAPF32 ? this.Module.HEAPF32.buffer : null);
      if (currentBuffer && this.outputBufferL.buffer !== currentBuffer) {
        this.outputBufferL = new Float32Array(currentBuffer, this.outputPtrL, 128);
        this.outputBufferR = new Float32Array(currentBuffer, this.outputPtrR, 128);
      }

      outputL.set(this.outputBufferL.subarray(0, numSamples));
      outputR.set(this.outputBufferR.subarray(0, numSamples));

    } catch (error) {
      console.error('OBXd process error:', error);
    }

    return true;
  }
}

// Register processor only once
if (!processorRegistered) {
  registerProcessor('obxd-processor', OBXdProcessor);
  processorRegistered = true;
}
