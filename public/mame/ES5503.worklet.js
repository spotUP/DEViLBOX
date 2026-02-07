/**
 * ES5503 AudioWorklet Processor
 * Ensoniq DOC 32-voice Wavetable Synthesizer for DEViLBOX
 *
 * This processor loads the ES5503 WASM module and runs the
 * synthesis engine in the audio thread for low-latency output.
 */

class ES5503Processor extends AudioWorkletProcessor {
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
      // Convenience setters
      case 'setWaveform':
        if (this.synth) this.synth.setWaveform(data.value);
        break;
      case 'setWaveSize':
        if (this.synth) this.synth.setWaveSize(data.value);
        break;
      case 'setResolution':
        if (this.synth) this.synth.setResolution(data.value);
        break;
      case 'setAttackTime':
        if (this.synth) this.synth.setAttackTime(data.value);
        break;
      case 'setReleaseTime':
        if (this.synth) this.synth.setReleaseTime(data.value);
        break;
      case 'setAmplitude':
        if (this.synth) this.synth.setAmplitude(data.value);
        break;
      case 'setNumOscillators':
        if (this.synth) this.synth.setNumOscillators(data.value);
        break;
      // Register-level access
      case 'writeRegister':
        if (this.synth) this.synth.writeRegister(data.offset, data.value);
        break;
      // Wave data loading
      case 'loadWaveData':
        if (this.synth && this.module && data.waveData) {
          if (!this.module.wasmMemory) {
            console.error("[Worklet] WASM memory not available");
            break;
          }
          const bytes = new Uint8Array(data.waveData);
          const ptr = this.module._malloc(bytes.length);
          const heap = new Uint8Array(this.module.wasmMemory.buffer);
          heap.set(bytes, ptr);
          this.synth.loadWaveData(ptr, data.offset || 0, bytes.length);
          this.module._free(ptr);
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

      this.module = await globalThis.initMAMEWasmModule(data.wasmBinary, data.jsCode, 'createES5503Module');

      this.synth = new this.module.ES5503Synth();
      this.synth.initialize(data.sampleRate);

      this.outputPtrL = this.module._malloc(this.bufferSize * 4);
      this.outputPtrR = this.module._malloc(this.bufferSize * 4);

      this.updateBufferViews();

      this.initialized = true;
      this.port.postMessage({ type: 'ready' });
    } catch (error) {
      console.error('ES5503 init error:', error);
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

    for (let i = 0; i < numSamples; i++) {
      outputL[i] = this.outputBufferL[i];
      outputR[i] = this.outputBufferR[i];
    }

    // Capture oscilloscope data
    OscilloscopeMixin.capture(this, outputL);

    return true;
  }
}

registerProcessor('es5503-processor', ES5503Processor);
