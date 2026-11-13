/**
 * Kdm.worklet.js - AudioWorklet processor for the Ken's Digital Music WASM replayer.
 * Stereo 48 kHz output rendered by the engine (kdm-wasm/src/kdm_engine.c); the
 * context resamples when it runs at another rate. waves.kwv is passed in at init.
 */
class KdmProcessor extends AudioWorkletProcessor {
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
    this.lastTick = -1;
    this.ended = false;
    this.q = new Float32Array(1024);
    this.qlen = 0;
    this.frac = 0;
    this.drained = false;
    this.port.onmessage = (event) => { this.handleMessage(event.data); };
  }

  async handleMessage(data) {
    if (data.type !== 'init' && !this.module && this.initializing) return;
    switch (data.type) {
      case 'init':
        await this.initWasm(data.wasmBinary, data.jsCode, data.bankData);
        break;
      case 'loadModule':
        if (!this.module) { this.port.postMessage({ type: 'error', message: 'KDM player not initialised' }); break; }
        this.songBytes = new Uint8Array(data.moduleData);
        this.playing = false;
        if (this.openSong(0)) this.port.postMessage({ type: 'moduleLoaded', channels: 1, totalTicks: this.module._kdm_total_ticks() });
        break;
      case 'replaceModule': {
        // An edited song swapped in while it plays: reopen and fast-forward to the tick.
        if (!this.module) break;
        const tick = this.open ? this.module._kdm_tick() : 0;
        this.songBytes = new Uint8Array(data.moduleData);
        this.openSong(this.playing ? tick : 0);
        break;
      }
      case 'play': this.playing = true; this.lastTick = -1; if (this.ended) this.openSong(0); break;
      case 'stop':
        this.playing = false;
        this.openSong(0);
        this.port.postMessage({ type: 'stopped' });
        break;
      case 'pause': this.playing = !this.playing; break;
      case 'dispose': this.cleanup(); break;
    }
  }

  openSong(skipTicks) {
    const m = this.module;
    if (!m || !this.songBytes) return false;
    if (this.open) { m._kdm_close(); this.open = false; }
    const ptr = m._malloc(this.songBytes.length);
    if (!ptr) { this.port.postMessage({ type: 'error', message: 'malloc failed' }); return false; }
    m.HEAPU8.set(this.songBytes, ptr);
    const ok = m._kdm_open(ptr, this.songBytes.length);
    m._free(ptr);
    if (!ok) { this.port.postMessage({ type: 'error', message: 'kdm_open: ' + m.UTF8ToString(m._kdm_error()) }); return false; }
    this.open = true;
    this.ended = false;
    this.qlen = 0; this.frac = 0; this.drained = false;
    this.lastTick = -1;
    // Fast-forward: render and discard until the replayer is at the wanted tick.
    const scratch = 4800;
    while (skipTicks > 0 && m._kdm_tick() < skipTicks) {
      if (m._kdm_render(this.outPtr, scratch / 12) === 0) break;
    }
    return true;
  }

  async initWasm(wasmBinary, jsCode, bankData) {
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
      if (jsCode && !globalThis.createKdm) {
        const factory = new Function(jsCode + '\nreturn createKdm;');
        const result = factory();
        if (typeof result === 'function') globalThis.createKdm = result;
        else { this.port.postMessage({ type: 'error', message: 'Failed to load JS module' }); return; }
      }
      if (typeof globalThis.createKdm !== 'function') { this.port.postMessage({ type: 'error', message: 'createKdm factory not available' }); return; }
      const config = {};
      if (wasmBinary) config.wasmBinary = wasmBinary;
      this.module = await globalThis.createKdm(config);
      const bank = new Uint8Array(bankData);
      const bankPtr = this.module._malloc(bank.length);
      this.module.HEAPU8.set(bank, bankPtr);
      const bankOk = this.module._kdm_set_bank(bankPtr, bank.length);
      this.module._free(bankPtr);
      if (!bankOk) { this.port.postMessage({ type: 'error', message: 'waves.kwv could not be stored' }); return; }
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
    if (this.module && this.open) { this.module._kdm_close(); }
    if (this.module && this.outPtr) this.module._free(this.outPtr);
    this.open = false; this.outPtr = 0; this.outBuf = null; this.module = null;
    this.initialized = false; this.playing = false; this.lastHeapBuffer = null;
  }

  /** Pull engine frames (always 48 kHz) into the queue until it holds `need` frames. */
  fill(need) {
    const m = this.module;
    while (this.qlen < need && !this.drained) {
      const got = m._kdm_render(this.outPtr, 128);
      this.updateBufferViews();
      if (this.q.length < (this.qlen + 128) * 2) {
        const bigger = new Float32Array((this.qlen + 256) * 2);
        bigger.set(this.q.subarray(0, this.qlen * 2));
        this.q = bigger;
      }
      this.q.set(this.outBuf.subarray(0, got * 2), this.qlen * 2);
      this.qlen += got;
      if (got < 128) this.drained = true;
    }
  }

  process(inputs, outputs) {
    if (!this.initialized || !this.open || !this.playing) return true;
    const output = outputs[0];
    if (!output || output.length < 2) return true;
    const outputL = output[0], outputR = output[1];
    const n = Math.min(outputL.length, 128);
    // Linear resample from the engine's 48 kHz to the context rate.
    const ratio = 48000 / sampleRate;
    const need = Math.floor(this.frac + (n - 1) * ratio) + 2;
    this.fill(need);
    let produced = 0;
    for (let i = 0; i < n; i++) {
      const pos = this.frac + i * ratio;
      const j = Math.floor(pos);
      if (j + 1 >= this.qlen && this.drained) break;
      const t = pos - j;
      outputL[i] = this.q[2 * j] * (1 - t) + this.q[2 * j + 2] * t;
      outputR[i] = this.q[2 * j + 1] * (1 - t) + this.q[2 * j + 3] * t;
      produced++;
    }
    const end = this.frac + produced * ratio;
    const used = Math.floor(end);
    this.frac = end - used;
    this.q.copyWithin(0, used * 2, this.qlen * 2);
    this.qlen = Math.max(0, this.qlen - used);
    const tick = this.module._kdm_tick();
    if (tick !== this.lastTick) { this.lastTick = tick; this.port.postMessage({ type: 'position', tick }); }
    if (produced < n) { this.playing = false; this.ended = true; this.port.postMessage({ type: 'songEnd' }); }
    return true;
  }
}
registerProcessor('kdm-processor', KdmProcessor);
