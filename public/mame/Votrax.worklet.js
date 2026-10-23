import { MameChipProcessor } from './mameChipWorklet.js';

/**
 * Votrax AudioWorklet Processor
 * Votrax SC-01 Formant Speech Synthesizer for DEViLBOX
 *
 * 4-voice polyphonic formant synth based on the Votrax SC-01.
 * 64 phonemes, 4 formant filters with bilinear-transformed analog circuits.
 * Based on MAME emulator by Olivier Galibert.
 */
class VotraxProcessor extends MameChipProcessor {
  chip = 'Votrax';

  handleChipMessage(data) {
    switch (data.type) {
      case 'writePhone':
        if (this.synth) this.synth.writePhone(data.value);
        return true;
      case 'writeInflection':
        if (this.synth) this.synth.writeInflection(data.value);
        return true;
      case 'writeRegister':
        if (this.synth) this.synth.writeRegister(data.offset, data.value);
        return true;
      case 'setPhoneme':
        if (this.synth) this.synth.setPhoneme(data.value);
        return true;
    }
    return false;
  }
}

registerProcessor('votrax-processor', VotraxProcessor);
