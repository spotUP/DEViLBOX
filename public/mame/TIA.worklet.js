import { MameChipProcessor } from './mameChipWorklet.js';

/**
 * TIA AudioWorklet Processor
 * Atari 2600 TIA sound (two channels, polynomial noise/tone AUDC modes)
 * for DEViLBOX. Based on the MAME emulator (Ron Fries' TIASound core).
 */
class TIAProcessor extends MameChipProcessor {
  chip = 'TIA';

}

registerProcessor('tia-processor', TIAProcessor);
