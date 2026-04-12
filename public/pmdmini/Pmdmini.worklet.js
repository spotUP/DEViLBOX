/**
 * Pmdmini.worklet.js - AudioWorklet processor for pmdmini PMD replayer
 *
 * Plays PC-98 PMD files (Professional Music Driver, YM2608 OPNA) via
 * pmdmini WASM. Renders S16 stereo, converts to float for WebAudio output.
 */

class PmdminiProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.module = null;
    this.s16Ptr = 0;
    this.s16Buf = null;
    this.initialized = false;
    this.bufferSize = 128;
    this.lastHeapBuffer = null;
    this.initializing = false;

    this.port.onmessage = (event) => {
      this.handleMessage(event.data);
    };
  }

  async handleMessage(data) {
    if (data.type !== 'init' && !this.module && this.initializing) {
      return;
    }

    switch (data.type) {
      case 'init':
        await this.initModule(data.sampleRate, data.wasmBinary, data.jsCode);
        break;

      case 'loadModule':
        if (this.module && typeof this.module._pmdmini_wasm_load === 'function') {
          try {
            const uint8Data = new Uint8Array(data.moduleData);
            const malloc = this.module._malloc || this.module.malloc;
            if (!malloc) {
              this.port.postMessage({ type: 'error', message: 'malloc not available' });
              return;
            }

            const wasmPtr = malloc(uint8Data.length);
            if (!wasmPtr) {
              this.port.postMessage({ type: 'error', message: 'malloc failed for module data' });
              return;
            }

            const heapU8 = this.module.HEAPU8 || (this.module.wasmMemory && new Uint8Array(this.module.wasmMemory.buffer));
            if (!heapU8) {
              const free = this.module._free || this.module.free;
              if (free) free(wasmPtr);
              this.port.postMessage({ type: 'error', message: 'HEAPU8 not available' });
              return;
            }

            heapU8.set(uint8Data, wasmPtr);
            const result = this.module._pmdmini_wasm_load(wasmPtr, uint8Data.length);
            const free = this.module._free || this.module.free;
            if (free) free(wasmPtr);

            if (result !== 0) {
              this.port.postMessage({ type: 'error', message: 'pmdmini_wasm_load failed: ' + result });
              return;
            }

            const meta = {};
            if (typeof this.module._pmdmini_wasm_get_tracks === 'function') {
              meta.tracks = this.module._pmdmini_wasm_get_tracks();
            }
            if (typeof this.module._pmdmini_wasm_get_length === 'function') {
              meta.lengthSec = this.module._pmdmini_wasm_get_length();
            }

            this.port.postMessage({ type: 'moduleLoaded', meta });
          } catch (error) {
            this.port.postMessage({ type: 'error', message: error.message });
          }
        }
        break;

      case 'stop':
        if (this.module && typeof this.module._pmdmini_wasm_stop === 'function') {
          this.module._pmdmini_wasm_stop();
          this.port.postMessage({ type: 'stopped' });
        }
        break;

      case 'dispose':
        this.cleanup();
        break;
    }
  }

  async initModule(sampleRate, wasmBinary, jsCode) {
    this.initializing = true;
    try {
      this.cleanup();

      if (jsCode && !globalThis.Pmdmini) {
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
        if (typeof globalThis.MutationObserver === 'undefined') {
          globalThis.MutationObserver = class { constructor() {} observe() {} disconnect() {} };
        }
        if (typeof globalThis.DOMParser === 'undefined') {
          globalThis.DOMParser = class { parseFromString() { return { querySelector: () => null, querySelectorAll: () => [] }; } };
        }
        if (typeof globalThis.URL === 'undefined') {
          globalThis.URL = class { constructor(path) { this.href = path; } };
        }

        const wrappedCode = jsCode + '\nreturn createPmdmini;';
        const factory = new Function(wrappedCode);
        const result = factory();

        if (typeof result === 'function') {
          globalThis.Pmdmini = result;
        } else {
          this.port.postMessage({ type: 'error', message: 'Failed to load JS module' });
          return;
        }
      }

      if (typeof globalThis.Pmdmini !== 'function') {
        this.port.postMessage({ type: 'error', message: 'Pmdmini factory not available' });
        return;
      }

      let capturedMemory = null;
      const origInstantiate = WebAssembly.instantiate;
      WebAssembly.instantiate = async function(...args) {
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
      if (wasmBinary) config.wasmBinary = wasmBinary;

      try {
        this.module = await globalThis.Pmdmini(config);
      } finally {
        WebAssembly.instantiate = origInstantiate;
      }

      if (!this.module.wasmMemory && capturedMemory) {
        this.module.wasmMemory = capturedMemory;
      }

      // Allocate S16 stereo buffer: frames * 2 channels * 2 bytes
      const malloc = this.module._malloc || this.module.malloc;
      if (malloc) {
        this.s16Ptr = malloc(this.bufferSize * 2 * 2);
        if (!this.s16Ptr) {
          this.port.postMessage({ type: 'error', message: 'malloc failed for output buffer' });
          return;
        }
      }

      // Initialize PMD engine
      if (typeof this.module._pmdmini_wasm_init === 'function') {
        this.module._pmdmini_wasm_init(sampleRate);
      }

      this.updateBufferViews();
      this.initialized = true;
      this.initializing = false;
      this.port.postMessage({ type: 'ready' });
    } catch (error) {
      this.initializing = false;
      this.port.postMessage({ type: 'error', message: error.message });
    }
  }

  updateBufferViews() {
    if (!this.module || !this.s16Ptr) return;
    const mem = this.module.wasmMemory || (this.module.HEAP16 && { buffer: this.module.HEAP16.buffer });
    if (!mem) return;
    if (this.lastHeapBuffer !== mem.buffer) {
      this.s16Buf = new Int16Array(mem.buffer, this.s16Ptr, this.bufferSize * 2);
      this.lastHeapBuffer = mem.buffer;
    }
  }

  cleanup() {
    if (this.module && typeof this.module._pmdmini_wasm_stop === 'function') {
      try { this.module._pmdmini_wasm_stop(); } catch (e) {}
    }
    const free = this.module?._free || this.module?.free;
    if (free && this.s16Ptr) { free(this.s16Ptr); this.s16Ptr = 0; }
    this.s16Buf = null;
    this.module = null;
    this.initialized = false;
    this.lastHeapBuffer = null;
  }

  process(inputs, outputs, parameters) {
    if (!this.initialized || !this.module) return true;
    const output = outputs[0];
    if (!output || output.length < 2) return true;
    const outputL = output[0];
    const outputR = output[1];
    if (!outputL || !outputR) return true;

    const numSamples = Math.min(outputL.length, this.bufferSize);

    if (typeof this.module._pmdmini_wasm_render === 'function' &&
        typeof this.module._pmdmini_wasm_is_playing === 'function' &&
        this.module._pmdmini_wasm_is_playing()) {
      this.updateBufferViews();
      if (this.s16Buf) {
        this.module._pmdmini_wasm_render(this.s16Ptr, numSamples);
        // Convert S16 interleaved stereo to float [-1, 1]
        const norm = 1.0 / 32768.0;
        for (let i = 0; i < numSamples; i++) {
          outputL[i] = this.s16Buf[i * 2] * norm;
          outputR[i] = this.s16Buf[i * 2 + 1] * norm;
        }
      }
    }
    return true;
  }
}

registerProcessor('pmdmini-processor', PmdminiProcessor);
