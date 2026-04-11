/**
 * Geonkick.worklet.js — AudioWorklet processor for the Geonkick WASM synth.
 *
 * Geonkick is a percussion synthesizer that bakes each "kick" sample offline
 * when parameters change (see geonkick-wasm/common/worker_stub.c) and then
 * reads the baked buffer at trigger time via gk_wasm_render_mono.
 *
 * The worklet runs at the AudioContext sample rate (no resampling needed —
 * gk_wasm_create takes the context's sampleRate). It receives trigger events
 * via port messages and renders into the worklet output each quantum.
 */

class GeonkickProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.wasm = null;
    this.handle = 0;
    this.initialized = false;
    this.outPtr = 0;
    this.outLen = 0;

    this.port.onmessage = (event) => this.handleMessage(event.data);
  }

  async handleMessage(data) {
    switch (data.type) {
      case 'init':
        await this.initWasm(data.wasmBinary, data.jsCode);
        break;
      case 'noteOn':
        if (this.initialized && this.handle) {
          this.wasm._gk_wasm_key_pressed(this.handle, 1, data.note | 0, data.velocity | 0);
        }
        break;
      case 'noteOff':
        if (this.initialized && this.handle) {
          this.wasm._gk_wasm_key_pressed(this.handle, 0, data.note | 0, 0);
        }
        break;
      case 'setLength':
        if (this.initialized && this.handle) {
          this.wasm._gk_wasm_set_length(this.handle, Number(data.seconds) || 0.3);
        }
        break;
      case 'setLimiter':
        if (this.initialized && this.handle) {
          this.wasm._gk_wasm_set_limiter(this.handle, Number(data.value) || 1.0);
        }
        break;
      case 'dispose':
        if (this.handle && this.wasm) {
          this.wasm._gk_wasm_destroy(this.handle);
          this.handle = 0;
        }
        if (this.outPtr && this.wasm) {
          this.wasm._free(this.outPtr);
          this.outPtr = 0;
        }
        this.initialized = false;
        break;
    }
  }

  async initWasm(wasmBinary, jsCode) {
    try {
      const factory = new Function(jsCode + '\nreturn createGeonkickModule;')();
      this.wasm = await factory({ wasmBinary });

      // Build-time scratch: one quantum (128 frames is typical, but give
      // 2048 headroom to match GK_RENDER_CHUNK in the bridge).
      this.outLen = 2048;
      this.outPtr = this.wasm._malloc(this.outLen * 4);

      // Create the synth instance at the worklet's context sample rate.
      this.handle = this.wasm._gk_wasm_create(sampleRate | 0);
      if (!this.handle) {
        throw new Error('gk_wasm_create returned null');
      }

      this.initialized = true;
      this.port.postMessage({ type: 'ready' });
    } catch (err) {
      this.port.postMessage({ type: 'error', message: 'Geonkick WASM init failed: ' + err.message });
    }
  }

  process(inputs, outputs, _parameters) {
    const output = outputs[0];
    if (!output || output.length < 1) return true;

    const outL = output[0];
    const outR = output.length > 1 ? output[1] : null;
    const blockSize = outL.length;

    if (!this.initialized || !this.handle || !this.outPtr) {
      outL.fill(0);
      if (outR) outR.fill(0);
      return true;
    }

    // Render mono from geonkick into WASM heap.
    this.wasm._gk_wasm_render_mono(this.handle, this.outPtr, blockSize);

    // Copy to both L and R. HEAPF32 is exposed via EXPORTED_RUNTIME_METHODS.
    const heap = this.wasm.HEAPF32;
    const offset = this.outPtr >> 2;
    for (let i = 0; i < blockSize; i++) {
      const v = heap[offset + i];
      outL[i] = v;
      if (outR) outR[i] = v;
    }

    return true;
  }
}

registerProcessor('geonkick-processor', GeonkickProcessor);
