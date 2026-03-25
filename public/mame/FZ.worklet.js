// Inline init function (self-contained worklet support)
if (!globalThis.initMAMEWasmModule) {
  globalThis.initMAMEWasmModule = async function(wasmBinary, jsCode, factoryName) {
    if (!wasmBinary || !jsCode) throw new Error('Missing wasmBinary or jsCode');
    if (typeof URL === 'undefined') globalThis.URL = class URL { constructor() { this.href = ''; } };
    const processedCode = jsCode.replace(/import\.meta\.url/g, '""').replace(/export\s+default\s+\w+;?/g, '');
    let createModule;
    try {
      const wrappedCode = `${processedCode}; return typeof ${factoryName} !== 'undefined' ? ${factoryName} : (typeof Module !== 'undefined' ? Module : null);`;
      createModule = new Function(wrappedCode)();
    } catch (e) { throw new Error(`Could not evaluate ${factoryName}: ${e.message}`); }
    if (!createModule) throw new Error(`Could not find factory function ${factoryName}`);
    let capturedMemory = null;
    const origInstantiate = WebAssembly.instantiate;
    WebAssembly.instantiate = async function(...args) {
      const result = await origInstantiate.apply(this, args);
      const inst = result.instance || result;
      if (inst.exports) for (const v of Object.values(inst.exports)) if (v instanceof WebAssembly.Memory) { capturedMemory = v; break; }
      return result;
    };
    let Module;
    try { Module = await createModule({ wasmBinary }); } finally { WebAssembly.instantiate = origInstantiate; }
    if (capturedMemory && !Module.wasmMemory) Module.wasmMemory = capturedMemory;
    return Module;
  };
}
// Inline OscilloscopeMixin if not present
if (!globalThis.OscilloscopeMixin) {
  globalThis.OscilloscopeMixin = {
    OSC_BUFFER_SIZE: 256, OSC_SEND_INTERVAL: 3,
    init(p) { p.oscEnabled = false; p.oscBuffer = new Float32Array(256); p.oscFrameCount = 0; },
    capture(p, buf) {
      if (!p.oscEnabled) return;
      if (++p.oscFrameCount < 3) return;
      p.oscFrameCount = 0;
      const len = Math.min(buf.length, 256);
      for (let i = 0; i < len; i++) p.oscBuffer[i] = buf[i];
      for (let i = len; i < 256; i++) p.oscBuffer[i] = 0;
      const copy = p.oscBuffer.slice().buffer;
      p.port.postMessage({ type: 'oscData', buffer: copy }, [copy]);
    }
  };
}

/**
 * Casio FZ Series PCM AudioWorklet Processor
 *
 * 8-voice 16-bit PCM playback with fractional pitch stepping,
 * loop modes, and reverse playback. Extracted from MAME's fz_pcm.
 */

class FZProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.synth = null;
    this.module = null;
    this.outputPtrL = 0;
    this.outputPtrR = 0;
    this.outputBufferL = null;
    this.outputBufferR = null;
    this.initialized = false;
    this.bufferSize = 128;
    this.lastHeapBuffer = null;

    this.port.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    OscilloscopeMixin.init(this);
  }

  async handleMessage(data) {
    switch (data.type) {
      case 'enableOsc':
        this.oscEnabled = data.enabled;
        break;
      case 'init':
        await this.initSynth(data);
        break;
      case 'noteOn':
        if (this.synth) this.synth.noteOn(data.note, data.velocity);
        break;
      case 'noteOff':
        if (this.synth) this.synth.noteOff(data.note);
        break;
      case 'allNotesOff':
        if (this.synth) this.synth.allNotesOff();
        break;
      case 'setParameter':
        if (this.synth) this.synth.setParameter(data.paramId, data.value);
        break;
      case 'controlChange':
        if (this.synth) this.synth.controlChange(data.cc, data.value);
        break;
      case 'pitchBend':
        if (this.synth) this.synth.pitchBend(data.value);
        break;
      case 'programChange':
        if (this.synth) this.synth.programChange(data.program);
        break;
      case 'writeRegister':
        if (this.synth) this.synth.writeRegister(data.offset, data.value);
        break;
      case 'loadSample':
        if (this.synth && this.module && data.data) {
          if (!this.module.wasmMemory) {
            console.error('[FZ Worklet] WASM memory not available');
            break;
          }
          const bytes = new Uint8Array(data.data);
          const ptr = this.module._malloc(bytes.length);
          const heap = new Uint8Array(this.module.wasmMemory.buffer);
          heap.set(bytes, ptr);
          if (data.voice !== undefined && data.voice >= 0) {
            this.synth.loadSample(data.voice, ptr, bytes.length);
          } else {
            this.synth.loadSampleAll(ptr, bytes.length);
          }
          this.module._free(ptr);
        }
        break;
      case 'loadROM':
        if (this.synth && this.module && data.data) {
          if (!this.module.wasmMemory) break;
          const romBytes = new Uint8Array(data.data);
          const romPtr = this.module._malloc(romBytes.length);
          const romHeap = new Uint8Array(this.module.wasmMemory.buffer);
          romHeap.set(romBytes, romPtr);
          this.synth.loadROM(romPtr, romBytes.length);
          // Don't free — ROM stays in WASM memory
        }
        break;
      case 'dispose':
        this.cleanup();
        break;
      case 'getVoiceStatus':
        if (this.synth && this.module) {
          const statusPtr = this.module._malloc(8 * 4 * 4); // 8 voices × 4 ints × 4 bytes
          this.synth.getVoiceStatus(statusPtr, 8);
          const heap = new Int32Array(this.module.wasmMemory.buffer, statusPtr, 32);
          const status = new Int32Array(heap);
          this.module._free(statusPtr);
          this.port.postMessage({ type: 'voiceStatus', data: status.buffer }, [status.buffer]);
        }
        break;
    }
  }

  async initSynth(data) {
    try {
      this.cleanup();
      this.module = await globalThis.initMAMEWasmModule(data.wasmBinary, data.jsCode, 'createFZModule');
      this.synth = new this.module.FZSynth();
      this.synth.setSampleRate(data.sampleRate);

      this.outputPtrL = this.module._malloc(this.bufferSize * 4);
      this.outputPtrR = this.module._malloc(this.bufferSize * 4);
      this.updateBufferViews();

      this.initialized = true;
      this.port.postMessage({ type: 'ready' });
    } catch (error) {
      console.error('[FZ Worklet] init error:', error);
      this.port.postMessage({ type: 'error', message: error.message });
    }
  }

  updateBufferViews() {
    if (!this.module || !this.outputPtrL) return;
    const mem = this.module.wasmMemory || (this.module.HEAPF32 ? { buffer: this.module.HEAPF32.buffer } : null);
    if (!mem) return;
    if (this.lastHeapBuffer !== mem.buffer) {
      this.outputBufferL = new Float32Array(mem.buffer, this.outputPtrL, this.bufferSize);
      this.outputBufferR = new Float32Array(mem.buffer, this.outputPtrR, this.bufferSize);
      this.lastHeapBuffer = mem.buffer;
    }
  }

  cleanup() {
    if (this.module && this.outputPtrL) { this.module._free(this.outputPtrL); this.outputPtrL = 0; }
    if (this.module && this.outputPtrR) { this.module._free(this.outputPtrR); this.outputPtrR = 0; }
    this.outputBufferL = null;
    this.outputBufferR = null;
    this.synth = null;
    this.initialized = false;
    this.lastHeapBuffer = null;
  }

  process(inputs, outputs, parameters) {
    if (!this.initialized || !this.synth) return true;
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const outputL = output[0];
    const outputR = output[1] || output[0];
    const numSamples = Math.min(outputL.length, this.bufferSize);

    this.updateBufferViews();
    if (!this.outputBufferL || !this.outputBufferR) return true;

    this.synth.process(this.outputPtrL, this.outputPtrR, numSamples);

    // Copy and check for heap migration
    try {
      outputL.set(this.outputBufferL.subarray(0, numSamples));
      outputR.set(this.outputBufferR.subarray(0, numSamples));
    } catch (e) {
      // Heap grew — rebuild views
      this.lastHeapBuffer = null;
      this.updateBufferViews();
      if (this.outputBufferL && this.outputBufferR) {
        outputL.set(this.outputBufferL.subarray(0, numSamples));
        outputR.set(this.outputBufferR.subarray(0, numSamples));
      }
    }

    OscilloscopeMixin.capture(this, outputL);
    return true;
  }
}

registerProcessor('fz-processor', FZProcessor);
