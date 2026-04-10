/**
 * SpaceyDelayer AudioWorklet Processor
 * Multitap tape delay effect backed by WASM DSP engine.
 * Stereo in/out effect processing.
 *
 * Uses WebAssembly.instantiate interception to capture WASM memory
 * (Emscripten 4.x no longer auto-exports HEAPF32).
 */

// Polyfill URL for AudioWorklet scope
if (typeof URL === 'undefined') {
  globalThis.URL = class URL {
    constructor(path, base) {
      this.href = base ? (base + '/' + path) : path;
      this.pathname = path;
    }
    toString() { return this.href; }
  };
}

let sharedModule = null;
let sharedModulePromise = null;

async function getOrCreateModule(wasmBinary, jsCode) {
  if (sharedModule) return sharedModule;
  if (sharedModulePromise) return sharedModulePromise;

  sharedModulePromise = (async () => {
    const wrappedCode = jsCode + '\nreturn createSpaceyDelayer;';
    const createModule = new Function(wrappedCode)();

    if (typeof createModule !== 'function') {
      sharedModulePromise = null;
      throw new Error('Could not load SpaceyDelayer module factory');
    }

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

    if (capturedMemory && !Module.wasmMemory) {
      Module.wasmMemory = capturedMemory;
    }

    sharedModule = Module;
    return Module;
  })();

  return sharedModulePromise;
}

class SpaceyDelayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.module = null;
    this.initialized = false;
    this.handle = 0;
    this.bufferSize = 128;
    this._wasmMemory = null;

    this.inPtrL = 0;
    this.inPtrR = 0;
    this.outPtrL = 0;
    this.outPtrR = 0;
    this.inBufL = null;
    this.inBufR = null;
    this.outBufL = null;
    this.outBufR = null;

    this.wasm = null;
    this.pendingMessages = [];

    this.port.onmessage = (event) => {
      this.handleMessage(event.data);
    };
  }

  async handleMessage(data) {
    switch (data.type) {
      case 'init':
        await this.initModule(data.sampleRate, data.wasmBinary, data.jsCode);
        break;
      case 'setParameter':
        if (!this.initialized || !this.handle) {
          this.pendingMessages.push(data);
          return;
        }
        this.setParameter(data.param, data.value);
        break;
      case 'dispose':
        this.cleanup();
        break;
    }
  }

  async initModule(sr, wasmBinary, jsCode) {
    try {
      this.cleanup();

      const Module = await getOrCreateModule(wasmBinary, jsCode);
      this.module = Module;

      this.wasm = {
        create: Module._spacey_delayer_create,
        destroy: Module._spacey_delayer_destroy,
        process: Module._spacey_delayer_process,
        setFirstTap: Module._spacey_delayer_set_first_tap,
        setTapSize: Module._spacey_delayer_set_tap_size,
        setFeedback: Module._spacey_delayer_set_feedback,
        setWetness: Module._spacey_delayer_set_wetness,
        setMultiTap: Module._spacey_delayer_set_multi_tap,
        setTapeFilter: Module._spacey_delayer_set_tape_filter,
      };

      this.inPtrL = Module._malloc(this.bufferSize * 4);
      this.inPtrR = Module._malloc(this.bufferSize * 4);
      this.outPtrL = Module._malloc(this.bufferSize * 4);
      this.outPtrR = Module._malloc(this.bufferSize * 4);

      if (!this.inPtrL || !this.inPtrR || !this.outPtrL || !this.outPtrR) {
        throw new Error('WASM malloc failed: out of memory');
      }

      this.handle = this.wasm.create(sr || sampleRate);

      // Get WASM memory buffer
      const wasmMem = Module.wasmMemory;
      const heapBuffer = Module.HEAPF32
        ? Module.HEAPF32.buffer
        : (wasmMem ? wasmMem.buffer : null);

      if (!heapBuffer) {
        throw new Error('Cannot access WASM memory buffer');
      }

      this._wasmMemory = wasmMem;

      this.inBufL = new Float32Array(heapBuffer, this.inPtrL, this.bufferSize);
      this.inBufR = new Float32Array(heapBuffer, this.inPtrR, this.bufferSize);
      this.outBufL = new Float32Array(heapBuffer, this.outPtrL, this.bufferSize);
      this.outBufR = new Float32Array(heapBuffer, this.outPtrR, this.bufferSize);

      this.initialized = true;
      this.port.postMessage({ type: 'ready' });

      const pending = this.pendingMessages;
      this.pendingMessages = [];
      for (const msg of pending) {
        this.handleMessage(msg);
      }
    } catch (error) {
      console.error('[SpaceyDelayer Worklet] Init error:', error);
      this.port.postMessage({ type: 'error', message: error.message });
    }
  }

  setParameter(param, value) {
    if (!this.handle || !this.wasm) return;
    switch (param) {
      case 'firstTap':   this.wasm.setFirstTap(this.handle, value); break;
      case 'tapSize':    this.wasm.setTapSize(this.handle, value); break;
      case 'feedback':   this.wasm.setFeedback(this.handle, value); break;
      case 'wetness':    this.wasm.setWetness(this.handle, value); break;
      case 'multiTap':   this.wasm.setMultiTap(this.handle, value ? 1 : 0); break;
      case 'tapeFilter': this.wasm.setTapeFilter(this.handle, value ? 1 : 0); break;
    }
  }

  cleanup() {
    if (this.module && this.handle && this.wasm) {
      this.wasm.destroy(this.handle);
      this.handle = 0;
    }
    if (this.module) {
      const free = this.module._free;
      if (free) {
        if (this.inPtrL) free(this.inPtrL);
        if (this.inPtrR) free(this.inPtrR);
        if (this.outPtrL) free(this.outPtrL);
        if (this.outPtrR) free(this.outPtrR);
      }
    }
    this.inPtrL = 0; this.inPtrR = 0;
    this.outPtrL = 0; this.outPtrR = 0;
    this.inBufL = null; this.inBufR = null;
    this.outBufL = null; this.outBufR = null;
    this.wasm = null;
    this.initialized = false;
    this._wasmMemory = null;
    this.handle = 0;
  }

  process(inputs, outputs) {
    if (!this.initialized || !this.handle || !this.wasm) {
      const input = inputs[0];
      const output = outputs[0];
      if (input && output) {
        for (let ch = 0; ch < output.length; ch++) {
          if (input[ch]) output[ch].set(input[ch]);
        }
      }
      return true;
    }

    const input = inputs[0];
    const output = outputs[0];
    if (!input || !output || input.length === 0 || output.length === 0) return true;

    const inputL = input[0];
    const inputR = input[1] || input[0];
    const outputL = output[0];
    const outputR = output[1] || output[0];
    const numSamples = Math.min(inputL.length, this.bufferSize);

    if (this._wasmMemory && this.inBufL && this.inBufL.buffer !== this._wasmMemory.buffer) {
      const buf = this._wasmMemory.buffer;
      this.inBufL = new Float32Array(buf, this.inPtrL, this.bufferSize);
      this.inBufR = new Float32Array(buf, this.inPtrR, this.bufferSize);
      this.outBufL = new Float32Array(buf, this.outPtrL, this.bufferSize);
      this.outBufR = new Float32Array(buf, this.outPtrR, this.bufferSize);
    }

    if (!this.inBufL || !this.outBufL) return true;

    this.inBufL.set(inputL.subarray(0, numSamples));
    this.inBufR.set(inputR.subarray(0, numSamples));

    this.wasm.process(this.handle, this.inPtrL, this.inPtrR,
                      this.outPtrL, this.outPtrR, numSamples);

    outputL.set(this.outBufL.subarray(0, numSamples));
    outputR.set(this.outBufR.subarray(0, numSamples));

    return true;
  }
}

registerProcessor('spacey-delayer-processor', SpaceyDelayerProcessor);
