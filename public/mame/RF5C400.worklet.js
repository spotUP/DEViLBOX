import { MameChipProcessor } from './mameChipWorklet.js';

/**
 * RF5C400 AudioWorklet Processor
 * Ricoh 32-Voice PCM for DEViLBOX
 *
 * Features:
 * - 32 independent voices
 * - 16-bit and 8-bit PCM formats
 * - ADSR envelope (Attack, Decay, Release)
 * - Per-voice volume and panning
 * - Sample looping
 */
class RF5C400Processor extends MameChipProcessor {
  chip = 'RF5C400';

  handleChipMessage(data) {
    switch (data.type) {
      case 'writeRegister':
        if (this.synth) {
          this.synth.writeRegister(data.offset, data.data);
        }
        return true;
      case 'loadROM':
        if (this.synth && this.module) {
          if (!this.module.wasmMemory) {
            console.error("[Worklet] WASM memory not available");
            return true;
          }
          const romPtr = this.module._malloc(data.size);
          const heap = new Uint8Array(this.module.wasmMemory.buffer);
          const romView = new Uint8Array(heap.buffer, romPtr, data.size);
          romView.set(new Uint8Array(data.data));
          this.synth.loadROM(data.offset, romPtr, data.size);
          this.module._free(romPtr);
        }
        return true;
    }
    return false;
  }
}

registerProcessor('rf5c400-processor', RF5C400Processor);
