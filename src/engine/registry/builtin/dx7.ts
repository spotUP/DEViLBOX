/**
 * DX7 synth registration — VDX7 cycle-accurate Yamaha DX7 emulation (WASM)
 */

import { SynthRegistry } from '../SynthRegistry';
import type { SynthDescriptor } from '../SynthDescriptor';
import { DX7Synth } from '../../dx7/DX7Synth';

const dx7Desc: SynthDescriptor = {
  id: 'DX7',
  name: 'Yamaha DX7',
  category: 'wasm',
  loadMode: 'eager',
  sharedInstance: false,
  useSynthBus: true,
  volumeOffsetDb: 0,

  create: () => new DX7Synth(),

  onTriggerAttack: (synth, note, time, velocity) => {
    (synth as DX7Synth).triggerAttack(note, time, velocity);
    return true;
  },

  onTriggerRelease: (synth, note, time) => {
    (synth as DX7Synth).triggerRelease(note, time);
    return true;
  },

  parameters: [
    { key: 'volume', label: 'Volume', type: 'knob', min: 0, max: 2, default: 1 },
    { key: 'bank', label: 'Bank', type: 'knob', min: 0, max: 7, default: 0 },
    { key: 'program', label: 'Program', type: 'knob', min: 0, max: 31, default: 0 },
  ],
};

SynthRegistry.register(dx7Desc);
