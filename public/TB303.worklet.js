/**
 * TB303.worklet.js - Accurate Roland TB-303 Emulation (WASM Version)
 *
 * This version delegates the complex DSP math to a WebAssembly module
 * for maximum performance and 4x oversampling capability.
 */

class TB303Processor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    this.wasmLoaded = false;
    this.wasmInstance = null;
    this.voiceIndex = options?.processorOptions?.voiceIndex || 0;
    this.outputPtr = 0;
    this.bufferSize = 128;

    // Parameters
    this.noteNumber = 69;
    this.velocity = 0.5;
    this.accent = false;
    this.slide = false;
    this.noteOn = false;
    this.freq = 440.0;

    this.port.onmessage = (e) => this.handleMessage(e.data);
  }

  async initWasm(binary) {
    try {
      const imports = {
        env: {
          abort: (msg, file, line, col) => console.error(`WASM Abort: ${msg} at ${file}:${line}:${col}`),
        }
      };
      
      const { instance } = await WebAssembly.instantiate(binary, imports);
      this.wasmInstance = instance.exports;
      
      // Initialize unified DSP systems
      if (this.wasmInstance.init) this.wasmInstance.init();
      
      // Allocate output buffer
      this.outputPtr = this.wasmInstance.__new(this.bufferSize * 4, 1);
      
      // Initialize this specific voice
      this.wasmInstance.initVoice(this.voiceIndex, sampleRate);
      
      this.wasmLoaded = true;
      console.log(`🎹 TB303 Voice ${this.voiceIndex}: WASM Engine Active`);
    } catch (err) {
      console.error(`🎹 TB303 Voice ${this.voiceIndex}: WASM Init Failed:`, err);
    }
  }

  handleMessage(data) {
    const { type } = data;

    if (type === 'init' && data.wasmBinary) {
      this.initWasm(data.wasmBinary);
    } else if (type === 'noteOn') {
      this.noteNumber = data.note;
      this.velocity = data.velocity;
      this.accent = data.accent;
      this.slide = data.slide;
      this.noteOn = true;
      this.freq = 440.0 * Math.pow(2, (this.noteNumber - 69) / 12);
    } else if (type === 'noteOff') {
      this.noteOn = false;
    } else if (type === 'setParameter' && this.wasmLoaded) {
      // Direct pass-through to WASM for params if they match our AS implementation
      // For now, we'll just re-sync all params on change for simplicity
      this.updateWasmParams(data);
    }
  }

  updateWasmParams(data) {
    // This is a placeholder - in a real implementation we'd track all params
    // and call updateVoiceParams with the latest values.
    // For the POC, we'll assume the UI sends enough info.
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const outputChannel = output[0];

    if (!outputChannel || !this.wasmLoaded) {
      return true;
    }

    // Process in WASM
    this.wasmInstance.processVoice(
      this.voiceIndex, 
      this.outputPtr, 
      this.bufferSize, 
      this.freq, 
      this.noteOn, 
      sampleRate
    );

    // Copy output from WASM memory
    const wasmOutput = new Float32Array(this.wasmInstance.memory.buffer, this.outputPtr, this.bufferSize);
    outputChannel.set(wasmOutput);

    return true;
  }
}

try {
  registerProcessor('tb303-processor', TB303Processor);
} catch (e) {
  // Already registered
}