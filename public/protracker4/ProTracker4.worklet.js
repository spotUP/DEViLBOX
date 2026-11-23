/**
 * ProTracker4.worklet.js - AudioWorklet processor for the ProTracker 4 replayer (libpt4 compiled to WASM,
 * protracker4-wasm/). player_render() writes interleaved stereo; it is split into the two output channels here.
 * libpt4 mixes to stereo itself, so there are no per-channel outputs.
 */

class ProTracker4Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.module = null;
    this.interleavedPtr = 0;
    this.interleavedBuf = null;
    this.initialized = false;
    this.initializing = false;
    this.bufferSize = 128;
    this.lastHeapBuffer = null;
    this.loaded = false;
    this.playing = false;
    this.framesPlayed = 0;      // frames rendered since the song started: a swapped-in module catches up to here
    this.muteMask = 0xFFFFFFFF; // bit N set = channel N audible
    this.channels = 0;
    this.quanta = 0;
    this.scopePtr = 0;
    this.port.onmessage = (event) => { this.handleMessage(event.data); };
  }

  async handleMessage(data) {
    if (data.type !== 'init' && !this.module && this.initializing) return;
    switch (data.type) {
      case 'init':
        await this.initModule(data.sampleRate, data.wasmBinary, data.jsCode);
        break;
      case 'loadModule':
        // Answer every load: the engine waits for moduleLoaded or error before it reports loaded.
        if (this.loadBytes(data.moduleData)) {
          this.framesPlayed = 0;
          this.loaded = true;
          this.playing = true;
          this.port.postMessage({ type: 'moduleLoaded', channels: this.channels });
        }
        break;
      case 'swapModule':
        this.swapModule(data.moduleData);
        break;
      case 'play':
        this.playing = true;
        break;
      case 'pause':
        this.playing = false;
        break;
      case 'stop':
        this.playing = false;
        this.framesPlayed = 0;
        if (this.module) this.module._player_stop();
        break;
      case 'setMuteMask':
        this.muteMask = data.mask;
        this.applyMuteMask();
        break;
      case 'dispose':
        this.cleanup();
        break;
    }
  }

  /** Copies a module into the WASM heap and opens it. Posts the error and returns false if it does not open. */
  loadBytes(moduleData) {
    if (!this.module || !moduleData) {
      this.port.postMessage({ type: 'error', message: 'ProTracker 4 player not initialised' });
      return false;
    }
    const bytes = new Uint8Array(moduleData);
    const ptr = this.module._malloc(bytes.length);
    if (!ptr) { this.port.postMessage({ type: 'error', message: 'malloc failed for module data' }); return false; }
    this.heapU8().set(bytes, ptr);
    const err = this.module._player_load(ptr, bytes.length);
    this.module._free(ptr);
    if (err !== 0) { this.port.postMessage({ type: 'error', message: 'libpt4 could not open the module (code ' + err + ')' }); return false; }
    this.channels = this.module._player_get_channels();
    this.applyMuteMask();
    this.updateBufferViews();
    return true;
  }

  /**
   * An edited module takes the place of the playing one without a restart. The edited module is opened and run silently for
   * the frames already played, in the blocks they were played in (the replayer is deterministic); from there it is the edited
   * module played from the start, at the position the listener is at.
   */
  swapModule(moduleData) {
    if (!this.loadBytes(moduleData)) return;
    let left = this.framesPlayed;
    while (left > 0) {
      const n = Math.min(this.bufferSize, left);
      this.module._player_render(this.interleavedPtr, n);
      left -= n;
    }
    this.port.postMessage({ type: 'moduleSwapped', frames: this.framesPlayed });
  }

  applyMuteMask() {
    if (!this.module) return;
    for (let ch = 0; ch < 32; ch++) this.module._player_set_channel_gain(ch, (this.muteMask >>> ch) & 1 ? 1 : 0);
  }

  heapU8() { return this.module.HEAPU8 || new Uint8Array(this.module.wasmMemory.buffer); }

  async initModule(sampleRate, wasmBinary, jsCode) {
    this.initializing = true;
    try {
      this.cleanup();
      if (jsCode && !globalThis.createProTracker4) {
        if (typeof globalThis.document === 'undefined') {
          globalThis.document = { createElement: () => ({}), getElementsByTagName: () => [], head: { appendChild: () => {} }, addEventListener: () => {}, removeEventListener: () => {} };
        }
        if (typeof globalThis.window === 'undefined') {
          globalThis.window = { addEventListener: () => {}, removeEventListener: () => {}, location: { href: '', pathname: '' } };
        }
        const result = new Function(jsCode + '\nreturn createProTracker4;')();
        if (typeof result !== 'function') {
          this.port.postMessage({ type: 'error', message: 'Failed to load the ProTracker 4 JS module' });
          return;
        }
        globalThis.createProTracker4 = result;
      }
      if (typeof globalThis.createProTracker4 !== 'function') {
        this.port.postMessage({ type: 'error', message: 'ProTracker 4 factory not available' });
        return;
      }

      let capturedMemory = null;
      const origInstantiate = WebAssembly.instantiate;
      WebAssembly.instantiate = async function (...args) {
        const result = await origInstantiate.apply(this, args);
        const instance = result.instance || result;
        if (instance.exports) {
          for (const value of Object.values(instance.exports)) {
            if (value instanceof WebAssembly.Memory) { capturedMemory = value; break; }
          }
        }
        return result;
      };
      const config = {};
      if (wasmBinary) {
        config.wasmBinary = wasmBinary;
        // Emscripten 7 glue ignores wasmBinary and falls back to fetch/XHR, which a worklet does not have.
        config.instantiateWasm = (imports, done) => {
          WebAssembly.instantiate(wasmBinary, imports).then((r) => done(r.instance, r.module));
          return {};
        };
      }
      try {
        this.module = await globalThis.createProTracker4(config);
      } finally {
        WebAssembly.instantiate = origInstantiate;
      }
      if (!this.module.wasmMemory && capturedMemory) this.module.wasmMemory = capturedMemory;

      this.scopePtr = this.module._malloc(256 * 2);
      this.interleavedPtr = this.module._malloc(this.bufferSize * 2 * 4);
      if (!this.interleavedPtr) {
        this.port.postMessage({ type: 'error', message: 'malloc failed for output buffer' });
        return;
      }
      this.module._player_set_sample_rate(sampleRate);
      this.updateBufferViews();
      this.initialized = true;
      this.port.postMessage({ type: 'ready' });
    } catch (error) {
      this.port.postMessage({ type: 'error', message: error.message });
    } finally {
      this.initializing = false;
    }
  }

  updateBufferViews() {
    if (!this.module || !this.interleavedPtr) return;
    const heapF32 = this.module.HEAPF32 || (this.module.wasmMemory && new Float32Array(this.module.wasmMemory.buffer));
    if (heapF32 && this.lastHeapBuffer !== heapF32.buffer) {
      this.interleavedBuf = new Float32Array(heapF32.buffer, this.interleavedPtr, this.bufferSize * 2);
      this.lastHeapBuffer = heapF32.buffer;
    }
  }

  cleanup() {
    if (this.module && this.interleavedPtr) this.module._free(this.interleavedPtr);
    this.interleavedPtr = 0;
    this.scopePtr = 0;
    this.interleavedBuf = null;
    this.module = null;
    this.initialized = false;
    this.loaded = false;
    this.lastHeapBuffer = null;
  }

  /** Per-voice peak (0..1) and the last 256 samples of each voice, as the mixer output it (a muted voice reads flat). */
  postMeters() {
    const m = this.module;
    const n = this.channels;
    const levels = new Array(n);
    const channels = new Array(n);
    const buf = this.heapU8().buffer;
    for (let c = 0; c < n; c++) {
      levels[c] = Math.min(1, m._player_voice_peak(c) / 16384);
      m._player_voice_scope(c, this.scopePtr);
      channels[c] = new Int16Array(buf.slice(this.scopePtr, this.scopePtr + 512));
    }
    this.port.postMessage({ type: 'vu', levels, audioTime: currentTime });
    this.port.postMessage({ type: 'oscData', channels, frame: this.framesPlayed, sampleRate }, channels.map((a) => a.buffer));
  }

  process(inputs, outputs) {
    if (!this.initialized || !this.module || !this.loaded || !this.playing) return true;
    const output = outputs[0];
    if (!output || output.length < 2) return true;
    const outputL = output[0];
    const outputR = output[1];
    const numSamples = Math.min(outputL.length, this.bufferSize);
    const rendered = this.module._player_render(this.interleavedPtr, numSamples);
    this.updateBufferViews();
    if (rendered > 0 && this.interleavedBuf) {
      this.framesPlayed += rendered;
      if ((++this.quanta & 3) === 0) this.postMeters();
      for (let i = 0; i < rendered; i++) {
        outputL[i] = this.interleavedBuf[i * 2];
        outputR[i] = this.interleavedBuf[i * 2 + 1];
      }
    }
    return true;
  }
}

registerProcessor('protracker4-processor', ProTracker4Processor);
