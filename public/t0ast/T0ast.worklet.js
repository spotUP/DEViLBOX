/**
 * T0ast.worklet.js - AudioWorklet processor for the T0AST WASM replayer
 * (t0ast-wasm/src/bbmp-t0ast.cpp). The engine runs at 44100 Hz; other context rates go
 * through the engine's own resampler. Live edits poke bytes into the DECODED pattern cells the
 * sequencer reads (no reopen); the file's patterns are packed, so pokes are kept and
 * replayed after every reopen (stop / restart).
 */
class T0astProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.module = null;
    this.songBytes = null;
    this.pokes = [];
    this.open = false;
    this.initialized = false;
    this.initializing = false;
    this.playing = false;
    this.outPtr = 0;
    this.outBuf = null;
    this.lastHeapBuffer = null;
    this.lastPos = -1;
    this.ended = false;
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
        this.pokes = [];
        this.playing = false;
        if (this.openSong()) this.port.postMessage({ type: 'moduleLoaded', channels: this.module._t0ast_channels(), durationMs: this.module._t0ast_duration_ms() });
        break;
      case 'poke': {
        // Live edit: offset into the decoded cells (6 bytes a cell). Kept for a reopen (the file is packed).
        if (!this.module || !this.songBytes) break;
        const bytes = new Uint8Array(data.bytes);
        this.pokes.push({ offset: data.offset, bytes });
        if (this.open) this.applyPoke(data.offset, bytes);
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
    if (this.open) { m._t0ast_close(); this.open = false; }
    const ptr = m._malloc(this.songBytes.length);
    if (!ptr) { this.port.postMessage({ type: 'error', message: 'malloc failed' }); return false; }
    m.HEAPU8.set(this.songBytes, ptr);
    const ok = m._t0ast_open(ptr, this.songBytes.length, sampleRate);
    m._free(ptr);
    if (!ok) { this.port.postMessage({ type: 'error', message: 't0ast_open: ' + m.UTF8ToString(m._t0ast_error()) }); return false; }
    this.open = true;
    for (const p of this.pokes) this.applyPoke(p.offset, p.bytes);
    this.ended = false;
    this.lastPos = -1;
    return true;
  }

  applyPoke(offset, bytes) {
    const ptr = this.module._malloc(bytes.length);
    this.module.HEAPU8.set(bytes, ptr);
    this.module._t0ast_poke(offset, ptr, bytes.length);
    this.module._free(ptr);
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
      if (jsCode && !globalThis.createT0ast) {
        const factory = new Function(jsCode + '\nreturn createT0ast;');
        const result = factory();
        if (typeof result === 'function') globalThis.createT0ast = result;
        else { this.port.postMessage({ type: 'error', message: 'Failed to load JS module' }); return; }
      }
      if (typeof globalThis.createT0ast !== 'function') { this.port.postMessage({ type: 'error', message: 'createT0ast factory not available' }); return; }
      const config = {};
      if (wasmBinary) config.wasmBinary = wasmBinary;
      this.module = await globalThis.createT0ast(config);
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
    if (this.module && this.open) { this.module._t0ast_close(); }
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
    const got = this.module._t0ast_render(this.outPtr, n);
    this.updateBufferViews();
    for (let i = 0; i < got; i++) {
      outputL[i] = this.outBuf[2 * i];
      outputR[i] = this.outBuf[2 * i + 1];
    }
    const pos = this.module._t0ast_position();
    // pos = order position * 64 + row.
    if (pos !== this.lastPos) { this.lastPos = pos; this.port.postMessage({ type: 'position', songPos: pos >> 6, row: pos & 63 }); }
    if (got < n) { this.playing = false; this.ended = true; this.port.postMessage({ type: 'songEnd' }); }
    return true;
  }
}
registerProcessor('t0ast-processor', T0astProcessor);
