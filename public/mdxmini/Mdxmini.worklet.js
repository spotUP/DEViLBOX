/**
 * Mdxmini.worklet.js - AudioWorklet processor for mdxmini MDX player
 *
 * The WASM mdxmini_wasm_render() writes interleaved stereo float (LRLRLR...)
 * into a buffer. We deinterleave into the WebAudio output channels.
 */

class MdxminiProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.module = null;
    this.interleavedPtr = 0;
    this.interleavedBuf = null;
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
        if (this.module && typeof this.module._mdxmini_wasm_init === 'function') {
          try {
            // Stop any currently playing song
            if (typeof this.module._mdxmini_wasm_stop === 'function') {
              this.module._mdxmini_wasm_stop();
            }

            // Init engine at current sample rate
            this.module._mdxmini_wasm_init(Math.round(sampleRate));

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
            const result = this.module._mdxmini_wasm_load(wasmPtr, uint8Data.length);
            const free = this.module._free || this.module.free;
            if (free) free(wasmPtr);

            if (result === 0) {
              // Set max loops to 2 for reasonable playback length
              if (typeof this.module._mdxmini_wasm_set_max_loop === 'function') {
                this.module._mdxmini_wasm_set_max_loop(2);
              }
              this.port.postMessage({ type: 'moduleLoaded' });
            } else {
              this.port.postMessage({ type: 'error', message: 'mdxmini_wasm_load failed with code ' + result });
            }
          } catch (error) {
            this.port.postMessage({ type: 'error', message: error.message });
          }
        }
        break;

      case 'loadPdx':
        if (this.module && typeof this.module._mdxmini_wasm_load_pdx === 'function') {
          try {
            const uint8Data = new Uint8Array(data.pdxData);
            const malloc = this.module._malloc || this.module.malloc;
            if (!malloc) return;

            const wasmPtr = malloc(uint8Data.length);
            if (!wasmPtr) return;

            const heapU8 = this.module.HEAPU8 || (this.module.wasmMemory && new Uint8Array(this.module.wasmMemory.buffer));
            if (!heapU8) { this.module._free(wasmPtr); return; }

            heapU8.set(uint8Data, wasmPtr);
            const result = this.module._mdxmini_wasm_load_pdx(wasmPtr, uint8Data.length);
            const free = this.module._free || this.module.free;
            if (free) free(wasmPtr);

            if (result === 0) {
              this.port.postMessage({ type: 'pdxLoaded' });
            } else {
              this.port.postMessage({ type: 'error', message: 'mdxmini_wasm_load_pdx failed with code ' + result });
            }
          } catch (error) {
            this.port.postMessage({ type: 'error', message: error.message });
          }
        }
        break;

      case 'stop':
        if (this.module && typeof this.module._mdxmini_wasm_stop === 'function') {
          this.module._mdxmini_wasm_stop();
          this.port.postMessage({ type: 'stopped' });
        }
        break;

      case 'dispose':
        this.cleanup();
        break;
    }
  }

  async initModule(sr, wasmBinary, jsCode) {
    this.initializing = true;
    try {
      this.cleanup();

      if (jsCode && !globalThis.Mdxmini) {
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

        const wrappedCode = jsCode + '\nreturn createMdxmini;';
        const factory = new Function(wrappedCode);
        const result = factory();

        if (typeof result === 'function') {
          globalThis.Mdxmini = result;
        } else {
          this.port.postMessage({ type: 'error', message: 'Failed to load JS module' });
          return;
        }
      }

      if (typeof globalThis.Mdxmini !== 'function') {
        this.port.postMessage({ type: 'error', message: 'Mdxmini factory not available' });
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
        this.module = await globalThis.Mdxmini(config);
      } finally {
        WebAssembly.instantiate = origInstantiate;
      }

      if (!this.module.wasmMemory && capturedMemory) {
        this.module.wasmMemory = capturedMemory;
      }

      // Allocate interleaved stereo buffer: frames * 2 channels * 4 bytes per float
      const malloc = this.module._malloc || this.module.malloc;
      if (malloc) {
        this.interleavedPtr = malloc(this.bufferSize * 2 * 4);
        if (!this.interleavedPtr) {
          this.port.postMessage({ type: 'error', message: 'malloc failed for output buffer' });
          return;
        }
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
    if (!this.module || !this.interleavedPtr) return;
    const heapF32 = this.module.HEAPF32 || (this.module.wasmMemory && new Float32Array(this.module.wasmMemory.buffer));
    if (!heapF32) return;
    if (this.lastHeapBuffer !== heapF32.buffer) {
      this.interleavedBuf = new Float32Array(heapF32.buffer, this.interleavedPtr, this.bufferSize * 2);
      this.lastHeapBuffer = heapF32.buffer;
    }
  }

  cleanup() {
    if (this.module && typeof this.module._mdxmini_wasm_stop === 'function') {
      try { this.module._mdxmini_wasm_stop(); } catch(e) { /* ignore */ }
    }
    const free = this.module?._free || this.module?.free;
    if (free && this.interleavedPtr) { free(this.interleavedPtr); this.interleavedPtr = 0; }
    this.interleavedBuf = null;
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

    if (typeof this.module._mdxmini_wasm_render === 'function') {
      this.updateBufferViews();
      if (this.interleavedBuf) {
        const rendered = this.module._mdxmini_wasm_render(this.interleavedPtr, numSamples);
        if (rendered > 0) {
          // Deinterleave LRLRLR... into separate L and R channels
          for (let i = 0; i < rendered; i++) {
            outputL[i] = this.interleavedBuf[i * 2];
            outputR[i] = this.interleavedBuf[i * 2 + 1];
          }
        }
      }
    }
    return true;
  }
}

registerProcessor('mdxmini-processor', MdxminiProcessor);
