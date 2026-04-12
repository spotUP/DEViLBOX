/**
 * SetBfree.worklet.js — Hammond B3 Organ + Leslie Speaker AudioWorklet
 *
 * Parameter indices:
 *   0-8:   Upper manual drawbars (0-8 each)
 *   9-17:  Lower manual drawbars (0-8 each)
 *   18-26: Pedal drawbars (0-8 each)
 *   27: Percussion enabled (0/1)
 *   28: Percussion volume (0=soft, 1=normal)
 *   29: Percussion decay (0=slow, 1=fast)
 *   30: Percussion harmonic (0=second, 1=third)
 *   31: Vibrato type (0=off, 1=V1, 2=C1, 3=V2, 4=C2, 5=V3, 6=C3)
 *   32: Vibrato upper (0/1)
 *   33: Vibrato lower (0/1)
 *   34: Leslie speed (0=slow, 1=stop, 2=fast)
 *   35: Overdrive drive (0.0-1.0)
 *   36: Overdrive input gain (0.0-1.0)
 *   37: Overdrive output gain (0.0-1.0)
 *   38: Reverb mix (0.0-1.0)
 *   39: Volume (0.0-1.0)
 *   40: Key click (0/1)
 *   41: Key click level (0.0-1.0)
 *   42: Overdrive feedback (0.0-1.0)
 *   43: Overdrive fat (0.0-1.0)
 */

let processorRegistered = false;

class SetBfreeProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.synth = null;
    this.isInitialized = false;
    this.pendingMessages = [];
    this.outputPtrL = 0;
    this.outputPtrR = 0;
    this.outputBufferL = null;
    this.outputBufferR = null;
    this._wasmMemory = null;
    this.Module = null;

    this.port.onmessage = this.handleMessage.bind(this);
  }

  handleMessage(event) {
    const { type, ...data } = event.data;

    switch (type) {
      case 'init':
        this.initialize(data);
        break;

      case 'noteOn':
        if (this.synth && this.isInitialized) {
          this.Module._setbfree_note_on(this.synth, data.note, data.velocity || 100);
        } else {
          this.pendingMessages.push(event.data);
        }
        break;

      case 'noteOff':
        if (this.synth && this.isInitialized) {
          this.Module._setbfree_note_off(this.synth, data.note);
        }
        break;

      case 'allNotesOff':
        if (this.synth && this.isInitialized) {
          this.Module._setbfree_all_notes_off(this.synth);
        }
        break;

      case 'setDrawbar':
        if (this.synth && this.isInitialized) {
          this.Module._setbfree_set_drawbar(
            this.synth, data.manual, data.drawbar, data.value
          );
        }
        break;

      case 'parameter':
        if (this.synth && this.isInitialized) {
          this.Module._setbfree_set_param(this.synth, data.paramId, data.value);
        }
        break;

      case 'leslieSpeed':
        if (this.synth && this.isInitialized) {
          // 0=slow, 1=stop, 2=fast
          this.Module._setbfree_set_param(this.synth, 34, data.speed);
        }
        break;

      case 'leslieToggle':
        if (this.synth && this.isInitialized) {
          // Toggle between slow and fast
          const current = this.Module._setbfree_get_param(this.synth, 34);
          const next = (current === 2) ? 0 : 2; // fast→slow or slow/stop→fast
          this.Module._setbfree_set_param(this.synth, 34, next);
        }
        break;

      case 'loadPatch':
        if (this.synth && this.isInitialized && data.values) {
          const numParams = this.Module._setbfree_get_num_params(this.synth);
          const count = Math.min(data.values.length, numParams);
          for (let i = 0; i < count; i++) {
            this.Module._setbfree_set_param(this.synth, i, data.values[i]);
          }
          this.port.postMessage({ type: 'patchLoaded', paramCount: count });
        }
        break;

      case 'getState':
        if (this.synth && this.isInitialized) {
          const numParams = this.Module._setbfree_get_num_params(this.synth);
          const state = new Float32Array(numParams);
          for (let i = 0; i < numParams; i++) {
            state[i] = this.Module._setbfree_get_param(this.synth, i);
          }
          this.port.postMessage({ type: 'state', values: Array.from(state), numParams });
        }
        break;

      case 'dispose':
        this.cleanup();
        break;
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
    if (this.Module && this.synth) {
      this.Module._setbfree_destroy(this.synth);
      this.synth = null;
    }
    this.outputBufferL = null;
    this.outputBufferR = null;
    this.isInitialized = false;
  }

  async initialize(data) {
    try {
      const { wasmBinary, jsCode } = data;

      if (!wasmBinary || !jsCode) {
        throw new Error('Missing wasmBinary or jsCode in init message');
      }

      let createModule;
      try {
        const wrappedCode = `${jsCode}; return createSetBfree;`;
        createModule = new Function(wrappedCode)();
      } catch (evalErr) {
        console.error('Failed to evaluate SetBfree JS:', evalErr);
        throw new Error('Could not evaluate SetBfree module factory');
      }

      if (!createModule) {
        throw new Error('Could not load SetBfree module factory');
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

      let Module;
      try {
        Module = await createModule({ wasmBinary });
      } finally {
        WebAssembly.instantiate = origInstantiate;
      }

      this.Module = Module;

      // Create synth instance
      this.synth = Module._setbfree_create(sampleRate);
      if (!this.synth) {
        throw new Error('setbfree_create returned null');
      }

      // Allocate output buffers in WASM memory (128 samples × 4 bytes)
      const bufferSize = 128 * 4;
      this.outputPtrL = Module._malloc(bufferSize);
      this.outputPtrR = Module._malloc(bufferSize);

      // Get WASM memory
      const wasmMem = Module.wasmMemory || capturedMemory;
      const heapBuffer = Module.HEAPF32
        ? Module.HEAPF32.buffer
        : (wasmMem ? wasmMem.buffer : null);

      if (!heapBuffer) {
        throw new Error('Cannot access WASM memory buffer');
      }

      this._wasmMemory = wasmMem;

      this.outputBufferL = new Float32Array(heapBuffer, this.outputPtrL, 128);
      this.outputBufferR = new Float32Array(heapBuffer, this.outputPtrR, 128);

      this.isInitialized = true;

      // Process pending messages
      for (const msg of this.pendingMessages) {
        this.handleMessage({ data: msg });
      }
      this.pendingMessages = [];

      this.port.postMessage({ type: 'ready' });

    } catch (error) {
      console.error('SetBfree initialization error:', error);
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
      this.Module._setbfree_process(
        this.synth, this.outputPtrL, this.outputPtrR, numSamples
      );

      // Recreate views if WASM memory was resized
      const currentBuffer = this._wasmMemory
        ? this._wasmMemory.buffer
        : (this.Module.HEAPF32 ? this.Module.HEAPF32.buffer : null);
      if (currentBuffer && this.outputBufferL.buffer !== currentBuffer) {
        this.outputBufferL = new Float32Array(currentBuffer, this.outputPtrL, 128);
        this.outputBufferR = new Float32Array(currentBuffer, this.outputPtrR, 128);
      }

      outputL.set(this.outputBufferL.subarray(0, numSamples));
      outputR.set(this.outputBufferR.subarray(0, numSamples));
    } catch (error) {
      console.error('SetBfree process error:', error);
    }

    return true;
  }
}

if (!processorRegistered) {
  registerProcessor('setbfree-processor', SetBfreeProcessor);
  processorRegistered = true;
}
