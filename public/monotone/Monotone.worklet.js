/**
 * Monotone.worklet.js — AudioWorklet processor for Monotone WASM replayer
 * Mono PC-speaker output (same sample on both sides).
 */
class MonotoneProcessor extends AudioWorkletProcessor {
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
    this.lastReport = -1;
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
          if (this.handle) { this.module._mt_destroy(this.handle); this.handle = 0; }
          const uint8Data = new Uint8Array(data.moduleData);
          const wasmPtr = this.module._malloc(uint8Data.length);
          if (!wasmPtr) { this.port.postMessage({ type: 'error', message: 'malloc failed' }); return; }
          this.module.HEAPU8.set(uint8Data, wasmPtr);
          this.handle = this.module._mt_create(wasmPtr, uint8Data.length, sampleRate);
          this.module._free(wasmPtr);
          if (!this.handle) { this.port.postMessage({ type: 'error', message: 'mt_create failed (unsupported format)' }); return; }
          const subsongCount = 1;
          this.playing = false;
          this.port.postMessage({ type: 'moduleLoaded', subsongCount, channels: 1 });
        } catch (error) { this.port.postMessage({ type: 'error', message: error.message }); }
        break;
      }
      case 'replaceModule': {
        // An edited module's tracks swapped in while it plays; every voice keeps its row.
        if (!this.module || !this.handle) break;
        const bytes = new Uint8Array(data.moduleData);
        const ptr = this.module._malloc(bytes.length);
        if (!ptr) break;
        this.module.HEAPU8.set(bytes, ptr);
        this.module._mt_free_replace && 0;
        this.module._free(ptr);
        break;
      }
      case 'play': this.playing = true; this.lastReport = -1; break;
      case 'stop':
        this.playing = false;
        if (this.handle) this.module._mt_restart(this.handle);
        this.port.postMessage({ type: 'stopped' });
        break;
      case 'pause': this.playing = !this.playing; break;
      case 'setChannelMask': if (this.handle) this.module._mt_set_channel_mask(this.handle, data.mask); break;
      case 'setCell':
        // cell: the 16-bit MONOTONE cell word (note<<9 | effect<<6 | data)
        if (this.handle) this.module._mt_set_cell(this.handle, data.pattern, data.row, data.channel, data.cell);
        break;
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
      if (jsCode && !globalThis.createMonotone) {
        const wrappedCode = jsCode + '\nreturn createMonotone;';
        const factory = new Function(wrappedCode);
        const result = factory();
        if (typeof result === 'function') globalThis.createMonotone = result;
        else { this.port.postMessage({ type: 'error', message: 'Failed to load JS module' }); return; }
      }
      if (typeof globalThis.createMonotone !== 'function') { this.port.postMessage({ type: 'error', message: 'createMonotone factory not available' }); return; }
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
      try { this.module = await globalThis.createMonotone(config); } finally { WebAssembly.instantiate = origInstantiate; }
      if (!this.module.wasmMemory && capturedMemory) this.module.wasmMemory = capturedMemory;
      // Interleaved stereo output buffer (PC speaker is mono: same sample both sides)
      const frameBytes = this.bufferSize * 4; // float32
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
    if (this.module && this.handle) { this.module._mt_destroy(this.handle); this.handle = 0; }
    if (this.module) {
      if (this.interleavedPtr) { this.module._free(this.interleavedPtr); this.interleavedPtr = 0; }
    }
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
    if (!this.interleavedBuf) return true;

    const rendered = this.module._mt_render_stereo(this.handle, this.interleavedPtr, numSamples);
    const buf = this.interleavedBuf;
    for (let i = 0; i < rendered; i++) { outputL[i] = buf[2 * i]; outputR[i] = buf[2 * i + 1]; }

    // The row the voices last read: song position and the row within it, the
    // player's own counters (act_get_position / act_get_row), reported when
    // they change.
    const position = this.module._mt_get_position(this.handle);
    const row = this.module._mt_get_row(this.handle);
    const key = position * 65536 + row;
    if (key !== this.lastReport) {
      this.lastReport = key;
      this.port.postMessage({ type: 'position', position, row });
    }

    if (this.module._mt_has_ended(this.handle)) this.port.postMessage({ type: 'songEnd' });
    return true;
  }
}
registerProcessor('monotone-processor', MonotoneProcessor);
