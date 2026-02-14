/**
 * Shared MAME WASM module initialization for AudioWorklet processors.
 *
 * This file is imported by each chip's worklet.js file.
 * It provides a single function that:
 *  1. Evaluates the preprocessed Emscripten JS via new Function()
 *  2. Intercepts WebAssembly.instantiate to capture WASM memory
 *  3. Calls the factory with { wasmBinary } to get the Module
 *  4. Returns the Module with captured memory attached
 *
 * Usage in worklet:
 *   const Module = await globalThis.initMAMEWasmModule(wasmBinary, jsCode, 'createAICAModule');
 */

/**
 * Oscilloscope mixin for worklet processors.
 * Provides standardized waveform buffer capture and transmission.
 *
 * Usage in worklet:
 *   1. In constructor: OscilloscopeMixin.init(this);
 *   2. In handleMessage: add case 'enableOsc': this.oscEnabled = data.enabled; break;
 *   3. In process: OscilloscopeMixin.capture(this, outputL);
 */
globalThis.OscilloscopeMixin = {
  OSC_BUFFER_SIZE: 256,
  OSC_SEND_INTERVAL: 3, // Send every N frames (~20Hz at 128 samples/frame)

  /**
   * Initialize oscilloscope state on processor instance
   */
  init(processor) {
    processor.oscEnabled = false;
    processor.oscBuffer = new Float32Array(this.OSC_BUFFER_SIZE);
    processor.oscFrameCount = 0;
  },

  /**
   * Capture waveform data and send to main thread
   * Call this at the end of process() with the output buffer
   */
  capture(processor, outputBuffer) {
    if (!processor.oscEnabled) return;

    processor.oscFrameCount++;
    if (processor.oscFrameCount < this.OSC_SEND_INTERVAL) return;
    processor.oscFrameCount = 0;

    // Copy samples to oscilloscope buffer
    const copyLen = Math.min(outputBuffer.length, this.OSC_BUFFER_SIZE);
    for (let i = 0; i < copyLen; i++) {
      processor.oscBuffer[i] = outputBuffer[i];
    }

    // Zero-pad if output is smaller than osc buffer
    for (let i = copyLen; i < this.OSC_BUFFER_SIZE; i++) {
      processor.oscBuffer[i] = 0;
    }

    // Send to main thread (transfer buffer copy for performance)
    const bufferCopy = processor.oscBuffer.slice().buffer;
    processor.port.postMessage({
      type: 'oscData',
      buffer: bufferCopy
    }, [bufferCopy]);
  }
};

globalThis.initMAMEWasmModule = async function initMAMEWasmModule(wasmBinary, jsCode, factoryName) {
  if (!wasmBinary || !jsCode) {
    throw new Error('Missing wasmBinary or jsCode');
  }

  // Evaluate the preprocessed JS to get the module factory function
  let createModule;
  try {
    const wrappedCode = `${jsCode}; return typeof ${factoryName} !== 'undefined' ? ${factoryName} : (typeof Module !== 'undefined' ? Module : null);`;
    createModule = new Function(wrappedCode)();
  } catch (evalErr) {
    throw new Error(`Could not evaluate ${factoryName}: ${evalErr.message}`);
  }

  if (!createModule) {
    throw new Error(`Could not find factory function ${factoryName}`);
  }

  // Intercept WebAssembly.instantiate to capture WASM memory
  // (Emscripten doesn't always export wasmMemory on Module object)
  let capturedMemory = null;
  const origInstantiate = WebAssembly.instantiate;
  WebAssembly.instantiate = async function (...args) {
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

  // Attach captured memory for buffer view regeneration
  if (capturedMemory && !Module.wasmMemory) {
    Module.wasmMemory = capturedMemory;
  }

  return Module;
};
