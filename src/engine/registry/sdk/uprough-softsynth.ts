/**
 * UpRoughSoftsynth SDK registration (lazy). Registry `parameters` is static, so only the voice select lives
 * here; per-voice knobs are SOFTSYNTH_VOICES[].params and are stored in config.upRoughSoftsynth.params.
 */
import { SynthRegistry } from '../SynthRegistry';
import type { SynthDescriptor } from '../SynthDescriptor';
import { UpRoughSoftsynth } from '../../uprough/UpRoughSoftsynth';
import { SOFTSYNTH_VOICES } from '../../uprough/voiceRegistry';
import { DEFAULT_UPROUGH_SOFTSYNTH } from '@/types/instrument';

const descriptor: SynthDescriptor = {
  id: 'UpRoughSoftsynth',
  name: 'Up Rough Softsynth',
  category: 'native',
  loadMode: 'lazy',

  create: (config) => new UpRoughSoftsynth(config.upRoughSoftsynth || DEFAULT_UPROUGH_SOFTSYNTH),

  parameters: [
    {
      key: 'voice',
      label: 'Voice',
      type: 'select',
      default: 0,
      options: SOFTSYNTH_VOICES.map((v, i) => ({ value: i, label: v.label })),
    },
  ],

  volumeOffsetDb: 0,
  useSynthBus: true,
};

SynthRegistry.register(descriptor);
