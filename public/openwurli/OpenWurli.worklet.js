/**
 * OpenWurli AudioWorklet Processor
 *
 * Loads the OpenWurli WASM module and processes audio in real-time.
 * Receives MIDI and parameter messages from the main thread.
 *
 * WASM JS code is passed as a string from the main thread and executed
 * via Function constructor (AudioWorklets don't support dynamic import).
 */

class OpenWurliProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ready = false;
    this.module = null;
    this.outPtrL = 0;
    this.outPtrR = 0;
    this.blockSize = 128;

    this.port.onmessage = (e) => this.handleMessage(e.data);
  }

  async handleMessage(msg) {
    switch (msg.type) {
      case 'init':
        await this.initWasm(msg.sampleRate, msg.wasmBinary, msg.jsCode);
        break;
      case 'noteOn':
        if (this.ready) this.module._owNoteOn(msg.note, msg.velocity);
        break;
      case 'noteOff':
        if (this.ready) this.module._owNoteOff(msg.note);
        break;
      case 'sustainPedal':
        if (this.ready) this.module._owSustainPedal(msg.value ? 1 : 0);
        break;
      case 'allNotesOff':
        if (this.ready) this.module._owAllNotesOff();
        break;
      case 'setParam':
        if (this.ready) this.module._owSetParam(msg.paramId, msg.value);
        break;
      case 'getParam':
        if (this.ready) {
          const val = this.module._owGetParam(msg.paramId);
          this.port.postMessage({ type: 'paramValue', paramId: msg.paramId, value: val });
        }
        break;
      case 'destroy':
        if (this.ready) {
          this.module._owDestroy();
          this.ready = false;
        }
        break;
    }
  }

  async initWasm(sampleRate, wasmBinary, jsCode) {
    try {
      // Load JS module via Function constructor (dynamic import not allowed in worklets)
      if (jsCode && !globalThis.createOpenWurliModule) {
        // Polyfills for Emscripten in worklet scope
        if (typeof globalThis.document === 'undefined') {
          globalThis.document = {
            createElement: () => ({ relList: { supports: () => false }, tagName: 'DIV' }),
            getElementById: () => null, querySelector: () => null,
            querySelectorAll: () => [], getElementsByTagName: () => [],
            head: { appendChild: () => {} },
            addEventListener: () => {}, removeEventListener: () => {}
          };
        }
        if (typeof globalThis.window === 'undefined') {
          globalThis.window = {
            addEventListener: () => {}, removeEventListener: () => {},
            location: { href: '', pathname: '' }
          };
        }

        const wrappedCode = jsCode + '\nreturn createOpenWurliModule;';
        const factory = new Function(wrappedCode);
        const result = factory();

        if (typeof result === 'function') {
          globalThis.createOpenWurliModule = result;
        } else {
          this.port.postMessage({ type: 'error', message: 'Failed to load JS module' });
          return;
        }
      }

      if (typeof globalThis.createOpenWurliModule !== 'function') {
        this.port.postMessage({ type: 'error', message: 'createOpenWurliModule not found' });
        return;
      }

      // Intercept WebAssembly.instantiate to capture memory
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

      const config = {};
      if (wasmBinary) config.wasmBinary = wasmBinary;

      try {
        this.module = await globalThis.createOpenWurliModule(config);
      } finally {
        WebAssembly.instantiate = origInstantiate;
      }

      if (!this.module.wasmMemory && capturedMemory) {
        this.module.wasmMemory = capturedMemory;
      }

      // Initialize engine
      const result = this.module._owInit(sampleRate);
      if (result !== 0) {
        this.port.postMessage({ type: 'error', message: `owInit failed: ${result}` });
        return;
      }

      // Allocate output buffers in WASM memory
      this.blockSize = 128;
      this.outPtrL = this.module._malloc(this.blockSize * 4);
      this.outPtrR = this.module._malloc(this.blockSize * 4);

      this.ready = true;
      this.port.postMessage({ type: 'ready' });
    } catch (err) {
      this.port.postMessage({ type: 'error', message: `Init failed: ${err.message || err}` });
    }
  }

  process(inputs, outputs, parameters) {
    if (!this.ready || !this.module) {
      return true;
    }

    const output = outputs[0];
    if (!output || output.length < 2) return true;

    const outL = output[0];
    const outR = output[1];
    const numSamples = outL.length;

    // Process through WASM
    this.module._owProcess(this.outPtrL, this.outPtrR, numSamples);

    // Copy from WASM heap to output buffers
    const heap = this.module.HEAPF32 || new Float32Array(this.module.wasmMemory.buffer);
    const offL = this.outPtrL >> 2;
    const offR = this.outPtrR >> 2;

    outL.set(heap.subarray(offL, offL + numSamples));
    outR.set(heap.subarray(offR, offR + numSamples));

    return true;
  }
}

registerProcessor('openwurli-processor', OpenWurliProcessor);
