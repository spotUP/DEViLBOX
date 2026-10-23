import { MameChipProcessor } from './mameChipWorklet.js';

/**
 * uPD931 AudioWorklet Processor
 * NEC/Casio Dual Waveform Keyboard Synthesizer for DEViLBOX
 *
 * 8-voice polyphonic synthesizer using step-based waveform accumulation
 * with dual oscillators (Wave A/B), mirror/invert modes, cycle masking,
 * 5-stage envelope system, key scaling, and retrigger (mandolin effect).
 *
 * The distinctive early Casio keyboard sound - warm, characterful, lo-fi.
 */
class UPD931Processor extends MameChipProcessor {
  chip = 'UPD931';

}

registerProcessor('upd931-processor', UPD931Processor);
