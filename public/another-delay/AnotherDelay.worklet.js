/**
 * AnotherDelay AudioWorklet Processor
 * Tape delay with wow/flutter/saturation/reverb backed by WASM DSP engine.
 * Stereo in/out effect processing.
 */

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
    let createModule;
    const wrappedCode = jsCode + '\nreturn createAnotherDelay;';
    createModule = new Function(wrappedCode)();

    if (typeof createModule !== 'function') {
      sharedModulePromise = null;
      throw new Error('Could not load AnotherDelay module factory');
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

class AnotherDelayProcessor extends AudioWorkletProcessor {
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
        create:           Module._another_delay_create,
        destroy:          Module._another_delay_destroy,
        process:          Module._another_delay_process,
        setDelayTime:     Module._another_delay_set_delay_time,
        setFeedback:      Module._another_delay_set_feedback,
        setLowpass:       Module._another_delay_set_lowpass,
        setHighpass:      Module._another_delay_set_highpass,
        setFlutterFreq:   Module._another_delay_set_flutter_freq,
        setFlutterDepth:  Module._another_delay_set_flutter_depth,
        setWowFreq:       Module._another_delay_set_wow_freq,
        setWowDepth:      Module._another_delay_set_wow_depth,
        setReverbEnabled: Module._another_delay_set_reverb_enabled,
        setRoomSize:      Module._another_delay_set_room_size,
        setDamping:       Module._another_delay_set_damping,
        setWidth:         Module._another_delay_set_width,
        setGain:          Module._another_delay_set_gain,
      };

      this.inPtrL = Module._malloc(this.bufferSize * 4);
      this.inPtrR = Module._malloc(this.bufferSize * 4);
      this.outPtrL = Module._malloc(this.bufferSize * 4);
      this.outPtrR = Module._malloc(this.bufferSize * 4);

      if (!this.inPtrL || !this.inPtrR || !this.outPtrL || !this.outPtrR) {
        throw new Error('WASM malloc failed: out of memory');
      }

      this.handle = this.wasm.create(sr || sampleRate);

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
      console.error('[AnotherDelay Worklet] Init error:', error);
      this.port.postMessage({ type: 'error', message: error.message });
    }
  }

  setParameter(param, value) {
    if (!this.handle || !this.wasm) return;
    switch (param) {
      case 'delayTime':     this.wasm.setDelayTime(this.handle, value); break;
      case 'feedback':      this.wasm.setFeedback(this.handle, value); break;
      case 'lowpass':       this.wasm.setLowpass(this.handle, value); break;
      case 'highpass':      this.wasm.setHighpass(this.handle, value); break;
      case 'flutterFreq':   this.wasm.setFlutterFreq(this.handle, value); break;
      case 'flutterDepth':  this.wasm.setFlutterDepth(this.handle, value); break;
      case 'wowFreq':       this.wasm.setWowFreq(this.handle, value); break;
      case 'wowDepth':      this.wasm.setWowDepth(this.handle, value); break;
      case 'reverbEnabled': this.wasm.setReverbEnabled(this.handle, value ? 1 : 0); break;
      case 'roomSize':      this.wasm.setRoomSize(this.handle, value); break;
      case 'damping':       this.wasm.setDamping(this.handle, value); break;
      case 'width':         this.wasm.setWidth(this.handle, value); break;
      case 'gain':          this.wasm.setGain(this.handle, value); break;
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

registerProcessor('another-delay-processor', AnotherDelayProcessor);
