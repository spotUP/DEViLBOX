/**
 * SpaceyDelayer AudioWorklet Processor
 * Multitap tape delay effect backed by WASM DSP engine.
 * Stereo in/out effect processing.
 */

class SpaceyDelayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.module = null;
    this.initialized = false;
    this.handle = 0;
    this.bufferSize = 128;
    this.lastHeapBuffer = null;

    // WASM memory pointers
    this.inPtrL = 0;
    this.inPtrR = 0;
    this.outPtrL = 0;
    this.outPtrR = 0;
    this.inBufL = null;
    this.inBufR = null;
    this.outBufL = null;
    this.outBufR = null;

    // WASM function references
    this.wasm = null;

    // Pending messages
    this.pendingMessages = [];

    this.port.onmessage = (event) => {
      this.handleMessage(event.data);
    };
  }

  async handleMessage(data) {
    switch (data.type) {
      case 'init':
        await this.initModule(data.sampleRate, data.wasmBinary, data.jsCode);
        break;

      case 'setParameter':
        if (!this.initialized || !this.handle) {
          this.pendingMessages.push(data);
          return;
        }
        this.setParameter(data.param, data.value);
        break;

      case 'dispose':
        this.cleanup();
        break;
    }
  }

  async initModule(sr, wasmBinary, jsCode) {
    try {
      this.cleanup();

      // Load JS module via Function constructor
      if (jsCode && !globalThis.createSpaceyDelayer) {
        if (typeof globalThis.URL === 'undefined') {
          globalThis.URL = class URL {
            constructor(path) { this.href = path; }
          };
        }

        const wrappedCode = jsCode + '\nreturn createSpaceyDelayer;';
        const factory = new Function(wrappedCode);
        const result = factory();

        if (typeof result === 'function') {
          globalThis.createSpaceyDelayer = result;
        } else {
          throw new Error('Failed to load JS module: got ' + typeof result);
        }
      }

      if (typeof globalThis.createSpaceyDelayer !== 'function') {
        throw new Error('createSpaceyDelayer factory not available');
      }

      const config = {};
      if (wasmBinary) {
        config.wasmBinary = wasmBinary;
      }

      this.module = await globalThis.createSpaceyDelayer(config);

      // Wrap exported functions
      this.wasm = {
        create: this.module._spacey_delayer_create,
        destroy: this.module._spacey_delayer_destroy,
        process: this.module._spacey_delayer_process,
        setFirstTap: this.module._spacey_delayer_set_first_tap,
        setTapSize: this.module._spacey_delayer_set_tap_size,
        setFeedback: this.module._spacey_delayer_set_feedback,
        setWetness: this.module._spacey_delayer_set_wetness,
        setMultiTap: this.module._spacey_delayer_set_multi_tap,
        setTapeFilter: this.module._spacey_delayer_set_tape_filter,
      };

      // Allocate I/O buffers in WASM memory (float = 4 bytes)
      this.inPtrL = this.module._malloc(this.bufferSize * 4);
      this.inPtrR = this.module._malloc(this.bufferSize * 4);
      this.outPtrL = this.module._malloc(this.bufferSize * 4);
      this.outPtrR = this.module._malloc(this.bufferSize * 4);

      // Check for allocation failure
      if (!this.inPtrL || !this.inPtrR || !this.outPtrL || !this.outPtrR) {
        throw new Error('WASM malloc failed: out of memory');
      }

      // Create delay instance
      this.handle = this.wasm.create(sr || sampleRate);

      this.updateBufferViews();
      this.initialized = true;
      this.port.postMessage({ type: 'ready' });

      // Process pending messages
      const pending = this.pendingMessages;
      this.pendingMessages = [];
      for (const msg of pending) {
        this.handleMessage(msg);
      }
    } catch (error) {
      console.error('[SpaceyDelayer Worklet] Init error:', error);
      this.port.postMessage({ type: 'error', message: error.message });
    }
  }

  setParameter(param, value) {
    if (!this.handle || !this.wasm) return;

    switch (param) {
      case 'firstTap':
        this.wasm.setFirstTap(this.handle, value);
        break;
      case 'tapSize':
        this.wasm.setTapSize(this.handle, value);
        break;
      case 'feedback':
        this.wasm.setFeedback(this.handle, value);
        break;
      case 'wetness':
        this.wasm.setWetness(this.handle, value);
        break;
      case 'multiTap':
        this.wasm.setMultiTap(this.handle, value ? 1 : 0);
        break;
      case 'tapeFilter':
        this.wasm.setTapeFilter(this.handle, value ? 1 : 0);
        break;
    }
  }

  updateBufferViews() {
    if (!this.module || !this.inPtrL) return;

    const heapF32 = this.module.HEAPF32;
    if (!heapF32) return;

    if (this.lastHeapBuffer !== heapF32.buffer) {
      this.inBufL = new Float32Array(heapF32.buffer, this.inPtrL, this.bufferSize);
      this.inBufR = new Float32Array(heapF32.buffer, this.inPtrR, this.bufferSize);
      this.outBufL = new Float32Array(heapF32.buffer, this.outPtrL, this.bufferSize);
      this.outBufR = new Float32Array(heapF32.buffer, this.outPtrR, this.bufferSize);
      this.lastHeapBuffer = heapF32.buffer;
    }
  }

  cleanup() {
    if (this.module) {
      if (this.handle && this.wasm) {
        this.wasm.destroy(this.handle);
        this.handle = 0;
      }
      const free = this.module._free;
      if (free) {
        if (this.inPtrL) free(this.inPtrL);
        if (this.inPtrR) free(this.inPtrR);
        if (this.outPtrL) free(this.outPtrL);
        if (this.outPtrR) free(this.outPtrR);
      }
    }

    this.inPtrL = 0;
    this.inPtrR = 0;
    this.outPtrL = 0;
    this.outPtrR = 0;
    this.inBufL = null;
    this.inBufR = null;
    this.outBufL = null;
    this.outBufR = null;
    this.wasm = null;
    this.module = null;
    this.initialized = false;
    this.lastHeapBuffer = null;
    this.handle = 0;
  }

  process(inputs, outputs, parameters) {
    if (!this.initialized || !this.handle || !this.wasm) {
      // Pass-through when not ready
      const input = inputs[0];
      const output = outputs[0];
      if (input && output) {
        for (let ch = 0; ch < output.length; ch++) {
          if (input[ch]) {
            output[ch].set(input[ch]);
          }
        }
      }
      return true;
    }

    const input = inputs[0];
    const output = outputs[0];
    if (!input || !output || input.length === 0 || output.length === 0) {
      return true;
    }

    const inputL = input[0];
    const inputR = input[1] || input[0];
    const outputL = output[0];
    const outputR = output[1] || output[0];
    const numSamples = Math.min(inputL.length, this.bufferSize);

    // Check for WASM memory growth
    this.updateBufferViews();

    if (!this.inBufL || !this.outBufL) {
      return true;
    }

    // Copy input to WASM memory
    this.inBufL.set(inputL.subarray(0, numSamples));
    this.inBufR.set(inputR.subarray(0, numSamples));

    // Process through WASM
    this.wasm.process(this.handle, this.inPtrL, this.inPtrR,
                      this.outPtrL, this.outPtrR, numSamples);

    // Copy output from WASM memory
    outputL.set(this.outBufL.subarray(0, numSamples));
    outputR.set(this.outBufR.subarray(0, numSamples));

    return true;
  }
}

registerProcessor('spacey-delayer-processor', SpaceyDelayerProcessor);
