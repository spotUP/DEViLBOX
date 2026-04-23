/**
 * SoundTouch.worklet.js — AudioWorklet host for the SoundTouch WASM module.
 *
 * Wraps Olli Parviainen's SoundTouch (LGPL-2.1+) so the DJ deck's audio-
 * buffer playback path can pitch-shift without tempo change when Key Lock is
 * ON. The tracker path already has native key-lock via replayer's pitch/tempo
 * split; this worklet only matters when the deck has hot-swapped to a
 * pre-rendered WAV on an AudioBufferSourceNode (whose .playbackRate couples
 * pitch and tempo).
 *
 * Message contract (main thread → worklet):
 *   { type: 'init', wasmBinary, jsCode }      — one-shot module+effect setup
 *   { type: 'parameter', key: 'pitchSemis', value: number }
 *   { type: 'parameter', key: 'tempo',      value: number }
 *   { type: 'parameter', key: 'rate',       value: number }
 *   { type: 'clear' }                         — flush FIFO (on key-lock OFF)
 *   { type: 'dispose' }                       — destroy the processor
 *
 * Worklet → main thread:
 *   { type: 'ready' }        after init succeeds
 *   { type: 'error', error } on init failure
 *
 * Shares a single WASM module across processors (matching DattorroPlate
 * pattern) so each deck doesn't pay a separate ~4 MB allocation.
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

let processorRegistered = false;

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
      const wrappedCode = `${jsCode}; return createSoundTouchModule;`;
      createModule = new Function(wrappedCode)();
    } catch (evalErr) {
      console.error('Failed to evaluate SoundTouch JS:', evalErr);
      sharedModulePromise = null;
      throw new Error('Could not evaluate SoundTouch module factory');
    }
    if (!createModule) {
      sharedModulePromise = null;
      throw new Error('Could not load SoundTouch module factory');
    }

    // Capture WASM memory for heap-buffer view recreation after growth.
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

class SoundTouchKeyLockProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.st = null;
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
      case 'init':
        await this.initialize(data);
        break;

      case 'parameter':
        if (this.st && this.isInitialized) {
          this.applyParameter(data.key, data.value);
        } else {
          this.pendingMessages.push(event.data);
        }
        break;

      case 'clear':
        if (this.st && this.isInitialized) {
          this.st.clearBuffer();
        } else {
          this.pendingMessages.push(event.data);
        }
        break;

      case 'dispose':
        this.cleanup();
        break;
    }
  }

  applyParameter(key, value) {
    const v = Number(value);
    if (!Number.isFinite(v)) return;
    switch (key) {
      case 'pitchSemis':
        this.st.setPitchSemiTones(v);
        break;
      case 'tempo':
        this.st.setTempo(v);
        break;
      case 'rate':
        this.st.setRate(v);
        break;
      default:
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

    if (this.st) {
      try { this.st.delete(); } catch(_) {}
    }
    this.st = null;
    this.isInitialized = false;
  }

  async initialize(data) {
    try {
      const { wasmBinary, jsCode } = data;

      if (!wasmBinary || !jsCode) {
        throw new Error('Missing wasmBinary or jsCode in init message');
      }

      const Module = await getOrCreateModule(wasmBinary, jsCode);

      this.st = new Module.SoundTouchProcessor();
      this.st.initialize(sampleRate);

      const bufferSize = 128 * 4;
      this.inputPtrL = Module._malloc(bufferSize);
      this.inputPtrR = Module._malloc(bufferSize);
      this.outputPtrL = Module._malloc(bufferSize);
      this.outputPtrR = Module._malloc(bufferSize);

      const wasmMem = Module.wasmMemory;
      const heapBuffer = Module.HEAPF32
        ? Module.HEAPF32.buffer
        : (wasmMem ? wasmMem.buffer : null);

      if (!heapBuffer) {
        throw new Error('Cannot access WASM memory buffer');
      }

      this._wasmMemory = wasmMem;

      this.inputBufferL = new Float32Array(heapBuffer, this.inputPtrL, 128);
      this.inputBufferR = new Float32Array(heapBuffer, this.inputPtrR, 128);
      this.outputBufferL = new Float32Array(heapBuffer, this.outputPtrL, 128);
      this.outputBufferR = new Float32Array(heapBuffer, this.outputPtrR, 128);

      this.Module = Module;
      this.isInitialized = true;

      // Drain any parameter/clear messages queued during init.
      for (const msg of this.pendingMessages) {
        this.handleMessage({ data: msg });
      }
      this.pendingMessages = [];

      this.port.postMessage({ type: 'ready' });

    } catch (error) {
      console.error('SoundTouch initialization error:', error);
      this.port.postMessage({
        type: 'error',
        error: error.message || String(error)
      });
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

    if (!this.st || !this.isInitialized) {
      // Passthrough while WASM warms up.
      outputL.set(inputL);
      outputR.set(inputR);
      return true;
    }

    try {
      // Recreate views if WASM memory was resized.
      const currentBuffer = this._wasmMemory
        ? this._wasmMemory.buffer
        : (this.Module.HEAPF32 ? this.Module.HEAPF32.buffer : null);

      if (currentBuffer && this.inputBufferL.buffer !== currentBuffer) {
        this.inputBufferL  = new Float32Array(currentBuffer, this.inputPtrL, 128);
        this.inputBufferR  = new Float32Array(currentBuffer, this.inputPtrR, 128);
        this.outputBufferL = new Float32Array(currentBuffer, this.outputPtrL, 128);
        this.outputBufferR = new Float32Array(currentBuffer, this.outputPtrR, 128);
      }

      // Copy input into WASM heap.
      this.inputBufferL.set(inputL.subarray(0, numSamples));
      this.inputBufferR.set(inputR.subarray(0, numSamples));

      // Push through SoundTouch. Return value is the actual sample count;
      // output buffers are zero-padded to `numSamples` by the C++ side.
      this.st.process(
        this.inputPtrL, this.inputPtrR,
        this.outputPtrL, this.outputPtrR,
        numSamples
      );

      outputL.set(this.outputBufferL.subarray(0, numSamples));
      outputR.set(this.outputBufferR.subarray(0, numSamples));

    } catch (_) {
      // Passthrough on any WASM fault so audio never drops out hard.
      outputL.set(inputL);
      outputR.set(inputR);
    }

    return true;
  }
}

if (!processorRegistered) {
  registerProcessor('soundtouch-keylock-processor', SoundTouchKeyLockProcessor);
  processorRegistered = true;
}
