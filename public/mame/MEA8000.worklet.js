import { MameChipProcessor } from './mameChipWorklet.js';

/**
 * MEA8000 AudioWorklet Processor
 * Philips MEA 8000 4-Formant Speech Synthesizer for DEViLBOX
 *
 * 4-voice polyphonic vocoder with sawtooth/noise excitation and
 * 4 cascade second-order digital filters. 8 vowel presets with
 * real-time formant control.
 * Based on MAME emulator by Antoine Mine.
 */
class MEA8000Processor extends MameChipProcessor {
  chip = 'MEA8000';

  handleChipMessage(data) {
    switch (data.type) {
      case 'writeRegister':
        if (this.synth) this.synth.writeRegister(data.offset, data.value);
        return true;
      case 'setFormants':
        if (this.synth) this.synth.setFormants(data.f1, data.f2, data.f3);
        return true;
      case 'setNoiseMode':
        if (this.synth) this.synth.setNoiseMode(data.value);
        return true;
    }
    return false;
  }
}

registerProcessor('mea8000-processor', MEA8000Processor);
