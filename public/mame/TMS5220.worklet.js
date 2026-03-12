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
 * TMS5220 AudioWorklet Processor
 * Texas Instruments LPC Speech Synthesizer (Speak & Spell) for DEViLBOX
 *
 * Supports two modes:
 * 1. ROM Speech: Load VSM ROM, speak words by byte address (MAME-accurate)
 * 2. MIDI: 4-voice polyphonic LPC synth with phoneme presets
 */

class TMS5220Processor extends AudioWorkletProcessor {
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
    this.romPtr = 0; // WASM pointer to ROM data
    this.frameBufferPtr = 0; // WASM pointer to frame buffer data

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
      case 'activateSpeechVoice':
        if (this.synth) this.synth.activateSpeechVoice();
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
      case 'setFormants':
        if (this.synth) this.synth.setFormants(data.k1, data.k2, data.k3);
        break;
      case 'setNoiseMode':
        if (this.synth) this.synth.setNoiseMode(data.value);
        break;
      case 'setLPCFrame':
        if (this.synth) {
          this.synth.setLPCFrame(
            data.energy, data.pitch, data.unvoiced ? 1 : 0,
            data.k[0], data.k[1], data.k[2], data.k[3], data.k[4],
            data.k[5], data.k[6], data.k[7], data.k[8], data.k[9]
          );
        }
        break;
      case 'setVolume':
        if (this.synth) this.synth.setVolume(data.value);
        break;
      case 'setChirpType':
        if (this.synth) this.synth.setChirpType(data.value);
        break;

      // === ROM Speech Commands ===
      case 'loadROM':
        this.loadROM(data.romData);
        break;
      case 'speakAtByte':
        if (this.synth) {
          console.log(`[TMS5220 Worklet] speakAtByte: addr=${data.byteAddr}`);
          this.synth.speakAtByte(data.byteAddr);
        }
        break;
      case 'stopSpeaking':
        if (this.synth) this.synth.stopSpeaking();
        break;

      // === Frame Buffer Commands (phoneme TTS through MAME engine) ===
      case 'loadFrameBuffer':
        this.loadFrameBuffer(data.frameData, data.numFrames);
        break;
      case 'speakFrameBuffer':
        if (this.synth) this.synth.speakFrameBuffer();
        break;

      case 'dispose':
        this.cleanup();
        break;
    }
  }

  loadROM(romData) {
    if (!this.module || !this.synth) {
      console.error('[TMS5220 Worklet] Cannot load ROM: synth not initialized');
      return;
    }

    // Free old ROM if any
    if (this.romPtr) {
      this.module._free(this.romPtr);
      this.romPtr = 0;
    }

    // Allocate WASM memory and copy ROM data
    const size = romData.byteLength;
    this.romPtr = this.module._malloc(size);
    if (!this.romPtr) {
      console.error('[TMS5220 Worklet] Failed to allocate WASM memory for ROM');
      return;
    }

    const romBytes = new Uint8Array(romData);
    const heapView = new Uint8Array(
      this.module.wasmMemory
        ? this.module.wasmMemory.buffer
        : this.module.HEAPU8.buffer
    );
    heapView.set(romBytes, this.romPtr);

    // Tell the synth about the ROM
    this.synth.loadROM(this.romPtr, size);
    console.log(`[TMS5220 Worklet] ROM loaded: ${size} bytes at WASM ptr ${this.romPtr}`);

    this.port.postMessage({ type: 'romLoaded', size });
  }

  loadFrameBuffer(frameData, numFrames) {
    if (!this.module || !this.synth) {
      console.error('[TMS5220 Worklet] Cannot load frame buffer: synth not initialized');
      return;
    }

    // Free old frame buffer if any
    if (this.frameBufferPtr) {
      this.module._free(this.frameBufferPtr);
      this.frameBufferPtr = 0;
    }

    // Allocate WASM memory and copy frame data (12 bytes per frame)
    const size = numFrames * 12;
    this.frameBufferPtr = this.module._malloc(size);
    if (!this.frameBufferPtr) {
      console.error('[TMS5220 Worklet] Failed to allocate WASM memory for frame buffer');
      return;
    }

    const bytes = new Uint8Array(frameData);
    const heapView = new Uint8Array(
      this.module.wasmMemory
        ? this.module.wasmMemory.buffer
        : this.module.HEAPU8.buffer
    );
    heapView.set(bytes, this.frameBufferPtr);

    // Tell the synth about the frame buffer
    this.synth.loadFrameBuffer(this.frameBufferPtr, numFrames);
  }

  async initSynth(data) {
    try {
      this.cleanup();

      this.module = await globalThis.initMAMEWasmModule(data.wasmBinary, data.jsCode, 'createTMS5220Module');

      this.synth = new this.module.TMS5220Synth();
      this.synth.initialize(data.sampleRate);

      this.outputPtrL = this.module._malloc(this.bufferSize * 4);
      this.outputPtrR = this.module._malloc(this.bufferSize * 4);

      this.updateBufferViews();

      this.initialized = true;
      this.port.postMessage({ type: 'ready' });
    } catch (error) {
      console.error('TMS5220 init error:', error);
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
    if (this.module && this.frameBufferPtr) {
      this.module._free(this.frameBufferPtr);
      this.frameBufferPtr = 0;
    }
    if (this.module && this.romPtr) {
      this.module._free(this.romPtr);
      this.romPtr = 0;
    }
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

registerProcessor('tms5220-processor', TMS5220Processor);
