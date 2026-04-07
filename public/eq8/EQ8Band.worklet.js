/**
 * EQ8Band.worklet.js — AudioWorklet processor for 8-band EQ WASM effect.
 */

if (typeof URL === 'undefined') {
  globalThis.URL = class URL {
    constructor(path, base) { this.href = base ? (base + '/' + path) : path; this.pathname = path; }
    toString() { return this.href; }
  };
}

let processorRegistered = false;
let sharedModule = null;
let sharedModulePromise = null;

async function getOrCreateModule(wasmBinary, jsCode) {
  if (sharedModule) return sharedModule;
  if (sharedModulePromise) return sharedModulePromise;
  sharedModulePromise = (async () => {
    const wrappedCode = `${jsCode}; return createEQ8Band;`;
    const createModule = new Function(wrappedCode)();
    if (!createModule) throw new Error('No createEQ8Band factory');
    let capturedMemory = null;
    const orig = WebAssembly.instantiate;
    WebAssembly.instantiate = async function (...args) {
      const r = await orig.apply(this, args);
      const inst = r.instance || r;
      if (inst.exports) for (const v of Object.values(inst.exports)) { if (v instanceof WebAssembly.Memory) { capturedMemory = v; break; } }
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

class EQ8BandProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.handle = -1; this.isInitialized = false; this.pendingMessages = []; this.Module = null;
    this.inputPtrL = 0; this.inputPtrR = 0; this.outputPtrL = 0; this.outputPtrR = 0;
    this.inputBufferL = null; this.inputBufferR = null; this.outputBufferL = null; this.outputBufferR = null;
    this._wasmMemory = null;
    this.port.onmessage = this.handleMessage.bind(this);
  }

  async handleMessage(event) {
    const { type, ...data } = event.data;
    switch (type) {
      case 'init': await this.initialize(data); break;
      case 'parameter':
        if (this.isInitialized && this.handle >= 0) this.applyParam(data.param, data.value);
        else this.pendingMessages.push(event.data);
        break;
      case 'dispose': this.cleanup(); break;
    }
  }

  applyParam(param, value) {
    const M = this.Module, h = this.handle;
    const fn = M['_eq8_set_' + param];
    if (fn) fn(h, value);
  }

  cleanup() {
    if (this.Module) {
      if (this.handle >= 0) this.Module._eq8_destroy(this.handle);
      if (this.inputPtrL) this.Module._free(this.inputPtrL);
      if (this.inputPtrR) this.Module._free(this.inputPtrR);
      if (this.outputPtrL) this.Module._free(this.outputPtrL);
      if (this.outputPtrR) this.Module._free(this.outputPtrR);
    }
    this.handle = -1; this.isInitialized = false;
  }

  async initialize(data) {
    try {
      const M = await getOrCreateModule(data.wasmBinary, data.jsCode);
      this.handle = M._eq8_create(sampleRate);
      if (this.handle < 0) throw new Error('eq8_create failed');
      const bs = 128 * 4;
      this.inputPtrL = M._malloc(bs); this.inputPtrR = M._malloc(bs);
      this.outputPtrL = M._malloc(bs); this.outputPtrR = M._malloc(bs);
      const mem = M.wasmMemory;
      const buf = M.HEAPF32 ? M.HEAPF32.buffer : (mem ? mem.buffer : null);
      if (!buf) throw new Error('No WASM memory');
      this._wasmMemory = mem;
      this.inputBufferL = new Float32Array(buf, this.inputPtrL, 128);
      this.inputBufferR = new Float32Array(buf, this.inputPtrR, 128);
      this.outputBufferL = new Float32Array(buf, this.outputPtrL, 128);
      this.outputBufferR = new Float32Array(buf, this.outputPtrR, 128);
      this.Module = M; this.isInitialized = true;
      for (const msg of this.pendingMessages) this.handleMessage({ data: msg });
      this.pendingMessages = [];
      this.port.postMessage({ type: 'ready' });
    } catch (e) {
      console.error('[EQ8Band] init error:', e);
      this.port.postMessage({ type: 'error', error: e.message });
    }
  }

  process(inputs, outputs) {
    const input = inputs[0], output = outputs[0];
    const outL = output[0], outR = output[1] || output[0];
    if (!input || !input[0] || !input[0].length) { if (outL) outL.fill(0); if (outR) outR.fill(0); return true; }
    const inL = input[0], inR = input[1] || input[0], n = inL.length;
    if (!this.isInitialized || this.handle < 0) { outL.set(inL); outR.set(inR); return true; }
    try {
      const cur = this._wasmMemory ? this._wasmMemory.buffer : (this.Module.HEAPF32 ? this.Module.HEAPF32.buffer : null);
      if (cur && this.inputBufferL.buffer !== cur) {
        this.inputBufferL = new Float32Array(cur, this.inputPtrL, 128);
        this.inputBufferR = new Float32Array(cur, this.inputPtrR, 128);
        this.outputBufferL = new Float32Array(cur, this.outputPtrL, 128);
        this.outputBufferR = new Float32Array(cur, this.outputPtrR, 128);
      }
      this.inputBufferL.set(inL.subarray(0, n)); this.inputBufferR.set(inR.subarray(0, n));
      this.Module._eq8_process(this.handle, this.inputPtrL, this.inputPtrR, this.outputPtrL, this.outputPtrR, n);
      outL.set(this.outputBufferL.subarray(0, n)); outR.set(this.outputBufferR.subarray(0, n));
    } catch (e) { outL.set(inL); outR.set(inR); }
    return true;
  }
}

if (!processorRegistered) { registerProcessor('eq8-processor', EQ8BandProcessor); processorRegistered = true; }
