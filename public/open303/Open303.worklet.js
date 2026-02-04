/**
 * Open303 AudioWorklet Processor
 * TB-303 Bass Synthesizer for DEViLBOX
 *
 * IMPORTANT: AudioWorklets don't support dynamic import().
 * The WASM module JS is passed as a string and executed via Function constructor.
 */

class Open303Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.synth = null;
    this.module = null;
    this.outputPtrL = 0;
    this.outputPtrR = 0;
    this.outputBufferL = null;
    this.outputBufferR = null;
    this.initialized = false;
    this.bufferSize = 128;
    this.lastHeapBuffer = null;

    this.port.onmessage = (event) => {
      this.handleMessage(event.data);
    };
  }

  async handleMessage(data) {
    switch (data.type) {
      case 'init':
        await this.initSynth(data.sampleRate, data.wasmBinary, data.jsCode);
        break;
      case 'noteOn':
        if (this.synth) {
          // Check if slide flag is set - Open303 WASM may handle this via
          // a special noteOn signature or by setting slide mode before noteOn
          if (data.slide && this.synth.setSlide) {
            this.synth.setSlide(true);
          }
          this.synth.noteOn(data.note, data.velocity);
          if (data.slide && this.synth.setSlide) {
            // Reset slide mode after noteOn if the synth handles it per-note
            // Some 303 implementations keep slide active until next non-slide note
          }
        }
        break;
      case 'noteOff':
        if (this.synth) {
          this.synth.noteOff(data.note);
        }
        break;
      case 'allNotesOff':
        if (this.synth) {
          this.synth.allNotesOff();
        }
        break;
      case 'setParameter':
        if (this.synth) {
          this.synth.setParameter(data.paramId, data.value);
        }
        break;
      case 'controlChange':
        if (this.synth) {
          this.synth.controlChange(data.cc, data.value);
        }
        break;
      case 'pitchBend':
        if (this.synth) {
          this.synth.pitchBend(data.value);
        }
        break;
      case 'programChange':
        if (this.synth) {
          this.synth.programChange(data.program);
        }
        break;
      case 'dispose':
        this.cleanup();
        break;
    }
  }

  async initSynth(sampleRate, wasmBinary, jsCode) {
    try {
      // Cleanup any existing allocation
      this.cleanup();

      // Load JS module via Function constructor (dynamic import not allowed in worklets)
      if (jsCode && !globalThis.Open303) {
        console.log('[Open303 Worklet] Loading JS module...');

        // Polyfill URL if not available in AudioWorklet scope
        if (typeof globalThis.URL === 'undefined') {
          globalThis.URL = class URL {
            constructor(path) { this.href = path; }
          };
        }

        // The Emscripten module defines createOpen303Module, aliased to Open303
        const wrappedCode = jsCode + '\nreturn Open303;';
        const factory = new Function(wrappedCode);
        const result = factory();

        if (typeof result === 'function') {
          globalThis.Open303 = result;
          console.log('[Open303 Worklet] ✓ JS module loaded');
        } else {
          console.error('[Open303 Worklet] Unexpected result type:', typeof result);
          this.port.postMessage({ type: 'error', message: 'Failed to load JS module' });
          return;
        }
      }

      if (typeof globalThis.Open303 !== 'function') {
        console.error('[Open303 Worklet] Open303 factory not available');
        this.port.postMessage({ type: 'error', message: 'Open303 factory not available' });
        return;
      }

      // Initialize WASM module
      const config = {};
      if (wasmBinary) {
        config.wasmBinary = wasmBinary;
      }

      this.module = await globalThis.Open303(config);
      console.log('[Open303 Worklet] WASM loaded');

      // Create synth instance
      if (this.module.Open303Synth) {
        this.synth = new this.module.Open303Synth();
        this.synth.initialize(sampleRate);
      } else if (this.module._initSynth) {
        // Alternative API: direct function calls
        this.module._initSynth(sampleRate);
        this.synth = {
          noteOn: (note, vel) => this.module._noteOn(note, vel),
          noteOff: (note) => this.module._noteOff(note),
          allNotesOff: () => this.module._allNotesOff && this.module._allNotesOff(),
          setParameter: (id, val) => this.module._setParameter && this.module._setParameter(id, val),
          controlChange: (cc, val) => this.module._controlChange && this.module._controlChange(cc, val),
          pitchBend: (val) => this.module._pitchBend && this.module._pitchBend(val),
          programChange: (prog) => this.module._programChange && this.module._programChange(prog),
          process: (ptrL, ptrR, n) => this.module._render ? this.module._render(ptrL, ptrR, n) : this.module._process && this.module._process(ptrL, ptrR, n)
        };
      }

      // Allocate output buffers in WASM memory (4 bytes per float)
      const malloc = this.module._malloc || this.module.malloc;
      if (malloc) {
        this.outputPtrL = malloc(this.bufferSize * 4);
        this.outputPtrR = malloc(this.bufferSize * 4);
      }

      // Create typed array views
      this.updateBufferViews();

      this.initialized = true;
      this.port.postMessage({ type: 'ready' });
      console.log('[Open303 Worklet] ✓ Ready');
    } catch (error) {
      console.error('[Open303 Worklet] Init error:', error);
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
    this.synth = null;
    this.initialized = false;
    this.lastHeapBuffer = null;
  }

  process(inputs, outputs, parameters) {
    if (!this.initialized || !this.synth) {
      return true;
    }

    const output = outputs[0];
    if (!output || output.length === 0) {
      return true;
    }

    const outputL = output[0];
    const outputR = output[1] || output[0];
    const numSamples = Math.min(outputL.length, this.bufferSize);

    // Check for WASM memory growth
    this.updateBufferViews();

    if (!this.outputBufferL || !this.outputBufferR) {
      return true;
    }

    // Process audio through WASM
    this.synth.process(this.outputPtrL, this.outputPtrR, numSamples);

    // Copy from WASM memory to output buffers
    for (let i = 0; i < numSamples; i++) {
      outputL[i] = this.outputBufferL[i];
      outputR[i] = this.outputBufferR[i];
    }

    return true;
  }
}

registerProcessor('open303-processor', Open303Processor);
