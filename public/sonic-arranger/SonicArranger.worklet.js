/**
 * SonicArranger.worklet.js — AudioWorklet processor for SonicArranger WASM replayer
 * Whole-song replayer with per-channel output for oscilloscope.
 */
class SonicArrangerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.module = null;
    this.handle = 0;
    this.chPtrs = [0, 0, 0, 0];
    this.interleavedPtr = 0;
    this.interleavedBuf = null;
    this.initialized = false;
    this.playing = false;
    this.bufferSize = 128;
    this.lastHeapBuffer = null;
    this.initializing = false;
    this._oscCounter = 0;
    this.port.onmessage = (event) => { this.handleMessage(event.data); };
  }
  async handleMessage(data) {
    if (data.type !== 'init' && !this.module && this.initializing) return;
    switch (data.type) {
      case 'init': await this.initWasm(data.sampleRate, data.wasmBinary, data.jsCode); break;
      case 'loadModule': {
        if (!this.module) break;
        try {
          if (this.handle) { this.module._sa_destroy(this.handle); this.handle = 0; }
          const uint8Data = new Uint8Array(data.moduleData);
          const wasmPtr = this.module._malloc(uint8Data.length);
          if (!wasmPtr) { this.port.postMessage({ type: 'error', message: 'malloc failed' }); return; }
          this.module.HEAPU8.set(uint8Data, wasmPtr);
          this.handle = this.module._sa_create(wasmPtr, uint8Data.length, sampleRate);
          this.module._free(wasmPtr);
          if (!this.handle) { this.port.postMessage({ type: 'error', message: 'sa_create failed (unsupported format)' }); return; }
          const subsongCount = this.module._sa_subsong_count(this.handle);
          if (typeof data.subsong === 'number' && data.subsong > 0) this.module._sa_select_subsong(this.handle, data.subsong);
          this.playing = false;
          this.port.postMessage({ type: 'moduleLoaded', subsongCount, channels: 4 });
        } catch (error) { this.port.postMessage({ type: 'error', message: error.message }); }
        break;
      }
      case 'play': this.playing = true; break;
      case 'stop': this.playing = false; if (this.handle) this.module._sa_select_subsong(this.handle, 0); this.port.postMessage({ type: 'stopped' }); break;
      case 'pause': this.playing = !this.playing; break;
      case 'setSubsong': if (this.handle) this.module._sa_select_subsong(this.handle, data.subsong); break;
      case 'setChannelMask': if (this.handle) this.module._sa_set_channel_mask(this.handle, data.mask); break;
      case 'setCell': {        if (this.handle && this.module._sa_set_cell) {          this.module._sa_set_cell(this.handle, data.index, data.row, data.channel, data.note, data.instrument, data.effect, data.effectArg);        }        break;      }      case 'setInstrumentParam': {        if (this.handle && this.module._sa_set_instrument_param) {          var pLen = this.module.lengthBytesUTF8(data.param) + 1;          var pPtr = this.module._malloc(pLen);          this.module.stringToUTF8(data.param, pPtr, pLen);          this.module._sa_set_instrument_param(this.handle, data.instrument, pPtr, data.value);          this.module._free(pPtr);        }        break;      }      case 'dispose': this.cleanup(); break;
    }
  }
  async initWasm(rate, wasmBinary, jsCode) {
    this.initializing = true;
    try {
      this.cleanup();
      if (!globalThis.self) globalThis.self = globalThis;
      if (typeof globalThis.importScripts === 'undefined') globalThis.importScripts = function() {};
      if (!globalThis.WorkerGlobalScope) globalThis.WorkerGlobalScope = true;
      if (typeof globalThis.document === 'undefined') {
        globalThis.document = { createElement: () => ({ relList: { supports: () => false }, tagName: 'DIV', rel: '', addEventListener: () => {}, removeEventListener: () => {} }), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], getElementsByTagName: () => [], head: { appendChild: () => {} }, addEventListener: () => {}, removeEventListener: () => {} };
      }
      if (typeof globalThis.window === 'undefined') globalThis.window = { addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => {}, customElements: { whenDefined: () => Promise.resolve() }, location: { href: '', pathname: '' } };
      if (typeof globalThis.MutationObserver === 'undefined') globalThis.MutationObserver = class { constructor() {} observe() {} disconnect() {} };
      if (typeof globalThis.DOMParser === 'undefined') globalThis.DOMParser = class { parseFromString() { return { querySelector: () => null, querySelectorAll: () => [] }; } };
      if (typeof globalThis.URL === 'undefined') globalThis.URL = class { constructor(path) { this.href = path; } };
      if (jsCode && !globalThis.createSonicArranger) {
        const wrappedCode = jsCode + '\nreturn createSonicArranger;';
        const factory = new Function(wrappedCode);
        const result = factory();
        if (typeof result === 'function') globalThis.createSonicArranger = result;
        else { this.port.postMessage({ type: 'error', message: 'Failed to load JS module' }); return; }
      }
      if (typeof globalThis.createSonicArranger !== 'function') { this.port.postMessage({ type: 'error', message: 'createSonicArranger factory not available' }); return; }
      let capturedMemory = null;
      const origInstantiate = WebAssembly.instantiate;
      WebAssembly.instantiate = async function(...args) {
        const result = await origInstantiate.apply(this, args);
        const instance = result.instance || result;
        if (instance.exports) { for (const value of Object.values(instance.exports)) { if (value instanceof WebAssembly.Memory) { capturedMemory = value; break; } } }
        return result;
      };
      const config = {};
      if (wasmBinary) config.wasmBinary = wasmBinary;
      try { this.module = await globalThis.createSonicArranger(config); } finally { WebAssembly.instantiate = origInstantiate; }
      if (!this.module.wasmMemory && capturedMemory) this.module.wasmMemory = capturedMemory;
      const frameBytes = this.bufferSize * 4;
      this.interleavedPtr = this.module._malloc(this.bufferSize * 2 * 4);
      for (let i = 0; i < 4; i++) this.chPtrs[i] = this.module._malloc(frameBytes);
      if (!this.interleavedPtr) { this.port.postMessage({ type: 'error', message: 'malloc failed' }); return; }
      this.updateBufferViews();
      this.initialized = true;
      this.initializing = false;
      this.port.postMessage({ type: 'ready' });
    } catch (error) { this.initializing = false; this.port.postMessage({ type: 'error', message: error.message }); }
  }
  updateBufferViews() {
    if (!this.module || !this.interleavedPtr) return;
    const heapF32 = this.module.HEAPF32 || (this.module.wasmMemory && new Float32Array(this.module.wasmMemory.buffer));
    if (!heapF32) return;
    if (this.lastHeapBuffer !== heapF32.buffer) {
      this.interleavedBuf = new Float32Array(heapF32.buffer, this.interleavedPtr, this.bufferSize * 2);
      this.chBufs = [];
      for (let i = 0; i < 4; i++) this.chBufs[i] = new Float32Array(heapF32.buffer, this.chPtrs[i], this.bufferSize);
      this.lastHeapBuffer = heapF32.buffer;
    }
  }
  cleanup() {
    if (this.module && this.handle) { this.module._sa_destroy(this.handle); this.handle = 0; }
    if (this.module) {
      if (this.interleavedPtr) { this.module._free(this.interleavedPtr); this.interleavedPtr = 0; }
      for (let i = 0; i < 4; i++) { if (this.chPtrs[i]) { this.module._free(this.chPtrs[i]); this.chPtrs[i] = 0; } }
    }
    this.interleavedBuf = null; this.chBufs = null; this.module = null; this.initialized = false; this.playing = false; this.lastHeapBuffer = null;
  }
  process(inputs, outputs) {
    if (!this.initialized || !this.module || !this.handle || !this.playing) return true;
    const output = outputs[0];
    if (!output || output.length < 2) return true;
    const outputL = output[0], outputR = output[1];
    if (!outputL || !outputR) return true;
    const numSamples = Math.min(outputL.length, this.bufferSize);
    this.updateBufferViews();
    if (!this.chBufs) return true;
    const rendered = this.module._sa_render_multi(this.handle, this.chPtrs[0], this.chPtrs[1], this.chPtrs[2], this.chPtrs[3], numSamples);
    if (rendered > 0) {
      for (let i = 0; i < rendered; i++) {
        outputL[i] = this.chBufs[0][i] + this.chBufs[3][i];
        outputR[i] = this.chBufs[1][i] + this.chBufs[2][i];
      }
      this._oscCounter++;
      if (this._oscCounter >= 8) {
        this._oscCounter = 0;
        const oscSize = Math.min(256, rendered);
        const channels = [];
        for (let ch = 0; ch < 4; ch++) {
          const arr = new Int16Array(oscSize);
          for (let i = 0; i < oscSize; i++) arr[i] = Math.max(-32768, Math.min(32767, Math.round(this.chBufs[ch][i] * 32767)));
          channels.push(arr);
        }
        this.port.postMessage({ type: 'oscData', channels });
      }
    }
    if (this.module._sa_has_ended(this.handle)) this.port.postMessage({ type: 'songEnd' });
    return true;
  }
}
registerProcessor('sonic-arranger-processor', SonicArrangerProcessor);
