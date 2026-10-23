/**
 * MDA JX10 AudioWorklet Processor
 * Dual-Oscillator Analog Synthesizer for DEViLBOX
 *
 * AudioWorklets don't support dynamic import().
 * The WASM module JS is passed as a string and executed via Function constructor.
 */

import { TimedEventQueue } from '../shared/timedEventQueue.js';

class MdaJX10Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Notes sent ahead with a `time` wait here for their frame (see shared/timedEventQueue.js)
    this.noteEvents = new TimedEventQueue();
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
    // Live voice report for the editor curves (src/engine/voiceStatus/wasmVoiceStatus.ts)
    this.watchVoices = false;
    this.voiceCounter = 0;
    this.voicePtr = 0;

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
        if (this.engine && this.noteEvents.push(data, currentTime)) this.applyNoteEvent(data);
        break;
      case 'noteOff':
        if (this.engine && this.noteEvents.push(data, currentTime)) this.applyNoteEvent(data);
        break;
      case 'setParam':
        if (this.engine) {
          this.module._jx10_set_param(this.engine, data.index, data.value);
        }
        break;
      case 'setProgram':
        if (this.engine) {
          this.module._jx10_set_program(this.engine, data.program);
        }
        break;
      case 'allNotesOff':
        // Cancels the notes scheduled at or after it: on Stop the replayer has already sent the coming rows
        if (this.engine) {
          this.noteEvents.cancelFrom(data.time ?? currentTime);
          if (this.noteEvents.push(data, currentTime)) this.applyNoteEvent(data);
        }
        break;
      case 'watchVoices':
        this.watchVoices = !!data.on;
        break;
      case 'getInfo':
        if (this.engine) {
          this.port.postMessage({
            type: 'info',
            activeVoices: this.module._jx10_get_active_voices(this.engine),
            numParams: this.module._jx10_get_num_params(this.engine),
            numPrograms: this.module._jx10_get_num_programs(this.engine)
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
      if (jsCode && !globalThis.MdaJX10Factory) {
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

        const wrappedCode = jsCode + '\nreturn createMdaJX10;';
        const factory = new Function(wrappedCode);
        const result = factory();

        if (typeof result === 'function') {
          globalThis.MdaJX10Factory = result;
        } else {
          this.port.postMessage({ type: 'error', message: 'Failed to load JS module' });
          return;
        }
      }

      if (typeof globalThis.MdaJX10Factory !== 'function') {
        this.port.postMessage({ type: 'error', message: 'MdaJX10 factory not available' });
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
        this.module = await globalThis.MdaJX10Factory(config);
      } finally {
        WebAssembly.instantiate = origInstantiate;
      }

      if (!this.module.wasmMemory && capturedMemory) {
        this.module.wasmMemory = capturedMemory;
      }

      // Create synth engine instance
      this.engine = this.module._jx10_create(sr || sampleRate);

      // Allocate output buffers in WASM memory (4 bytes per float)
      this.outputPtrL = this.module._malloc(this.bufferSize * 4);
      this.outputPtrR = this.module._malloc(this.bufferSize * 4);

      this.updateBufferViews();

      this.initialized = true;
      this.initializing = false;

      this.port.postMessage({ type: 'ready' });
    } catch (error) {
      this.initializing = false;
      console.error('[MdaJX10 Worklet] Init error:', error);
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
      this.module._jx10_destroy(this.engine);
      this.engine = null;
    }
    if (this.module) {
      if (this.voicePtr) {
        this.module._free(this.voicePtr);
        this.voicePtr = 0;
      }
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

  applyNoteEvent(ev) {
    switch (ev.type) {
      case 'noteOn': this.module._jx10_note_on(this.engine, ev.note, ev.velocity); break;
      case 'noteOff': this.module._jx10_note_off(this.engine, ev.note); break;
      case 'allNotesOff': this.module._jx10_all_notes_off(this.engine); break;
    }
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
    // Render in segments so a queued note event keys the engine at its own frame, not at the block start
    let done = 0;
    while (done < numSamples) {
      const now = currentTime + done / sampleRate;
      this.noteEvents.drain(now, (ev) => this.applyNoteEvent(ev));
      const off = this.noteEvents.nextOffset(now, numSamples - done, sampleRate);
      const len = off > 0 ? off : numSamples - done;
      this.module._jx10_process(this.engine, this.outputPtrL + done * 4, this.outputPtrR + done * 4, len);
      done += len;
    }

    // Copy from WASM heap to AudioWorklet output
    outputL.set(this.outputBufferL.subarray(0, numSamples));
    outputR.set(this.outputBufferR.subarray(0, numSamples));

    this.reportVoices();
    return true;
  }

  // 8 floats per voice slot, layout in wasmVoiceStatus.ts; every 6th block (about 60 reports a second)
  reportVoices() {
    if (!this.watchVoices || typeof this.module._jx10_get_voices !== 'function') return;
    if (++this.voiceCounter < 6) return;
    this.voiceCounter = 0;
    if (!this.voicePtr) this.voicePtr = this.module._malloc(8 * 8 * 4);
    const n = this.module._jx10_get_voices(this.engine, this.voicePtr, 8);
    const heap = this.module.HEAPF32 || new Float32Array(this.module.wasmMemory.buffer);
    const at = this.voicePtr >> 2;
    this.port.postMessage({ type: 'voiceStatus', voices: heap.slice(at, at + n * 8) });
  }
}

registerProcessor('mda-jx10-processor', MdaJX10Processor);
