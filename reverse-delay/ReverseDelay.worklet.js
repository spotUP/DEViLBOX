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
    let createModule;
    try {
      const wrappedCode = `${jsCode}; return createReverseDelay;`;
      createModule = new Function(wrappedCode)();
    } catch (e) { console.error('[ReverseDelay] Failed:', e); sharedModulePromise = null; throw e; }
    if (!createModule) { sharedModulePromise = null; throw new Error('No factory'); }
    let capturedMemory = null;
    const origInstantiate = WebAssembly.instantiate;
    WebAssembly.instantiate = async function (...args) {
      const result = await origInstantiate.apply(this, args);
      const instance = result.instance || result;
      if (instance.exports) { for (const value of Object.values(instance.exports)) { if (value instanceof WebAssembly.Memory) { capturedMemory = value; break; } } }
      return result;
    };
    let Module;
    try { Module = await createModule({ wasmBinary }); } finally { WebAssembly.instantiate = origInstantiate; }
    if (capturedMemory && !Module.wasmMemory) Module.wasmMemory = capturedMemory;
    sharedModule = Module;
    return Module;
  })();
  return sharedModulePromise;
}

class ReverseDelayProcessor extends AudioWorkletProcessor {
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
        if (this.isInitialized && this.handle >= 0) this.applyParameter(data.param, data.value);
        else this.pendingMessages.push(event.data);
        break;
      case 'dispose': this.cleanup(); break;
    }
  }
  applyParameter(param, value) {
    const M = this.Module; const h = this.handle;
    const fn = M['_reverse_delay_set_' + param];
    if (fn) fn(h, value);
  }
  cleanup() {
    if (this.Module) {
      if (this.handle >= 0) this.Module._reverse_delay_destroy(this.handle);
      if (this.inputPtrL) this.Module._free(this.inputPtrL);
      if (this.inputPtrR) this.Module._free(this.inputPtrR);
      if (this.outputPtrL) this.Module._free(this.outputPtrL);
      if (this.outputPtrR) this.Module._free(this.outputPtrR);
    }
    this.handle = -1; this.inputPtrL = this.inputPtrR = 0; this.outputPtrL = this.outputPtrR = 0;
    this.inputBufferL = this.inputBufferR = null; this.outputBufferL = this.outputBufferR = null;
    this.isInitialized = false;
  }
  async initialize(data) {
    try {
      const { wasmBinary, jsCode } = data;
      if (!wasmBinary || !jsCode) throw new Error('Missing data');
      const Module = await getOrCreateModule(wasmBinary, jsCode);
      this.handle = Module._reverse_delay_create(sampleRate);
      if (this.handle < 0) throw new Error('create returned ' + this.handle);
      const bufBytes = 128 * 4;
      this.inputPtrL = Module._malloc(bufBytes); this.inputPtrR = Module._malloc(bufBytes);
      this.outputPtrL = Module._malloc(bufBytes); this.outputPtrR = Module._malloc(bufBytes);
      const wasmMem = Module.wasmMemory;
      const heapBuf = Module.HEAPF32 ? Module.HEAPF32.buffer : (wasmMem ? wasmMem.buffer : null);
      if (!heapBuf) throw new Error('No WASM memory');
      this._wasmMemory = wasmMem;
      this.inputBufferL = new Float32Array(heapBuf, this.inputPtrL, 128);
      this.inputBufferR = new Float32Array(heapBuf, this.inputPtrR, 128);
      this.outputBufferL = new Float32Array(heapBuf, this.outputPtrL, 128);
      this.outputBufferR = new Float32Array(heapBuf, this.outputPtrR, 128);
      this.Module = Module; this.isInitialized = true;
      for (const msg of this.pendingMessages) this.handleMessage({ data: msg });
      this.pendingMessages = [];
      this.port.postMessage({ type: 'ready' });
    } catch (error) {
      console.error('[ReverseDelay] init error:', error);
      this.port.postMessage({ type: 'error', error: error.message });
    }
  }
  process(inputs, outputs) {
    const input = inputs[0]; const output = outputs[0];
    const outputL = output[0]; const outputR = output[1] || output[0];
    if (!input || !input[0] || !input[0].length) { if (outputL) outputL.fill(0); if (outputR) outputR.fill(0); return true; }
    const inputL = input[0]; const inputR = input[1] || input[0]; const n = inputL.length;
    if (!this.isInitialized || this.handle < 0) { outputL.set(inputL); outputR.set(inputR); return true; }
    try {
      const curBuf = this._wasmMemory ? this._wasmMemory.buffer : (this.Module.HEAPF32 ? this.Module.HEAPF32.buffer : null);
      if (curBuf && this.inputBufferL.buffer !== curBuf) {
        this.inputBufferL = new Float32Array(curBuf, this.inputPtrL, 128);
        this.inputBufferR = new Float32Array(curBuf, this.inputPtrR, 128);
        this.outputBufferL = new Float32Array(curBuf, this.outputPtrL, 128);
        this.outputBufferR = new Float32Array(curBuf, this.outputPtrR, 128);
      }
      this.inputBufferL.set(inputL.subarray(0, n)); this.inputBufferR.set(inputR.subarray(0, n));
      this.Module._reverse_delay_process(this.handle, this.inputPtrL, this.inputPtrR, this.outputPtrL, this.outputPtrR, n);
      outputL.set(this.outputBufferL.subarray(0, n)); outputR.set(this.outputBufferR.subarray(0, n));
    } catch (e) { outputL.set(inputL); outputR.set(inputR); }
    return true;
  }
}
if (!processorRegistered) { registerProcessor('reverse-delay-processor', ReverseDelayProcessor); processorRegistered = true; }
