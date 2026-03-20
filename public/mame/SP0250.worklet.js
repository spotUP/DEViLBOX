// Inline init function (self-contained worklet support)
if (!globalThis.initMAMEWasmModule) {
  globalThis.initMAMEWasmModule = async function(wasmBinary, jsCode, factoryName) {
    if (!wasmBinary || !jsCode) throw new Error('Missing wasmBinary or jsCode');
    // Provide URL polyfill if not available (worklet scope)
    if (typeof URL === 'undefined') globalThis.URL = class URL { constructor() { this.href = ''; } };
    // Replace import.meta.url and strip ES module exports (not usable in new Function())
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
 * SP0250 AudioWorklet Processor
 * GI SP0250 Digital LPC Sound Synthesizer for DEViLBOX
 *
 * 4-voice polyphonic LPC vocal synth based on the GI SP0250.
 * 6-stage lattice filters with 128-entry coefficient ROM.
 * Based on MAME emulator by Olivier Galibert.
 */

class SP0250Processor extends AudioWorkletProcessor {
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
    this.frameBufferPtr = 0;

    this.port.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    // Initialize oscilloscope support
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
      case 'writeFIFO':
        if (this.synth) this.synth.writeFIFO(data.index, data.data);
        break;
      case 'setFilterCoeff':
        if (this.synth) this.synth.setFilterCoeff(data.filterIdx, data.isB ? 1 : 0, data.value);
        break;
      case 'writeRegister':
        if (this.synth) this.synth.writeRegister(data.offset, data.value);
        break;
      // Convenience setters
      case 'setVolume':
        if (this.synth) this.synth.setVolume(data.value);
        break;
      case 'setVowel':
        if (this.synth) this.synth.setVowel(data.value);
        break;
      // === Frame Buffer Speech Commands ===
      case 'loadFrameBuffer':
        this.loadFrameBuffer(data.frameData, data.numFrames);
        break;
      case 'speakFrameBuffer':
        if (this.synth) this.synth.speakFrameBuffer();
        break;
      case 'stopSpeaking':
        if (this.synth) this.synth.stopSpeaking();
        break;
      case 'dispose':
        this.cleanup();
        break;
    }
  }

  loadFrameBuffer(frameData, numFrames) {
    if (!this.module || !this.synth) return;
    if (this.frameBufferPtr) { this.module._free(this.frameBufferPtr); this.frameBufferPtr = 0; }
    const size = numFrames * 15;
    this.frameBufferPtr = this.module._malloc(size);
    if (!this.frameBufferPtr) return;
    const bytes = new Uint8Array(frameData);
    const heapView = new Uint8Array(this.module.wasmMemory ? this.module.wasmMemory.buffer : this.module.HEAPU8.buffer);
    heapView.set(bytes, this.frameBufferPtr);
    this.synth.loadFrameBuffer(this.frameBufferPtr, numFrames);
  }

  async initSynth(data) {
    try {
      this.cleanup();

      this.module = await globalThis.initMAMEWasmModule(data.wasmBinary, data.jsCode, 'createSP0250Module');

      this.synth = new this.module.SP0250Synth();
      this.synth.initialize(data.sampleRate);

      this.outputPtrL = this.module._malloc(this.bufferSize * 4);
      this.outputPtrR = this.module._malloc(this.bufferSize * 4);

      this.updateBufferViews();

      this.initialized = true;
      this.port.postMessage({ type: 'ready' });
    } catch (error) {
      console.error('SP0250 init error:', error);
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
    if (this.module && this.frameBufferPtr) { this.module._free(this.frameBufferPtr); this.frameBufferPtr = 0; }
    if (this.module && this.outputPtrL) {
      this.module._free(this.outputPtrL);
      this.outputPtrL = 0;
    }
    if (this.module && this.outputPtrR) {
      this.module._free(this.outputPtrR);
      this.outputPtrR = 0;
    }
    this.outputBufferL = null;
    this.outputBufferR = null;
    this.synth = null;
    this.initialized = false;
    this.lastHeapBuffer = null;
  }

  process(inputs, outputs, parameters) {
    if (!this.initialized || !this.synth) {
      return true;
    }

    const output = outputs[0];
    if (!output || output.length === 0) {
      return true;
    }

    const outputL = output[0];
    const outputR = output[1] || output[0];
    const numSamples = Math.min(outputL.length, this.bufferSize);

    this.updateBufferViews();

    if (!this.outputBufferL || !this.outputBufferR) {
      return true;
    }

    this.synth.process(this.outputPtrL, this.outputPtrR, numSamples);

    for (let i = 0; i < numSamples; i++) {
      outputL[i] = this.outputBufferL[i];
      outputR[i] = this.outputBufferR[i];
    }

    // Capture oscilloscope data
    OscilloscopeMixin.capture(this, outputL);

    return true;
  }
}

registerProcessor('sp0250-processor', SP0250Processor);
