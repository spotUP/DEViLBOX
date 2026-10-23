import { MameChipProcessor } from './mameChipWorklet.js';

/**
 * SNKWave AudioWorklet Processor
 * SNK Wave Programmable Waveform Generator for DEViLBOX
 *
 * 8-voice polyphonic wavetable synth based on the SNK arcade wave
 * generator. 16-sample ping-pong waveforms with 3-bit resolution.
 * Based on MAME emulator by Nicola Salmoria.
 */
class SNKWaveProcessor extends MameChipProcessor {
  chip = 'SNKWave';

  handleChipMessage(data) {
    switch (data.type) {
      case 'writeRegister':
        if (this.synth) this.synth.writeRegister(data.offset, data.value);
        return true;
      case 'setCustomWaveform':
        if (this.synth) this.synth.setCustomWaveform(data.b0, data.b1, data.b2, data.b3);
        return true;
      case 'setWaveform':
        if (this.synth) this.synth.setWaveform(data.value);
        return true;
    }
    return false;
  }
}

registerProcessor('snkwave-processor', SNKWaveProcessor);
