import { MameChipProcessor } from './mameChipWorklet.js';

/**
 * ES5503 AudioWorklet Processor
 * Ensoniq DOC 32-voice Wavetable Synthesizer for DEViLBOX
 *
 * This processor loads the ES5503 WASM module and runs the
 * synthesis engine in the audio thread for low-latency output.
 */
class ES5503Processor extends MameChipProcessor {
  chip = 'ES5503';

  handleChipMessage(data) {
    switch (data.type) {
      case 'setWaveform':
        if (this.synth) this.synth.setWaveform(data.value);
        return true;
      case 'setWaveSize':
        if (this.synth) this.synth.setWaveSize(data.value);
        return true;
      case 'setResolution':
        if (this.synth) this.synth.setResolution(data.value);
        return true;
      case 'setAttackTime':
        if (this.synth) this.synth.setAttackTime(data.value);
        return true;
      case 'setReleaseTime':
        if (this.synth) this.synth.setReleaseTime(data.value);
        return true;
      case 'setAmplitude':
        if (this.synth) this.synth.setAmplitude(data.value);
        return true;
      case 'setNumOscillators':
        if (this.synth) this.synth.setNumOscillators(data.value);
        return true;
      case 'writeRegister':
        if (this.synth) this.synth.writeRegister(data.offset, data.value);
        return true;
      case 'loadWaveData':
        if (this.synth && this.module && data.waveData) {
          if (!this.module.wasmMemory) {
            console.error("[Worklet] WASM memory not available");
            return true;
          }
          const bytes = new Uint8Array(data.waveData);
          const ptr = this.module._malloc(bytes.length);
          const heap = new Uint8Array(this.module.wasmMemory.buffer);
          heap.set(bytes, ptr);
          this.synth.loadWaveData(ptr, data.offset || 0, bytes.length);
          this.module._free(ptr);
        }
        return true;
    }
    return false;
  }
}

registerProcessor('es5503-processor', ES5503Processor);
