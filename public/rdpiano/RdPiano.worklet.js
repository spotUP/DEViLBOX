/**
 * RdPiano AudioWorklet Processor
 * Roland SA-synthesis Digital Piano (MKS-20 / MK-80)
 * Output-only synth processor with ROM loading support
 */

let processorRegistered = false;

class RdPianoProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.synth = null;
    this.Module = null;
    this.isInitialized = false;
    this.pendingMessages = [];
    this.outputPtrL = 0;
    this.outputPtrR = 0;
    this.outputBufferL = null;
    this.outputBufferR = null;
    this.port.onmessage = this.handleMessage.bind(this);
  }

  async handleMessage(event) {
    const { type, ...data } = event.data;

    switch (type) {
      case 'init':
        await this.initialize(data);
        break;

      case 'loadProgramROM':
        if (this.synth && this.Module) {
          this.loadProgramROM(data.romData);
        } else {
          this.pendingMessages.push(event.data);
        }
        break;

      case 'loadROMSet':
        if (this.synth && this.Module) {
          this.loadROMSet(data.setIndex, data.ic5, data.ic6, data.ic7, data.ic18);
        } else {
          this.pendingMessages.push(event.data);
        }
        break;

      case 'initMCU':
        if (this.synth) {
          const success = this.synth.initMCU();
          if (success) {
            this.isInitialized = true;
            // Process any pending messages
            for (const msg of this.pendingMessages) {
              this.handleMessage({ data: msg });
            }
            this.pendingMessages = [];
            this.port.postMessage({ type: 'ready' });
          } else {
            this.port.postMessage({ type: 'error', error: 'MCU initialization failed' });
          }
        }
        break;

      case 'selectPatch':
        if (this.synth && this.isInitialized) {
          this.synth.selectPatch(data.patchIndex);
        } else {
          this.pendingMessages.push(event.data);
        }
        break;

      case 'noteOn':
        if (this.synth && this.isInitialized) {
          this.synth.noteOn(data.note, data.velocity || 100);
        } else {
          this.pendingMessages.push(event.data);
        }
        break;

      case 'noteOff':
        if (this.synth && this.isInitialized) {
          this.synth.noteOff(data.note);
        }
        break;

      case 'allNotesOff':
        if (this.synth && this.isInitialized) {
          this.synth.allNotesOff();
        }
        break;

      case 'parameter':
        if (this.synth && this.isInitialized) {
          this.synth.setParameter(data.paramId, data.value);
        } else {
          this.pendingMessages.push(event.data);
        }
        break;

      case 'controlChange':
        if (this.synth && this.isInitialized) {
          this.synth.controlChange(data.cc, data.value);
        }
        break;

      case 'pitchBend':
        if (this.synth && this.isInitialized) {
          this.synth.pitchBend(data.value);
        }
        break;

      case 'dispose':
        this.cleanup();
        break;
    }
  }

  loadProgramROM(romData) {
    if (!this.Module || !this.synth) return;
    const data = new Uint8Array(romData);
    const ptr = this.Module._malloc(data.byteLength);
    if (!ptr) {
      this.port.postMessage({ type: 'error', error: 'Failed to allocate memory for program ROM' });
      return;
    }
    const heapBuffer = this._wasmMemory ? this._wasmMemory.buffer : (this.Module.HEAPU8 ? this.Module.HEAPU8.buffer : null);
    if (!heapBuffer) {
      this.port.postMessage({ type: 'error', error: 'Cannot access WASM memory for ROM loading' });
      this.Module._free(ptr);
      return;
    }
    new Uint8Array(heapBuffer, ptr, data.byteLength).set(data);
    this.synth.loadProgramROM(ptr, data.byteLength);
    this.Module._free(ptr);
  }

  loadROMSet(setIndex, ic5Data, ic6Data, ic7Data, ic18Data) {
    if (!this.Module || !this.synth) return;

    const roms = [
      new Uint8Array(ic5Data),
      new Uint8Array(ic6Data),
      new Uint8Array(ic7Data),
      new Uint8Array(ic18Data),
    ];

    const heapBuffer = this._wasmMemory ? this._wasmMemory.buffer : (this.Module.HEAPU8 ? this.Module.HEAPU8.buffer : null);
    if (!heapBuffer) throw new Error('Cannot access WASM memory for ROM loading');

    const ptrs = roms.map(rom => {
      const ptr = this.Module._malloc(rom.byteLength);
      if (!ptr) throw new Error('Failed to allocate memory for ROM');
      new Uint8Array(heapBuffer, ptr, rom.byteLength).set(rom);
      return ptr;
    });

    try {
      this.synth.loadROMSet(
        setIndex,
        ptrs[0], roms[0].byteLength,
        ptrs[1], roms[1].byteLength,
        ptrs[2], roms[2].byteLength,
        ptrs[3], roms[3].byteLength
      );
    } finally {
      ptrs.forEach(ptr => this.Module._free(ptr));
    }
  }

  cleanup() {
    if (this.Module && this.outputPtrL) {
      this.Module._free(this.outputPtrL);
      this.outputPtrL = 0;
    }
    if (this.Module && this.outputPtrR) {
      this.Module._free(this.outputPtrR);
      this.outputPtrR = 0;
    }
    this.outputBufferL = null;
    this.outputBufferR = null;
    if (this.synth) {
      this.synth.delete();
      this.synth = null;
    }
    this.Module = null;
    this.isInitialized = false;
  }

  async initialize(data) {
    try {
      const { wasmBinary, jsCode } = data;
      if (!wasmBinary || !jsCode) {
        throw new Error('Missing wasmBinary or jsCode in init message');
      }

      // Evaluate Emscripten-generated JS to get module factory
      let createModule;
      try {
        const wrappedCode = `${jsCode}; return typeof createRdPianoModule !== 'undefined' ? createRdPianoModule : (typeof Module !== 'undefined' ? Module : null);`;
        createModule = new Function(wrappedCode)();
      } catch (evalErr) {
        throw new Error('Could not evaluate RdPiano module factory: ' + evalErr.message);
      }

      if (!createModule) {
        throw new Error('Could not load RdPiano module factory');
      }

      // Intercept WebAssembly.instantiate to capture WASM memory
      // (Emscripten doesn't export HEAPF32/wasmMemory on Module object)
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
      let Module;
      try {
        Module = await createModule({ wasmBinary });
      } finally {
        WebAssembly.instantiate = origInstantiate;
      }
      this.Module = Module;

      // Store memory reference for heap access - try multiple sources
      const wasmMem = Module.wasmMemory || capturedMemory;
      this._wasmMemory = wasmMem;

      // Create synth instance
      this.synth = new Module.RdPianoSynth();
      this.synth.initialize(sampleRate);

      // Allocate output buffers (128 samples * 4 bytes per float)
      const bufferSize = 128 * 4;
      this.outputPtrL = Module._malloc(bufferSize);
      this.outputPtrR = Module._malloc(bufferSize);
      if (!this.outputPtrL || !this.outputPtrR) {
        throw new Error('Failed to allocate output buffers');
      }

      // Get WASM memory buffer
      const heapBuffer = Module.HEAPF32
        ? Module.HEAPF32.buffer
        : (wasmMem ? wasmMem.buffer : null);

      if (!heapBuffer) {
        throw new Error('Cannot access WASM memory buffer');
      }

      // Create typed array views
      this.outputBufferL = new Float32Array(heapBuffer, this.outputPtrL, 128);
      this.outputBufferR = new Float32Array(heapBuffer, this.outputPtrR, 128);

      // Process pending messages (ROM loading etc.)
      const pending = [...this.pendingMessages];
      this.pendingMessages = [];
      for (const msg of pending) {
        await this.handleMessage({ data: msg });
      }

      this.port.postMessage({ type: 'wasmReady' });
    } catch (error) {
      this.port.postMessage({ type: 'error', error: error.message });
    }
  }

  process(inputs, outputs, parameters) {
    if (!this.synth || !this.isInitialized) {
      return true;
    }

    const outputL = outputs[0][0];
    const outputR = outputs[0][1] || outputs[0][0];
    const numSamples = outputL.length;

    try {
      // Generate audio through WASM
      this.synth.processJS(this.outputPtrL, this.outputPtrR, numSamples);

      // Handle WASM memory growth (buffer may have been reallocated)
      const currentBuffer = this._wasmMemory ? this._wasmMemory.buffer : (this.Module.HEAPF32 ? this.Module.HEAPF32.buffer : null);
      if (currentBuffer && this.outputBufferL.buffer !== currentBuffer) {
        this.outputBufferL = new Float32Array(currentBuffer, this.outputPtrL, 128);
        this.outputBufferR = new Float32Array(currentBuffer, this.outputPtrR, 128);
      }

      // Copy to output
      outputL.set(this.outputBufferL.subarray(0, numSamples));
      outputR.set(this.outputBufferR.subarray(0, numSamples));
    } catch (error) {
      // Silence on error
    }

    return true;
  }
}

if (!processorRegistered) {
  registerProcessor('rdpiano-processor', RdPianoProcessor);
  processorRegistered = true;
}
