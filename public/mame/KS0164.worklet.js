import { MameChipProcessor } from './mameChipWorklet.js';

/**
 * Samsung KS0164 Wavetable Synthesizer AudioWorklet Processor
 *
 * 32-voice wavetable synth with 16-bit linear + 8-bit compressed
 * sample playback, pitch interpolation, loop, and volume ramping.
 * Extracted from MAME's ks0164 emulator.
 */
class KS0164Processor extends MameChipProcessor {
  chip = 'KS0164';
  romPtr = 0;

  initializeSynth(data) {
    this.synth.setSampleRate(data.sampleRate);
  }

  handleChipMessage(data) {
    switch (data.type) {
      case 'writeRegister':
        if (this.synth) this.synth.writeRegister(data.offset, data.value);
        return true;
      case 'loadROM':
        if (this.synth && this.module && data.data) {
          if (!this.module.wasmMemory) {
            console.error('[KS0164 Worklet] WASM memory not available');
            return true;
          }
          const romBytes = new Uint8Array(data.data);
          // Free previous ROM if any
          if (this.romPtr) {
            this.module._free(this.romPtr);
            this.romPtr = 0;
          }
          this.romPtr = this.module._malloc(romBytes.length);
          if (!this.romPtr) {
            console.error('[KS0164 Worklet] Failed to allocate ROM memory:', romBytes.length, 'bytes');
            return true;
          }
          const romHeap = new Uint8Array(this.module.wasmMemory.buffer);
          romHeap.set(romBytes, this.romPtr);
          this.synth.loadROM(this.romPtr, romBytes.length);
          const numSamples = this.synth.getNumSamples();
          console.log(`[KS0164 Worklet] ROM loaded: ${romBytes.length} bytes, ${numSamples} samples found`);
          this.port.postMessage({ type: 'romLoaded', numSamples });
        }
        return true;
      case 'getVoiceStatus':
        if (this.synth && this.module) {
          const statusPtr = this.module._malloc(32 * 4 * 4); // 32 voices x 4 ints x 4 bytes
          this.synth.getVoiceStatus(statusPtr, 32);
          const heap = new Int32Array(this.module.wasmMemory.buffer, statusPtr, 128);
          const status = new Int32Array(heap);
          this.module._free(statusPtr);
          this.port.postMessage({ type: 'voiceStatus', data: status.buffer }, [status.buffer]);
        }
        return true;
    }
    return false;
  }

  cleanupChip() {
    if (this.module && this.romPtr) { this.module._free(this.romPtr); this.romPtr = 0; }
  }
}

registerProcessor('ks0164-processor', KS0164Processor);
