/**
 * Fil4.worklet.js — AudioWorklet processor for the fil4 WASM parametric EQ.
 */

// Emscripten shims (required in AudioWorkletGlobalScope)
if (typeof URL === 'undefined') {
  globalThis.URL = class URL {
    constructor(path, base) { this.href = base ? (base + '/' + path) : path; this.pathname = path; }
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
    const wrappedCode = `${jsCode}; return createFil4;`;
    const createModule = new Function(wrappedCode)();
    if (!createModule) throw new Error('No createFil4 factory');
    let capturedMemory = null;
    const orig = WebAssembly.instantiate;
    WebAssembly.instantiate = async function (...args) {
      const r = await orig.apply(this, args);
      const inst = r.instance || r;
      if (inst.exports) for (const v of Object.values(inst.exports)) {
        if (v instanceof WebAssembly.Memory) { capturedMemory = v; break; }
      }
      return r;
    };
    let M;
    try { M = await createModule({ wasmBinary }); } finally { WebAssembly.instantiate = orig; }
    if (capturedMemory && !M.wasmMemory) M.wasmMemory = capturedMemory;
    sharedModule = M;
    return M;
  })();
  return sharedModulePromise;
}

let processorRegistered = false;

class Fil4Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.handle = -1;
    this.isInitialized = false;
    this.pendingMessages = [];
    this.Module = null;
    this.L_ptr = 0; this.R_ptr = 0;
    this.heapL = null; this.heapR = null;
    this._wasmMemory = null;
    this.port.onmessage = this.handleMessage.bind(this);
  }

  async handleMessage(event) {
    const { type, ...data } = event.data;
    switch (type) {
      case 'init':    await this.initialize(data); break;
      case 'dispose': this.cleanup(); break;
      case 'get_magnitude':
        if (this.isInitialized && this.handle >= 0) this.computeMagnitude(data.id, data.freqs);
        break;
      default:
        if (this.isInitialized && this.handle >= 0) this.applyCmd(type, data);
        else this.pendingMessages.push(event.data);
        break;
    }
  }

  applyCmd(type, data) {
    const M = this.Module, h = this.handle;
    switch (type) {
      case 'set_hp':    M._fil4_set_hp   (h, data.enabled ? 1 : 0, data.freq, data.q); break;
      case 'set_lp':    M._fil4_set_lp   (h, data.enabled ? 1 : 0, data.freq, data.q); break;
      case 'set_shelf': M._fil4_set_shelf(h, data.which, data.enabled ? 1 : 0, data.freq, data.gain, data.q); break;
      case 'set_band':  M._fil4_set_band (h, data.band,  data.enabled ? 1 : 0, data.freq, data.bw,   data.gain); break;
      case 'set_gain':  M._fil4_set_gain (h, data.gain); break;
    }
  }

  computeMagnitude(id, freqs) {
    const M = this.Module, h = this.handle;
    const n = freqs.length;
    const freqPtr = M._malloc(n * 4);
    const outPtr  = M._malloc(n * 4);
    try {
      this.refreshHeap();
      const buf = this._wasmMemory ? this._wasmMemory.buffer
                : (M.HEAPF32 ? M.HEAPF32.buffer : null);
      if (!buf) throw new Error('No WASM memory for magnitude');
      const heap = new Float32Array(buf);
      heap.set(freqs, freqPtr >> 2);
      M._fil4_get_magnitude(h, freqPtr, outPtr, n);
      const result = new Float32Array(buf, outPtr, n).slice();
      this.port.postMessage({ type: 'magnitude_result', id, data: result }, [result.buffer]);
    } finally {
      M._free(freqPtr);
      M._free(outPtr);
    }
  }

  refreshHeap() {
    const cur = this._wasmMemory ? this._wasmMemory.buffer
              : (this.Module && this.Module.HEAPF32 ? this.Module.HEAPF32.buffer : null);
    if (!cur) return;
    if (!this.heapL || this.heapL.buffer !== cur) {
      this.heapL = new Float32Array(cur, this.L_ptr, 128);
      this.heapR = new Float32Array(cur, this.R_ptr, 128);
    }
  }

  async initialize(data) {
    try {
      const M = await getOrCreateModule(data.wasmBinary, data.jsCode);
      this.handle = M._fil4_create(sampleRate);
      if (this.handle < 0) throw new Error('fil4_create failed');
      const bs = 128 * 4;
      this.L_ptr = M._malloc(bs);
      this.R_ptr = M._malloc(bs);
      this._wasmMemory = M.wasmMemory || null;
      this.Module = M;
      this.refreshHeap();
      this.isInitialized = true;
      for (const msg of this.pendingMessages) this.handleMessage({ data: msg });
      this.pendingMessages = [];
      this.port.postMessage({ type: 'ready' });
    } catch (e) {
      console.error('[Fil4] init error:', e);
      this.port.postMessage({ type: 'error', error: e.message });
    }
  }

  cleanup() {
    if (this.Module && this.handle >= 0) {
      this.Module._fil4_destroy(this.handle);
      this.Module._free(this.L_ptr);
      this.Module._free(this.R_ptr);
    }
    this.handle = -1;
    this.isInitialized = false;
  }

  process(inputs, outputs) {
    const input = inputs[0], output = outputs[0];
    const outL = output[0], outR = output[1] || output[0];
    if (!input || !input[0] || !input[0].length) { if (outL) outL.fill(0); if (outR) outR.fill(0); return true; }
    const inL = input[0], inR = input[1] || input[0], n = inL.length;

    if (!this.isInitialized || this.handle < 0) { outL.set(inL); outR.set(inR); return true; }

    try {
      this.refreshHeap();
      // Copy input into WASM heap
      this.heapL.set(inL.subarray(0, n));
      this.heapR.set(inR.subarray(0, n));
      // Process in-place — fil4_process modifies L_ptr/R_ptr directly
      this.Module._fil4_process(this.handle, this.L_ptr, this.R_ptr, n);
      // Read output back from the same buffers
      outL.set(this.heapL.subarray(0, n));
      outR.set(this.heapR.subarray(0, n));
    } catch (err) {
      outL.set(inL); outR.set(inR);
    }
    return true;
  }
}

if (!processorRegistered) {
  registerProcessor('fil4-processor', Fil4Processor);
  processorRegistered = true;
}
