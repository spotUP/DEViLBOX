/**
 * RE-201 Space Echo AudioWorklet Processor
 * Roland RE-201 model backed by WASM DSP engine.
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

// AudioWorkletGlobalScope lacks WorkerGlobalScope and self, causing Emscripten
// to detect "shell" environment and abort. Shim them for ENVIRONMENT_IS_WORKER.
if (typeof globalThis.WorkerGlobalScope === 'undefined') {
  globalThis.WorkerGlobalScope = globalThis.constructor;
}
if (typeof self === 'undefined') {
  globalThis.self = globalThis;
  if (!self.location) self.location = { href: '' };
}

let sharedModule = null;
let sharedModulePromise = null;

async function getOrCreateModule(wasmBinary, jsCode) {
  if (sharedModule) return sharedModule;
  if (sharedModulePromise) return sharedModulePromise;

  sharedModulePromise = (async () => {
    let createModule;
    const wrappedCode = jsCode + '\nreturn createRE201;';
    createModule = new Function(wrappedCode)();

    if (typeof createModule !== 'function') {
      sharedModulePromise = null;
      throw new Error('Could not load RE201 module factory');
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

class RE201Processor extends AudioWorkletProcessor {
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
        create:          Module._re201_create,
        destroy:         Module._re201_destroy,
        process:         Module._re201_process,
        setBass:         Module._re201_set_bass,
        setTreble:       Module._re201_set_treble,
        setDelayMode:    Module._re201_set_delay_mode,
        setRepeatRate:   Module._re201_set_repeat_rate,
        setIntensity:    Module._re201_set_intensity,
        setEchoVolume:   Module._re201_set_echo_volume,
        setReverbVolume: Module._re201_set_reverb_volume,
        setInputLevel:   Module._re201_set_input_level,
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
      console.error('[RE201 Worklet] Init error:', error);
      this.port.postMessage({ type: 'error', message: error.message });
    }
  }

  setParameter(param, value) {
    if (!this.handle || !this.wasm) return;
    switch (param) {
      case 'bass':         this.wasm.setBass(this.handle, value); break;
      case 'treble':       this.wasm.setTreble(this.handle, value); break;
      case 'delayMode':    this.wasm.setDelayMode(this.handle, value | 0); break;
      case 'repeatRate':   this.wasm.setRepeatRate(this.handle, value); break;
      case 'intensity':    this.wasm.setIntensity(this.handle, value); break;
      case 'echoVolume':   this.wasm.setEchoVolume(this.handle, value); break;
      case 'reverbVolume': this.wasm.setReverbVolume(this.handle, value); break;
      case 'inputLevel':   this.wasm.setInputLevel(this.handle, value); break;
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
    try {
      return this.processInner(inputs, outputs);
    } catch (e) {
      // Report once, with the stack, instead of the browser silently
      // retiring the processor.
      if (!this._reportedError) {
        this._reportedError = true;
        this.port.postMessage({ type: 'processError', message: String(e && e.message || e), stack: String(e && e.stack || '') });
      }
      return true;
    }
  }

  /** Once a second: is process() running, and what goes in and out. For diagnostics. */
  reportStats(inputs, outputs) {
    this._statCalls = (this._statCalls || 0) + 1;
    const i0 = inputs[0] && inputs[0][0], o0 = outputs[0] && outputs[0][0];
    let si = 0, so = 0;
    if (i0) for (let k = 0; k < i0.length; k++) si += i0[k] * i0[k];
    if (o0) for (let k = 0; k < o0.length; k++) so += o0[k] * o0[k];
    this._statIn = Math.max(this._statIn || 0, i0 ? Math.sqrt(si / i0.length) : 0);
    this._statOut = Math.max(this._statOut || 0, o0 ? Math.sqrt(so / o0.length) : 0);
    if (this._statCalls % 375 === 0) {
      this.port.postMessage({
        type: 'stats', calls: this._statCalls, initialized: !!this.initialized, handle: this.handle || 0,
        inputs: inputs[0] ? inputs[0].length : -1, peakInRms: this._statIn, peakOutRms: this._statOut,
      });
      this._statIn = 0; this._statOut = 0;
    }
  }

  processInner(inputs, outputs) {
    const keep = this.processBody(inputs, outputs);
    this.reportStats(inputs, outputs);
    return keep;
  }

  processBody(inputs, outputs) {
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

registerProcessor('re201-processor', RE201Processor);
