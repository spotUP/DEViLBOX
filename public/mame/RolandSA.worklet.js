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
 * Roland SA AudioWorklet Processor
 * Silicon-Accurate 16-Voice Sample Player for DEViLBOX
 *
 * Gate array emulation from Roland SA-synthesis digital pianos.
 * 16 voices x 10 parts = 160 concurrent sample parts.
 * 3 wave ROMs (IC5, IC6, IC7) - 128KB each = 384KB total.
 *
 * Used in: Roland HP-3000S, HP-2000, KR-33
 */

class RolandSAProcessor extends AudioWorkletProcessor {
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
      case 'setVolume':
        if (this.synth) this.synth.setVolume(data.value);
        break;
      case 'setMode':
        if (this.synth) this.synth.setMode(data.value);
        break;
      case 'loadROM':
        if (this.synth && this.module) {
          if (!this.module.wasmMemory) {
            console.error("[Worklet] WASM memory not available");
            break;
          }
          const romPtr = this.module._malloc(data.size);
          const heap = new Uint8Array(this.module.wasmMemory.buffer);
          const romView = new Uint8Array(heap.buffer, romPtr, data.size);
          romView.set(new Uint8Array(data.data));
          this.synth.loadROM(data.romId, romPtr, data.size);
          this.module._free(romPtr);
        }
        break;
      case 'dispose':
        this.cleanup();
        break;
    }
  }

  async initSynth(data) {
    try {
      this.cleanup();

      this.module = await globalThis.initMAMEWasmModule(data.wasmBinary, data.jsCode, 'createRolandSAModule');

      this.synth = new this.module.RolandSASynth();
      this.synth.initialize(data.sampleRate);

      this.outputPtrL = this.module._malloc(this.bufferSize * 4);
      this.outputPtrR = this.module._malloc(this.bufferSize * 4);

      this.updateBufferViews();

      this.initialized = true;
      this.port.postMessage({ type: 'ready' });
    } catch (error) {
      console.error('RolandSA init error:', error);
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
    if (this.synth) {
      this.synth.delete();
      this.synth = null;
    }
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

registerProcessor('rolandsa-processor', RolandSAProcessor);
