import { MameChipProcessor } from './mameChipWorklet.js';

/**
 * SN76477 AudioWorklet Processor
 * TI Complex Sound Generator (Space Invaders chip) for DEViLBOX
 *
 * This processor loads the SN76477 WASM module and runs the
 * synthesis engine in the audio thread for low-latency output.
 */
class SN76477Processor extends MameChipProcessor {
  chip = 'SN76477';

  handleChipMessage(data) {
    switch (data.type) {
      case 'setVCOFreq':
        if (this.synth) this.synth.setVCOFreq(data.value);
        return true;
      case 'setSLFFreq':
        if (this.synth) this.synth.setSLFFreq(data.value);
        return true;
      case 'setNoiseFreq':
        if (this.synth) this.synth.setNoiseFreq(data.value);
        return true;
      case 'setVCODutyCycle':
        if (this.synth) this.synth.setVCODutyCycle(data.value);
        return true;
      case 'setMixerMode':
        if (this.synth) this.synth.setMixerModeValue(data.value);
        return true;
      case 'setEnvelopeMode':
        if (this.synth) this.synth.setEnvelopeModeValue(data.value);
        return true;
      case 'setAttackTime':
        if (this.synth) this.synth.setAttackTime(data.value);
        return true;
      case 'setDecayTime':
        if (this.synth) this.synth.setDecayTime(data.value);
        return true;
      case 'setOneShotTime':
        if (this.synth) this.synth.setOneShotTime(data.value);
        return true;
      case 'setNoiseFilterFreq':
        if (this.synth) this.synth.setNoiseFilterFreq(data.value);
        return true;
      case 'setAmplitude':
        if (this.synth) this.synth.setAmplitude(data.value);
        return true;
      case 'setVCOMode':
        if (this.synth) this.synth.setVCOMode(data.value);
        return true;
      case 'setEnable':
        if (this.synth) this.synth.setEnable(data.value);
        return true;
      case 'setVCORes':
        if (this.synth) this.synth.setVCORes(data.value);
        return true;
      case 'setVCOCap':
        if (this.synth) this.synth.setVCOCap(data.value);
        return true;
      case 'setVCOVoltage':
        if (this.synth) this.synth.setVCOVoltage(data.value);
        return true;
      case 'setPitchVoltage':
        if (this.synth) this.synth.setPitchVoltage(data.value);
        return true;
    }
    return false;
  }
}

registerProcessor('sn76477-processor', SN76477Processor);
