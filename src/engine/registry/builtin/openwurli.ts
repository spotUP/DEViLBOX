/**
 * OpenWurli synth registration — Wurlitzer 200A electric piano (WASM)
 */

import { SynthRegistry } from '../SynthRegistry';
import type { SynthDescriptor } from '../SynthDescriptor';
import { OpenWurliSynth } from '../../openwurli/OpenWurliSynth';
import { DEFAULT_OPENWURLI } from '@/types/instrument';

const openwurliDesc: SynthDescriptor = {
  id: 'OpenWurli',
  name: 'Wurlitzer 200A',
  category: 'wasm',
  loadMode: 'eager',
  sharedInstance: false,
  useSynthBus: true,
  volumeOffsetDb: 6,
  controlsComponent: 'OpenWurliControls',
  hardwareComponent: 'OpenWurliHardware',

  create: (config) => {
    const owConfig = config.openWurli || { ...DEFAULT_OPENWURLI };
    return new OpenWurliSynth(owConfig);
  },

  onTriggerAttack: (synth, note, time, velocity, _opts) => {
    (synth as OpenWurliSynth).triggerAttack(note, time, velocity);
    return true;
  },

  onTriggerRelease: (synth, note, time, _opts) => {
    (synth as OpenWurliSynth).triggerRelease(note, time);
    return true;
  },

  parameters: [
    { key: 'volume', label: 'Volume', group: 'Main', type: 'knob', min: 0, max: 1, default: 0.8 },
    { key: 'tremoloDepth', label: 'Tremolo', group: 'Main', type: 'knob', min: 0, max: 1, default: 0.5 },
    { key: 'speakerCharacter', label: 'Speaker', group: 'Main', type: 'knob', min: 0, max: 1, default: 0.5 },
    { key: 'velocityCurve', label: 'Vel Curve', group: 'Main', type: 'select', min: 0, max: 4, default: 2,
      options: [
        { value: 0, label: 'Linear' },
        { value: 1, label: 'Soft' },
        { value: 2, label: 'Medium' },
        { value: 3, label: 'Hard' },
        { value: 4, label: 'Fixed' },
      ]
    },
    { key: 'mlpEnabled', label: 'MLP Correction', group: 'Main', type: 'toggle', min: 0, max: 1, default: 1 },
  ],
};

SynthRegistry.register(openwurliDesc);
