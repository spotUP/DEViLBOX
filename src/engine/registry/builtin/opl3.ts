/**
 * OPL3 synth registration — Nuked OPL3 (YMF262) 18-channel FM (WASM)
 */

import { SynthRegistry } from '../SynthRegistry';
import type { SynthDescriptor } from '../SynthDescriptor';
import { OPL3Synth } from '../../opl3/OPL3Synth';

const opl3Desc: SynthDescriptor = {
  id: 'OPL3',
  name: 'OPL3 FM Synth',
  category: 'wasm',
  loadMode: 'eager',
  sharedInstance: false,
  useSynthBus: true,
  volumeOffsetDb: 6,

  create: () => new OPL3Synth(),

  onTriggerAttack: (synth, note, time, velocity) => {
    (synth as OPL3Synth).triggerAttack(note, time, velocity);
    return true;
  },

  onTriggerRelease: (synth, note, time) => {
    (synth as OPL3Synth).triggerRelease(note, time);
    return true;
  },

  parameters: [],
};

SynthRegistry.register(opl3Desc);
