/**
 * Maxtrax.worklet.js — AudioWorklet processor for MaxTrax WASM player
 *
 * The WASM maxtrax_render() produces F32 stereo interleaved at 28150 Hz
 * (PAULA_RATE_PAL).  The worklet resamples to the AudioContext rate on the fly
 * using a ring buffer + linear interpolation.
 *
 * Message protocol (main thread → worklet):
 *   { type: 'init',   sampleRate, wasmBinary, jsCode }  — instantiate WASM
 *   { type: 'load',   buffer: ArrayBuffer, score: number }  — load + play
 *   { type: 'stop' }  — stop playback
 *   { type: 'dispose' }  — teardown
 *
 * Message protocol (worklet → main thread):
 *   { type: 'ready' }                 — WASM initialized
 *   { type: 'moduleLoaded', result }  — song loaded (result = 0 on success)
 *   { type: 'error', message }        — error
 */

const WASM_RATE = 28150; // PAULA_RATE_PAL — fixed output rate of the WASM
const VBLANK_CHUNK = 563; // WASM_RATE / 50 — fire VBlank every this many frames

class MaxtraxProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.module = null;
    this.initialized = false;
    this.initializing = false;

    // WASM output buffer (allocated after WASM init)
    this.wasmBufPtr = 0;
    this.wasmBufFrames = VBLANK_CHUNK; // render in VBlank-sized chunks

    // Resampling: WASM always outputs at WASM_RATE; AudioContext may be 44100 or 48000
    // ratio < 1 means we need fewer WASM samples than output samples
    this.ratio = WASM_RATE / sampleRate;

    // Ring buffer: holds WASM-rate F32 samples waiting to be consumed
    const RING_CAP = 8192;
    this.ringCap = RING_CAP;
    this.ringL = new Float32Array(RING_CAP);
    this.ringR = new Float32Array(RING_CAP);

    // Absolute position counters (never reset — float64 is safe for millions of years)
    this.readPos = 0.0;  // fractional WASM sample position consumed so far
    this.writePos = 0;   // integer WASM samples rendered so far

    this.port.onmessage = (e) => this.handleMessage(e.data);
  }

  handleMessage(data) {
    switch (data.type) {
      case 'init':
        this.initModule(data.wasmBinary, data.jsCode);
        break;

      case 'load':
        this.loadSong(data.buffer, data.score | 0);
        break;

      case 'stop':
        if (this.module && typeof this.module._maxtrax_stop === 'function') {
          try { this.module._maxtrax_stop(); } catch { /* ignore */ }
        }
        // Reset resampler so stale buffered samples don't play on next load
        this.readPos = 0;
        this.writePos = 0;
        break;

      case 'setEvent':
        if (this.module && typeof this.module._maxtrax_set_event === 'function') {
          try {
            this.module._maxtrax_set_event(
              data.score, data.index,
              data.ev.command, data.ev.data, data.ev.startTime, data.ev.stopTime,
            );
          } catch { /* ignore — WASM not ready or bad index */ }
        }
        break;

      case 'recook':
        if (this.module && typeof this.module._maxtrax_recook === 'function') {
          try { this.module._maxtrax_recook(data.score); } catch { /* ignore */ }
        }
        break;

      case 'setPatchScalar':
        if (this.module && typeof this.module._maxtrax_set_patch_scalar === 'function') {
          try { this.module._maxtrax_set_patch_scalar(data.patchNumber, data.field, data.value); } catch { /* ignore */ }
        }
        break;

      case 'reloadPatch':
        if (this.module && typeof this.module._maxtrax_reload_patch === 'function') {
          try {
            const bytes = new Uint8Array(data.bytes);
            const ptr = this.module._malloc(data.len);
            if (ptr) {
              this.module.HEAPU8.set(bytes, ptr);
              this.module._maxtrax_reload_patch(data.patchNumber, ptr, data.len);
              this.module._free(ptr);
            }
          } catch { /* ignore */ }
        }
        break;

      case 'dispose':
        if (this.module && typeof this.module._maxtrax_stop === 'function') {
          try { this.module._maxtrax_stop(); } catch { /* ignore */ }
        }
        if (this.module && this.wasmBufPtr) {
          try { this.module._free(this.wasmBufPtr); } catch { /* ignore */ }
          this.wasmBufPtr = 0;
        }
        this.module = null;
        this.initialized = false;
        break;
    }
  }

  async initModule(wasmBinary, jsCode) {
    if (this.initializing) return;
    this.initializing = true;
    try {
      // Emscripten JS needs some browser globals that don't exist in AudioWorkletGlobalScope
      if (typeof globalThis.document === 'undefined') {
        globalThis.document = {
          createElement: () => ({
            relList: { supports: () => false }, tagName: 'DIV', rel: '',
            addEventListener: () => {}, removeEventListener: () => {},
          }),
          getElementById: () => null, querySelector: () => null,
          querySelectorAll: () => [], getElementsByTagName: () => [],
          head: { appendChild: () => {} },
          addEventListener: () => {}, removeEventListener: () => {},
        };
      }
      if (typeof globalThis.window === 'undefined') {
        globalThis.window = {
          addEventListener: () => {}, removeEventListener: () => {},
          dispatchEvent: () => {}, location: { href: '', pathname: '' },
          customElements: { whenDefined: () => Promise.resolve() },
        };
      }
      if (typeof globalThis.MutationObserver === 'undefined') {
        globalThis.MutationObserver = class { constructor() {} observe() {} disconnect() {} };
      }
      if (typeof globalThis.DOMParser === 'undefined') {
        globalThis.DOMParser = class {
          parseFromString() { return { querySelector: () => null, querySelectorAll: () => [] }; }
        };
      }
      if (typeof globalThis.URL === 'undefined') {
        globalThis.URL = class { constructor(p) { this.href = p; } };
      }

      if (!globalThis.createMaxtrax) {
        const wrapped = jsCode + '\nreturn createMaxtrax;';
        const factory = new Function(wrapped);
        const fn = factory();
        if (typeof fn !== 'function') throw new Error('createMaxtrax factory not a function');
        globalThis.createMaxtrax = fn;
      }

      // Intercept WebAssembly.instantiate to capture the Memory object (Emscripten
      // doesn't always expose wasmMemory directly).
      let capturedMemory = null;
      const origInstantiate = WebAssembly.instantiate;
      WebAssembly.instantiate = async function (...args) {
        const result = await origInstantiate.apply(this, args);
        const instance = result.instance || result;
        if (instance.exports) {
          for (const v of Object.values(instance.exports)) {
            if (v instanceof WebAssembly.Memory) { capturedMemory = v; break; }
          }
        }
        return result;
      };

      const config = {};
      config.printErr = (msg) => {
        console.error('[MaxtraxWASM]', msg);
        this.port.postMessage({ type: 'log', message: msg });
      };
      config.print = (msg) => {
        console.log('[MaxtraxWASM]', msg);
        this.port.postMessage({ type: 'log', message: msg });
      };
      if (wasmBinary) config.wasmBinary = wasmBinary;

      try {
        this.module = await globalThis.createMaxtrax(config);
      } finally {
        WebAssembly.instantiate = origInstantiate;
      }

      if (!this.module.wasmMemory && capturedMemory) {
        this.module.wasmMemory = capturedMemory;
      }

      // Allocate the render output buffer in WASM memory
      const malloc = this.module._malloc;
      if (!malloc) throw new Error('_malloc not exported');
      this.wasmBufPtr = malloc(this.wasmBufFrames * 2 * 4); // stereo F32
      if (!this.wasmBufPtr) throw new Error('malloc failed for render buffer');

      this.initialized = true;
      this.port.postMessage({ type: 'ready' });
    } catch (err) {
      this.port.postMessage({ type: 'error', message: String(err) });
    } finally {
      this.initializing = false;
    }
  }

  async loadSong(buffer, score) {
    if (!this.initialized || !this.module) {
      this.port.postMessage({ type: 'error', message: 'WASM not ready' });
      return;
    }

    try {
      const uint8 = new Uint8Array(buffer);
      const malloc = this.module._malloc;
      const free = this.module._free;
      const ptr = malloc(uint8.length);
      if (!ptr) throw new Error('malloc failed for song data');

      const heapU8 = this.getHeapU8();
      if (!heapU8) { free(ptr); throw new Error('HEAPU8 not available'); }

      heapU8.set(uint8, ptr);
      const result = this.module._maxtrax_load(ptr, uint8.length, score);
      free(ptr);

      // Reset resampler so we start from the beginning of the new song
      this.readPos = 0;
      this.writePos = 0;
      this.ringL.fill(0);
      this.ringR.fill(0);

      this.port.postMessage({ type: 'moduleLoaded', result });
    } catch (err) {
      this.port.postMessage({ type: 'error', message: String(err) });
    }
  }

  process(inputs, outputs) {
    const out = outputs[0];
    const outL = out && out[0];
    const outR = out && out[1];
    if (!outL || !outR) return true;

    const n = outL.length; // 128

    if (!this.initialized || !this.module) {
      outL.fill(0); outR.fill(0); return true;
    }

    // Fill ring buffer with enough WASM-rate samples for this block
    // Need: ceil(readPos + n * ratio) + 1 samples written (the +1 is for interpolation)
    const needWrite = Math.ceil(this.readPos + n * this.ratio) + 1;

    while (this.writePos < needWrite) {
      const chunk = Math.min(this.wasmBufFrames, needWrite - this.writePos);
      let rendered = 0;
      try {
        rendered = this.module._maxtrax_render(this.wasmBufPtr, chunk);
      } catch (e) {
        if (!this._trapLogged) {
          this._trapLogged = true;
          this.port.postMessage({ type: 'log', message: 'render trap: ' + (e && e.stack || e) });
        }
        break;
      }
      if (rendered <= 0) break;

      const heapF32 = this.getHeapF32();
      if (!heapF32) break;

      const base = this.wasmBufPtr >> 2; // byte offset → float32 index
      for (let i = 0; i < rendered; i++) {
        const ri = (this.writePos + i) % this.ringCap;
        this.ringL[ri] = heapF32[base + i * 2];
        this.ringR[ri] = heapF32[base + i * 2 + 1];
      }
      this.writePos += rendered;
    }

    // Resample WASM-rate → AudioContext rate using linear interpolation
    for (let i = 0; i < n; i++) {
      const pos = this.readPos + i * this.ratio;
      const idx = Math.floor(pos);
      const frac = pos - idx;
      const ri0 = idx % this.ringCap;
      const ri1 = (idx + 1) % this.ringCap;
      outL[i] = this.ringL[ri0] + frac * (this.ringL[ri1] - this.ringL[ri0]);
      outR[i] = this.ringR[ri0] + frac * (this.ringR[ri1] - this.ringR[ri0]);
    }
    this.readPos += n * this.ratio;

    return true;
  }

  getHeapU8() {
    if (!this.module) return null;
    return this.module.HEAPU8 ||
      (this.module.wasmMemory ? new Uint8Array(this.module.wasmMemory.buffer) : null);
  }

  getHeapF32() {
    if (!this.module) return null;
    return this.module.HEAPF32 ||
      (this.module.wasmMemory ? new Float32Array(this.module.wasmMemory.buffer) : null);
  }
}

registerProcessor('maxtrax-processor', MaxtraxProcessor);
