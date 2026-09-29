/**
 * Oktalyzer.worklet.js — AudioWorklet processor for Oktalyzer WASM replayer
 * Whole-song replayer with per-channel output for oscilloscope.
 */
class OktalyzerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.module = null;
    this.handle = 0;
    // Oktalyzer mixes up to 8 channels (each Paula channel may be split in two).
    this.chPtrs = [0, 0, 0, 0, 0, 0, 0, 0];
    this.numChannels = 4;
    this.pans = [0, 1, 1, 0, 0, 1, 1, 0];
    this.interleavedPtr = 0;
    this.interleavedBuf = null;
    this.initialized = false;
    this.playing = false;
    this.bufferSize = 128;
    this.lastHeapBuffer = null;
    this.initializing = false;
    // Per-channel dub sends + isolation slots (worklets/channel-outputs.js).
    this._outs = globalThis.DevilboxChannelOutputs ? new globalThis.DevilboxChannelOutputs() : null;
    this.port.onmessage = (event) => { this.handleMessage(event.data); };
  }

  async handleMessage(data) {
    if (this._outs && this._outs.handleMessage(data)) return;
    if (data.type !== 'init' && !this.module && this.initializing) return;
    switch (data.type) {
      case 'init':
        await this.initWasm(data.sampleRate, data.wasmBinary, data.jsCode);
        break;
      case 'loadModule': {
        if (!this.module) break;
        try {
          if (this.handle) { this.module._okt_destroy(this.handle); this.handle = 0; }
          const uint8Data = new Uint8Array(data.moduleData);
          const wasmPtr = this.module._malloc(uint8Data.length);
          if (!wasmPtr) { this.port.postMessage({ type: 'error', message: 'malloc failed' }); return; }
          this.module.HEAPU8.set(uint8Data, wasmPtr);
          this.handle = this.module._okt_create(wasmPtr, uint8Data.length, sampleRate);
          this.module._free(wasmPtr);
          if (!this.handle) { this.port.postMessage({ type: 'error', message: 'okt_create failed (unsupported format)' }); return; }
          const subsongCount = this.module._okt_subsong_count(this.handle);
          if (typeof data.subsong === 'number' && data.subsong > 0) this.module._okt_select_subsong(this.handle, data.subsong);
          this.playing = false;
          this.numChannels = this.module._okt_channel_count(this.handle);
          for (let ch = 0; ch < this.numChannels; ch++) this.pans[ch] = this.module._okt_channel_panning(this.handle, ch);
          this._stream?.discontinue();
          this.port.postMessage({ type: 'moduleLoaded', subsongCount, channels: this.numChannels });
        } catch (error) { this.port.postMessage({ type: 'error', message: error.message }); }
        break;
      }
      case 'play': this.playing = true; break;
      case 'stop':
        this.playing = false;
        if (this.handle) this.module._okt_select_subsong(this.handle, 0);
        this.port.postMessage({ type: 'stopped' });
        break;
      case 'pause': this.playing = !this.playing; break;
      case 'setSubsong': if (this.handle) this.module._okt_select_subsong(this.handle, data.subsong); break;
      case 'setChannelMask': if (this.handle) this.module._okt_set_channel_mask(this.handle, data.mask); break;
      case 'setCell': {        if (this.handle && this.module._okt_set_cell) {          this.module._okt_set_cell(this.handle, data.index, data.row, data.channel, data.note, data.instrument, data.effect, data.effectArg);        }        break;      }      case 'setInstrumentParam': {        if (this.handle && this.module._okt_set_instrument_param) {          var pLen = this.module.lengthBytesUTF8(data.param) + 1;          var pPtr = this.module._malloc(pLen);          this.module.stringToUTF8(data.param, pPtr, pLen);          this.module._okt_set_instrument_param(this.handle, data.instrument, pPtr, data.value);          this.module._free(pPtr);        }        break;      }      case 'getInstrumentParam': {        if (this.handle && this.module._okt_get_instrument_param) {          var pLen = this.module.lengthBytesUTF8(data.param) + 1;          var pPtr = this.module._malloc(pLen);          this.module.stringToUTF8(data.param, pPtr, pLen);          var val = this.module._okt_get_instrument_param(this.handle, data.inst, pPtr);          this.module._free(pPtr);          this.port.postMessage({ type: 'instrumentParamValue', inst: data.inst, param: data.param, value: val });        }        break;      }      case 'dispose': this.cleanup(); break;
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
      if (jsCode && !globalThis.createOktalyzer) {
        const wrappedCode = jsCode + '\nreturn createOktalyzer;';
        const factory = new Function(wrappedCode);
        const result = factory();
        if (typeof result === 'function') globalThis.createOktalyzer = result;
        else { this.port.postMessage({ type: 'error', message: 'Failed to load JS module' }); return; }
      }
      if (typeof globalThis.createOktalyzer !== 'function') { this.port.postMessage({ type: 'error', message: 'createOktalyzer factory not available' }); return; }
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
      try { this.module = await globalThis.createOktalyzer(config); } finally { WebAssembly.instantiate = origInstantiate; }
      if (!this.module.wasmMemory && capturedMemory) this.module.wasmMemory = capturedMemory;
      // Allocate interleaved stereo + 4 per-channel mono buffers
      const frameBytes = this.bufferSize * 4; // float32
      this.interleavedPtr = this.module._malloc(this.bufferSize * 2 * 4);
      for (let i = 0; i < 8; i++) this.chPtrs[i] = this.module._malloc(frameBytes);
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
      this.chBufs = [];
      for (let i = 0; i < 8; i++) {
        this.chBufs[i] = new Float32Array(heapF32.buffer, this.chPtrs[i], this.bufferSize);
      }
      this.lastHeapBuffer = heapF32.buffer;
    }
  }

  cleanup() {
    if (this.module && this.handle) { this.module._okt_destroy(this.handle); this.handle = 0; }
    if (this.module) {
      if (this.interleavedPtr) { this.module._free(this.interleavedPtr); this.interleavedPtr = 0; }
      for (let i = 0; i < 8; i++) { if (this.chPtrs[i]) { this.module._free(this.chPtrs[i]); this.chPtrs[i] = 0; } }
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

    // Render per-channel
    const rendered = this.module._okt_render_multi(
      this.handle, this.chPtrs[0], this.chPtrs[1], this.chPtrs[2], this.chPtrs[3],
      this.chPtrs[4], this.chPtrs[5], this.chPtrs[6], this.chPtrs[7], numSamples);

    if (rendered > 0) {
      // Mix to stereo by each channel's side, as okt_render does. A voice in
      // an isolation slot leaves the mix; channel-outputs.js carries it.
      const n = this.numChannels;
      outputL.fill(0, 0, rendered);
      outputR.fill(0, 0, rendered);
      for (let ch = 0; ch < n; ch++) {
        if (this._outs && this._outs.isIsolated(ch)) continue;
        const buf = this.chBufs[ch];
        const out = this.pans[ch] === 0 ? outputL : outputR;
        for (let i = 0; i < rendered; i++) out[i] += buf[i];
      }

      if (this._outs) this._outs.write(outputs, this.chBufs.slice(0, n), rendered, (ch) => (this.pans[ch] === 0 ? 0 : 1));

      // Every sample of each voice, for the oscilloscopes and the per-channel
      // role classifiers (worklets/channel-stream.js).
      if (globalThis.DevilboxChannelStream) {
        this._stream ||= new globalThis.DevilboxChannelStream(this.port, sampleRate);
        this._stream.writeFloat32(this.chBufs.slice(0, this.numChannels), rendered);
      }
    }

    if (this.module._okt_has_ended(this.handle)) this.port.postMessage({ type: 'songEnd' });
    return true;
  }
}
registerProcessor('oktalyzer-processor', OktalyzerProcessor);
