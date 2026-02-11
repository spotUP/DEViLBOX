/**
 * SpringReverb.worklet.js - Spring Reverb AudioWorklet Effect Processor
 * WASM binary and JS code are received via postMessage.
 */

let processorRegistered = false;

class SpringReverbProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.effect = null;
    this.isInitialized = false;
    this.pendingMessages = [];
    this.Module = null;
    this.inputPtrL = 0;
    this.inputPtrR = 0;
    this.outputPtrL = 0;
    this.outputPtrR = 0;
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
      case 'init': await this.initialize(data); break;
      case 'parameter':
        if (this.effect && this.isInitialized) {
          this.effect.setParameter(data.paramId, data.value);
        } else {
          this.pendingMessages.push(event.data);
        }
        break;
      case 'dispose': this.cleanup(); break;
    }
  }

  cleanup() {
    if (this.Module) {
      if (this.inputPtrL) this.Module._free(this.inputPtrL);
      if (this.inputPtrR) this.Module._free(this.inputPtrR);
      if (this.outputPtrL) this.Module._free(this.outputPtrL);
      if (this.outputPtrR) this.Module._free(this.outputPtrR);
    }
    this.inputPtrL = 0; this.inputPtrR = 0;
    this.outputPtrL = 0; this.outputPtrR = 0;
    this.inputBufferL = null; this.inputBufferR = null;
    this.outputBufferL = null; this.outputBufferR = null;
    if (this.effect) { try { this.effect.delete(); } catch(_) {} }
    this.effect = null;
    this.isInitialized = false;
  }

  async initialize(data) {
    try {
      const { wasmBinary, jsCode } = data;
      if (!wasmBinary || !jsCode) throw new Error('Missing wasmBinary or jsCode');

      let createModule;
      try {
        const wrappedCode = `${jsCode}; return typeof createSpringReverbModule !== 'undefined' ? createSpringReverbModule : (typeof Module !== 'undefined' ? Module : null);`;
        createModule = new Function(wrappedCode)();
      } catch (evalErr) {
        throw new Error('Could not evaluate SpringReverb module factory');
      }
      if (!createModule) throw new Error('Could not load SpringReverb module factory');

      let capturedMemory = null;
      const origInstantiate = WebAssembly.instantiate;
      WebAssembly.instantiate = async function(...args) {
        const result = await origInstantiate.apply(this, args);
        const instance = result.instance || result;
        if (instance.exports) {
          for (const value of Object.values(instance.exports)) {
            if (value instanceof WebAssembly.Memory) { capturedMemory = value; break; }
          }
        }
        return result;
      };

      let Module;
      try { Module = await createModule({ wasmBinary }); }
      finally { WebAssembly.instantiate = origInstantiate; }

      this.effect = new Module.SpringReverbEffect();
      this.effect.initialize(sampleRate);

      const bufferSize = 128 * 4;
      this.inputPtrL = Module._malloc(bufferSize);
      this.inputPtrR = Module._malloc(bufferSize);
      this.outputPtrL = Module._malloc(bufferSize);
      this.outputPtrR = Module._malloc(bufferSize);

      const wasmMem = Module.wasmMemory || capturedMemory;
      const heapBuffer = Module.HEAPF32 ? Module.HEAPF32.buffer : (wasmMem ? wasmMem.buffer : null);
      if (!heapBuffer) throw new Error('Cannot access WASM memory buffer');
      this._wasmMemory = wasmMem;

      this.inputBufferL = new Float32Array(heapBuffer, this.inputPtrL, 128);
      this.inputBufferR = new Float32Array(heapBuffer, this.inputPtrR, 128);
      this.outputBufferL = new Float32Array(heapBuffer, this.outputPtrL, 128);
      this.outputBufferR = new Float32Array(heapBuffer, this.outputPtrR, 128);

      this.Module = Module;
      this.isInitialized = true;

      for (const msg of this.pendingMessages) this.handleMessage({ data: msg });
      this.pendingMessages = [];
      this.port.postMessage({ type: 'ready' });

    } catch (error) {
      console.error('SpringReverb initialization error:', error);
      this.port.postMessage({ type: 'error', error: error.message });
    }
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    const outputL = output[0];
    const outputR = output[1] || output[0];

    if (!input || !input[0] || !input[0].length) {
      if (outputL) outputL.fill(0);
      if (outputR) outputR.fill(0);
      return true;
    }

    const inputL = input[0];
    const inputR = input[1] || input[0];
    const numSamples = inputL.length;

    if (!this.effect || !this.isInitialized) {
      outputL.set(inputL);
      outputR.set(inputR);
      return true;
    }

    try {
      const currentBuffer = this._wasmMemory
        ? this._wasmMemory.buffer
        : (this.Module.HEAPF32 ? this.Module.HEAPF32.buffer : null);
      if (currentBuffer && this.inputBufferL.buffer !== currentBuffer) {
        this.inputBufferL = new Float32Array(currentBuffer, this.inputPtrL, 128);
        this.inputBufferR = new Float32Array(currentBuffer, this.inputPtrR, 128);
        this.outputBufferL = new Float32Array(currentBuffer, this.outputPtrL, 128);
        this.outputBufferR = new Float32Array(currentBuffer, this.outputPtrR, 128);
      }

      this.inputBufferL.set(inputL.subarray(0, numSamples));
      this.inputBufferR.set(inputR.subarray(0, numSamples));
      this.effect.process(this.inputPtrL, this.inputPtrR, this.outputPtrL, this.outputPtrR, numSamples);
      outputL.set(this.outputBufferL.subarray(0, numSamples));
      outputR.set(this.outputBufferR.subarray(0, numSamples));
    } catch (error) {
      outputL.set(inputL);
      outputR.set(inputR);
    }

    return true;
  }
}

if (!processorRegistered) {
  registerProcessor('springreverb-processor', SpringReverbProcessor);
  processorRegistered = true;
}
