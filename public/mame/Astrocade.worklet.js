import { MameChipProcessor } from './mameChipWorklet.js';

/**
 * Astrocade AudioWorklet Processor
 * Bally Astrocade Custom I/O Sound Chip for DEViLBOX
 *
 * 3 square wave tone generators with hardware vibrato,
 * master oscillator modulation, and 15-bit LFSR noise.
 * Based on MAME emulator by Aaron Giles / Frank Palazzolo.
 */
class AstrocadeProcessor extends MameChipProcessor {
  chip = 'Astrocade';

  handleChipMessage(data) {
    switch (data.type) {
      case 'writeRegister':
        if (this.synth) this.synth.writeRegister(data.offset, data.value);
        return true;
      case 'setVibratoSpeed':
        if (this.synth) this.synth.setVibratoSpeed(data.value);
        return true;
      case 'setVibratoDepth':
        if (this.synth) this.synth.setVibratoDepth(data.value);
        return true;
      case 'setNoiseVolume':
        if (this.synth) this.synth.setNoiseVolume(data.value);
        return true;
    }
    return false;
  }
}

registerProcessor('astrocade-processor', AstrocadeProcessor);
