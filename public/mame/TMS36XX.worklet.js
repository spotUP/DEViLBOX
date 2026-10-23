import { MameChipProcessor } from './mameChipWorklet.js';

/**
 * TMS36XX AudioWorklet Processor
 * TMS3615/TMS3617 Tone Matrix Synthesizer for DEViLBOX
 *
 * 6-note polyphonic organ tone generator with 6 organ stop harmonics.
 * Square wave oscillators with configurable decay per stop.
 * Based on MAME emulator by Juergen Buchmueller.
 */
class TMS36XXProcessor extends MameChipProcessor {
  chip = 'TMS36XX';

  handleChipMessage(data) {
    switch (data.type) {
      case 'writeRegister':
        if (this.synth) this.synth.writeRegister(data.offset, data.value);
        return true;
      case 'setStopEnable':
        if (this.synth) this.synth.setStopEnable(data.value);
        return true;
      case 'setOctave':
        if (this.synth) this.synth.setOctave(data.value);
        return true;
    }
    return false;
  }
}

registerProcessor('tms36xx-processor', TMS36XXProcessor);
