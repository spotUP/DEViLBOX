import { MameChipProcessor } from './mameChipWorklet.js';

/**
 * C352 AudioWorklet Processor
 * Namco 32-Voice PCM Sound Chip for DEViLBOX
 */
class C352Processor extends MameChipProcessor {
  chip = 'C352';

  handleChipMessage(data) {
    switch (data.type) {
      case 'keyOn':
        if (this.synth) {
          this.synth.keyOn(data.voice);
        }
        return true;
      case 'keyOff':
        if (this.synth) {
          this.synth.keyOff(data.voice);
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
      case 'configureVoice':
        if (this.synth) {
          this.synth.configureVoice(
            data.voice,
            data.bank,
            data.start,
            data.end,
            data.loop,
            data.freq,
            data.flags
          );
        }
        return true;
      case 'setVoiceVolume':
        if (this.synth) {
          this.synth.setVoiceVolume(data.voice, data.vol_f, data.vol_r);
        }
        return true;
    }
    return false;
  }
}

registerProcessor('c352-processor', C352Processor);
