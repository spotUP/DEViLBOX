/**
 * K054539 AudioWorklet Processor
 * Konami PCM/ADPCM Sound Chip for DEViLBOX
 */

class K054539Processor extends AudioWorkletProcessor {
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
        if (this.synth) {
          this.synth.noteOn(data.note, data.velocity);
        }
        break;
      case 'noteOff':
        if (this.synth) {
          this.synth.noteOff(data.note);
        }
        break;
      case 'keyOn':
        if (this.synth) {
          this.synth.keyOn(data.channel);
        }
        break;
      case 'keyOff':
        if (this.synth) {
          this.synth.keyOff(data.channel);
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
      case 'loadROM':
        if (this.synth && this.module) {
          // Allocate memory for ROM data
          const romPtr = this.module._malloc(data.size);
          const romView = new Uint8Array(this.module.HEAPU8.buffer, romPtr, data.size);
          romView.set(new Uint8Array(data.data));
          this.synth.loadROM(data.offset, romPtr, data.size);
          this.module._free(romPtr);
        }
        break;
      case 'configureChannel':
        if (this.synth) {
          this.synth.configureChannel(
            data.channel,
            data.startAddr,
            data.loopAddr,
            data.sampleType,
            data.loopEnable,
            data.reverse
          );
        }
        break;
      case 'setChannelPitch':
        if (this.synth) {
          this.synth.setChannelPitch(data.channel, data.delta);
        }
        break;
      case 'setChannelVolume':
        if (this.synth) {
          this.synth.setChannelVolume(data.channel, data.volume);
        }
        break;
      case 'setChannelPan':
        if (this.synth) {
          this.synth.setChannelPan(data.channel, data.pan);
        }
        break;
      case 'setChannelGain':
        if (this.synth) {
          this.synth.setChannelGain(data.channel, data.gain);
        }
        break;
      case 'dispose':
        this.cleanup();
        break;
    }
  }

  async initSynth(sampleRate) {
    try {
      this.cleanup();

      // Import the WASM module
      const moduleFactory = await import('./K054539.js');
      this.module = await moduleFactory.default();

      // Create synth instance
      this.synth = new this.module.K054539Synth();
      this.synth.initialize(sampleRate);

      // Allocate output buffers in WASM memory
      this.outputPtrL = this.module._malloc(this.bufferSize * 4);
      this.outputPtrR = this.module._malloc(this.bufferSize * 4);

      this.updateBufferViews();

      this.initialized = true;
      this.port.postMessage({ type: 'ready' });
    } catch (error) {
      console.error('K054539 init error:', error);
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

registerProcessor('k054539-processor', K054539Processor);
