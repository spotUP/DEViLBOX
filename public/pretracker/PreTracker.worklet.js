/**
 * PreTracker AudioWorklet Processor
 * Audio playback for PreTracker WASM module
 *
 * IMPORTANT: AudioWorklets don't support dynamic import().
 * The WASM module JS is passed as a string and executed via Function constructor.
 */

class PreTrackerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.module = null;
    this.outputPtrL = 0;
    this.outputPtrR = 0;
    this.outputBufferL = null;
    this.outputBufferR = null;
    this.initialized = false;
    this.bufferSize = 128;
    this.lastHeapBuffer = null;
    this.initializing = false;

    console.log('[PreTracker Worklet] v1.0 (WASM Memory Safety)');

    this.port.onmessage = (event) => {
      this.handleMessage(event.data);
    };
  }

  async handleMessage(data) {
    // Queue non-init messages while WASM is still loading
    if (data.type !== 'init' && !this.module && this.initializing) {
      return;
    }

    switch (data.type) {
      case 'init':
        await this.initModule(data.sampleRate, data.wasmBinary, data.jsCode);
        break;

      case 'loadModule':
        // msg.data = ArrayBuffer of module file (e.g., .xm, .it, etc.)
        if (this.module && typeof this.module._player_init === 'function') {
          try {
            const uint8Data = new Uint8Array(data.moduleData);
            const malloc = this.module._malloc || this.module.malloc;
            if (!malloc) {
              console.error('[PreTracker] malloc not available');
              this.port.postMessage({ type: 'error', message: 'malloc not available' });
              return;
            }

            const wasmPtr = malloc(uint8Data.length);
            if (!wasmPtr) {
              console.error('[PreTracker] malloc failed for module data');
              this.port.postMessage({ type: 'error', message: 'malloc failed for module data' });
              return;
            }

            // Copy module data to WASM memory
            const heapU8 = this.module.HEAPU8 || (this.module.wasmMemory && new Uint8Array(this.module.wasmMemory.buffer));
            if (!heapU8) {
              console.error('[PreTracker] HEAPU8 not available');
              const free = this.module._free || this.module.free;
              if (free) free(wasmPtr);
              this.port.postMessage({ type: 'error', message: 'HEAPU8 not available' });
              return;
            }

            heapU8.set(uint8Data, wasmPtr);
            this.module._player_init(wasmPtr, uint8Data.length);
            const free = this.module._free || this.module.free;
            if (free) free(wasmPtr);

            this.port.postMessage({ type: 'moduleLoaded' });
          } catch (error) {
            console.error('[PreTracker] Module load error:', error);
            this.port.postMessage({ type: 'error', message: error.message });
          }
        }
        break;

      case 'stop':
        if (this.module && typeof this.module._player_stop === 'function') {
          this.module._player_stop();
          this.port.postMessage({ type: 'stopped' });
        }
        break;

      case 'setSubsong':
        if (this.module && typeof this.module._player_set_subsong === 'function') {
          this.module._player_set_subsong(data.subsong);
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
      // Cleanup any existing allocation
      this.cleanup();

      // Load JS module via Function constructor (dynamic import not allowed in worklets)
      if (jsCode && !globalThis.PreTracker) {
        console.log('[PreTracker Worklet] Loading JS module...');

        // Polyfills for DOM objects that Emscripten expects
        if (typeof globalThis.document === 'undefined') {
          globalThis.document = {
            createElement: () => ({
              relList: { supports: () => false },
              tagName: 'DIV',
              rel: '',
              addEventListener: () => {},
              removeEventListener: () => {}
            }),
            getElementById: () => null,
            querySelector: () => null,
            querySelectorAll: () => [],
            getElementsByTagName: () => [],
            head: { appendChild: () => {} },
            addEventListener: () => {},
            removeEventListener: () => {}
          };
        }

        if (typeof globalThis.window === 'undefined') {
          globalThis.window = {
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => {},
            customElements: { whenDefined: () => Promise.resolve() },
            location: { href: '', pathname: '' }
          };
        }

        // Polyfill MutationObserver
        if (typeof globalThis.MutationObserver === 'undefined') {
          globalThis.MutationObserver = class MutationObserver {
            constructor() {}
            observe() {}
            disconnect() {}
          };
        }

        // Polyfill DOMParser
        if (typeof globalThis.DOMParser === 'undefined') {
          globalThis.DOMParser = class DOMParser {
            parseFromString() {
              return { querySelector: () => null, querySelectorAll: () => [] };
            }
          };
        }

        // Polyfill URL if not available in AudioWorklet scope
        if (typeof globalThis.URL === 'undefined') {
          globalThis.URL = class URL {
            constructor(path) { this.href = path; }
          };
        }

        // The Emscripten module defines createPretracker, aliased to PreTracker
        const wrappedCode = jsCode + '\nreturn createPretracker;';
        const factory = new Function(wrappedCode);
        const result = factory();

        if (typeof result === 'function') {
          globalThis.PreTracker = result;
          console.log('[PreTracker Worklet] ✓ JS module loaded');
        } else {
          console.error('[PreTracker Worklet] Unexpected result type:', typeof result);
          this.port.postMessage({ type: 'error', message: 'Failed to load JS module' });
          return;
        }
      }

      if (typeof globalThis.PreTracker !== 'function') {
        console.error('[PreTracker Worklet] PreTracker factory not available');
        this.port.postMessage({ type: 'error', message: 'PreTracker factory not available' });
        return;
      }

      // Intercept WebAssembly.instantiate to capture WASM memory
      let capturedMemory = null;
      const origInstantiate = WebAssembly.instantiate;
      WebAssembly.instantiate = async function(...args) {
        const result = await origInstantiate.apply(this, args);
        const instance = result.instance || result;
        if (instance.exports) {
          for (const value of Object.values(instance.exports)) {
            if (value instanceof WebAssembly.Memory) {
              capturedMemory = value;
              break;
            }
          }
        }
        return result;
      };

      // Initialize WASM module
      const config = {};
      if (wasmBinary) {
        config.wasmBinary = wasmBinary;
      }

      try {
        this.module = await globalThis.PreTracker(config);
      } finally {
        WebAssembly.instantiate = origInstantiate;
      }

      // Store captured memory for buffer access
      if (!this.module.wasmMemory && capturedMemory) {
        this.module.wasmMemory = capturedMemory;
      }
      console.log('[PreTracker Worklet] WASM loaded');

      // Allocate output buffers in WASM memory (4 bytes per float)
      const malloc = this.module._malloc || this.module.malloc;
      if (malloc) {
        this.outputPtrL = malloc(this.bufferSize * 4);
        this.outputPtrR = malloc(this.bufferSize * 4);
        if (!this.outputPtrL || !this.outputPtrR) {
          console.error('[PreTracker] malloc failed for output buffers');
          this.port.postMessage({ type: 'error', message: 'malloc failed for output buffers' });
          return;
        }
      }

      // Create typed array views
      this.updateBufferViews();

      this.initialized = true;
      this.initializing = false;

      this.port.postMessage({ type: 'ready' });
      console.log('[PreTracker Worklet] ✓ Ready');
    } catch (error) {
      this.initializing = false;
      console.error('[PreTracker Worklet] Init error:', error);
      this.port.postMessage({ type: 'error', message: error.message });
    }
  }

  updateBufferViews() {
    if (!this.module || !this.outputPtrL) return;

    const heapF32 = this.module.HEAPF32 || (this.module.wasmMemory && new Float32Array(this.module.wasmMemory.buffer));
    if (!heapF32) return;

    // Check if WASM memory has grown (buffer changed)
    if (this.lastHeapBuffer !== heapF32.buffer) {
      this.outputBufferL = new Float32Array(heapF32.buffer, this.outputPtrL, this.bufferSize);
      this.outputBufferR = new Float32Array(heapF32.buffer, this.outputPtrR, this.bufferSize);
      this.lastHeapBuffer = heapF32.buffer;
    }
  }

  cleanup() {
    const free = this.module?._free || this.module?.free;
    if (free && this.outputPtrL) {
      free(this.outputPtrL);
      this.outputPtrL = 0;
    }
    if (free && this.outputPtrR) {
      free(this.outputPtrR);
      this.outputPtrR = 0;
    }
    this.outputBufferL = null;
    this.outputBufferR = null;
    this.module = null;
    this.initialized = false;
    this.lastHeapBuffer = null;
  }

  process(inputs, outputs, parameters) {
    if (!this.initialized || !this.module) {
      return true;
    }

    const output = outputs[0];
    if (!output || output.length < 2) {
      return true;
    }

    const outputL = output[0];
    const outputR = output[1];
    if (!outputL || !outputR) {
      return true;
    }

    const blockLength = outputL.length;
    const numSamples = Math.min(blockLength, this.bufferSize);

    // Get HEAPF32 for reading output
    const heapF32 = this.module.HEAPF32 || (this.module.wasmMemory && new Float32Array(this.module.wasmMemory.buffer));
    if (!heapF32) return true;

    // Render audio from WASM
    if (typeof this.module._player_render === 'function') {
      this.updateBufferViews();
      if (this.outputBufferL && this.outputBufferR) {
        const rendered = this.module._player_render(this.outputPtrL, this.outputPtrR, numSamples);
        if (rendered > 0) {
          for (let i = 0; i < rendered; i++) {
            outputL[i] = this.outputBufferL[i];
            outputR[i] = this.outputBufferR[i];
          }
        }
      }
    }

    return true;
  }
}

registerProcessor('pretracker-processor', PreTrackerProcessor);
