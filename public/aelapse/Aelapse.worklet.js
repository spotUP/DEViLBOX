/**
 * Aelapse.worklet.js - Ælapse DSP AudioWorklet
 *
 * Wraps the tape delay + spring reverb WASM module from
 * juce-wasm/aelapse/AelapseEffect.cpp. Mirrors the pattern used by
 * SpringReverb.worklet.js — single shared WASM module, per-instance Embind
 * effect objects, 128-sample stereo block processing.
 *
 * In addition to audio processing, this worklet streams the Springs RMS
 * ring buffer to the main thread so the overlay WebGL2 shader can animate
 * the springs. The RMS data is pulled via the C++ getRMSFrameCount /
 * copyRMSFrames Embind methods every N process() blocks (~30Hz cadence).
 */

// Polyfill crypto for AudioWorklet scope — Emscripten's WASM module factory
// calls crypto.getRandomValues() during initialization but the Web Crypto API
// is not available in AudioWorklet global scope.
if (typeof crypto === 'undefined') {
  globalThis.crypto = {
    getRandomValues(arr) {
      for (let i = 0; i < arr.length; i++) arr[i] = (Math.random() * 256) | 0;
      return arr;
    }
  };
}

// Polyfill URL for AudioWorklet scope — Emscripten calls new URL() even
// when wasmBinary is provided directly.
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

// Shared WASM module (single instance across processors)
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
    try {
      const wrappedCode = `${jsCode}; return createAelapseModule;`;
      createModule = new Function(wrappedCode)();
    } catch (evalErr) {
      console.error('Failed to evaluate Aelapse JS:', evalErr);
      sharedModulePromise = null;
      throw new Error('Could not evaluate Aelapse module factory');
    }

    if (!createModule) {
      sharedModulePromise = null;
      throw new Error('Could not load Aelapse module factory');
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

    if (capturedMemory && !Module.wasmMemory) {
      Module.wasmMemory = capturedMemory;
    }

    sharedModule = Module;
    return Module;
  })();

  return sharedModulePromise;
}

class AelapseProcessor extends AudioWorkletProcessor {
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

    // RMS snapshot buffer — 64 frames × 4 springs × 4 bytes = 1024 bytes
    this.rmsPtr = 0;
    this.rmsView = null;

    // Throttle RMS postMessages to ~30Hz. At 48kHz / 128 frames = 375 Hz
    // of process() invocations → every 12 blocks ≈ 31 Hz.
    this.rmsCounter = 0;
    this.rmsInterval = 12;

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
      if (this.inputPtrL)  this.Module._free(this.inputPtrL);
      if (this.inputPtrR)  this.Module._free(this.inputPtrR);
      if (this.outputPtrL) this.Module._free(this.outputPtrL);
      if (this.outputPtrR) this.Module._free(this.outputPtrR);
      if (this.rmsPtr)     this.Module._free(this.rmsPtr);
    }
    this.inputPtrL = 0;
    this.inputPtrR = 0;
    this.outputPtrL = 0;
    this.outputPtrR = 0;
    this.rmsPtr = 0;
    this.inputBufferL = null;
    this.inputBufferR = null;
    this.outputBufferL = null;
    this.outputBufferR = null;
    this.rmsView = null;
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

      const Module = await getOrCreateModule(wasmBinary, jsCode);

      this.effect = new Module.AelapseEffect();
      this.effect.initialize(sampleRate);

      const bufferSize = 128 * 4;  // 128 samples × 4 bytes per float
      this.inputPtrL  = Module._malloc(bufferSize);
      this.inputPtrR  = Module._malloc(bufferSize);
      this.outputPtrL = Module._malloc(bufferSize);
      this.outputPtrR = Module._malloc(bufferSize);

      // 256 floats for the RMS snapshot (64 frames × 4 springs)
      this.rmsPtr = Module._malloc(256 * 4);

      const wasmMem = Module.wasmMemory;
      const heapBuffer = Module.HEAPF32
        ? Module.HEAPF32.buffer
        : (wasmMem ? wasmMem.buffer : null);
      if (!heapBuffer) throw new Error('Cannot access WASM memory buffer');

      this._wasmMemory = wasmMem;

      this.inputBufferL  = new Float32Array(heapBuffer, this.inputPtrL, 128);
      this.inputBufferR  = new Float32Array(heapBuffer, this.inputPtrR, 128);
      this.outputBufferL = new Float32Array(heapBuffer, this.outputPtrL, 128);
      this.outputBufferR = new Float32Array(heapBuffer, this.outputPtrR, 128);
      this.rmsView       = new Float32Array(heapBuffer, this.rmsPtr, 256);

      this.Module = Module;
      this.isInitialized = true;

      for (const msg of this.pendingMessages) {
        this.handleMessage({ data: msg });
      }
      this.pendingMessages = [];

      this.port.postMessage({ type: 'ready' });
    } catch (error) {
      console.error('Aelapse initialization error:', error);
      this.port.postMessage({ type: 'error', error: error.message });
    }
  }

  _refreshViewsIfMemoryGrew() {
    const currentBuffer = this._wasmMemory
      ? this._wasmMemory.buffer
      : (this.Module.HEAPF32 ? this.Module.HEAPF32.buffer : null);
    if (currentBuffer && this.inputBufferL.buffer !== currentBuffer) {
      this.inputBufferL  = new Float32Array(currentBuffer, this.inputPtrL, 128);
      this.inputBufferR  = new Float32Array(currentBuffer, this.inputPtrR, 128);
      this.outputBufferL = new Float32Array(currentBuffer, this.outputPtrL, 128);
      this.outputBufferR = new Float32Array(currentBuffer, this.outputPtrR, 128);
      this.rmsView       = new Float32Array(currentBuffer, this.rmsPtr, 256);
    }
  }

  process(inputs, outputs) {
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
      this._refreshViewsIfMemoryGrew();

      this.inputBufferL.set(inputL.subarray(0, numSamples));
      this.inputBufferR.set(inputR.subarray(0, numSamples));

      this.effect.process(
        this.inputPtrL, this.inputPtrR,
        this.outputPtrL, this.outputPtrR,
        numSamples,
      );

      outputL.set(this.outputBufferL.subarray(0, numSamples));
      outputR.set(this.outputBufferR.subarray(0, numSamples));

      // RMS snapshot — throttled so we're not spamming postMessage.
      this.rmsCounter++;
      if (this.rmsCounter >= this.rmsInterval) {
        this.rmsCounter = 0;
        // copyRMSFrames(dstPtr, maxFrames) — dst is on the WASM heap, we
        // then clone to a transferable Float32Array for the postMessage.
        this.effect.copyRMSFrames(this.rmsPtr, 64);
        const pos = this.effect.getRMSStackPos();
        // Clone off the WASM heap — the main thread can't share a view
        // into our memory safely across the boundary.
        const snap = new Float32Array(256);
        snap.set(this.rmsView);
        this.port.postMessage({ type: 'rms', stack: snap, pos }, [snap.buffer]);
      }
    } catch (_error) {
      outputL.set(inputL);
      outputR.set(inputR);
    }

    return true;
  }
}

if (!processorRegistered) {
  registerProcessor('aelapse-processor', AelapseProcessor);
  processorRegistered = true;
}
