import { MameChipProcessor } from './mameChipWorklet.js';

/**
 * YMF271 AudioWorklet Processor
 * Yamaha OPX 4-Operator FM Synthesizer for DEViLBOX
 */
class YMF271Processor extends MameChipProcessor {
  chip = 'YMF271';

  handleChipMessage(data) {
    switch (data.type) {
      case 'controlChange':
        if (this.synth) {
          this.synth.setParameter(data.cc, data.value / 127.0);
        }
        return true;
      case 'pitchBend':
        // YMF271 doesn't have direct pitch bend
        return true;
      case 'programChange':
        // Selects the algorithm
        if (this.synth) {
          this.synth.setParameter(1, data.program / 15.0);
        }
        return true;
    }
    return false;
  }
}

registerProcessor('ymf271-processor', YMF271Processor);
