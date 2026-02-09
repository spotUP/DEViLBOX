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
    // Store ROM pointers to prevent use-after-free
    this.romPointers = [];
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
          try {
            // Verify ROMs are loaded before calling initMCU
            console.log('[RdPiano Worklet] Checking ROM status before initMCU...');
            const romSet0 = this.synth.isROMSetLoaded(0);
            const romSet1 = this.synth.isROMSetLoaded(1);
            const romSet2 = this.synth.isROMSetLoaded(2);
            console.log(`[RdPiano Worklet] ROM sets loaded: [0]=${romSet0}, [1]=${romSet1}, [2]=${romSet2}`);

            if (!romSet0 && !romSet1 && !romSet2) {
              console.error('[RdPiano Worklet] No ROM sets loaded! Cannot initialize MCU.');
              this.port.postMessage({ type: 'error', error: 'No ROM sets loaded before initMCU' });
              break;
            }

            console.log('[RdPiano Worklet] Calling initMCU()...');
            const success = this.synth.initMCU();
            console.log('[RdPiano Worklet] initMCU() returned:', success);

            if (success) {
              this.isInitialized = true;
              // Process any pending messages
              for (const msg of this.pendingMessages) {
                this.handleMessage({ data: msg });
              }
              this.pendingMessages = [];
              this.port.postMessage({ type: 'ready' });
            } else {
              this.port.postMessage({ type: 'error', error: 'MCU initialization failed - initMCU returned false' });
            }
          } catch (error) {
            console.error('[RdPiano Worklet] initMCU crashed:', error);
            this.port.postMessage({
              type: 'initMCUError',
              error: error.message || 'WASM memory access error during initMCU'
            });
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
    if (!this.Module || !this.synth) {
      console.error('[RdPiano Worklet] loadProgramROM called but Module or synth not ready');
      return;
    }
    const data = new Uint8Array(romData);
    console.log(`[RdPiano Worklet] Loading program ROM: ${data.byteLength} bytes`);

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

    console.log(`[RdPiano Worklet] Calling synth.loadProgramROM(ptr=${ptr}, len=${data.byteLength})`);
    this.synth.loadProgramROM(ptr, data.byteLength);
    console.log(`[RdPiano Worklet] Program ROM loaded successfully`);

    // DON'T free ROM memory - WASM module stores pointers to this data
    // initMCU needs to access it later, freeing causes use-after-free crash
    this.romPointers.push(ptr);
  }

  loadROMSet(setIndex, ic5Data, ic6Data, ic7Data, ic18Data) {
    if (!this.Module || !this.synth) {
      console.error('[RdPiano Worklet] loadROMSet called but Module or synth not ready');
      return;
    }

    console.log(`[RdPiano Worklet] Loading ROM set ${setIndex}...`);
    const roms = [
      new Uint8Array(ic5Data),
      new Uint8Array(ic6Data),
      new Uint8Array(ic7Data),
      new Uint8Array(ic18Data),
    ];
    console.log(`[RdPiano Worklet] ROM sizes: IC5=${roms[0].byteLength}, IC6=${roms[1].byteLength}, IC7=${roms[2].byteLength}, IC18=${roms[3].byteLength}`);

    const heapBuffer = this._wasmMemory ? this._wasmMemory.buffer : (this.Module.HEAPU8 ? this.Module.HEAPU8.buffer : null);
    if (!heapBuffer) throw new Error('Cannot access WASM memory for ROM loading');

    const ptrs = roms.map((rom, idx) => {
      const ptr = this.Module._malloc(rom.byteLength);
      if (!ptr) throw new Error(`Failed to allocate memory for ROM ${idx}`);
      new Uint8Array(heapBuffer, ptr, rom.byteLength).set(rom);
      console.log(`[RdPiano Worklet] Allocated ROM ${idx} at ptr=${ptr}`);
      return ptr;
    });

    console.log(`[RdPiano Worklet] Calling synth.loadROMSet(${setIndex}, ...)`);
    this.synth.loadROMSet(
      setIndex,
      ptrs[0], roms[0].byteLength,
      ptrs[1], roms[1].byteLength,
      ptrs[2], roms[2].byteLength,
      ptrs[3], roms[3].byteLength
    );
    console.log(`[RdPiano Worklet] ROM set ${setIndex} loaded successfully`);

    // DON'T free ROM memory - WASM module stores pointers to this data
    // initMCU needs to access it later, freeing causes use-after-free crash
    this.romPointers.push(...ptrs);
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
