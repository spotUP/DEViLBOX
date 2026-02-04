/**
 * V2Synth.worklet.js
 * AudioWorklet for Farbrausch V2 Synth (WASM)
 *
 * IMPORTANT: AudioWorklets don't support dynamic import().
 * The WASM module JS is passed as a string and executed via Function constructor.
 */

class V2SynthProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._initialized = false;
    this._module = null;
    this._outLPtr = 0;
    this._outRPtr = 0;
    this._outL = null;
    this._outR = null;

    this.port.onmessage = async (event) => {
      if (event.data.type === 'init') {
        try {
          const { wasmBinary, jsCode } = event.data;

          // Load JS module via Function constructor (dynamic import not allowed in worklets)
          if (jsCode && !globalThis.V2Synth) {
            console.log('[V2 Worklet] Loading JS module, code length:', jsCode.length);

            // The Emscripten module exports: var V2Synth = (IIFE that returns factory)
            const wrappedCode = jsCode + '\nreturn V2Synth;';
            const factory = new Function(wrappedCode);
            const result = factory();

            if (typeof result === 'function') {
              globalThis.V2Synth = result;
              console.log('[V2 Worklet] ✓ JS module loaded');
            } else {
              console.error('[V2 Worklet] Unexpected result type:', typeof result);
              return;
            }
          }

          if (typeof globalThis.V2Synth !== 'function') {
            console.error('[V2 Worklet] V2Synth not available');
            return;
          }

          // Initialize WASM module
          const config = {};
          if (wasmBinary) {
            config.wasmBinary = wasmBinary;
          }

          this._module = await globalThis.V2Synth(config);
          console.log('[V2 Worklet] WASM loaded, exports:', Object.keys(this._module).filter(k => k.startsWith('_')));

          // Initialize synth at sample rate
          if (this._module._initSynth) {
            this._module._initSynth(sampleRate);
          } else if (this._module.initSynth) {
            this._module.initSynth(sampleRate);
          }

          // Allocate output buffers
          const malloc = this._module._malloc || this._module.malloc;
          if (malloc) {
            this._outLPtr = malloc(128 * 4);
            this._outRPtr = malloc(128 * 4);

            // Get heap view
            if (!this._module.HEAPF32 && this._module.wasmMemory) {
              this._module.HEAPF32 = new Float32Array(this._module.wasmMemory.buffer);
            }

            if (this._module.HEAPF32) {
              this._outL = new Float32Array(this._module.HEAPF32.buffer, this._outLPtr, 128);
              this._outR = new Float32Array(this._module.HEAPF32.buffer, this._outRPtr, 128);
            }
          }

          this._initialized = true;
          this.port.postMessage({ type: 'ready' });
          console.log('[V2 Worklet] ✓ Ready');
        } catch (err) {
          console.error('[V2 Worklet] Failed to load WASM module:', err);
        }
      } else if (event.data.type === 'midi') {
        if (this._initialized && this._module) {
          const processMIDI = this._module._processMIDI || this._module.processMIDI;
          if (processMIDI) {
            processMIDI(event.data.msg[0], event.data.msg[1], event.data.msg[2]);
          }
        }
      } else if (event.data.type === 'param') {
        if (this._initialized && this._module) {
          const setParameter = this._module._setParameter || this._module.setParameter;
          if (setParameter) {
            setParameter(0, event.data.index, event.data.value);
          }
        }
      }
    };
  }

  process(inputs, outputs, parameters) {
    if (!this._initialized || !this._module) return true;

    const output = outputs[0];
    if (!output || !output[0]) return true;

    const left = output[0];
    const right = output[1];
    const numSamples = left.length;

    // Render audio
    const render = this._module._render || this._module.render;
    if (render && this._outL && this._outR) {
      render(this._outLPtr, this._outRPtr, numSamples);
      left.set(this._outL.subarray(0, numSamples));
      if (right) {
        right.set(this._outR.subarray(0, numSamples));
      }
    }

    return true;
  }
}

registerProcessor('v2-synth-processor', V2SynthProcessor);
