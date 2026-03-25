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
 * Fairlight CMI IIx AudioWorklet Processor
 *
 * 8-voice sampling synthesizer with SSM2045 cascaded lowpass filters,
 * hardware envelope generator, and 16KB wave RAM per voice.
 * DSP extracted 1:1 from MAME's cmi01a.cpp with PIA6821/PTM6840 behavioral models.
 */

class CMIProcessor extends AudioWorkletProcessor {
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
        if (this.synth) {
          console.log('[CMI Worklet] noteOn:', data.note, 'vel:', data.velocity);
          this.synth.noteOn(data.note, data.velocity);
        } else {
          console.warn('[CMI Worklet] noteOn ignored — synth not ready');
        }
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
            console.error('[CMI Worklet] WASM memory not available');
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
      case 'dispose':
        this.cleanup();
        break;
      case 'getVoiceStatus':
        if (this.synth && this.module) {
          const statusPtr = this.module._malloc(16 * 4 * 4); // 16 voices × 4 ints × 4 bytes
          this.synth.getVoiceStatus(statusPtr, 16);
          const heap = new Int32Array(this.module.wasmMemory.buffer, statusPtr, 64);
          const status = new Int32Array(heap); // copy before free
          this.module._free(statusPtr);
          this.port.postMessage({ type: 'voiceStatus', data: status.buffer }, [status.buffer]);
        }
        break;
    }
  }

  async initSynth(data) {
    try {
      this.cleanup();

      console.log('[CMI Worklet] initSynth: loading WASM module...');
      this.module = await globalThis.initMAMEWasmModule(data.wasmBinary, data.jsCode, 'createCMIModule');
      console.log('[CMI Worklet] Module loaded, has CMISynth:', typeof this.module.CMISynth);
      console.log('[CMI Worklet] Module wasmMemory:', !!this.module.wasmMemory, 'HEAPF32:', !!this.module.HEAPF32);

      this.synth = new this.module.CMISynth();
      this.synth.setSampleRate(data.sampleRate);
      console.log('[CMI Worklet] Synth created, sample rate:', data.sampleRate);

      this.outputPtrL = this.module._malloc(this.bufferSize * 4);
      this.outputPtrR = this.module._malloc(this.bufferSize * 4);
      console.log('[CMI Worklet] Output buffers allocated:', this.outputPtrL, this.outputPtrR);

      this.updateBufferViews();
      console.log('[CMI Worklet] Buffer views:', !!this.outputBufferL, !!this.outputBufferR);

      this.initialized = true;
      this.port.postMessage({ type: 'ready' });
      console.log('[CMI Worklet] ✓ Initialization complete');
    } catch (error) {
      console.error('[CMI Worklet] init error:', error);
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

    // One-time audio level diagnostic
    if (!this._audioCheckDone) {
      let maxL = 0;
      for (let i = 0; i < numSamples; i++) maxL = Math.max(maxL, Math.abs(this.outputBufferL[i]));
      if (maxL > 0) {
        console.log('[CMI Worklet] ✓ Audio output detected! Peak:', maxL.toFixed(4));
        this._audioCheckDone = true;
      }
    }

    for (let i = 0; i < numSamples; i++) {
      outputL[i] = this.outputBufferL[i];
      outputR[i] = this.outputBufferR[i];
    }

    OscilloscopeMixin.capture(this, outputL);

    return true;
  }
}

registerProcessor('cmi-processor', CMIProcessor);
