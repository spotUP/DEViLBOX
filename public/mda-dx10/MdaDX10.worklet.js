/**
 * MDA DX10 AudioWorklet Processor
 * 2-Operator FM Synthesizer for DEViLBOX
 *
 * AudioWorklets don't support dynamic import().
 * The WASM module JS is passed as a string and executed via Function constructor.
 */

class MdaDX10Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.engine = null;
    this.module = null;
    this.outputPtrL = 0;
    this.outputPtrR = 0;
    this.outputBufferL = null;
    this.outputBufferR = null;
    this.initialized = false;
    this.bufferSize = 128;
    this.lastHeapBuffer = null;
    this.initializing = false;

    this.port.onmessage = (event) => {
      this.handleMessage(event.data);
    };
  }

  async handleMessage(data) {
    switch (data.type) {
      case 'init':
        await this.initEngine(data.sampleRate, data.wasmBinary, data.jsCode);
        break;
      case 'noteOn':
        if (this.engine) {
          this.module._dx10_note_on(this.engine, data.note, data.velocity);
        }
        break;
      case 'noteOff':
        if (this.engine) {
          this.module._dx10_note_off(this.engine, data.note);
        }
        break;
      case 'setParam':
        if (this.engine) {
          this.module._dx10_set_param(this.engine, data.index, data.value);
        }
        break;
      case 'setProgram':
        if (this.engine) {
          this.module._dx10_set_program(this.engine, data.program);
        }
        break;
      case 'allNotesOff':
        if (this.engine) {
          this.module._dx10_all_notes_off(this.engine);
        }
        break;
      case 'getInfo':
        if (this.engine) {
          this.port.postMessage({
            type: 'info',
            activeVoices: this.module._dx10_get_active_voices(this.engine),
            numParams: this.module._dx10_get_num_params(this.engine),
            numPrograms: this.module._dx10_get_num_programs(this.engine)
          });
        }
        break;
      case 'dispose':
        this.cleanup();
        break;
    }
  }

  async initEngine(sr, wasmBinary, jsCode) {
    this.initializing = true;
    try {
      this.cleanup();

      // Load JS module via Function constructor (dynamic import not allowed in worklets)
      if (jsCode && !globalThis.MdaDX10Factory) {
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

        if (typeof globalThis.MutationObserver === 'undefined') {
          globalThis.MutationObserver = class MutationObserver {
            constructor() {}
            observe() {}
            disconnect() {}
          };
        }

        if (typeof globalThis.DOMParser === 'undefined') {
          globalThis.DOMParser = class DOMParser {
            parseFromString() {
              return { querySelector: () => null, querySelectorAll: () => [] };
            }
          };
        }

        const wrappedCode = jsCode + '\nreturn createMdaDX10;';
        const factory = new Function(wrappedCode);
        const result = factory();

        if (typeof result === 'function') {
          globalThis.MdaDX10Factory = result;
        } else {
          this.port.postMessage({ type: 'error', message: 'Failed to load JS module' });
          return;
        }
      }

      if (typeof globalThis.MdaDX10Factory !== 'function') {
        this.port.postMessage({ type: 'error', message: 'MdaDX10 factory not available' });
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

      const config = {};
      if (wasmBinary) {
        config.wasmBinary = wasmBinary;
      }

      try {
        this.module = await globalThis.MdaDX10Factory(config);
      } finally {
        WebAssembly.instantiate = origInstantiate;
      }

      if (!this.module.wasmMemory && capturedMemory) {
        this.module.wasmMemory = capturedMemory;
      }

      // Create synth engine instance
      this.engine = this.module._dx10_create(sr || sampleRate);

      // Allocate output buffers in WASM memory (4 bytes per float)
      this.outputPtrL = this.module._malloc(this.bufferSize * 4);
      this.outputPtrR = this.module._malloc(this.bufferSize * 4);

      this.updateBufferViews();

      this.initialized = true;
      this.initializing = false;

      this.port.postMessage({ type: 'ready' });
    } catch (error) {
      this.initializing = false;
      console.error('[MdaDX10 Worklet] Init error:', error);
      this.port.postMessage({ type: 'error', message: error.message });
    }
  }

  updateBufferViews() {
    if (!this.module || !this.outputPtrL) return;

    const heapF32 = this.module.HEAPF32 || (this.module.wasmMemory && new Float32Array(this.module.wasmMemory.buffer));
    if (!heapF32) return;

    if (this.lastHeapBuffer !== heapF32.buffer) {
      this.outputBufferL = new Float32Array(heapF32.buffer, this.outputPtrL, this.bufferSize);
      this.outputBufferR = new Float32Array(heapF32.buffer, this.outputPtrR, this.bufferSize);
      this.lastHeapBuffer = heapF32.buffer;
    }
  }

  cleanup() {
    if (this.module && this.engine) {
      this.module._dx10_destroy(this.engine);
      this.engine = null;
    }
    if (this.module) {
      if (this.outputPtrL) {
        this.module._free(this.outputPtrL);
        this.outputPtrL = 0;
      }
      if (this.outputPtrR) {
        this.module._free(this.outputPtrR);
        this.outputPtrR = 0;
      }
    }
    this.outputBufferL = null;
    this.outputBufferR = null;
    this.initialized = false;
    this.lastHeapBuffer = null;
  }

  process(inputs, outputs, parameters) {
    if (!this.initialized || !this.engine) {
      return true;
    }

    const output = outputs[0];
    if (!output || output.length === 0) {
      return true;
    }

    const outputL = output[0];
    const outputR = output[1] || output[0];
    const numSamples = Math.min(outputL.length, this.bufferSize);

    // Refresh buffer views in case WASM memory grew
    this.updateBufferViews();

    if (!this.outputBufferL || !this.outputBufferR) {
      return true;
    }

    // Zero the output buffers before processing
    this.outputBufferL.fill(0);
    this.outputBufferR.fill(0);

    // Generate audio
    this.module._dx10_process(this.engine, this.outputPtrL, this.outputPtrR, numSamples);

    // Copy from WASM heap to AudioWorklet output
    outputL.set(this.outputBufferL.subarray(0, numSamples));
    outputR.set(this.outputBufferR.subarray(0, numSamples));

    return true;
  }
}

registerProcessor('mda-dx10-processor', MdaDX10Processor);
