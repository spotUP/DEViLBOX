import type { SynthPreset } from './types';
import type { GearmulatorConfig } from '../../types/instrument';

export const GEARMULATOR_PRESETS: SynthPreset[] = [
  {
    id: 'gm-virus-init',
    name: 'Virus Init',
    description: 'Access Virus A/B/C init patch',
    category: 'lead',
    config: {
      synthType: 0,
      channel: 0,
      clockPercent: 100,
    } as Partial<GearmulatorConfig>,
  },
  {
    id: 'gm-virus-ti',
    name: 'Virus TI Init',
    description: 'Access Virus TI init patch',
    category: 'pad',
    config: {
      synthType: 1,
      channel: 0,
      clockPercent: 100,
    } as Partial<GearmulatorConfig>,
  },
  {
    id: 'gm-microq',
    name: 'microQ Init',
    description: 'Waldorf microQ init patch',
    category: 'key',
    config: {
      synthType: 2,
      channel: 0,
      clockPercent: 100,
    } as Partial<GearmulatorConfig>,
  },
  {
    id: 'gm-xt',
    name: 'Microwave XT Init',
    description: 'Waldorf Microwave II/XT init patch',
    category: 'pad',
    config: {
      synthType: 3,
      channel: 0,
      clockPercent: 100,
    } as Partial<GearmulatorConfig>,
  },
  {
    id: 'gm-nord',
    name: 'Nord Lead Init',
    description: 'Nord Lead 2x init patch',
    category: 'lead',
    config: {
      synthType: 4,
      channel: 0,
      clockPercent: 100,
    } as Partial<GearmulatorConfig>,
  },
  {
    id: 'gm-jp8000',
    name: 'JP-8000 Init',
    description: 'Roland JP-8000 init patch',
    category: 'lead',
    config: {
      synthType: 5,
      channel: 0,
      clockPercent: 100,
    } as Partial<GearmulatorConfig>,
  },
];
