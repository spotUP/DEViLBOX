import { MameChipProcessor } from './mameChipWorklet.js';

/**
 * Fairlight CMI IIx AudioWorklet Processor
 *
 * 8-voice sampling synthesizer with SSM2045 cascaded lowpass filters,
 * hardware envelope generator, and 16KB wave RAM per voice.
 * DSP extracted 1:1 from MAME's cmi01a.cpp with PIA6821/PTM6840 behavioral models.
 */
class CMIProcessor extends MameChipProcessor {
  chip = 'CMI';

  initializeSynth(data) {
    this.synth.setSampleRate(data.sampleRate);
  }

  handleChipMessage(data) {
    switch (data.type) {
      case 'writeRegister':
        if (this.synth) this.synth.writeRegister(data.offset, data.value);
        return true;
      case 'loadSample':
        if (this.synth && this.module && data.data) {
          if (!this.module.wasmMemory) {
            console.error('[CMI Worklet] WASM memory not available');
            return true;
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
        return true;
      case 'getVoiceStatus':
        if (this.synth && this.module) {
          const statusPtr = this.module._malloc(16 * 4 * 4); // 16 voices × 4 ints × 4 bytes
          this.synth.getVoiceStatus(statusPtr, 16);
          const heap = new Int32Array(this.module.wasmMemory.buffer, statusPtr, 64);
          const status = new Int32Array(heap); // copy before free
          this.module._free(statusPtr);
          this.port.postMessage({ type: 'voiceStatus', data: status.buffer }, [status.buffer]);
        }
        return true;
    }
    return false;
  }
}

registerProcessor('cmi-processor', CMIProcessor);
