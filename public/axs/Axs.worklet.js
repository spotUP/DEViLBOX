/**
 * Axs.worklet.js - AudioWorklet processor for the AXS (AXSF) WASM replayer (axs-wasm/src/axs.cpp,
 * clean-room). The replayer makes 44.1 kHz stereo; the glue takes it to the context rate. Live cell
 * edits are kept in a list and applied again after every reopen (stop / restart).
 */
class AxsProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.module = null;
    this.songBytes = null;
    this.open = false;
    this.initialized = false;
    this.initializing = false;
    this.playing = false;
    this.outPtr = 0;
    this.outBuf = null;
    this.lastHeapBuffer = null;
    this.lastPos = -1;
    this.ended = false;
    this.edits = [];
    this.port.onmessage = (event) => { this.handleMessage(event.data); };
  }

  async handleMessage(data) {
    if (data.type !== 'init' && !this.module && this.initializing) return;
    switch (data.type) {
      case 'init':
        await this.initWasm(data.wasmBinary, data.jsCode);
        break;
      case 'loadModule':
        if (!this.module) break;
        this.songBytes = new Uint8Array(data.moduleData);
        this.edits = [];
        this.playing = false;
        if (this.openSong()) this.port.postMessage({ type: 'moduleLoaded', durationMs: this.module._axs_duration_ms() });
        break;
      case 'setCell': {
        // Live edit: one cell of a block; also patched into the song bytes' TRAK so a reopen keeps it.
        if (!this.module || !this.open) break;
        this.module._axs_set_cell(data.block, data.track, data.row, data.note, data.vel, data.cmd, data.par);
        this.edits.push(data);
        break;
      }
      case 'play': this.playing = true; this.lastPos = -1; if (this.ended) this.openSong(); break;
      case 'stop':
        this.playing = false;
        this.openSong();
        this.port.postMessage({ type: 'stopped' });
        break;
      case 'pause': this.playing = !this.playing; break;
      case 'dispose': this.cleanup(); break;
    }
  }

  openSong() {
    const m = this.module;
    if (!m || !this.songBytes) return false;
    if (this.open) { m._axs_close(); this.open = false; }
    const ptr = m._malloc(this.songBytes.length);
    if (!ptr) { this.port.postMessage({ type: 'error', message: 'malloc failed' }); return false; }
    m.HEAPU8.set(this.songBytes, ptr);
    const ok = m._axs_open(ptr, this.songBytes.length, sampleRate);
    m._free(ptr);
    if (!ok) { this.port.postMessage({ type: 'error', message: 'axs_open: ' + m.UTF8ToString(m._axs_error()) }); return false; }
    for (const e of this.edits) m._axs_set_cell(e.block, e.track, e.row, e.note, e.vel, e.cmd, e.par);
    this.open = true;
    this.ended = false;
    this.lastPos = -1;
    return true;
  }

  async initWasm(wasmBinary, jsCode) {
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
      if (jsCode && !globalThis.createAxs) {
        const factory = new Function(jsCode + '\nreturn createAxs;');
        const result = factory();
        if (typeof result === 'function') globalThis.createAxs = result;
        else { this.port.postMessage({ type: 'error', message: 'Failed to load JS module' }); return; }
      }
      if (typeof globalThis.createAxs !== 'function') { this.port.postMessage({ type: 'error', message: 'createAxs factory not available' }); return; }
      const config = {};
      if (wasmBinary) config.wasmBinary = wasmBinary;
      this.module = await globalThis.createAxs(config);
      this.outPtr = this.module._malloc(128 * 2 * 4);
      this.updateBufferViews();
      this.initialized = true;
      this.initializing = false;
      this.port.postMessage({ type: 'ready' });
    } catch (error) { this.initializing = false; this.port.postMessage({ type: 'error', message: error.message }); }
  }

  updateBufferViews() {
    if (!this.module || !this.outPtr) return;
    const heap = this.module.HEAPF32;
    if (this.lastHeapBuffer !== heap.buffer) {
      this.outBuf = new Float32Array(heap.buffer, this.outPtr, 128 * 2);
      this.lastHeapBuffer = heap.buffer;
    }
  }

  cleanup() {
    if (this.module && this.open) { this.module._axs_close(); }
    if (this.module && this.outPtr) this.module._free(this.outPtr);
    this.open = false; this.outPtr = 0; this.outBuf = null; this.module = null;
    this.initialized = false; this.playing = false; this.lastHeapBuffer = null;
  }

  process(inputs, outputs) {
    if (!this.initialized || !this.open || !this.playing) return true;
    const output = outputs[0];
    if (!output || output.length < 2) return true;
    const outputL = output[0], outputR = output[1];
    const n = Math.min(outputL.length, 128);
    const got = this.module._axs_render(this.outPtr, n);
    this.updateBufferViews();
    for (let i = 0; i < got; i++) {
      outputL[i] = this.outBuf[2 * i];
      outputR[i] = this.outBuf[2 * i + 1];
    }
    const position = this.module._axs_position(), row = this.module._axs_row();
    const key = position * 256 + row;
    if (key !== this.lastPos) { this.lastPos = key; this.port.postMessage({ type: 'position', position, row }); }
    if (got < n) { this.playing = false; this.ended = true; this.port.postMessage({ type: 'songEnd' }); }
    return true;
  }
}
registerProcessor('axs-processor', AxsProcessor);
