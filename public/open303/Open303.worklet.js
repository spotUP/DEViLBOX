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
    this.currentNote = -1; // Track currently held note for slide logic
    this.pendingMessages = []; // Queue messages received before WASM init completes
    this.initializing = false;

    this.port.onmessage = (event) => {
      this.handleMessage(event.data);
    };
  }

  async handleMessage(data) {
    // Queue non-init messages while WASM is still loading
    if (data.type !== 'init' && data.type !== 'dispose' && !this.synth && this.initializing) {
      // Only queue setParameter (not notes - those are stale by the time init finishes)
      if (data.type === 'setParameter') {
        this.pendingMessages.push(data);
      }
      return;
    }

    switch (data.type) {
      case 'init':
        await this.initSynth(data.sampleRate, data.wasmBinary, data.jsCode);
        break;
      case 'noteOn':
        if (this.synth) {
          // TB-303 slide/trigger logic (matches "Classic-Naive" MIDI implementation):
          // Open303 internally uses a noteList to decide trigger vs slide.
          // If noteList is empty → triggerNote() (full envelope retrigger)
          // If noteList is NOT empty → slideToNote() (pitch glide only, no retrigger)
          //
          // For NON-SLIDE notes: send noteOff first to clear noteList → triggerNote
          // For SLIDE notes: keep previous note held → slideToNote (legato)
          if (!data.slide && this.currentNote >= 0) {
            console.log('[Open303] TRIGGER: noteOff(' + this.currentNote + ') then noteOn(' + data.note + ') vel=' + data.velocity);
            this.synth.noteOff(this.currentNote);
          } else if (data.slide && this.currentNote >= 0) {
            console.log('[Open303] SLIDE: noteOn(' + data.note + ') over held note ' + this.currentNote + ' vel=' + data.velocity);
          } else {
            console.log('[Open303] FIRST NOTE: noteOn(' + data.note + ') vel=' + data.velocity);
          }
          this.synth.noteOn(data.note, data.velocity);
          this.currentNote = data.note;
        }
        break;
      case 'noteOff':
        if (this.synth) {
          // Only process noteOff for the actual held note (note=0 is intentionally a no-op)
          if (data.note > 0 && data.note === this.currentNote) {
            console.log('[Open303] RELEASE: noteOff(' + data.note + ')');
            this.synth.noteOff(data.note);
            this.currentNote = -1;
          }
          // note=0 is ignored - worklet handles note transitions via noteOn slide logic
        }
        break;
      case 'gateOff':
        if (this.synth && this.currentNote >= 0) {
          // Gate off: VCA envelope enters 16ms release (matching real 303 hardware).
          // Real TB-303: 8ms hold + 8ms linear decay when gate goes LOW.
          console.log('[Open303] GATE OFF: noteOff(' + this.currentNote + ')');
          this.synth.noteOff(this.currentNote);
          this.currentNote = -1;
        }
        break;
      case 'allNotesOff':
        if (this.synth) {
          console.log('[Open303] ALL NOTES OFF');
          this.synth.allNotesOff();
          this.currentNote = -1;
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
      case 'getDiagnostics':
        if (this.synth) {
          try {
            var peak = 0;
            if (this.outputBufferL) {
              for (var di = 0; di < this.bufferSize; di++) {
                var abs = Math.abs(this.outputBufferL[di] || 0);
                if (abs > peak) peak = abs;
              }
            }
            this.port.postMessage({
              type: 'diagnostics',
              cutoff: this.synth.getParameter(2),
              resonance: this.synth.getParameter(3),
              envMod: this.synth.getParameter(4),
              decay: this.synth.getParameter(5),
              accent: this.synth.getParameter(6),
              waveform: this.synth.getParameter(0),
              volume: this.synth.getParameter(7),
              peakAmplitude: peak,
              currentNote: this.currentNote,
              initialized: this.initialized
            });
          } catch (e) {
            this.port.postMessage({ type: 'diagnostics', error: e.message });
          }
        } else {
          this.port.postMessage({ type: 'diagnostics', error: 'synth not initialized', initialized: this.initialized, initializing: this.initializing });
        }
        break;
      case 'dispose':
        this.cleanup();
        break;
    }
  }

  async initSynth(sampleRate, wasmBinary, jsCode) {
    this.initializing = true;
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

      // Intercept WebAssembly.instantiate to capture WASM memory
      // (Emscripten may not export HEAPF32/wasmMemory on Module)
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
        this.module = await globalThis.Open303(config);
      } finally {
        WebAssembly.instantiate = origInstantiate;
      }

      // Store captured memory for buffer access
      if (!this.module.wasmMemory && capturedMemory) {
        this.module.wasmMemory = capturedMemory;
      }
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
      this.initializing = false;

      // Replay queued parameter messages that arrived during WASM init
      if (this.pendingMessages.length > 0) {
        console.log('[Open303 Worklet] Replaying ' + this.pendingMessages.length + ' queued parameter messages');
        // Deduplicate: keep only the last value for each paramId
        const paramMap = new Map();
        for (const msg of this.pendingMessages) {
          paramMap.set(msg.paramId, msg.value);
        }
        for (const [paramId, value] of paramMap) {
          this.synth.setParameter(paramId, value);
        }
        this.pendingMessages = [];
      }

      this.port.postMessage({ type: 'ready' });
      console.log('[Open303 Worklet] ✓ Ready');
    } catch (error) {
      this.initializing = false;
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
