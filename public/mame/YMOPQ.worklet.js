import { MameChipProcessor } from './mameChipWorklet.js';

/**
 * YMOPQ AudioWorklet Processor
 * Yamaha YM3806 (OPQ) 4-Operator FM Synthesizer for DEViLBOX
 *
 * 8-channel FM synthesis with 32 operators, 8 algorithms,
 * LFO, reverb, stereo output. Based on ymfm by Aaron Giles.
 */
class YMOPQProcessor extends MameChipProcessor {
  chip = 'YMOPQ';

  handleChipMessage(data) {
    switch (data.type) {
      case 'writeRegister':
        if (this.synth) this.synth.writeRegister(data.offset, data.value);
        return true;
      case 'setAlgorithm':
        if (this.synth) this.synth.setAlgorithm(data.value);
        return true;
      case 'setFeedback':
        if (this.synth) this.synth.setFeedback(data.value);
        return true;
      case 'setLFORate':
        if (this.synth) this.synth.setLFORate(data.value);
        return true;
    }
    return false;
  }
}

registerProcessor('ymopq-processor', YMOPQProcessor);
