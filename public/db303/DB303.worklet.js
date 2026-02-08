/**
 * DB303 AudioWorklet Processor
 * TB-303 Bass Synthesizer for DEViLBOX
 *
 * IMPORTANT: AudioWorklets don't support dynamic import().
 * The WASM module JS is passed as a string and executed via Function constructor.
 */

// Performance: Disable note event logging (causes severe slowdown if true)
const DEBUG_NOTE_EVENTS = true;

class DB303Processor extends AudioWorkletProcessor {
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
    this.eventQueue = []; // Queue for sample-accurate events
    console.log('[DB303 Worklet] v1.1.1 (Sample-Accurate Queue Enabled)');

    this.port.onmessage = (event) => {
      this.handleMessage(event.data);
    };
  }

  async handleMessage(data) {
    // Queue non-init messages while WASM is still loading
    if (data.type !== 'init' && data.type !== 'dispose' && !this.synth && this.initializing) {
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
      case 'noteOff':
      case 'gateOff':
        if (data.time !== undefined) {
          this.eventQueue.push(data);
          this.eventQueue.sort((a, b) => a.time - b.time);
        } else {
          this.processEvent(data);
        }
        break;
      case 'allNotesOff':
        if (this.synth) {
          if (DEBUG_NOTE_EVENTS) console.log('[DB303] ALL NOTES OFF');
          this.synth.allNotesOff();
          this.currentNote = -1;
          this.eventQueue = [];
        }
        break;
      case 'setParameter':
        if (this.synth) {
          // Map string param names to numeric IDs (matches C++ DB303Param enum)
          // WASM only exposes setParameter(int, float), not named setters
          const paramNameToId = {
            waveform: 0, tuning: 1, cutoff: 2, resonance: 3, envMod: 4, decay: 5, accent: 6, volume: 7,
            ampSustain: 10, slideTime: 11, normalAttack: 12, accentAttack: 13, accentDecay: 14, ampDecay: 15, ampRelease: 16,
            preFilterHp: 20, feedbackHp: 21, postFilterHp: 22, squarePhase: 23,
            tanhDrive: 30, tanhOffset: 31,
            // Aliases for UI param names
            normalDecay: 5, // Same as decay
            softAttack: 12, // Same as normalAttack
            accentSoftAttack: 13, // Same as accentAttack
          };
          
          let paramId = data.paramId;
          let value = data.value;
          
          if (typeof paramId === 'string') {
            // Try named setter first (in case WASM exports them)
            const setterName = 'set' + paramId.charAt(0).toUpperCase() + paramId.slice(1);
            if (typeof this.synth[setterName] === 'function') {
              this.synth[setterName](value);
              break;
            }
            // Map string to numeric ID
            paramId = paramNameToId[paramId];
            if (paramId === undefined) {
              // Unknown param, skip
              break;
            }
          }
          
          // Call setParameter with numeric ID
          if (typeof this.synth.setParameter === 'function') {
            this.synth.setParameter(paramId, value);
          }
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

  processEvent(data) {
    if (!this.synth) return;

    switch (data.type) {
      case 'noteOn':
        if (!data.slide && this.currentNote >= 0) {
          if (DEBUG_NOTE_EVENTS) console.log('[DB303] TRIGGER: noteOff(' + this.currentNote + ') then noteOn(' + data.note + ') vel=' + data.velocity + ' at ' + currentTime.toFixed(3));
          this.synth.noteOff(this.currentNote);
        } else if (data.slide && this.currentNote >= 0) {
          if (DEBUG_NOTE_EVENTS) console.log('[DB303] SLIDE: noteOn(' + data.note + ') over held note ' + this.currentNote + ' vel=' + data.velocity + ' at ' + currentTime.toFixed(3));
        } else {
          if (DEBUG_NOTE_EVENTS) console.log('[DB303] FIRST NOTE: noteOn(' + data.note + ') vel=' + data.velocity + ' at ' + currentTime.toFixed(3));
        }
        this.synth.noteOn(data.note, data.velocity);
        this.currentNote = data.note;
        break;
      case 'noteOff':
        if (data.note > 0 && data.note === this.currentNote) {
          if (DEBUG_NOTE_EVENTS) console.log('[DB303] RELEASE: noteOff(' + data.note + ') at ' + currentTime.toFixed(3));
          this.synth.noteOff(data.note);
          this.currentNote = -1;
        }
        break;
      case 'gateOff':
        // Use allNotesOff to clear the entire noteList - during slides, multiple notes
        // accumulate in the WASM noteList, so we need to clear them all
        if (this.currentNote >= 0) {
          if (DEBUG_NOTE_EVENTS) console.log('[DB303] GATE OFF: allNotesOff() at ' + currentTime.toFixed(3));
          this.synth.allNotesOff();
          this.currentNote = -1;
        }
        break;
    }
  }

  async initSynth(sampleRate, wasmBinary, jsCode) {
    this.initializing = true;
    try {
      // Cleanup any existing allocation
      this.cleanup();

      // Load JS module via Function constructor (dynamic import not allowed in worklets)
      if (jsCode && !globalThis.DB303) {
        console.log('[DB303 Worklet] Loading JS module...');

        // Polyfill URL if not available in AudioWorklet scope
        if (typeof globalThis.URL === 'undefined') {
          globalThis.URL = class URL {
            constructor(path) { this.href = path; }
          };
        }

        // The Emscripten module defines createDB303Module, aliased to DB303
        const wrappedCode = jsCode + '\nreturn DB303;';
        const factory = new Function(wrappedCode);
        const result = factory();

        if (typeof result === 'function') {
          globalThis.DB303 = result;
          console.log('[DB303 Worklet] ✓ JS module loaded');
        } else {
          console.error('[DB303 Worklet] Unexpected result type:', typeof result);
          this.port.postMessage({ type: 'error', message: 'Failed to load JS module' });
          return;
        }
      }

      if (typeof globalThis.DB303 !== 'function') {
        console.error('[DB303 Worklet] DB303 factory not available');
        this.port.postMessage({ type: 'error', message: 'DB303 factory not available' });
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
        this.module = await globalThis.DB303(config);
      } finally {
        WebAssembly.instantiate = origInstantiate;
      }

      // Store captured memory for buffer access
      if (!this.module.wasmMemory && capturedMemory) {
        this.module.wasmMemory = capturedMemory;
      }
      console.log('[DB303 Worklet] WASM loaded');

      // Create synth engine instance - db303 WASM exports DB303Engine class
      if (this.module.DB303Engine) {
        this.synth = new this.module.DB303Engine(Math.floor(sampleRate));
        console.log('[DB303 Worklet] Created DB303Engine at', sampleRate, 'Hz');
      } else if (this.module.DB303Synth) {
        // Fallback for older WASM builds
        this.synth = new this.module.DB303Synth();
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
        console.log('[DB303 Worklet] Replaying ' + this.pendingMessages.length + ' queued parameter messages');
        // Deduplicate: keep only the last value for each paramId
        const paramMap = new Map();
        for (const msg of this.pendingMessages) {
          paramMap.set(msg.paramId, msg.value);
        }
        for (const [paramId, value] of paramMap) {
          // Use named setters (e.g., 'cutoff' -> 'setCutoff')
          if (typeof paramId === 'string') {
            const setterName = 'set' + paramId.charAt(0).toUpperCase() + paramId.slice(1);
            if (typeof this.synth[setterName] === 'function') {
              this.synth[setterName](value);
            }
          }
        }
        this.pendingMessages = [];
      }

      this.port.postMessage({ type: 'ready' });
      console.log('[DB303 Worklet] ✓ Ready');
    } catch (error) {
      this.initializing = false;
      console.error('[DB303 Worklet] Init error:', error);
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
    const blockLength = outputL.length;
    const numSamples = Math.min(blockLength, this.bufferSize);

    // Process audio block with sample-accurate event handling
    const sampleTime = 1.0 / sampleRate;
    let processedSamples = 0;
    
    // Get HEAPF32 for reading output
    const heapF32 = this.module.HEAPF32 || (this.module.wasmMemory && new Float32Array(this.module.wasmMemory.buffer));
    if (!heapF32) return true;

    // Process sub-blocks
    while (processedSamples < numSamples) {
      const blockStartTime = currentTime + processedSamples * sampleTime;
      
      // Find the next event in this block
      let nextEvent = null;
      if (this.eventQueue.length > 0 && this.eventQueue[0].time <= currentTime + numSamples * sampleTime) {
        nextEvent = this.eventQueue[0];
      }

      let samplesToProcess;
      if (nextEvent) {
        const eventOffset = Math.max(0, nextEvent.time - blockStartTime);
        samplesToProcess = Math.min(numSamples - processedSamples, Math.floor(eventOffset / sampleTime));
      } else {
        samplesToProcess = numSamples - processedSamples;
      }

      // Render audio before the next event (if any)
      if (samplesToProcess > 0) {
        // DB303Engine API: process(numSamples) then getOutputBufferPtr()
        if (typeof this.synth.process === 'function' && typeof this.synth.getOutputBufferPtr === 'function') {
          this.synth.process(samplesToProcess);
          const outputPtr = this.synth.getOutputBufferPtr();
          const ptrIndex = outputPtr >> 2;  // Float32 offset
          
          // Copy interleaved stereo output to separate L/R channels
          for (let i = 0; i < samplesToProcess; i++) {
            outputL[processedSamples + i] = heapF32[ptrIndex + i * 2];
            outputR[processedSamples + i] = heapF32[ptrIndex + i * 2 + 1];
          }
        } else {
          // Fallback for other WASM builds using separate L/R pointers
          this.updateBufferViews();
          if (this.outputBufferL && this.outputBufferR) {
            this.synth.process(this.outputPtrL, this.outputPtrR, samplesToProcess);
            for (let i = 0; i < samplesToProcess; i++) {
              outputL[processedSamples + i] = this.outputBufferL[i];
              outputR[processedSamples + i] = this.outputBufferR[i];
            }
          }
        }
        
        processedSamples += samplesToProcess;
      }

      // If we reached an event, process it
      if (nextEvent && processedSamples < numSamples) {
        const event = this.eventQueue.shift();
        this.processEvent(event);
        // Continue loop to process remaining samples or next events
      } else if (nextEvent && processedSamples === numSamples) {
        // Event is at the very end of or after this block
        if (nextEvent.time <= currentTime + numSamples * sampleTime) {
          const event = this.eventQueue.shift();
          this.processEvent(event);
        }
        break;
      } else {
        // No more events
        break;
      }
    }

    return true;
  }
}

registerProcessor('db303-processor', DB303Processor);
