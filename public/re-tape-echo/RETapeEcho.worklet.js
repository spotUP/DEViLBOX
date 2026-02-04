/**
 * RE-Tape-Echo AudioWorklet Processor
 * Roland RE-150/201 tape echo effect backed by WASM DSP engine.
 * Stereo in/out effect processing.
 */

class RETapeEchoProcessor extends AudioWorkletProcessor {
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
      if (jsCode && !globalThis.createRETapeEcho) {
        if (typeof globalThis.URL === 'undefined') {
          globalThis.URL = class URL {
            constructor(path) { this.href = path; }
          };
        }

        const wrappedCode = jsCode + '\nreturn createRETapeEcho;';
        const factory = new Function(wrappedCode);
        const result = factory();

        if (typeof result === 'function') {
          globalThis.createRETapeEcho = result;
        } else {
          throw new Error('Failed to load JS module: got ' + typeof result);
        }
      }

      if (typeof globalThis.createRETapeEcho !== 'function') {
        throw new Error('createRETapeEcho factory not available');
      }

      const config = {};
      if (wasmBinary) {
        config.wasmBinary = wasmBinary;
      }

      this.module = await globalThis.createRETapeEcho(config);

      // Wrap exported functions
      this.wasm = {
        create: this.module._re_tape_echo_create,
        destroy: this.module._re_tape_echo_destroy,
        process: this.module._re_tape_echo_process,
        setMode: this.module._re_tape_echo_set_mode,
        setRepeatRate: this.module._re_tape_echo_set_repeat_rate,
        setIntensity: this.module._re_tape_echo_set_intensity,
        setEchoVolume: this.module._re_tape_echo_set_echo_volume,
        setWow: this.module._re_tape_echo_set_wow,
        setFlutter: this.module._re_tape_echo_set_flutter,
        setDirt: this.module._re_tape_echo_set_dirt,
        setInputBleed: this.module._re_tape_echo_set_input_bleed,
        setLoopAmount: this.module._re_tape_echo_set_loop_amount,
        setPlayheadFilter: this.module._re_tape_echo_set_playhead_filter,
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

      // Create instance
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
      console.error('[RETapeEcho Worklet] Init error:', error);
      this.port.postMessage({ type: 'error', message: error.message });
    }
  }

  setParameter(param, value) {
    if (!this.handle || !this.wasm) return;

    switch (param) {
      case 'mode':
        this.wasm.setMode(this.handle, value | 0);
        break;
      case 'repeatRate':
        this.wasm.setRepeatRate(this.handle, value);
        break;
      case 'intensity':
        this.wasm.setIntensity(this.handle, value);
        break;
      case 'echoVolume':
        this.wasm.setEchoVolume(this.handle, value);
        break;
      case 'wow':
        this.wasm.setWow(this.handle, value);
        break;
      case 'flutter':
        this.wasm.setFlutter(this.handle, value);
        break;
      case 'dirt':
        this.wasm.setDirt(this.handle, value);
        break;
      case 'inputBleed':
        this.wasm.setInputBleed(this.handle, value ? 1 : 0);
        break;
      case 'loopAmount':
        this.wasm.setLoopAmount(this.handle, value);
        break;
      case 'playheadFilter':
        this.wasm.setPlayheadFilter(this.handle, value ? 1 : 0);
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
      const input = inputs[0];
      const output = outputs[0];
      if (input && output) {
        for (let ch = 0; ch < output.length; ch++) {
          if (input[ch]) output[ch].set(input[ch]);
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

    this.updateBufferViews();

    if (!this.inBufL || !this.outBufL) {
      return true;
    }

    this.inBufL.set(inputL.subarray(0, numSamples));
    this.inBufR.set(inputR.subarray(0, numSamples));

    this.wasm.process(this.handle, this.inPtrL, this.inPtrR,
                      this.outPtrL, this.outPtrR, numSamples);

    outputL.set(this.outBufL.subarray(0, numSamples));
    outputR.set(this.outBufR.subarray(0, numSamples));

    return true;
  }
}

registerProcessor('re-tape-echo-processor', RETapeEchoProcessor);
