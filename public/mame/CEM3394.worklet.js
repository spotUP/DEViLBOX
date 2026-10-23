import { MameChipProcessor } from './mameChipWorklet.js';

/**
 * CEM3394 AudioWorklet Processor
 * Curtis Electromusic Synthesizer Voice for DEViLBOX
 */
class CEM3394Processor extends MameChipProcessor {
  chip = 'CEM3394';

}

registerProcessor('cem3394-processor', CEM3394Processor);
