/**
 * HarmonicSynth SDK registration
 *
 * Registers the additive/spectral synth with the SynthRegistry.
 * This file is lazy-loaded (imported on first use of HarmonicSynth).
 */

import { SynthRegistry } from '../SynthRegistry';
import type { SynthDescriptor } from '../SynthDescriptor';
import { HarmonicSynth } from '../../harmonic/HarmonicSynth';
import { DEFAULT_HARMONIC_SYNTH } from '@/types/instrument';

const descriptor: SynthDescriptor = {
  id: 'HarmonicSynth',
  name: 'Harmonic Synth',
  category: 'native',
  loadMode: 'lazy',

  create: (config) => {
    const harmonicConfig = config.harmonicSynth || DEFAULT_HARMONIC_SYNTH;
    return new HarmonicSynth(harmonicConfig);
  },

  volumeOffsetDb: 5,
  useSynthBus: true,

  controlsComponent: 'HarmonicSynthControls',
};

SynthRegistry.register(descriptor);
