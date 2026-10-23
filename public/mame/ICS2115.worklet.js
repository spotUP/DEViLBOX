import { MameChipProcessor } from './mameChipWorklet.js';

/**
 * ICS2115 WaveFront AudioWorklet Processor
 * 32-voice wavetable synthesizer for DEViLBOX
 *
 * Features:
 * - 32 independent voices
 * - 16-bit, 8-bit, and u-law sample formats
 * - Volume and oscillator envelopes
 * - Per-voice panning with log2 pan law
 * - Bidirectional looping
 * - Linear interpolation
 */
class ICS2115Processor extends MameChipProcessor {
  chip = 'ICS2115';

  handleChipMessage(data) {
    switch (data.type) {
      case 'writeRegister':
        if (this.synth) {
          this.synth.writeRegister(data.voice, data.reg, data.data);
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

registerProcessor('ics2115-processor', ICS2115Processor);
