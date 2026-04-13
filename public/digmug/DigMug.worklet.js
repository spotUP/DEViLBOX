/**
 * DigMug.worklet.js — AudioWorklet processor for DigMug WASM replayer
 * Whole-song replayer: dm_create() loads module, dm_render() produces audio.
 */
class DigMugProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.module = null;
    this.handle = 0;
    this.interleavedPtr = 0;
    this.interleavedBuf = null;
    this.initialized = false;
    this.playing = false;
    this.bufferSize = 128;
    this.lastHeapBuffer = null;
    this.initializing = false;
    this.port.onmessage = (event) => { this.handleMessage(event.data); };
  }

  async handleMessage(data) {
    if (data.type !== 'init' && !this.module && this.initializing) return;
    switch (data.type) {
      case 'init':
        await this.initWasm(data.sampleRate, data.wasmBinary, data.jsCode);
        break;
      case 'loadModule': {
        if (!this.module) break;
        try {
          if (this.handle) { this.module._dm_destroy(this.handle); this.handle = 0; }
          const uint8Data = new Uint8Array(data.moduleData);
          const wasmPtr = this.module._malloc(uint8Data.length);
          if (!wasmPtr) { this.port.postMessage({ type: 'error', message: 'malloc failed' }); return; }
          this.module.HEAPU8.set(uint8Data, wasmPtr);
          this.handle = this.module._dm_create(wasmPtr, uint8Data.length, sampleRate);
          this.module._free(wasmPtr);
          if (!this.handle) { this.port.postMessage({ type: 'error', message: 'dm_create failed (unsupported format)' }); return; }
          const subsongCount = this.module._dm_subsong_count(this.handle);
          if (typeof data.subsong === 'number' && data.subsong > 0) this.module._dm_select_subsong(this.handle, data.subsong);
          this.playing = false;
          this.port.postMessage({ type: 'moduleLoaded', subsongCount, channels: 4 });
        } catch (error) { this.port.postMessage({ type: 'error', message: error.message }); }
        break;
      }
      case 'play': this.playing = true; break;
      case 'stop':
        this.playing = false;
        if (this.handle) this.module._dm_select_subsong(this.handle, 0);
        this.port.postMessage({ type: 'stopped' });
        break;
      case 'pause': this.playing = !this.playing; break;
      case 'setSubsong': if (this.handle) this.module._dm_select_subsong(this.handle, data.subsong); break;
      case 'setChannelMask': if (this.handle) this.module._dm_set_channel_mask(this.handle, data.mask); break;
      case 'dispose': this.cleanup(); break;
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
        globalThis.document = {
          createElement: () => ({ relList: { supports: () => false }, tagName: 'DIV', rel: '', addEventListener: () => {}, removeEventListener: () => {} }),
          getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
          getElementsByTagName: () => [], head: { appendChild: () => {} },
          addEventListener: () => {}, removeEventListener: () => {}
        };
      }
      if (typeof globalThis.window === 'undefined') {
        globalThis.window = { addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => {}, customElements: { whenDefined: () => Promise.resolve() }, location: { href: '', pathname: '' } };
      }
      if (typeof globalThis.MutationObserver === 'undefined') globalThis.MutationObserver = class { constructor() {} observe() {} disconnect() {} };
      if (typeof globalThis.DOMParser === 'undefined') globalThis.DOMParser = class { parseFromString() { return { querySelector: () => null, querySelectorAll: () => [] }; } };
      if (typeof globalThis.URL === 'undefined') globalThis.URL = class { constructor(path) { this.href = path; } };
      if (jsCode && !globalThis.createDigMug) {
        const wrappedCode = jsCode + '\nreturn createDigMug;';
        const factory = new Function(wrappedCode);
        const result = factory();
        if (typeof result === 'function') globalThis.createDigMug = result;
        else { this.port.postMessage({ type: 'error', message: 'Failed to load JS module' }); return; }
      }
      if (typeof globalThis.createDigMug !== 'function') { this.port.postMessage({ type: 'error', message: 'createDigMug factory not available' }); return; }
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
      try { this.module = await globalThis.createDigMug(config); } finally { WebAssembly.instantiate = origInstantiate; }
      if (!this.module.wasmMemory && capturedMemory) this.module.wasmMemory = capturedMemory;
      this.interleavedPtr = this.module._malloc(this.bufferSize * 2 * 4);
      if (!this.interleavedPtr) { this.port.postMessage({ type: 'error', message: 'malloc failed for output buffer' }); return; }
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
      this.lastHeapBuffer = heapF32.buffer;
    }
  }

  cleanup() {
    if (this.module && this.handle) { this.module._dm_destroy(this.handle); this.handle = 0; }
    if (this.module && this.interleavedPtr) { this.module._free(this.interleavedPtr); this.interleavedPtr = 0; }
    this.interleavedBuf = null; this.module = null; this.initialized = false; this.playing = false; this.lastHeapBuffer = null;
  }

  process(inputs, outputs) {
    if (!this.initialized || !this.module || !this.handle || !this.playing) return true;
    const output = outputs[0];
    if (!output || output.length < 2) return true;
    const outputL = output[0], outputR = output[1];
    if (!outputL || !outputR) return true;
    const numSamples = Math.min(outputL.length, this.bufferSize);
    this.updateBufferViews();
    if (this.interleavedBuf) {
      const rendered = this.module._dm_render(this.handle, this.interleavedPtr, numSamples);
      if (rendered > 0) { for (let i = 0; i < rendered; i++) { outputL[i] = this.interleavedBuf[i * 2]; outputR[i] = this.interleavedBuf[i * 2 + 1]; } }
      if (this.module._dm_has_ended(this.handle)) this.port.postMessage({ type: 'songEnd' });
    }
    return true;
  }
}
registerProcessor('digmug-processor', DigMugProcessor);
