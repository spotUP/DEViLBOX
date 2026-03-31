/**
 * Monique.worklet.js — AudioWorklet processor for Monique Monosynth
 * Uses WASMSynthBase Embind API (class-based: MoniqueSynth)
 */

// AudioWorkletGlobalScope has no `performance` — polyfill for Emscripten's emscripten_get_now()
if (typeof performance === 'undefined') {
  globalThis.performance = { now: () => currentTime * 1000 };
}

class MoniqueProcessor extends AudioWorkletProcessor {
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
    this._wasmMemory = null;
    this._bufferSize = 128;

    this.port.onmessage = this.handleMessage.bind(this);
  }

  async handleMessage(event) {
    const { type, ...data } = event.data;

    switch (type) {
      case 'init':
        await this.initialize(data);
        break;

      case 'noteOn':
        if (this.synth && this.isInitialized) {
          console.log('[Monique Worklet] noteOn:', data.note, 'vel:', data.velocity || 100);
          this.synth.noteOn(data.note, data.velocity || 100);
          this._audioDetected = false; // Reset to detect audio from this note
        } else {
          this.pendingMessages.push(event.data);
        }
        break;

      case 'noteOff':
        if (this.synth && this.isInitialized) {
          console.log('[Monique Worklet] noteOff:', data.note);
          this.synth.noteOff(data.note);
        }
        break;

      case 'allNotesOff':
        if (this.synth && this.isInitialized) {
          this.synth.allNotesOff();
        }
        break;

      case 'setParam':
        if (this.synth && this.isInitialized) {
          this.synth.setParameter(data.index, data.value);
        } else {
          this.pendingMessages.push(event.data);
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
    this.outputBufferL = null;
    this.outputBufferR = null;
    this.synth = null;
    this.isInitialized = false;
  }

  async initialize(data) {
    try {
      const { wasmBinary, jsCode } = data;
      if (!wasmBinary || !jsCode) {
        throw new Error('Missing wasmBinary or jsCode in init message');
      }

      // Evaluate JS to get the module factory
      let createModule;
      try {
        const wrappedCode = `${jsCode}; return typeof createMoniqueModule !== 'undefined' ? createMoniqueModule : null;`;
        createModule = new Function(wrappedCode)();
      } catch (evalErr) {
        console.error('[Monique Worklet] Failed to evaluate JS:', evalErr);
        throw new Error('Could not evaluate Monique module factory');
      }

      if (!createModule) {
        throw new Error('Could not load createMoniqueModule factory');
      }

      // Intercept WebAssembly.instantiate to capture WASM memory
      let capturedMemory = null;
      const origInstantiate = WebAssembly.instantiate;
      WebAssembly.instantiate = async function (...args) {
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

      // Create synth instance via Embind class
      const SynthClass = Module.MoniqueSynth;
      if (!SynthClass) {
        throw new Error('WASM module does not export MoniqueSynth class');
      }
      this.synth = new SynthClass();
      this.synth.initialize(data.sampleRate || sampleRate);

      // Allocate output buffers (128 = Web Audio standard quantum size)
      this._bufferSize = 128;
      this.outputPtrL = Module._malloc(this._bufferSize * 4);
      this.outputPtrR = Module._malloc(this._bufferSize * 4);

      // Get WASM memory
      const wasmMem = Module.wasmMemory || capturedMemory;
      this._wasmMemory = wasmMem;

      const heapBuffer = Module.HEAPF32
        ? Module.HEAPF32.buffer
        : wasmMem ? wasmMem.buffer : null;

      if (!heapBuffer) {
        throw new Error('Cannot access WASM memory buffer');
      }

      this.outputBufferL = new Float32Array(heapBuffer, this.outputPtrL, this._bufferSize);
      this.outputBufferR = new Float32Array(heapBuffer, this.outputPtrR, this._bufferSize);

      this.isInitialized = true;

      // Replay pending messages
      for (const msg of this.pendingMessages) {
        this.handleMessage({ data: msg });
      }
      this.pendingMessages = [];

      this.port.postMessage({ type: 'ready' });
    } catch (err) {
      console.error('[Monique Worklet] Init failed:', err);
      this.port.postMessage({ type: 'error', error: err.message || String(err) });
    }
  }

  process(inputs, outputs, parameters) {
    if (!this.synth || !this.isInitialized) {
      return true;
    }

    const outputL = outputs[0]?.[0];
    const outputR = outputs[0]?.[1] || outputs[0]?.[0];
    if (!outputL) return true;

    const numSamples = outputL.length;

    try {
      this.synth.process(this.outputPtrL, this.outputPtrR, numSamples);

      // Refresh views if WASM memory was resized
      const currentBuffer = this._wasmMemory
        ? this._wasmMemory.buffer
        : this.Module.HEAPF32 ? this.Module.HEAPF32.buffer : null;
      if (currentBuffer && this.outputBufferL.buffer !== currentBuffer) {
        this.outputBufferL = new Float32Array(currentBuffer, this.outputPtrL, this._bufferSize);
        this.outputBufferR = new Float32Array(currentBuffer, this.outputPtrR, this._bufferSize);
      }

      outputL.set(this.outputBufferL.subarray(0, numSamples));
      if (outputR !== outputL) {
        outputR.set(this.outputBufferR.subarray(0, numSamples));
      }

      // Audio level monitoring — log once when audio starts/stops
      if (!this._audioDetected) this._audioDetected = false;
      let peak = 0;
      for (let i = 0; i < numSamples; i++) {
        const v = Math.abs(outputL[i]);
        if (v > peak) peak = v;
      }
      if (peak > 0.0001 && !this._audioDetected) {
        this._audioDetected = true;
        this.port.postMessage({ type: 'audioLevel', peak, status: 'producing audio' });
      }
    } catch (error) {
      console.error('[Monique Worklet] process error:', error);
    }

    return true;
  }
}

registerProcessor('monique-processor', MoniqueProcessor);
