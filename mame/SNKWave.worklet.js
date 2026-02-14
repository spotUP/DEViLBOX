/**
 * SNKWave AudioWorklet Processor
 * SNK Wave Programmable Waveform Generator for DEViLBOX
 *
 * 8-voice polyphonic wavetable synth based on the SNK arcade wave
 * generator. 16-sample ping-pong waveforms with 3-bit resolution.
 * Based on MAME emulator by Nicola Salmoria.
 */

class SNKWaveProcessor extends AudioWorkletProcessor {
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
      case 'writeRegister':
        if (this.synth) this.synth.writeRegister(data.offset, data.value);
        break;
      case 'setCustomWaveform':
        if (this.synth) this.synth.setCustomWaveform(data.b0, data.b1, data.b2, data.b3);
        break;
      // Convenience setters
      case 'setVolume':
        if (this.synth) this.synth.setVolume(data.value);
        break;
      case 'setWaveform':
        if (this.synth) this.synth.setWaveform(data.value);
        break;
      case 'dispose':
        this.cleanup();
        break;
    }
  }

  async initSynth(data) {
    try {
      this.cleanup();

      this.module = await globalThis.initMAMEWasmModule(data.wasmBinary, data.jsCode, 'createSNKWaveModule');

      this.synth = new this.module.SNKWaveSynth();
      this.synth.initialize(data.sampleRate);

      this.outputPtrL = this.module._malloc(this.bufferSize * 4);
      this.outputPtrR = this.module._malloc(this.bufferSize * 4);

      this.updateBufferViews();

      this.initialized = true;
      this.port.postMessage({ type: 'ready' });
    } catch (error) {
      console.error('SNKWave init error:', error);
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

registerProcessor('snkwave-processor', SNKWaveProcessor);
