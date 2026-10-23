import { MameChipProcessor } from './mameChipWorklet.js';

/**
 * MSM5232 AudioWorklet Processor
 * OKI MSM5232 8-voice organ/melody chip for DEViLBOX
 *
 * Two groups of four voices, each voice mixing 2', 4', 8' and 16' square
 * feet with the chip's envelope (attack/decay, ARM sustain mode).
 * Based on the MAME emulator (Jarek Burczynski, Hiromitsu Shioya).
 */
class MSM5232Processor extends MameChipProcessor {
  chip = 'MSM5232';

  handleChipMessage(data) {
    switch (data.type) {
      case 'writeRegister':
        if (this.synth) this.synth.writeRegister(data.offset, data.value);
        return true;
      case 'setFeetMix':
        if (this.synth) this.synth.setFeetMix(data.value);
        return true;
    }
    return false;
  }
}

registerProcessor('msm5232-processor', MSM5232Processor);
