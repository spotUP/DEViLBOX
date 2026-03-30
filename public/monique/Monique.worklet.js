/**
 * Monique.worklet.js — AudioWorklet processor for Monique Monosynth
 * Uses WASMSynthBase Embind API (class-based: MoniqueSynth)
 */

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
          console.log(`[Monique Worklet] noteOn: note=${data.note} vel=${data.velocity || 100}`);
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
      console.log('[Monique Worklet] Init called, wasmBinary:', wasmBinary?.byteLength, 'jsCode length:', jsCode?.length);
      if (!wasmBinary || !jsCode) {
        throw new Error('Missing wasmBinary or jsCode in init message');
      }

      // Evaluate JS to get the module factory
      let createModule;
      try {
        const wrappedCode = `${jsCode}; return typeof createMoniqueModule !== 'undefined' ? createMoniqueModule : null;`;
        createModule = new Function(wrappedCode)();
        console.log('[Monique Worklet] Factory eval result:', typeof createModule);
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
        console.log('[Monique Worklet] Module created, keys:', Object.keys(Module).slice(0, 20));
      } finally {
        WebAssembly.instantiate = origInstantiate;
      }

      this.Module = Module;

      // Create synth instance via Embind class
      const SynthClass = Module.MoniqueSynth;
      console.log('[Monique Worklet] SynthClass:', typeof SynthClass, SynthClass ? 'found' : 'MISSING');
      if (!SynthClass) {
        throw new Error('WASM module does not export MoniqueSynth class');
      }
      this.synth = new SynthClass();
      console.log('[Monique Worklet] Synth instance created, calling initialize with sampleRate:', data.sampleRate || sampleRate);
      this.synth.initialize(data.sampleRate || sampleRate);
      console.log('[Monique Worklet] Synth initialized');

      // Allocate output buffers
      this.outputPtrL = Module._malloc(128 * 4);
      this.outputPtrR = Module._malloc(128 * 4);
      console.log('[Monique Worklet] Buffers allocated:', this.outputPtrL, this.outputPtrR);

      // Get WASM memory
      const wasmMem = Module.wasmMemory || capturedMemory;
      this._wasmMemory = wasmMem;
      console.log('[Monique Worklet] wasmMemory:', wasmMem ? 'found' : 'MISSING', 'capturedMemory:', capturedMemory ? 'found' : 'MISSING');

      const heapBuffer = Module.HEAPF32
        ? Module.HEAPF32.buffer
        : wasmMem ? wasmMem.buffer : null;

      if (!heapBuffer) {
        throw new Error('Cannot access WASM memory buffer');
      }

      this.outputBufferL = new Float32Array(heapBuffer, this.outputPtrL, 128);
      this.outputBufferR = new Float32Array(heapBuffer, this.outputPtrR, 128);

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
        this.outputBufferL = new Float32Array(currentBuffer, this.outputPtrL, 128);
        this.outputBufferR = new Float32Array(currentBuffer, this.outputPtrR, 128);
      }

      // Debug: check for non-zero samples periodically
      if (!this._dbgCount) this._dbgCount = 0;
      if (++this._dbgCount % 500 === 1) {
        let maxL = 0;
        for (let i = 0; i < numSamples; i++) {
          const v = Math.abs(this.outputBufferL[i]);
          if (v > maxL) maxL = v;
        }
        console.log(`[Monique Worklet] process #${this._dbgCount} maxL=${maxL.toFixed(6)} samples=${numSamples}`);
      }

      outputL.set(this.outputBufferL.subarray(0, numSamples));
      if (outputR !== outputL) {
        outputR.set(this.outputBufferR.subarray(0, numSamples));
      }
    } catch (error) {
      console.error('[Monique Worklet] process error:', error);
    }

    return true;
  }
}

registerProcessor('monique-processor', MoniqueProcessor);
