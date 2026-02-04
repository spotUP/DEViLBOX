/**
 * SP0250 AudioWorklet Processor
 * GI SP0250 Digital LPC Sound Synthesizer for DEViLBOX
 *
 * 4-voice polyphonic LPC vocal synth based on the GI SP0250.
 * 6-stage lattice filters with 128-entry coefficient ROM.
 * Based on MAME emulator by Olivier Galibert.
 */

const BASE_URL = globalThis.BASE_URL || '/';

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

    this.port.onmessage = (event) => {
      this.handleMessage(event.data);
    };
  }

  async handleMessage(data) {
    switch (data.type) {
      case 'init':
        await this.initSynth(data.sampleRate);
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
      case 'dispose':
        this.cleanup();
        break;
    }
  }

  async initSynth(sampleRate) {
    try {
      this.cleanup();

      const moduleFactory = await import(`${BASE_URL}mame/SP0250.js`);
      this.module = await moduleFactory.default();

      this.synth = new this.module.SP0250Synth();
      this.synth.initialize(sampleRate);

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

    if (this.lastHeapBuffer !== this.module.HEAPF32.buffer) {
      this.outputBufferL = new Float32Array(
        this.module.HEAPF32.buffer,
        this.outputPtrL,
        this.bufferSize
      );
      this.outputBufferR = new Float32Array(
        this.module.HEAPF32.buffer,
        this.outputPtrR,
        this.bufferSize
      );
      this.lastHeapBuffer = this.module.HEAPF32.buffer;
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

    return true;
  }
}

registerProcessor('sp0250-processor', SP0250Processor);
