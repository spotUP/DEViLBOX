/**
 * CalfMonoSynth AudioWorklet Processor
 * Calf Monosynth - Feature-rich monophonic synthesizer
 * 2 oscillators (16 waveforms), biquad filter (8 types), dual ADSR, 2 LFOs,
 * modulation matrix, portamento, unison, pulse width modulation
 */

class CalfMonoSynthProcessor extends AudioWorkletProcessor {
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
          this.module._calf_mono_note_on(this.engine, data.note, data.velocity);
        }
        break;
      case 'noteOff':
        if (this.engine) {
          this.module._calf_mono_note_off(this.engine, data.note);
        }
        break;
      case 'setParam':
        if (this.engine) {
          this.module._calf_mono_set_param(this.engine, data.index, data.value);
        }
        break;
      case 'pitchBend':
        if (this.engine) {
          this.module._calf_mono_pitch_bend(this.engine, data.value);
        }
        break;
      case 'controlChange':
        if (this.engine) {
          this.module._calf_mono_control_change(this.engine, data.controller, data.value);
        }
        break;
      case 'allNotesOff':
        if (this.engine) {
          this.module._calf_mono_all_notes_off(this.engine);
        }
        break;
      case 'loadPatch':
        if (this.engine && data.values) {
          const numParams = this.module._calf_mono_get_num_params(this.engine);
          const count = Math.min(data.values.length, numParams);
          for (let i = 0; i < count; i++) {
            this.module._calf_mono_set_param(this.engine, i, data.values[i]);
          }
          this.port.postMessage({ type: 'patchLoaded', paramCount: count });
        }
        break;
      case 'getState':
        if (this.engine) {
          const numParams = this.module._calf_mono_get_num_params(this.engine);
          const state = new Float32Array(numParams);
          for (let i = 0; i < numParams; i++) {
            state[i] = this.module._calf_mono_get_param(this.engine, i);
          }
          this.port.postMessage({ type: 'state', values: Array.from(state), numParams });
        }
        break;
      case 'getInfo':
        if (this.engine) {
          this.port.postMessage({
            type: 'info',
            numParams: this.module._calf_mono_get_num_params(this.engine)
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

      if (jsCode && !globalThis.CalfMonoSynthFactory) {
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

        const wrappedCode = jsCode + '\nreturn createCalfMonoSynth;';
        const factory = new Function(wrappedCode);
        const result = factory();

        if (typeof result === 'function') {
          globalThis.CalfMonoSynthFactory = result;
        } else {
          this.port.postMessage({ type: 'error', message: 'Failed to load JS module' });
          return;
        }
      }

      if (typeof globalThis.CalfMonoSynthFactory !== 'function') {
        this.port.postMessage({ type: 'error', message: 'CalfMonoSynth factory not available' });
        return;
      }

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
        this.module = await globalThis.CalfMonoSynthFactory(config);
      } finally {
        WebAssembly.instantiate = origInstantiate;
      }

      if (!this.module.wasmMemory && capturedMemory) {
        this.module.wasmMemory = capturedMemory;
      }

      this.engine = this.module._calf_mono_create(sr || sampleRate);

      this.outputPtrL = this.module._malloc(this.bufferSize * 4);
      this.outputPtrR = this.module._malloc(this.bufferSize * 4);

      this.updateBufferViews();

      this.initialized = true;
      this.initializing = false;

      this.port.postMessage({ type: 'ready' });
    } catch (error) {
      this.initializing = false;
      console.error('[CalfMonoSynth Worklet] Init error:', error);
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
      this.module._calf_mono_destroy(this.engine);
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

    this.updateBufferViews();

    if (!this.outputBufferL || !this.outputBufferR) {
      return true;
    }

    this.outputBufferL.fill(0);
    this.outputBufferR.fill(0);

    this.module._calf_mono_process(this.engine, this.outputPtrL, this.outputPtrR, numSamples);

    outputL.set(this.outputBufferL.subarray(0, numSamples));
    outputR.set(this.outputBufferR.subarray(0, numSamples));

    return true;
  }
}

registerProcessor('calf-mono-processor', CalfMonoSynthProcessor);
