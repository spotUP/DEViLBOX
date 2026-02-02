/**
 * V2Synth.worklet.js
 * AudioWorklet for Farbrausch V2 Synth (WASM)
 */

class V2SynthProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._initialized = false;
    this._module = null;
    
    this.port.onmessage = async (event) => {
      if (event.data.type === 'init') {
        // We load the module dynamically inside the worklet
        // Note: Emscripten ES6 module needs to be imported
        try {
          const { default: V2Synth } = await import('./V2Synth.js');
          
          this._module = await V2Synth({
            wasmBinary: event.data.wasmBinary,
            // Optimization: bypass file system
            noInitialRun: true
          });

          this._module.initSynth(sampleRate);
          
          // Allocate buffers
          this._outLPtr = this._module._malloc(128 * 4);
          this._outRPtr = this._module._malloc(128 * 4);
          this._outL = new Float32Array(this._module.HEAPF32.buffer, this._outLPtr, 128);
          this._outR = new Float32Array(this._module.HEAPF32.buffer, this._outRPtr, 128);

          this._initialized = true;
          this.port.postMessage({ type: 'ready' });
        } catch (err) {
          console.error('[V2 Worklet] Failed to load WASM module:', err);
        }
      } else if (event.data.type === 'midi') {
        if (this._initialized) {
          this._module.processMIDI(event.data.msg[0], event.data.msg[1], event.data.msg[2]);
        }
      } else if (event.data.type === 'param') {
        if (this._initialized) {
          this._module.setParameter(0, event.data.index, event.data.value);
        }
      }
    };
  }

  process(inputs, outputs, parameters) {
    if (!this._initialized) return true;

    const output = outputs[0];
    const left = output[0];
    const right = output[1];
    const numSamples = left.length;

    // V2 renders stereo. If output is mono, we'll just use left.
    this._module.render(this._outLPtr, this._outRPtr, numSamples);

    left.set(this._outL);
    if (right) {
      right.set(this._outR);
    }

    return true;
  }
}

registerProcessor('v2-synth-processor', V2SynthProcessor);