import { MameChipProcessor } from './mameChipWorklet.js';

/**
 * ASC (Apple Sound Chip) AudioWorklet Processor
 * 4-Voice Wavetable Synthesizer for DEViLBOX
 *
 * 512-sample wavetable with 9.15 fixed-point phase accumulator,
 * linear interpolation, ADSR envelope, 8 preset waveforms.
 *
 * The warm, lo-fi sound of late 1980s Macintosh computers.
 */
class ASCProcessor extends MameChipProcessor {
  chip = 'ASC';
  deleteSynthOnCleanup = true;

}

registerProcessor('asc-processor', ASCProcessor);
