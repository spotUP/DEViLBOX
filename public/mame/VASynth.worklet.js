import { MameChipProcessor } from './mameChipWorklet.js';

/**
 * VASynth AudioWorklet Processor
 * Virtual Analog Subtractive Synthesizer for DEViLBOX
 *
 * Combines MAME VA building blocks: RC envelope, VCA, 4th-order TPT LPF.
 * 2 oscillators, TPT ladder filter with tanh saturation, RC envelopes.
 *
 * Authentic analog-style subtractive synthesis with self-oscillating filter.
 */
class VASynthProcessor extends MameChipProcessor {
  chip = 'VASynth';
  synthClass = 'VASynth';
  deleteSynthOnCleanup = true;

}

registerProcessor('vasynth-processor', VASynthProcessor);
