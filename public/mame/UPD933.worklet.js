import { MameChipProcessor } from './mameChipWorklet.js';

/**
 * uPD933 AudioWorklet Processor
 * NEC/Casio Phase Distortion Synthesis Chip for DEViLBOX
 *
 * 8-voice polyphonic PD synthesizer with 8 waveforms, 6 window functions,
 * 3 envelope generators per voice (DCA/DCW/DCO), and ring modulation.
 * Based on MAME emulator by Devin Acker.
 *
 * Powers the Casio CZ-101, CZ-1000, CZ-1, CZ-3000, CZ-5000.
 */
class UPD933Processor extends MameChipProcessor {
  chip = 'UPD933';

  handleChipMessage(data) {
    switch (data.type) {
      case 'setWaveform':
        if (this.synth) this.synth.setWaveform(data.wave1, data.wave2);
        return true;
      case 'setWindow':
        if (this.synth) this.synth.setWindow(data.value);
        return true;
    }
    return false;
  }
}

registerProcessor('upd933-processor', UPD933Processor);
