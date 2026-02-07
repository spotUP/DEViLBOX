/**
 * SN76477 AudioWorklet Processor
 * TI Complex Sound Generator (Space Invaders chip) for DEViLBOX
 *
 * This processor loads the SN76477 WASM module and runs the
 * synthesis engine in the audio thread for low-latency output.
 */

class SN76477Processor extends AudioWorkletProcessor {
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
        if (this.synth) {
          this.synth.noteOn(data.note, data.velocity);
        }
        break;
      case 'noteOff':
        if (this.synth) {
          this.synth.noteOff(data.note);
        }
        break;
      case 'allNotesOff':
        if (this.synth) {
          this.synth.allNotesOff();
        }
        break;
      case 'setParameter':
        if (this.synth) {
          this.synth.setParameter(data.paramId, data.value);
        }
        break;
      case 'controlChange':
        if (this.synth) {
          this.synth.controlChange(data.cc, data.value);
        }
        break;
      case 'pitchBend':
        if (this.synth) {
          this.synth.pitchBend(data.value);
        }
        break;
      case 'programChange':
        if (this.synth) {
          this.synth.programChange(data.program);
        }
        break;
      // Direct convenience setters
      case 'setVCOFreq':
        if (this.synth) this.synth.setVCOFreq(data.value);
        break;
      case 'setSLFFreq':
        if (this.synth) this.synth.setSLFFreq(data.value);
        break;
      case 'setNoiseFreq':
        if (this.synth) this.synth.setNoiseFreq(data.value);
        break;
      case 'setVCODutyCycle':
        if (this.synth) this.synth.setVCODutyCycle(data.value);
        break;
      case 'setMixerMode':
        if (this.synth) this.synth.setMixerModeValue(data.value);
        break;
      case 'setEnvelopeMode':
        if (this.synth) this.synth.setEnvelopeModeValue(data.value);
        break;
      case 'setAttackTime':
        if (this.synth) this.synth.setAttackTime(data.value);
        break;
      case 'setDecayTime':
        if (this.synth) this.synth.setDecayTime(data.value);
        break;
      case 'setOneShotTime':
        if (this.synth) this.synth.setOneShotTime(data.value);
        break;
      case 'setNoiseFilterFreq':
        if (this.synth) this.synth.setNoiseFilterFreq(data.value);
        break;
      case 'setAmplitude':
        if (this.synth) this.synth.setAmplitude(data.value);
        break;
      case 'setVCOMode':
        if (this.synth) this.synth.setVCOMode(data.value);
        break;
      case 'setEnable':
        if (this.synth) this.synth.setEnable(data.value);
        break;
      // Raw analog setters
      case 'setVCORes':
        if (this.synth) this.synth.setVCORes(data.value);
        break;
      case 'setVCOCap':
        if (this.synth) this.synth.setVCOCap(data.value);
        break;
      case 'setVCOVoltage':
        if (this.synth) this.synth.setVCOVoltage(data.value);
        break;
      case 'setPitchVoltage':
        if (this.synth) this.synth.setPitchVoltage(data.value);
        break;
      case 'dispose':
        this.cleanup();
        break;
    }
  }

  async initSynth(data) {
    try {
      this.cleanup();

      this.module = await globalThis.initMAMEWasmModule(data.wasmBinary, data.jsCode, 'createSN76477Module');

      // Create synth instance
      this.synth = new this.module.SN76477Synth();
      this.synth.initialize(data.sampleRate);

      // Allocate output buffers in WASM memory
      this.outputPtrL = this.module._malloc(this.bufferSize * 4);
      this.outputPtrR = this.module._malloc(this.bufferSize * 4);

      this.updateBufferViews();

      this.initialized = true;
      this.port.postMessage({ type: 'ready' });
    } catch (error) {
      console.error('SN76477 init error:', error);
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

registerProcessor('sn76477-processor', SN76477Processor);
