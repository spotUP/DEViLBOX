import { MameChipProcessor } from './mameChipWorklet.js';

/**
 * AICA AudioWorklet Processor
 * Sega Dreamcast Sound Processor for DEViLBOX
 */
class AICAProcessor extends MameChipProcessor {
  chip = 'AICA';

  handleChipMessage(data) {
    switch (data.type) {
      case 'loadSample':
        if (this.synth && this.module) {
          const samplePtr = this.module._malloc(data.size);
          const sampleArray = new Uint8Array(this.module.HEAPU8.buffer, samplePtr, data.size);
          sampleArray.set(new Uint8Array(data.data));
          this.synth.loadSample(data.offset, samplePtr, data.size);
          this.module._free(samplePtr);
        }
        return true;
      case 'configureSlot':
        if (this.synth) {
          // format: 0=PCM16, 1=PCM8, 2=ADPCM
          this.synth.configureSlot(data.slot, data.sampleAddr, data.loopStart, data.loopEnd, data.loop, data.format);
        }
        return true;
    }
    return false;
  }
}

registerProcessor('aica-processor', AICAProcessor);
