/**
 * ITFilter.worklet.js - High-Fidelity Impulse Tracker Resonant Filter (WASM Version)
 */

class ITFilterProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    
    this.wasmLoaded = false;
    this.wasmInstance = null;
    this.inputPtr = 0;
    this.outputPtr = 0;
    this.bufferSize = 128;

    this.port.onmessage = (e) => {
      const { type, wasmBinary } = e.data;
      if (type === 'init' && wasmBinary) {
        this.initWasm(wasmBinary);
      }
    };
  }

  async initWasm(binary) {
    try {
      const imports = {
        env: {
          abort: (msg, file, line, col) => console.error(`WASM Abort: ${msg} at ${file}:${line}:${col}`),
          "console.log": (msg) => console.log(msg)
        }
      };
      
      const { instance } = await WebAssembly.instantiate(binary, imports);
      this.wasmInstance = instance.exports;
      
      // Allocate memory for buffers
      // AssemblyScript Float32Array ID is 1
      this.inputPtr = this.wasmInstance.__new(this.bufferSize * 4, 1);
      this.outputPtr = this.wasmInstance.__new(this.bufferSize * 4, 1);
      
      this.wasmLoaded = true;
      console.log('🎹 ITFilter: WASM Engine Active');
    } catch (err) {
      console.error('🎹 ITFilter: WASM Init Failed:', err);
    }
  }

  static get parameterDescriptors() {
    return [
      { name: 'cutoff', defaultValue: 127, minValue: 0, maxValue: 127 },
      { name: 'resonance', defaultValue: 0, minValue: 0, maxValue: 127 }
    ];
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    
    if (!input || !input[0] || !this.wasmLoaded) return true;
    
    const cutoffs = parameters.cutoff;
    const resonances = parameters.resonance;
    
    const inputChannel = input[0];
    const outputChannel = output[0];
    const numSamples = inputChannel.length;

    // 1. Update Coefficients
    const c = cutoffs[0];
    const r = resonances[0];
    this.wasmInstance.updateCoefficients(c, r, sampleRate);

    // 2. Copy input to WASM memory
    const wasmInput = new Float32Array(this.wasmInstance.memory.buffer, this.inputPtr, numSamples);
    wasmInput.set(inputChannel);

    // 3. Process in WASM
    this.wasmInstance.processRaw(this.inputPtr, this.outputPtr, numSamples);

    // 4. Copy output from WASM memory
    const wasmOutput = new Float32Array(this.wasmInstance.memory.buffer, this.outputPtr, numSamples);
    outputChannel.set(wasmOutput);

    return true;
  }
}

try {
  registerProcessor('it-filter-processor', ITFilterProcessor);
} catch (e) {
  // Already registered
}
