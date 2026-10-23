import { MameChipProcessor } from './mameChipWorklet.js';

/**
 * ZOOM ZSG-2 Wavetable Synthesizer AudioWorklet Processor
 *
 * 48-channel wavetable synth with 2:1 compressed samples,
 * emphasis filter, IIR lowpass with ramping, volume ramping,
 * 4 output busses. Extracted from MAME's zsg2 emulator.
 */
class ZSG2Processor extends MameChipProcessor {
  chip = 'ZSG2';

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
            console.error('[ZSG2 Worklet] WASM memory not available');
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
      case 'loadROM':
        if (this.synth && this.module && data.data) {
          if (!this.module.wasmMemory) return true;
          const romBytes = new Uint8Array(data.data);
          const romPtr = this.module._malloc(romBytes.length);
          const romHeap = new Uint8Array(this.module.wasmMemory.buffer);
          romHeap.set(romBytes, romPtr);
          this.synth.loadROM(romPtr, romBytes.length);
          // Don't free - ROM stays in WASM memory
        }
        return true;
      case 'getVoiceStatus':
        if (this.synth && this.module) {
          const statusPtr = this.module._malloc(48 * 4 * 4); // 48 voices x 4 ints x 4 bytes
          this.synth.getVoiceStatus(statusPtr, 48);
          const heap = new Int32Array(this.module.wasmMemory.buffer, statusPtr, 48 * 4);
          const status = new Int32Array(heap);
          this.module._free(statusPtr);
          this.port.postMessage({ type: 'voiceStatus', data: status.buffer }, [status.buffer]);
        }
        return true;
    }
    return false;
  }
}

registerProcessor('zsg2-processor', ZSG2Processor);
