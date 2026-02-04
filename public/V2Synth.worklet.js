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
    this._wasmMemory = null;
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

            const wrappedCode = jsCode + '\nreturn typeof V2Synth !== "undefined" ? V2Synth : (typeof Module !== "undefined" ? Module : null);';
            const factory = new Function(wrappedCode);
            const result = factory();

            if (typeof result === 'function') {
              globalThis.V2Synth = result;
              console.log('[V2 Worklet] ✓ JS module loaded');
            } else {
              console.error('[V2 Worklet] Unexpected result type:', typeof result);
              this.port.postMessage({ type: 'error', error: 'JS module returned ' + typeof result });
              return;
            }
          }

          if (typeof globalThis.V2Synth !== 'function') {
            console.error('[V2 Worklet] V2Synth not available');
            this.port.postMessage({ type: 'error', error: 'V2Synth factory not available' });
            return;
          }

          // Intercept WebAssembly.instantiate to capture WASM memory and exports
          // (Emscripten may not export wasmMemory/_malloc on Module depending on build flags)
          let capturedMemory = null;
          let capturedMalloc = null;
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
              // Capture _malloc if available in raw exports
              if (typeof instance.exports._malloc === 'function') {
                capturedMalloc = instance.exports._malloc;
              }
            }
            return result;
          };

          // Initialize WASM module
          const config = {};
          if (wasmBinary) {
            config.wasmBinary = wasmBinary;
          }
          // Prevent Emscripten from using URL() to locate files (not available in WorkletGlobalScope)
          config.locateFile = (path) => path;

          try {
            this._module = await globalThis.V2Synth(config);
          } finally {
            WebAssembly.instantiate = origInstantiate;
          }

          // Resolve memory and malloc from multiple sources:
          // 1. Module.wasmMemory (from JS preprocessing) or capturedMemory (from interception)
          // 2. Module._malloc (from preprocessing) or capturedMalloc (from interception)
          this._wasmMemory = this._module.wasmMemory || capturedMemory;
          const malloc = this._module._malloc || this._module.malloc || capturedMalloc;

          console.log('[V2 Worklet] WASM loaded, exports:', Object.keys(this._module).filter(k => k.startsWith('_')),
            'memory:', !!this._wasmMemory, 'malloc:', !!malloc);

          // Initialize synth at sample rate
          if (this._module._initSynth) {
            this._module._initSynth(sampleRate);
          } else if (this._module.initSynth) {
            this._module.initSynth(sampleRate);
          }

          // Allocate output buffers
          if (malloc && this._wasmMemory) {
            this._outLPtr = malloc(128 * 4);
            this._outRPtr = malloc(128 * 4);

            this._outL = new Float32Array(this._wasmMemory.buffer, this._outLPtr, 128);
            this._outR = new Float32Array(this._wasmMemory.buffer, this._outRPtr, 128);
            console.log('[V2 Worklet] Output buffers allocated at', this._outLPtr, this._outRPtr);
          } else {
            console.warn('[V2 Worklet] No malloc or memory available, audio output disabled');
          }

          this._initialized = true;
          this.port.postMessage({ type: 'ready' });
          console.log('[V2 Worklet] ✓ Ready');
        } catch (err) {
          console.error('[V2 Worklet] Failed to load WASM module:', err);
          this.port.postMessage({ type: 'error', error: err.message });
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
      // Handle WASM memory growth
      if (this._wasmMemory && this._outL.buffer !== this._wasmMemory.buffer) {
        this._outL = new Float32Array(this._wasmMemory.buffer, this._outLPtr, 128);
        this._outR = new Float32Array(this._wasmMemory.buffer, this._outRPtr, 128);
      }

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
