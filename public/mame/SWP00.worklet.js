import { MameChipProcessor } from './mameChipWorklet.js';

/**
 * Yamaha SWP00 AWM2 AudioWorklet Processor
 *
 * 32-voice rompler with multi-format sample decoding (16/12/8-bit + DPCM),
 * LFO, Chamberlin LPF, envelope, and volume/pan ramping.
 * Extracted from MAME's swp00 emulator by Olivier Galibert.
 */
class SWP00Processor extends MameChipProcessor {
  chip = 'SWP00';

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
            console.error('[SWP00 Worklet] WASM memory not available');
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
          // Don't free — ROM stays in WASM memory
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
}

registerProcessor('swp00-processor', SWP00Processor);
