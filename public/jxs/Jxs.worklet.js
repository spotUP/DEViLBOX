/**
 * Jxs.worklet.js - AudioWorklet processor for the JayTrax (.jxs) WASM replayer.
 * Stereo 44.1 kHz output rendered by the engine (jxs-wasm/src/jxs_engine.cpp); the
 * context resamples when it runs at another rate. Subsong 0 is played.
 */
class JxsProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.module = null;
    this.songBytes = null;
    this.track = 0;
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
    // Keyboard preview: a second copy of the module (voice 0 only), rendered apart from the song at 44.1 kHz.
    this.previewOn = false;   // the copy is made in the WASM
    this.previewKey = null;   // the module bytes the copy was made from
    this.previewPtr = 0;      // stereo frames the copy renders into
    this.pq = new Float32Array(1024);
    this.pqlen = 0;
    this.pfrac = 0;
    // Per-voice mono queues (aligned with q) and the per-quantum voice buffers handed to
    // worklets/channel-outputs.js (dub sends, isolation) and channel-stream.js (scopes, VU).
    this.voices = 0;
    this.vq = [];
    this.chBufs = [];
    // Channel meters: each voice's peak since the last report, and the report cadence.
    this.peaks = new Float32Array(16);
    this.reportCounter = 0;
    this._outs = globalThis.DevilboxChannelOutputs ? new globalThis.DevilboxChannelOutputs() : null;
    this.port.onmessage = (event) => { this.handleMessage(event.data); };
  }

  async handleMessage(data) {
    if (this._outs && this._outs.handleMessage(data)) return;
    if (data.type !== 'init' && !this.module && this.initializing) return;
    switch (data.type) {
      case 'init':
        await this.initWasm(data.wasmBinary, data.jsCode);
        break;
      case 'loadModule':
        if (!this.module) { this.port.postMessage({ type: 'error', message: 'JXS player not initialised' }); break; }
        this.songBytes = new Uint8Array(data.moduleData);
        this.track = data.subsong | 0;   // the subsong jxs_open plays; a replaced (edited) module keeps it
        this.playing = false;
        if (this.openSong(0)) this.port.postMessage({ type: 'moduleLoaded', channels: this.voices, durationMs: this.module._jxs_duration_ms(), tracks: this.module._jxs_tracks() });
        break;
      case 'replaceModule': {
        // An edited song swapped in while it plays: reopen and fast-forward to the tick.
        if (!this.module) break;
        const pos = this.open ? this.module._jxs_bar() * 64 + this.module._jxs_step() : 0;
        this.songBytes = new Uint8Array(data.moduleData);
        this.openSong(this.playing ? pos : 0);
        break;
      }
      case 'play': this.playing = true; this.lastTick = -1; if (this.ended) this.openSong(0); break;
      case 'stop':
        this.playing = false;
        this.openSong(0);
        this.port.postMessage({ type: 'stopped' });
        break;
      case 'pause': this.playing = !this.playing; break;
      case 'previewLoad': this.previewLoad(data.buffer); break;
      case 'noteOn': if (this.previewOn) { this.pqlen = 0; this.pfrac = 0; this.module._jxs_preview_note(data.instrument, data.note); } break;
      case 'noteOff': if (this.previewOn) this.module._jxs_preview_stop(); break;
      case 'dispose': this.cleanup(); break;
    }
  }

  /** Make the preview copy of the module (the replayer plays the keys itself, apart from the song). */
  previewLoad(buffer) {
    const m = this.module;
    if (!m || !buffer) return;
    if (this.previewKey === buffer && this.previewOn) return;
    const bytes = new Uint8Array(buffer);
    const ptr = m._malloc(bytes.length);
    if (!ptr) return;
    m.HEAPU8.set(bytes, ptr);
    this.previewOn = m._jxs_preview_open(ptr, bytes.length) === 1;
    m._free(ptr);
    this.previewKey = this.previewOn ? buffer : null;
    this.pqlen = 0; this.pfrac = 0;
  }

  /** Keyboard voice: the preview copy's voice 0, resampled and added to both sides. */
  addPreview(outputL, outputR, n) {
    if (!this.previewOn || !this.previewPtr) return;
    const m = this.module;
    const ratio = 44100 / sampleRate;
    const need = Math.floor(this.pfrac + (n - 1) * ratio) + 2;
    while (this.pqlen < need) {
      const got = m._jxs_preview_render(this.previewPtr, 128);
      if (got <= 0) return;
      if (this.pq.length < (this.pqlen + 128) * 2) {
        const bigger = new Float32Array((this.pqlen + 256) * 2);
        bigger.set(this.pq.subarray(0, this.pqlen * 2));
        this.pq = bigger;
      }
      const base = this.previewPtr >> 2;
      this.pq.set(m.HEAPF32.subarray(base, base + got * 2), this.pqlen * 2);
      this.pqlen += got;
    }
    for (let i = 0; i < n; i++) {
      const pos = this.pfrac + i * ratio;
      const j = Math.floor(pos);
      const t = pos - j;
      outputL[i] += this.pq[2 * j] * (1 - t) + this.pq[2 * j + 2] * t;
      outputR[i] += this.pq[2 * j + 1] * (1 - t) + this.pq[2 * j + 3] * t;
    }
    const end = this.pfrac + n * ratio;
    const used = Math.floor(end);
    this.pfrac = end - used;
    this.pq.copyWithin(0, used * 2, this.pqlen * 2);
    this.pqlen = Math.max(0, this.pqlen - used);
  }

  openSong(skipTicks) {
    const m = this.module;
    if (!m || !this.songBytes) return false;
    if (this.open) { m._jxs_close(); this.open = false; }
    const ptr = m._malloc(this.songBytes.length);
    if (!ptr) { this.port.postMessage({ type: 'error', message: 'malloc failed' }); return false; }
    m.HEAPU8.set(this.songBytes, ptr);
    const ok = m._jxs_open(ptr, this.songBytes.length, this.track);
    m._free(ptr);
    if (!ok) { this.port.postMessage({ type: 'error', message: 'jxs_open: ' + m.UTF8ToString(m._jxs_error()) }); return false; }
    this.open = true;
    this.voices = m._jxs_voices();
    this.vq = []; this.chBufs = [];
    for (let c = 0; c < this.voices; c++) { this.vq.push(new Float32Array(1024)); this.chBufs.push(new Float32Array(128)); }
    this.ended = false;
    this.qlen = 0; this.frac = 0; this.drained = false;
    this.lastTick = -1;
    // Fast-forward: render and discard until the replayer is at the wanted bar and step.
    const scratch = 4800;
    while (skipTicks > 0 && m._jxs_bar() * 64 + m._jxs_step() < skipTicks) {
      if (m._jxs_render(this.outPtr, scratch / 12) === 0) break;
    }
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
      if (jsCode && !globalThis.createJxs) {
        const factory = new Function(jsCode + '\nreturn createJxs;');
        const result = factory();
        if (typeof result === 'function') globalThis.createJxs = result;
        else { this.port.postMessage({ type: 'error', message: 'Failed to load JS module' }); return; }
      }
      if (typeof globalThis.createJxs !== 'function') { this.port.postMessage({ type: 'error', message: 'createJxs factory not available' }); return; }
      const config = {};
      if (wasmBinary) config.wasmBinary = wasmBinary;
      this.module = await globalThis.createJxs(config);
      this.outPtr = this.module._malloc(128 * 2 * 4);
      this.previewPtr = this.module._malloc(128 * 2 * 4);
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
    if (this.module && this.open) { this.module._jxs_close(); }
    if (this.module && this.outPtr) this.module._free(this.outPtr);
    if (this.module && this.previewPtr) this.module._free(this.previewPtr);
    if (this.module && this.previewOn) this.module._jxs_preview_close();
    this.previewOn = false; this.previewKey = null; this.previewPtr = 0; this.pqlen = 0; this.pfrac = 0;
    this.open = false; this.outPtr = 0; this.outBuf = null; this.module = null;
    this.initialized = false; this.playing = false; this.lastHeapBuffer = null;
  }

  /** Pull engine frames (always 44.1 kHz) into the queue until it holds `need` frames. */
  fill(need) {
    const m = this.module;
    while (this.qlen < need && !this.drained) {
      const got = m._jxs_render(this.outPtr, 128);
      this.updateBufferViews();
      if (this.q.length < (this.qlen + 128) * 2) {
        const bigger = new Float32Array((this.qlen + 256) * 2);
        bigger.set(this.q.subarray(0, this.qlen * 2));
        this.q = bigger;
      }
      this.q.set(this.outBuf.subarray(0, got * 2), this.qlen * 2);
      for (let c = 0; c < this.voices; c++) {
        if (this.vq[c].length < this.qlen + 128) {
          const vb = new Float32Array(this.qlen + 256);
          vb.set(this.vq[c].subarray(0, this.qlen));
          this.vq[c] = vb;
        }
        const vp = m._jxs_voice(c) >> 2;
        this.vq[c].set(m.HEAPF32.subarray(vp, vp + got), this.qlen);
      }
      this.qlen += got;
      if (got < 128) this.drained = true;
    }
  }

  process(inputs, outputs) {
    if (!this.initialized) return true;
    const output = outputs[0];
    if (!output || output.length < 2) return true;
    const outputL = output[0], outputR = output[1];
    const n = Math.min(outputL.length, 128);
    if (!this.open || !this.playing) {
      // The song is silent: only the keyboard voice sounds.
      if (this.previewOn) { outputL.fill(0); outputR.fill(0); this.addPreview(outputL, outputR, n); }
      return true;
    }
    // Linear resample from the engine's 48 kHz to the context rate.
    const ratio = 44100 / sampleRate;
    const need = Math.floor(this.frac + (n - 1) * ratio) + 2;
    this.fill(need);
    const o = this._outs;
    if (o && this.module._jxs_set_isolated) this.module._jxs_set_isolated(o.isolatedMask >>> 0);
    let produced = 0;
    for (let i = 0; i < n; i++) {
      const pos = this.frac + i * ratio;
      const j = Math.floor(pos);
      if (j + 1 >= this.qlen && this.drained) break;
      const t = pos - j;
      outputL[i] = this.q[2 * j] * (1 - t) + this.q[2 * j + 2] * t;
      outputR[i] = this.q[2 * j + 1] * (1 - t) + this.q[2 * j + 3] * t;
      for (let c = 0; c < this.voices; c++) this.chBufs[c][i] = this.vq[c][j] * (1 - t) + this.vq[c][j + 1] * t;
      produced++;
    }
    // Every sample of each voice, for the oscilloscopes, the level meters and the per-channel dub
    // sends / isolation slots. A voice buffer holds its whole main-mix share (both sides added); an
    // isolation slot splits it by the voice's own pan (gain 1), so the slot sounds as the voice did in
    // the main mix. A dub send is mono on both sides: half of the buffer, the mean of the two sides.
    if (this.voices > 0 && produced > 0) {
      if (o) o.write(outputs, this.chBufs, produced, (c) => this.module._jxs_voice_side(c), 1, 0.5);
      if (globalThis.DevilboxChannelStream) {
        this._stream ||= new globalThis.DevilboxChannelStream(this.port, sampleRate);
        this._stream.writeFloat32(this.chBufs, produced);
      }
    }
    // Channel meters every 8 quanta: each voice's peak and its note-start count, stamped with the
    // audio clock so the meter is held until the sound is heard. The counts make a quiet voice
    // (a soft lead, a slow attack) flash on every note, which a level rise alone can miss.
    for (let c = 0; c < this.voices; c++) {
      const b = this.chBufs[c];
      let p = this.peaks[c];
      for (let i = 0; i < produced; i++) { const v = Math.abs(b[i]); if (v > p) p = v; }
      this.peaks[c] = p;
    }
    if (++this.reportCounter >= 8 && this.voices > 0) {
      this.reportCounter = 0;
      const levels = [], noteStarts = [];
      for (let c = 0; c < this.voices; c++) {
        levels.push(Math.min(1, this.peaks[c]));
        noteStarts.push(this.module._jxs_note_starts(c) >>> 0);
        this.peaks[c] = 0;
      }
      this.port.postMessage({ type: 'chLevels', levels, noteStarts, audioTime: currentTime });
    }
    this.addPreview(outputL, outputR, produced);
    const end = this.frac + produced * ratio;
    const used = Math.floor(end);
    this.frac = end - used;
    this.q.copyWithin(0, used * 2, this.qlen * 2);
    for (let c = 0; c < this.voices; c++) this.vq[c].copyWithin(0, used, this.qlen);
    this.qlen = Math.max(0, this.qlen - used);
    const bar = this.module._jxs_bar(), step = this.module._jxs_step();
    const pos = bar * 64 + step;
    if (pos !== this.lastTick) { this.lastTick = pos; this.port.postMessage({ type: 'position', bar, step }); }
    if (produced < n) { this.playing = false; this.ended = true; this.port.postMessage({ type: 'songEnd' }); }
    return true;
  }
}
registerProcessor('jxs-processor', JxsProcessor);
