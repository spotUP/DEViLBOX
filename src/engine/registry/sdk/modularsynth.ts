/**
 * ModularSynth SDK registration
 *
 * Registers the modular synthesis engine with the SynthRegistry.
 * This file is lazy-loaded (imported on first use of ModularSynth).
 */

import { SynthRegistry } from '../SynthRegistry';
import type { SynthDescriptor } from '../SynthDescriptor';
import { ModularSynth } from '../../modular/ModularSynth';
import { MODULAR_INIT_PATCH } from '../../../constants/modularPresets';
import '../../modular/modules'; // Register built-in modules

const descriptor: SynthDescriptor = {
  id: 'ModularSynth',
  name: 'Modular Synth',
  category: 'native',
  loadMode: 'lazy',

  create: (config) => {
    const patchConfig = config.modularSynth || MODULAR_INIT_PATCH;
    return new ModularSynth(patchConfig);
  },

  useSynthBus: true,
  controlsComponent: 'ModularSynthControls',
};

SynthRegistry.register(descriptor);
