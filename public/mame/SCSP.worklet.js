import { MameChipProcessor } from './mameChipWorklet.js';

/**
 * SCSP AudioWorklet Processor
 * Sega Saturn YMF292-F Sound Processor for DEViLBOX
 */
class SCSPProcessor extends MameChipProcessor {
  chip = 'SCSP';

  handleChipMessage(data) {
    switch (data.type) {
      case 'loadSample':
        if (this.synth && this.module) {
          // Copy sample data to WASM memory
          const samplePtr = this.module._malloc(data.size);
          const sampleArray = new Uint8Array(this.module.HEAPU8.buffer, samplePtr, data.size);
          sampleArray.set(new Uint8Array(data.data));
          this.synth.loadSample(data.offset, samplePtr, data.size);
          this.module._free(samplePtr);
        }
        return true;
      case 'configureSlot':
        if (this.synth) {
          this.synth.configureSlot(data.slot, data.sampleAddr, data.loopStart, data.loopEnd, data.loop, data.is8bit);
        }
        return true;
    }
    return false;
  }
}

registerProcessor('scsp-processor', SCSPProcessor);
